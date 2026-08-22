// The fourth benchmark arm: does adding model judgement change the wrong-value rate?
//
//   npm run bench:model -- [--captures N] [--tau 0.6] [--delta 0.16] [--limit N]
//
// `tools/bench.ts` has three arms and is frozen. Its harness is reproduced here
// rather than imported because it runs on import and exports nothing; the
// mutation set, the target picker, the truth-marker canary and the two notions
// of "correct" are deliberately identical, so the `gated` row printed below MUST
// match the `margin gate` row printed by bench.ts. If it does not, this file is
// wrong and nothing else it prints can be trusted.
//
// Two model arms, because docs/AI-AND-AGENTS.md leaves two questions open and
// they pull in opposite directions:
//
//   corroborate  3: the model must agree or Assay abstains. This should raise
//                the abstention rate; the open question is by how much, since
//                "it is plausible that the two methods disagree far more often
//                than expected, which would make the rule useless in practice".
//
//   tiebreak     the inverse, and the one LIMITATIONS.md 1 asks for: when the
//                gate abstains on a thin margin, let model agreement unlock it.
//                This buys coverage and RISKS WRONG VALUES, which is exactly why
//                it is a benchmark arm and not a default. Even here the element
//                published is the SCORER's top pick, never the model's -- the
//                model unlocks, it does not select.
//
// Read VALUE WRONG first. The gated arm publishes 0.0%; an arm that trades that
// for coverage has lost, whatever it did to VALUE OK.

import { load } from 'cheerio';
import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { fingerprint } from '../src/fingerprint.js';
import { healGated, rank } from '../src/heal.js';
import { MUTATIONS, markTarget, TRUTH_ATTR } from '../src/mutate.js';
import { pickTarget } from '../src/target.js';
import { pickElement, hasKey } from '../src/ai/index.js';

const arg = (name: string, dflt: number): number => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? Number(process.argv[i + 1]) : dflt;
};
const CAPTURES = arg('captures', 6);
const TAU = arg('tau', 0.6);
const DELTA = arg('delta', 0.16);
// Each model call is a separate agent session. Cap them while iterating; the
// cases past the cap are counted as unevaluated, never as agreement.
const CALL_LIMIT = arg('limit', Infinity);
const SITES = ['mattel', 'ikea', 'chicco'];

const clean = (s: string | null | undefined): string => (s || '').replace(/\s+/g, ' ').trim();

const fresh = async (site: string, file: string) => {
  const $ = load(await readFile(`corpus/${site}/${file}`, 'utf8'));
  $('script,style,noscript').remove();
  return $;
};

interface Tally {
  correct: number; wrong: number; value_ok: number; value_wrong: number;
  abstain_right: number; abstain_wrong: number; unevaluated: number; n: number;
}

// `unevaluated` is the column that keeps this file honest. A case the model
// never saw is not a pass, a fail or an abstention -- it is not scored.
const blank = (): Tally => ({ correct: 0, wrong: 0, value_ok: 0, value_wrong: 0,
  abstain_right: 0, abstain_wrong: 0, unevaluated: 0, n: 0 });

function tally(b: Tally, expect: string, decision: string, chose?: unknown, valueMatch?: unknown) {
  b.n++;
  if (decision === 'unevaluated') { b.unevaluated++; return; }
  if (decision === 'abstain') {
    if (expect === 'none') b.abstain_right++; else b.abstain_wrong++;
    return;
  }
  if (expect === 'none') { b.wrong++; b.value_wrong++; return; }
  if (chose) b.correct++; else b.wrong++;
  if (valueMatch) b.value_ok++; else b.value_wrong++;
}

const pct = (x: number, n: number): string => (n ? ((x / n) * 100).toFixed(1) + '%' : '-');

