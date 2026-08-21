// THE DELIVERABLE (PLAN.md 12).
//
// For every (site, capture, mutation) we know the correct answer exactly, because
// we made the change ourselves. So we can count the thing nobody publishes:
// how often a healer returns the WRONG element, confidently.
//
//   node tools/bench.js [--captures N] [--tau 0.55] [--delta 0.08]

import { load } from 'cheerio';
import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { fingerprint, candidates } from '../src/fingerprint.js';
import { heal, healGated, rank } from '../src/heal.js';
import { MUTATIONS, markTarget, TRUTH_ATTR } from '../src/mutate.js';
import { pickTarget } from '../src/target.js';

const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? Number(process.argv[i + 1]) : dflt;
};
const CAPTURES = arg('captures', 6);
const TAU = arg('tau', 0.6);   // calibrated, see tools/sweep.js
const DELTA = arg('delta', 0.16); // calibrated, see tools/sweep.js
const SITES = ['mattel', 'ikea', 'chicco'];

const fresh = async (site, file) => {
  const $ = load(await readFile(`corpus/${site}/${file}`, 'utf8'));
  $('script,style,noscript').remove();
  return $;
};

/** A real recall item, picked the way a human would at capture time. */

/** Naive baseline: first element sharing the original tag. What a beginner writes. */
function healNaive($, target) {
  for (const el of candidates($)) {
    if (el.name === target.tag) return { element: el };
  }
  return null;
}

const blank = () => ({ correct: 0, wrong: 0, value_ok: 0, value_wrong: 0,
  abstain_right: 0, abstain_wrong: 0, n: 0 });

/**
 * Two notions of correct, and the difference matters.
 *
 *   exact  -- did we return THE node we fingerprinted?   (test-automation metric)
 *   value  -- did we return the right STRING?            (scraping metric)
 *
 * They diverge when the scorer picks a parent or child of the true node, which
 * carries identical text. Similo's own M1 metric quietly counts that as a match
 * and M4 does not; for a scraper it genuinely IS a match, because the extracted
 * value is the same. We report BOTH rather than picking the flattering one.
 */
function tally(bucket, expect, decision, chose, valueMatch) {
  bucket.n++;
  if (decision === 'abstain') {
    if (expect === 'none') bucket.abstain_right++;
    else bucket.abstain_wrong++;
    return;
  }
  if (expect === 'none') { bucket.wrong++; bucket.value_wrong++; return; }
  if (chose) bucket.correct++; else bucket.wrong++;
  if (valueMatch) bucket.value_ok++; else bucket.value_wrong++;
}

const pct = (x, n) => (n ? ((x / n) * 100).toFixed(1) + '%' : '-');

