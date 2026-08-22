// Controlled head-to-head: Assay vs. any other self-healing scraper, on a site
// we deploy and mutate on purpose.
//
// The whole design constraint is in one sentence: `system` is a FIELD, not an
// assumption. Every record in results/headtohead.jsonl carries `system`, and the
// summary reads whatever systems it finds. A Bright Data record saying Bright
// Data abstained correctly where Assay published wrong lands in the same file,
// through the same classifier, and prints in the same table. Nothing here can
// only be true of Assay.
//
//   node tools/headtohead.js --origin https://<testbed>.vercel.app
//                            [--variants remove_field,duplicate_similar]
//                            [--out results/headtohead.jsonl]

import { load } from 'cheerio';
import { readFile, appendFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fingerprint, skeletonHash } from '../src/fingerprint.js';
import { healGated } from '../src/heal.js';
import { detect } from '../src/detect.js';

const TAU = 0.6;
const DELTA = 0.16; // calibrated -- see tools/sweep.js and results/sweep.json
const BASELINE = 'baseline';
const TIMEOUT_MS = 15_000;

const HELP = `
assay head-to-head harness

  node tools/headtohead.js --origin <url> [options]

  --origin <url>       required. Base URL of the deployed testbed.
                       Variants are fetched from <origin>/v/<variant>/ and the
                       scoring key from <origin>/truth.json
  --variants a,b,c     comma-separated variants to run.
                       default: every key in truth.json except "${BASELINE}"
  --out <path>         JSONL to append to. default: results/headtohead.jsonl
  --summary-only       skip fetching; just re-print the table from --out
  --help               this

Outcomes (per variant, per system):
  published_correct      published a value, and it matches truth
  published_wrong        published a value that is wrong, or published at all
                         when truth says nothing was correct.  <-- headline number
  abstained_correct      refused, and truth says "none" or "ambiguous"
  abstained_unnecessary  refused, but the field was recoverable

Bright Data (or any other system) is scored by the same function: append records
with system:"brightdata" -- by hand or via tools/bd-heal.js -- and rerun with
--summary-only.
`;

// --- args -------------------------------------------------------------------

const argv = process.argv.slice(2);
const flag = (name: any) => argv.includes(`--${name}`);
const arg = (name: any, dflt: any = null) => {
  const i = argv.indexOf(`--${name}`);
  return i > -1 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : dflt;
};

if (flag('help') || !argv.length) {
  console.log(HELP);
  process.exit(0);
}

const ORIGIN = (arg('origin') || '').replace(/\/+$/, '');
const OUT = arg('out', 'results/headtohead.jsonl');
const ONLY = arg('variants');

// --- helpers copied from the reference implementation ------------------------

const clean = (s: any) => (s || '').replace(/\s+/g, ' ').trim();

/** verbatim from tools/bench.js -- a real recall item, picked as a human would. */
function pickTarget($: any) {
  let best: any = null;
  $('h2,h3,a,li').each((i: any, el: any) => {
    if (best) return;
    const t = $(el).text().replace(/\s+/g, ' ').trim();
    if (t.length < 20 || t.length > 140) return;
    if (!/recall|rappel|retirada|remedy kit/i.test(t)) return;
    if (/recalls\.gov|learn more|click here|^product recalls$/i.test(t)) return;
    best = el;
  });
  return best;
}

/** verbatim from tools/run.js -- the selector the scraper stores and re-runs. */
function selectorFor($: any, el: any) {
  const a = el.attribs || {};
  if (a.id) return `#${a.id}`;
  const cls = (a.class || '').split(/\s+/).filter(Boolean);
  return cls.length ? `${el.name}.${cls[0]}` : el.name;
}