const run = async () => {
  const arms = { gated: blank(), corroborate: blank(), tiebreak: blank() };
  const events: Record<string, unknown>[] = [];
  let consulted = 0;
  let opinions = 0;

  for (const site of SITES) {
    const files = (await readdir(`corpus/${site}`)).filter((f) => f.endsWith('.html')).sort();
    const step = Math.max(1, Math.floor(files.length / CAPTURES));
    const sample = files.filter((_, i) => i % step === 0).slice(0, CAPTURES);

    for (const file of sample) {
      const $clean = await fresh(site, file);
      const targetEl = pickTarget($clean);
      if (!targetEl) continue;
      const target = fingerprint($clean, targetEl);

      for (const mut of MUTATIONS) {
        const $m = await fresh(site, file);
        const el = pickTarget($m);
        if (!el) continue;
        markTarget($m, el);
        let applied = false;
        try { applied = mut.apply($m, el); } catch { applied = false; }
        if (applied === false) continue;

        const truthEl = $m(`[${TRUTH_ATTR}]`).get(0) || null;
        const truthText = truthEl ? clean($m(truthEl).text()) : null;

        // The same strip-and-canary as bench.ts, and it matters more here than
        // there: this IS the model arm its comment anticipated. An answer key
        // visible in the prompt would make every number below meaningless.
        if (truthEl) $m(truthEl).removeAttr(TRUTH_ATTR);
        if ($m.html().includes(TRUTH_ATTR)) {
          throw new Error(`canary: ${TRUTH_ATTR} leaked into arm input (${site}/${file} ${mut.id})`);
        }
        const isTruth = (e: any) => !!e && e === truthEl;
        const sameValue = (e: any) => !!e && clean($m(e).text()) === truthText;

        const g = healGated($m, target, { tau: TAU, delta: DELTA, limit: 3 });
        const gOk = g.decision === 'heal' && isTruth(g.element);
        const gVal = g.decision === 'heal' && sameValue(g.element);
        tally(arms.gated, mut.expect, g.decision, gOk, gVal);

        // The model is consulted only where it could change the answer: the gate
        // healed (so agreement is worth checking) or abstained on a thin margin
        // (so agreement might unlock it). That count is the cost figure
        // docs/AI-AND-AGENTS.md 7 lists as unestimated.
        const consult = g.decision === 'heal' || g.reason === 'thin_margin';
        if (consult) consulted++;

        const ranked = consult ? rank($m, target, { limit: 5 }) : [];
        const pick = consult && consulted <= CALL_LIMIT
          ? await pickElement(target, ranked.map((r) => r.fp))
          : null;
        if (pick) opinions++;

        // Agreement, per docs/AI-AND-AGENTS.md 3 and the benign-tie rule: the
        // same node, or a different node carrying the same string. `index: null`
        // is the model saying "none of these", which disagrees with any heal.
        const modelEl = pick && pick.index !== null ? ranked[pick.index]!.el : null;
        const agrees = !!pick && !!modelEl && !!g.element
          && (modelEl === g.element || clean($m(modelEl).text()) === clean($m(g.element).text()));

        if (!consult) {
          // The gate answered without help; both model arms inherit it unchanged.
          tally(arms.corroborate, mut.expect, g.decision, gOk, gVal);
          tally(arms.tiebreak, mut.expect, g.decision, gOk, gVal);
        } else if (!pick) {
          tally(arms.corroborate, mut.expect, 'unevaluated');
          tally(arms.tiebreak, mut.expect, 'unevaluated');
        } else {
          // corroborate: disagreement adds a reason to abstain, never removes one
          if (g.decision === 'heal' && !agrees) tally(arms.corroborate, mut.expect, 'abstain');
          else tally(arms.corroborate, mut.expect, g.decision, gOk, gVal);

          // tiebreak: agreement unlocks a thin margin, on the SCORER's element
          if (g.reason === 'thin_margin' && agrees) {
            tally(arms.tiebreak, mut.expect, 'heal', isTruth(g.element), sameValue(g.element));
          } else {
            tally(arms.tiebreak, mut.expect, g.decision, gOk, gVal);
          }
        }

        events.push({
          site, capture: file.slice(0, 8), mutation: mut.id, expect: mut.expect,
          gated: { decision: g.decision, reason: g.reason, correct: gOk },
          consulted: consult,
          model_opinion: !!pick,
          model_index: pick ? pick.index : null,
          confidence: pick ? pick.confidence : null,
          agrees: pick ? agrees : null,
        });
      }
    }
  }

  const line = '-'.repeat(92);
  console.log('\nASSAY BENCHMARK  -  fourth arm, model judgement');
  console.log(`sites ${SITES.join(', ')}  |  ${CAPTURES} captures each  |  ${MUTATIONS.length} mutations`);
  console.log(`tau ${TAU}   delta ${DELTA}   model ${hasKey() ? (process.env.ASSAY_MODEL || 'default') : 'NONE (no ANTHROPIC_API_KEY)'}\n`);

  console.log(line);
  console.log('arm'.padEnd(30) + 'n'.padStart(5) + 'exact'.padStart(9)
    + 'VALUE OK'.padStart(11) + 'VALUE WRONG'.padStart(13)
    + 'abstained'.padStart(12) + 'unmeasured'.padStart(12));
  console.log(line);
  const labels: Record<string, string> = {
    gated: `margin gate (t${TAU}/d${DELTA})`,
    corroborate: 'gate + model must agree',
    tiebreak: 'gate + model breaks thin tie',
  };
  for (const [k, a] of Object.entries(arms)) {
    const measured = a.n - a.unevaluated;
    // A rate computed over only the cases the model never saw is not this arm's
    // rate. Print nothing rather than a number that gets quoted out of context.
    const cell = (x: number) => (a.unevaluated ? '-' : pct(x, measured));
    console.log(labels[k]!.padEnd(30) + String(a.n).padStart(5)
      + cell(a.correct).padStart(9)
      + cell(a.value_ok).padStart(11)
      + cell(a.value_wrong).padStart(13)
      + cell(a.abstain_right + a.abstain_wrong).padStart(12)
      + String(a.unevaluated).padStart(12));
  }
  console.log(line);

  console.log(`\ncost: the model could change the answer on ${consulted} of ${arms.gated.n} cases `
    + `(${pct(consulted, arms.gated.n)}).`);
  console.log(`      It returned an opinion on ${opinions}.`);

  if (!opinions) {
    console.log('\n  NOT MEASURED. The model returned no opinion on any case, so both model');
    console.log('  arms are unevaluated wherever they could have differed and their rows are');
    console.log('  blank above. That is not a result and must not be reported as one.');
    console.log('  Set ANTHROPIC_API_KEY and re-run. The gated row IS real and should match');
    console.log('  the `margin gate` row from `npm run bench`.\n');
  }

  await mkdir('results', { recursive: true });
  await writeFile('results/bench-model.json', JSON.stringify({
    arms, events, measured: opinions > 0,
    config: { tau: TAU, delta: DELTA, captures: CAPTURES, sites: SITES, consulted, opinions },
  }, null, 2));
  console.log(`${events.length} events -> results/bench-model.json\n`);
};

run();
