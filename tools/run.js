// The whole system, end to end, on two real captures of a real site.
//
//   run 1 (older capture)  -> scrape + capture fingerprint          [CAPTURE]
//   run 2 (newer capture)  -> scrape with the stored selector       [DETECT]
//                          -> rank candidates, apply the gate       [DECIDE]
//                          -> emit a proof record either way        [PROVE]
//
// The proof record is emitted for an ABSTAIN exactly as it is for a heal. A
// system that only explains itself when it succeeds is not accountable.
//
//   node tools/run.js [site] [fromYYYYMM] [toYYYYMM]

import { load } from 'cheerio';
import { readFile, readdir, appendFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fingerprint, skeletonHash } from '../src/fingerprint.js';
import { healGated } from '../src/heal.js';
import { detect } from '../src/detect.js';
import { publishRow } from '../src/envelope.js';
import { pickTarget } from '../src/target.js';

const [, , SITE = 'ikea', FROM = '202401', TO = '202608'] = process.argv;
const TAU = 0.6;
const DELTA = 0.16; // calibrated -- see tools/sweep.js and results/sweep.json

const parse = async (site, file) => {
  const $ = load(await readFile(`corpus/${site}/${file}`, 'utf8'));
  $('script,style,noscript').remove();
  return $;
};
const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
const sha = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16);


/** CSS selector good enough to re-run next time. What breaks on a redesign. */
function selectorFor($, el) {
  const a = el.attribs || {};
  if (a.id) return `#${a.id}`;
  const cls = (a.class || '').split(/\s+/).filter(Boolean);
  return cls.length ? `${el.name}.${cls[0]}` : el.name;
}

const say = (step, msg) => console.log(`  ${step.padEnd(9)} ${msg}`);