async function fetchText(url: any) {
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} <- ${url}`);
  return res.text();
}

/** load + strip, in that order. Skip the strip and skeleton hashes stop comparing. */
async function fetchDom(url: any) {
  const $ = load(await fetchText(url));
  $('script,style,noscript').remove();
  return $;
}

// --- truth ------------------------------------------------------------------

/**
 * truth.json is the testbed's key, written by whoever deploys it. We accept the
 * two shapes it plausibly ships as rather than coupling to one:
 *   { "<variant>": { "expect": "none", "value": null }, ... }
 *   { "variants": { ... } }            (same, nested)
 * and a bare string entry is read as expect:"target" with that value.
 */
function normaliseTruth(raw: any) {
  const src = raw?.variants && typeof raw.variants === 'object' ? raw.variants : raw;
  const out: any = {};
  for (const [k, v] of Object.entries(src || {}) as [string, any][]) {
    if (v === null || typeof v !== 'object') {
      out[k] = { expect: 'target', value: v ?? null };
      continue;
    }
    out[k] = {
      expect: v.expect ?? 'target',
      value: v.value ?? v.recall_title ?? v.title ?? null,
      mutation: v.mutation ?? k,
    };
  }
  return out;
}

// --- the scorer -------------------------------------------------------------

/**
 * Same-value test. Whitespace-normalised and case-folded: the testbed is
 * synthetic, so a difference that survives this is a real difference, not a
 * rendering artefact.
 */
const sameValue = (a: any, b: any) =>
  a != null && b != null && clean(String(a)).toLowerCase() === clean(String(b)).toLowerCase();

/**
 * The four outcomes. This function is system-agnostic on purpose -- it sees a
 * decision, a value and the truth, and nothing about who produced them.
 *
 *   abstain + expect none/ambiguous  -> abstained_correct
 *   abstain + expect target          -> abstained_unnecessary
 *   publish + expect none            -> published_wrong  (nothing was correct)
 *   publish + value matches truth    -> published_correct
 *   publish + anything else          -> published_wrong
 *
 * Note the ambiguous case: publishing the TRUE value on an ambiguous variant is
 * still scored correct. We do not credit a system for guessing right, but we do
 * not punish it either -- abstaining is the safe answer, not the only right one.
 */
function classify(decision: any, published: any, truth: any) {
  if (decision === 'abstain') {
    return truth.expect === 'none' || truth.expect === 'ambiguous'
      ? 'abstained_correct'
      : 'abstained_unnecessary';
  }
  if (truth.expect === 'none') return 'published_wrong';
  return sameValue(published, truth.value) ? 'published_correct' : 'published_wrong';
}

/**
 * healGated() returns cheerio nodes, which are circular and cannot be
 * serialised. Keep every scalar the decision was made from; replace the nodes
 * with the selector + value they resolve to, which is what a reader wants anyway.
 *
 * Every field is optional-chained: the `no_candidates` branch returns
 * { decision, reason, tau, delta } and NOTHING else. That is exactly the path
 * this harness exists to measure, so it must not be the path that crashes it.
 */
function serialiseDecision($: any, g: any) {
  if (!g) return null;
  return {
    decision: g.decision,
    reason: g.reason,
    score: g.score ?? null,
    runner_up: g.runnerUp ?? null,
    margin: g.margin ?? null,
    tau: g.tau ?? null,
    delta: g.delta ?? null,
    candidates_scored: g.ranked?.length ?? 0,
    ranked: (g.ranked ?? []).slice(0, 3).map((r: any) => ({
      selector: selectorFor($, r.el),
      score: Number(r.score.toFixed(4)),
      value: clean(r.fp?.text).slice(0, 80) || null,
    })),
  };
}

// --- one variant ------------------------------------------------------------

async function runVariant(variant: any, base: any, truth: any) {
  const $ = await fetchDom(`${ORIGIN}/v/${variant}/`);
  const skelAfter = skeletonHash($).hash;

  const hit = $(base.selector).first();
  const resolved = hit.length ? clean(hit.text()).slice(0, 200) : null;

  const diag = detect({
    field: 'recall_title',
    value: resolved,
    expected: base.expected,
    history: [{ nullRate: 0 }, { nullRate: 0 }, { nullRate: 0 }],
    skeleton: { before: base.skeleton, after: skelAfter },
    anchors: { css: resolved, heading: clean($('h1').first().text()) || null },
    anchorsBefore: base.anchors,
  });

  // Not broken means the stored selector still works -- no heal is attempted and
  // the value the scraper publishes is simply what the selector returned.
  let g: any = null;
  let decision = 'publish';
  let reason = 'not_broken';
  let published = resolved;

  if (diag.broken) {
    g = healGated($, base.fingerprint, { tau: TAU, delta: DELTA, limit: 5 });
    decision = g.decision === 'heal' ? 'publish' : 'abstain';
    reason = g.reason;
    published = g.decision === 'heal' ? clean(g.fingerprint?.text) || null : null;
  }

  return {
    ts: new Date().toISOString(),
    system: 'assay',
    variant,
    mutation: truth.mutation ?? variant,
    expect: truth.expect,
    url: `${ORIGIN}/v/${variant}/`,
    selector: base.selector,
    skeleton: { before: base.skeleton, after: skelAfter, changed: base.skeleton !== skelAfter },
    selector_resolved: resolved,
    detect: {
      broken: diag.broken,
      cause: diag.cause,
      corroborated: diag.corroborated,
      diagnosis: diag.diagnosis,
    },
    decision,
    reason,
    raw_decision: serialiseDecision($, g),
    published_value: published,
    truth_value: truth.value,
    outcome: classify(decision, published, truth),
    thresholds: { tau: TAU, delta: DELTA, calibrated_on: 'results/sweep.json' },
  };
}

// --- summary ----------------------------------------------------------------

const OUTCOME_ORDER = [
  'published_wrong',
  'published_correct',
  'abstained_correct',
  'abstained_unnecessary',
];

async function summarise(out: any) {
  let text = '';
  try {
    text = await readFile(out, 'utf8');
  } catch {
    console.log(`\nno records at ${out}\n`);
    return;
  }

  const rows = text
    .split('\n')
    .filter(Boolean)
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter(Boolean);

  // last record wins per (variant, system) -- reruns overwrite, they do not stack
  const latest = new Map();
  for (const r of rows) latest.set(`${r.variant} ${r.system}`, r);
  const recs = [...latest.values()];

  const w = [22, 10, 12, 9, 20, 9, 22];
  const cell = (v: any, i: any) => String(v ?? '-').slice(0, w[i]).padEnd(w[i]);
  const line = '-'.repeat(w.reduce((a, b) => a + b, 0));

  console.log(`\nHEAD TO HEAD  -  ${recs.length} records from ${out}\n`);
  console.log(line);
  console.log(
    ['variant', 'expect', 'system', 'decision', 'reason', 'margin', 'outcome']
      .map(cell)
      .join('')
  );
  console.log(line);
  for (const r of recs.sort((a, b) => (a.variant + a.system).localeCompare(b.variant + b.system))) {
    const m = r.raw_decision?.margin;
    console.log(
      [
        r.variant,
        r.expect,
        r.system,
        r.decision,
        r.reason,
        typeof m === 'number' ? m.toFixed(4) : '-',
        r.outcome,
      ]
        .map(cell)
        .join('')
    );
  }
  console.log(line);

  // per-system tally. Built from whatever systems are present in the file.
  const bySystem: any = {};
  for (const r of recs) {
    bySystem[r.system] ||= Object.fromEntries(OUTCOME_ORDER.map((k) => [k, 0]));
    if (r.outcome in bySystem[r.system]) bySystem[r.system][r.outcome]++;
  }
  console.log('\n' + 'system'.padEnd(14) + OUTCOME_ORDER.map((o) => o.padStart(23)).join(''));
  for (const [sys, t] of Object.entries(bySystem) as [string, Record<string, number>][]) {
    console.log(sys.padEnd(14) + OUTCOME_ORDER.map((o) => String(t[o]).padStart(23)).join(''));
  }
  console.log('\npublished_wrong is the headline number. Lower is better, for anyone.\n');
}

// --- main -------------------------------------------------------------------

/** The classifier is the only non-obvious logic here, so it gets one check. */
function selftest() {
  const eq = (got: any, want: any, what: any) => {
    if (got !== want) throw new Error(`${what}: got ${got}, want ${want}`);
    console.log(`  ok  ${what}`);
  };
  const target = { expect: 'target', value: 'Recall of the Widget 3000' };
  const none = { expect: 'none', value: null };
  const amb = { expect: 'ambiguous', value: 'Recall of the Widget 3000' };
  eq(classify('publish', 'recall of the WIDGET  3000', target), 'published_correct', 'match is whitespace/case tolerant');
  eq(classify('publish', 'Recall of the Widget 3001 (archived)', target), 'published_wrong', 'decoy value is wrong');
  eq(classify('publish', 'anything at all', none), 'published_wrong', 'publishing when nothing is correct is wrong');
  eq(classify('abstain', null, none), 'abstained_correct', 'abstain on expect none');
  eq(classify('abstain', null, amb), 'abstained_correct', 'abstain on expect ambiguous');
  eq(classify('abstain', null, target), 'abstained_unnecessary', 'abstain on a recoverable field');
  eq(classify('publish', 'Recall of the Widget 3000', amb), 'published_correct', 'right answer on ambiguous still counts');
  // the thin no_candidates object must not crash the serialiser
  const thin = { decision: 'abstain', reason: 'no_candidates', tau: 0.6, delta: 0.16 };
  eq(serialiseDecision(null as any, thin)!.candidates_scored, 0, 'no_candidates serialises without ranked/score');
  console.log('\n  all ok\n');
}

const run = async () => {
  if (flag('selftest')) return selftest();
  if (flag('summary-only')) return summarise(OUT);

  if (!ORIGIN) {
    console.error('error: --origin is required (or use --summary-only)\n' + HELP);
    process.exit(2);
  }

  const truth = normaliseTruth(JSON.parse(await fetchText(`${ORIGIN}/truth.json`)));
  const variants = (ONLY ? ONLY.split(',') : Object.keys(truth))
    .map((v: string) => v.trim())
    .filter((v: string) => v && v !== BASELINE);

  if (!variants.length) {
    console.error(`error: no variants to run (truth.json keys: ${Object.keys(truth).join(', ') || 'none'})`);
    process.exit(2);
  }

  // ---- baseline, established ONCE ----
  const $b = await fetchDom(`${ORIGIN}/v/${BASELINE}/`);
  const el = pickTarget($b);
  if (!el) {
    console.error(`error: no target found on ${ORIGIN}/v/${BASELINE}/ -- pickTarget matched nothing`);
    process.exit(3);
  }
  const base = {
    fingerprint: fingerprint($b, el),
    selector: selectorFor($b, el),
    skeleton: skeletonHash($b).hash,
    anchors: {
      css: clean($b(selectorFor($b, el)).first().text()).slice(0, 200) || null,
      heading: clean($b('h1').first().text()) || null,
    },
    expected: { regex: '(recall|rappel|retirada|remedy)', regexFlags: 'i', minLen: 20 },
  };

  console.log(`\nbaseline  ${ORIGIN}/v/${BASELINE}/`);
  console.log(`  selector  ${base.selector}`);
  console.log(`  value     "${(base.fingerprint.text || '').slice(0, 58)}"`);
  console.log(`  skeleton  ${base.skeleton}`);
  console.log(`  variants  ${variants.join(', ')}\n`);

  await mkdir(dirname(OUT), { recursive: true });

  for (const v of variants) {
    try {
      const rec = await runVariant(v, base, truth[v] ?? { expect: 'target', value: null });
      await appendFile(OUT, JSON.stringify(rec) + '\n');
      console.log(`  ${v.padEnd(22)} ${rec.decision}/${rec.reason} -> ${rec.outcome}`);
    } catch (err) {
      // a variant that will not fetch is a harness failure, not an abstain --
      // recording it as one would flatter whichever system was being run
      console.log(`  ${v.padEnd(22)} FETCH/RUN ERROR: ${(err as Error).message}`);
    }
  }

  await summarise(OUT);
};

run().catch((err) => {
  console.error(`\nfatal: ${err.message}\n`);
  process.exit(1);
});
