// Where does the algorithm actually lose? Measure before optimising.
//
//   node tools/diagnose.js [--captures N]

import { load } from 'cheerio';
import { readFile, readdir } from 'node:fs/promises';
import { fingerprint } from '../src/fingerprint.js';
import { rank, score, SPEC } from '../src/heal.js';
import { MUTATIONS, markTarget, isTarget } from '../src/mutate.js';

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > -1 ? Number(process.argv[i + 1]) : d;
};
const CAPTURES = arg('captures', 6);
const SITES = ['mattel', 'ikea', 'chicco'];
const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();

const fresh = async (site, file) => {
  const $ = load(await readFile(`corpus/${site}/${file}`, 'utf8'));
  $('script,style,noscript').remove();
  return $;
};

function pickTarget($) {
  let best = null;
  $('h2,h3,a,li').each((i, el) => {
    if (best) return;
    const t = clean($(el).text());
    if (t.length < 20 || t.length > 140) return;
    if (!/recall|rappel|retirada|remedy kit/i.test(t)) return;
    if (/recalls\.gov|learn more|click here|^product recalls$/i.test(t)) return;
    best = el;
  });
  return best;
}

const run = async () => {
  const failures = [];
  const okMargins = [];
  const badMargins = [];
  let n = 0;

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
        let applied = false;
        try { applied = mut.apply($m, el); } catch { applied = false; }
        if (applied === false) continue;
        n++;

        const ranked = rank($m, target, { limit: 6 });
        if (!ranked.length) continue;
        const best = ranked[0];
        const margin = ranked[1] ? best.score - ranked[1].score : 1;
        const correct = isTarget(best.el);

        if (mut.expect === 'none') continue; // nothing is correct; tau's job

        if (correct) {
          okMargins.push(margin);
        } else {
          badMargins.push(margin);
          // where did the true target rank, and what did we lose on?
          const truthIdx = ranked.findIndex((r) => isTarget(r.el));
          const truth = truthIdx > -1 ? ranked[truthIdx] : null;
          failures.push({
            site, capture: file.slice(0, 6), mutation: mut.id,
            chosen: clean(best.fp.text).slice(0, 44),
            chosenScore: best.score,
            truthRank: truthIdx,
            truthScore: truth ? truth.score : null,
            gap: truth ? best.score - truth.score : null,
            margin,
            chosenParts: best.parts,
            truthParts: truth ? score(target, truth.fp).parts : null,
          });
        }
      }
    }
  }

  console.log(`\n${n} cases, ${failures.length} wrong picks (excluding remove_field)\n`);

  const stat = (a) => a.length
    ? { min: Math.min(...a).toFixed(3), med: a.sort((x, y) => x - y)[Math.floor(a.length / 2)].toFixed(3), max: Math.max(...a).toFixed(3) }
    : null;
  console.log('MARGIN separates right from wrong?');
  console.log('  correct picks  ', JSON.stringify(stat([...okMargins])));
  console.log('  WRONG picks    ', JSON.stringify(stat([...badMargins])));
  console.log('  -> if the wrong picks have LOW margins, delta can catch them.\n');

  const byMut = {};
  failures.forEach((f) => { (byMut[f.mutation] ||= []).push(f); });

  for (const [mut, fs] of Object.entries(byMut)) {
    console.log(`\n=== ${mut}  (${fs.length} failures) ===`);
    for (const f of fs.slice(0, 4)) {
      console.log(`  ${f.site}/${f.capture}  margin ${f.margin.toFixed(4)}`);
      console.log(`    chose  ${f.chosenScore.toFixed(4)}  "${f.chosen}"`);
      console.log(`    truth  ${f.truthScore === null ? 'NOT IN TOP 6' : f.truthScore.toFixed(4) + `  (rank ${f.truthRank})`}`);
      if (f.truthParts) {
        const diffs = Object.keys(f.chosenParts)
          .filter((k) => f.truthParts[k] !== undefined)
          .map((k) => [k, (f.chosenParts[k] - f.truthParts[k])])
          .filter(([, d]) => Math.abs(d) > 0.01)
          .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
          .slice(0, 4);
        const w = Object.fromEntries(SPEC.map(([k, wt]) => [k, wt]));
        console.log(`    lost on: ` + diffs.map(([k, d]) =>
          `${k} ${d > 0 ? '+' : ''}${d.toFixed(2)} (w${w[k]})`).join('  '));
      }
    }
  }
  console.log();
};

run();
