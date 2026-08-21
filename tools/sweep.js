// Calibrate tau and delta against the mutation set, and PUBLISH the values.
//
// This is the contribution. Similo proposed a min-score threshold and explicitly
// declined to pick a number ("defining a suitable value for the threshold is
// non-trivial ... warrants more research"). Erratum built abstention in without
// publishing a cutoff. Testim ships 70% with no methodology. Nobody derives one
// from a measured mismatch rate.
//
// Ranking is independent of the thresholds, so we rank ONCE and sweep in memory.
//
//   node tools/sweep.js [--captures N]

import { load } from 'cheerio';
import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { fingerprint } from '../src/fingerprint.js';
import { rank } from '../src/heal.js';
import { MUTATIONS, markTarget, isTarget, TRUTH_ATTR } from '../src/mutate.js';
import { pickTarget } from '../src/target.js';

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > -1 ? Number(process.argv[i + 1]) : d;
};
const CAPTURES = arg('captures', 4);
const SITES = ['mattel', 'ikea', 'chicco'];

const fresh = async (site, file) => {
  const $ = load(await readFile(`corpus/${site}/${file}`, 'utf8'));
  $('script,style,noscript').remove();
  return $;
};


/** Collect the ranking facts once. Thresholds are applied later, in memory. */
async function collect() {
  const rows = [];
  for (const site of SITES) {
    const files = (await readdir(`corpus/${site}`)).filter((f) => f.endsWith('.html')).sort();
    const step = Math.max(1, Math.floor(files.length / CAPTURES));
    const sample = files.filter((_, i) => i % step === 0).slice(0, CAPTURES);

    for (const file of sample) {
      const $c = await fresh(site, file);
      const t0 = pickTarget($c);
      if (!t0) continue;
      const target = fingerprint($c, t0);

      for (const mut of MUTATIONS) {
        const $m = await fresh(site, file);
        const el = pickTarget($m);
        if (!el) continue;
        markTarget($m, el);
        let ok = false;
        try { ok = mut.apply($m, el); } catch { ok = false; }
        if (ok === false) continue;

        // ground truth read AFTER mutation -- see tools/bench.js
        const truthEl = $m(`[${TRUTH_ATTR}]`).get(0) || null;
        const truthText = truthEl ? $m(truthEl).text().replace(/\s+/g, ' ').trim() : null;

        const ranked = rank($m, target, { limit: 6 });
        if (!ranked.length) continue;
        const best = ranked[0];
        const runnerUp = ranked[1];
        const margin = runnerUp ? best.score - runnerUp.score : 1;
        const bestText = $m(best.el).text().replace(/\s+/g, ' ').trim();
        rows.push({
          site, mutation: mut.id, expect: mut.expect,
          bestScore: best.score,
          margin,
          bestIsTarget: isTarget(best.el),
          // the scraping-relevant notion of correct: did we get the right STRING
          bestValueOk: truthText !== null && bestText === truthText,
          tiedTexts: ranked.map((r) => ({ s: r.score, v: (r.fp.text || '').trim() })),
        });
      }
    }
  }
  return rows;
}

/** Apply a (tau, delta) pair to the pre-computed rankings. */
function evaluate(rows, tau, delta) {
  const r = { n: rows.length, correct: 0, wrong: 0, abstain_right: 0, abstain_wrong: 0 };
  for (const row of rows) {
    let decision;
    if (row.bestScore <= tau) decision = 'abstain';
    else if (row.margin <= delta) {
      const tied = row.tiedTexts.filter((t) => row.bestScore - t.s <= delta);
      decision = new Set(tied.map((t) => t.v)).size === 1 ? 'heal' : 'abstain';
    } else decision = 'heal';

    if (decision === 'abstain') {
      if (row.expect === 'none') r.abstain_right++;
      else r.abstain_wrong++;
    } else if (row.expect === 'none') r.wrong++;
    else if (row.bestValueOk) r.correct++;
    else r.wrong++;
  }
  return r;
}

const run = async () => {
  console.log(`collecting rankings (${SITES.length} sites x ${CAPTURES} captures x ${MUTATIONS.length} mutations)...`);
  const rows = await collect();
  console.log(`${rows.length} ranked cases\n`);

  const TAUS = [0.3, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85];
  const DELTAS = [0, 0.02, 0.05, 0.08, 0.12, 0.16, 0.2, 0.25, 0.3, 0.4];

  const grid = [];
  for (const tau of TAUS) {
    for (const delta of DELTAS) {
      const r = evaluate(rows, tau, delta);
      grid.push({ tau, delta, ...r,
        wrongPct: r.wrong / r.n, correctPct: r.correct / r.n,
        abstainPct: (r.abstain_right + r.abstain_wrong) / r.n });
    }
  }

  // The operating point we want: minimise WRONG first (the Erratum principle --
  // a no-match is always preferable to a mismatch), then maximise CORRECT.
  const sorted = [...grid].sort((a, b) =>
    a.wrong - b.wrong || b.correct - a.correct || a.abstainPct - b.abstainPct);
  const best = sorted[0];

  const pc = (x) => (x * 100).toFixed(1).padStart(5) + '%';

  console.log('VALUE-WRONG %  as a function of tau (rows) and delta (cols)');
  console.log('        ' + DELTAS.map((d) => String(d).padStart(7)).join(''));
  for (const tau of TAUS) {
    const cells = DELTAS.map((d) => {
      const g = grid.find((x) => x.tau === tau && x.delta === d);
      return pc(g.wrongPct).padStart(7);
    }).join('');
    console.log(String(tau).padEnd(8) + cells);
  }

  console.log('\nCORRECT %  (same axes -- read together with the table above)');
  console.log('        ' + DELTAS.map((d) => String(d).padStart(7)).join(''));
  for (const tau of TAUS) {
    const cells = DELTAS.map((d) => {
      const g = grid.find((x) => x.tau === tau && x.delta === d);
      return pc(g.correctPct).padStart(7);
    }).join('');
    console.log(String(tau).padEnd(8) + cells);
  }

  console.log('\n' + '='.repeat(70));
  console.log(`RECOMMENDED OPERATING POINT   tau = ${best.tau}   delta = ${best.delta}`);
  console.log('='.repeat(70));
  console.log(`  correct        ${pc(best.correctPct)}   (${best.correct}/${best.n})`);
  console.log(`  WRONG          ${pc(best.wrongPct)}   (${best.wrong}/${best.n})`);
  console.log(`  abstained      ${pc(best.abstainPct)}   right ${best.abstain_right}, unnecessary ${best.abstain_wrong}`);

  const ungated = evaluate(rows, 0, 0);
  console.log(`\n  vs ungated:    WRONG ${pc(ungated.wrong / ungated.n)} -> ${pc(best.wrongPct)}` +
    `   CORRECT ${pc(ungated.correct / ungated.n)} -> ${pc(best.correctPct)}`);

  await mkdir('results', { recursive: true });
  await writeFile('results/sweep.json', JSON.stringify({ grid, best, ungated, rows: rows.length }, null, 2));
  console.log(`\ngrid -> results/sweep.json\n`);
};

run();