const run = async () => {
  const files = (await readdir(`corpus/${SITE}`)).filter((f) => f.endsWith('.html')).sort();
  const f1 = files.find((f) => f.startsWith(FROM)) || files[0];
  const f2 = files.find((f) => f.startsWith(TO)) || files.at(-1);

  console.log(`\nASSAY  ${SITE}   run 1 = ${f1.slice(0, 8)}   run 2 = ${f2.slice(0, 8)}\n`);

  // ---------------- RUN 1 : capture ----------------
  const $1 = await parse(SITE, f1);
  const el1 = pickTarget($1);
  if (!el1) return console.log('no target in run 1');

  const target = fingerprint($1, el1);
  const selector = selectorFor($1, el1);
  const value1 = target.text;
  const skel1 = skeletonHash($1).hash;

  say('RUN 1', `selector  ${selector}`);
  say('', `value     "${value1.slice(0, 58)}"`);
  say('', `skeleton  ${skel1}`);
  say('', `captured  ${Object.values(target).filter((v) => v !== null && v !== 0).length} non-null properties`);

  // what the value looked like -- this is what makes category-D detection possible
  const expected = {
    regex: '(recall|rappel|retirada|remedy)',
    regexFlags: 'i',
    minLen: 20,
  };

  // ---------------- RUN 2 : re-scrape with the stored selector ----------------
  const $2 = await parse(SITE, f2);
  const skel2 = skeletonHash($2).hash;
  const hit = $2(selector).first();
  const value2 = hit.length ? clean(hit.text()).slice(0, 200) : null;

  console.log();
  say('RUN 2', `selector ${selector} -> ${hit.length ? `${hit.length} match(es)` : 'NO MATCH'}`);
  say('', `skeleton  ${skel2}  ${skel1 === skel2 ? '(unchanged)' : 'CHANGED'}`);
  if (value2) say('', `value     "${value2.slice(0, 58)}"`);

  // ---------------- DETECT ----------------
  const diag = detect({
    field: 'recall_title',
    value: value2,
    expected,
    history: [{ nullRate: 0 }, { nullRate: 0 }, { nullRate: 0 }],
    skeleton: { before: skel1, after: skel2 },
    anchors: {
      css: value2,
      heading: clean($2('h1').first().text()) || null,
    },
  });

  console.log();
  say('DETECT', diag.broken ? `BROKEN  (${diag.cause})` : 'healthy');
  diag.signals.forEach((s) => say('', `- ${s}`));

  if (!diag.broken) {
    const row = publishRow({
      values: { recall_title: value2 },
      statuses: { recall_title: { status: 'live' } },
      run: f2.slice(0, 8),
      proof: `pr_${sha(`${f1}${f2}${value2 || ''}`)}`,
    });
    console.log();
    say('PUBLISH', 'row emitted with trust envelope');
    console.log('\n' + JSON.stringify(row, null, 2) + '\n');
    return;
  }

  // ---------------- DECIDE ----------------
  const g = healGated($2, target, { tau: TAU, delta: DELTA, limit: 5 });

  console.log();
  say('RANK', `${g.ranked ? g.ranked.length : 0} candidates scored`);
  (g.ranked || []).slice(0, 4).forEach((r, i) =>
    say('', `${i === 0 ? '->' : '  '} ${r.score.toFixed(4)}  <${r.fp.tag}> "${clean(r.fp.text).slice(0, 46)}"`)
  );

  console.log();
  say('GATE', `score ${g.score?.toFixed(4)}  runner-up ${g.runnerUp?.toFixed(4) ?? '-'}  margin ${g.margin?.toFixed(4) ?? '-'}`);
  say('', `tau ${TAU}  delta ${DELTA}`);
  say('', `DECISION  ${g.decision.toUpperCase()}  (${g.reason})`);

  // ---------------- PROVE ----------------
  const proofId = `pr_${sha(`${f1}${f2}${g.decision}${g.reason}`)}`;
  const proof = {
    id: proofId,
    event: g.decision === 'heal' ? 'heal' : 'abstain',
    ts: null, // stamped by the caller; kept null so runs are byte-reproducible
    site: SITE,
    field: 'recall_title',
    mode: 'tiered',
    run_before: f1.slice(0, 8),
    run_after: f2.slice(0, 8),
    before: {
      value: value1,
      selector,
      skeleton: skel1,
    },
    after: g.decision === 'heal'
      ? {
          value: clean(g.fingerprint.text),
          selector: selectorFor($2, g.element),
          skeleton: skel2,
        }
      : null,
    diagnosis: diag.diagnosis,
    attributed_cause: diag.cause,
    candidates: (g.ranked || []).slice(0, 3).map((r) => ({
      selector: selectorFor($2, r.el),
      score: Number(r.score.toFixed(4)),
      value: clean(r.fp.text).slice(0, 80),
    })),
    margin: g.margin !== undefined && g.margin !== null ? Number(g.margin.toFixed(4)) : null,
    thresholds: { tau: TAU, delta: DELTA, calibrated_on: 'results/sweep.json' },
    decision: g.decision === 'heal' ? 'auto_approved' : 'abstain',
    reason: g.reason,
    approved_by: 'assay',
    golden_sha256: sha(value1 || ''),
  };

  await mkdir('results', { recursive: true });
  await appendFile('results/events.jsonl', JSON.stringify(proof) + '\n');

  console.log();
  say('PROOF', 'appended to results/events.jsonl');

  // ---------------- PUBLISH ----------------
  // The row that leaves the building. A heal publishes the relocated value; an
  // abstain publishes a labelled hole. Nothing else is possible by construction.
  const row = publishRow({
    values: { recall_title: g.decision === 'heal' ? clean(g.fingerprint.text) : null },
    statuses: {
      recall_title: g.decision === 'heal'
        ? { status: 'healed' }
        : { status: 'quarantined', reason: g.reason, held_since_run: f2.slice(0, 8) },
    },
    run: f2.slice(0, 8),
    proof: proofId,
  });
  say('PUBLISH', g.decision === 'heal' ? 'healed value published' : 'held -- labelled hole published');
  console.log('\n' + JSON.stringify({ proof, row }, null, 2) + '\n');
};

run();