const run = async () => {
  const arms = {
    naive: blank(),
    plain: blank(),
    gated: blank(),
  };
  const byMutation = {};
  const events = [];

  for (const site of SITES) {
    const files = (await readdir(`corpus/${site}`)).filter((f) => f.endsWith('.html')).sort();
    // spread the sample across the whole time range rather than clustering
    const step = Math.max(1, Math.floor(files.length / CAPTURES));
    const sample = files.filter((_, i) => i % step === 0).slice(0, CAPTURES);

    for (const file of sample) {
      const $clean = await fresh(site, file);
      const targetEl = pickTarget($clean);
      if (!targetEl) continue;
      const target = fingerprint($clean, targetEl);

      for (const mut of MUTATIONS) {
        // reload so mutations never compound
        const $m = await fresh(site, file);
        const el = pickTarget($m);
        if (!el) continue;
        markTarget($m, el);
        let applied = false;
        try {
          applied = mut.apply($m, el);
        } catch {
          applied = false;
        }
        if (applied === false) continue;

        // Read ground truth AFTER mutating. For translate_text the page is
        // rewritten, so the correct value is the translated string -- comparing
        // against the pre-mutation text would score every correct heal as wrong.
        // The marked node is re-found because swap_tag replaces the element.
        const truthEl = $m(`[${TRUTH_ATTR}]`).get(0) || null;
        const truthText = truthEl ? $m(truthEl).text().replace(/\s+/g, ' ').trim() : null;

        // Strip the truth marker BEFORE any arm sees the page. The scorer never
        // reads it, but a future model arm reads raw HTML -- an answer key
        // visible in the input is contamination (docs/CRITIQUE.md). Identity
        // survives as a node reference; the canary fails the bench loudly if
        // the attribute ever leaks back into arm input.
        if (truthEl) $m(truthEl).removeAttr(TRUTH_ATTR);
        if ($m.html().includes(TRUTH_ATTR)) {
          throw new Error(`canary: ${TRUTH_ATTR} leaked into arm input (${site}/${file} ${mut.id})`);
        }
        const isTruth = (el2) => !!el2 && el2 === truthEl;

        byMutation[mut.id] ||= { label: mut.label, expect: mut.expect, plain: blank(), gated: blank() };

        // --- naive
        const sameValue = (el2) =>
          el2 && $m(el2).text().replace(/\s+/g, ' ').trim() === truthText;

        const n = healNaive($m, target);
        tally(arms.naive, mut.expect, n ? 'heal' : 'abstain',
          n && isTruth(n.element), n && sameValue(n.element));

        // --- plain (always answers)
        const p = heal($m, target, { limit: 3 });
        const pOk = p && isTruth(p.element);
        const pVal = p && sameValue(p.element);
        tally(arms.plain, mut.expect, p ? 'heal' : 'abstain', pOk, pVal);
        tally(byMutation[mut.id].plain, mut.expect, p ? 'heal' : 'abstain', pOk, pVal);

        // --- gated
        const g = healGated($m, target, { tau: TAU, delta: DELTA, limit: 3 });
        const gOk = g.decision === 'heal' && isTruth(g.element);
        const gVal = g.decision === 'heal' && sameValue(g.element);
        tally(arms.gated, mut.expect, g.decision, gOk, gVal);
        tally(byMutation[mut.id].gated, mut.expect, g.decision, gOk, gVal);

        events.push({
          site, capture: file.slice(0, 8), mutation: mut.id, expect: mut.expect,
          plain: { correct: !!pOk, score: p ? Number(p.score.toFixed(4)) : null,
                   margin: p && p.margin !== null ? Number(p.margin.toFixed(4)) : null },
          gated: { decision: g.decision, reason: g.reason, correct: gOk,
                   score: g.score ? Number(g.score.toFixed(4)) : null,
                   margin: g.margin !== undefined && g.margin !== null ? Number(g.margin.toFixed(4)) : null },
        });
      }
    }
  }

  // ---------- report ----------
  const line = '-'.repeat(84);
  console.log(`\nASSAY BENCHMARK  -  mutation arm, ground truth exact`);
  console.log(`sites ${SITES.join(', ')}  |  ${CAPTURES} captures each  |  ${MUTATIONS.length} mutations`);
  console.log(`tau ${TAU}   delta ${DELTA}\n`);

  console.log(line);
  console.log(
    'arm'.padEnd(28) + 'n'.padStart(5) + 'exact'.padStart(9) +
    'VALUE OK'.padStart(11) + 'VALUE WRONG'.padStart(13) + 'abstained'.padStart(12)
  );
  console.log(line);
  for (const [name, a] of Object.entries(arms)) {
    const label = { naive: 'naive (first tag match)', plain: 'similarity, no gate',
      gated: `margin gate (t${TAU}/d${DELTA})` }[name];
    console.log(
      label.padEnd(28) + String(a.n).padStart(5) +
      pct(a.correct, a.n).padStart(9) +
      pct(a.value_ok, a.n).padStart(11) +
      pct(a.value_wrong, a.n).padStart(13) +
      pct(a.abstain_right + a.abstain_wrong, a.n).padStart(12)
    );
  }
  console.log(line);
  console.log('\nVALUE WRONG = returned a confidently incorrect VALUE. This is the number');
  console.log('nobody in the field publishes, and it is the whole point of the project.');
  console.log('exact = returned the identical node. Lower than VALUE OK because picking a');
  console.log('parent or child with the same text is a scraping success, not a failure.\n');

  console.log(line);
  console.log('per mutation'.padEnd(38) + 'plain V-WRONG'.padStart(14) + 'gated V-WRONG'.padStart(14) + 'gated abstain'.padStart(16));
  console.log(line);
  for (const [id, m] of Object.entries(byMutation)) {
    const tag = m.expect === 'none' ? ' [tau]' : m.expect === 'ambiguous' ? ' [delta]' : '';
    console.log(
      (m.label + tag).padEnd(38) +
      pct(m.plain.value_wrong, m.plain.n).padStart(14) +
      pct(m.gated.value_wrong, m.gated.n).padStart(14) +
      pct(m.gated.abstain_right + m.gated.abstain_wrong, m.gated.n).padStart(16)
    );
  }
  console.log(line);

  await mkdir('results', { recursive: true });
  await writeFile('results/bench.json', JSON.stringify({ arms, byMutation, events,
    config: { tau: TAU, delta: DELTA, captures: CAPTURES, sites: SITES } }, null, 2));
  console.log(`\n${events.length} events -> results/bench.json\n`);
};

run();
