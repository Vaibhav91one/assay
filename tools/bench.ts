// THE DELIVERABLE (PLAN.md 12).
//
// For every (site, capture, mutation) we know the correct answer exactly, because
// we made the change ourselves. So we can count the thing nobody publishes:
// how often a healer returns the WRONG element, confidently.
//
//   node tools/bench.js [--captures N] [--tau 0.55] [--delta 0.08]
//
// This file now owns one thing only: choosing which archived captures to grade.
// The mutation loop, the arms, the scoring and the table live in
// `tools/bench-core.ts`, shared with `tools/bench-live.ts` -- see the note at the
// top of that file for why a second copy was not an option.

import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { MUTATIONS } from '../src/mutate.js';
import { grade, report, type Capture } from './bench-core.js';

const arg = (name: string, dflt: number): number => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? Number(process.argv[i + 1]) : dflt;
};
const CAPTURES = arg('captures', 6);
const TAU = arg('tau', 0.6);   // calibrated, see tools/sweep.js
const DELTA = arg('delta', 0.16); // calibrated, see tools/sweep.js
const SITES = ['mattel', 'ikea', 'chicco'];

const run = async () => {
  const captures: Capture[] = [];
  for (const site of SITES) {
    const files = (await readdir(`corpus/${site}`)).filter((f) => f.endsWith('.html')).sort();
    // spread the sample across the whole time range rather than clustering
    const step = Math.max(1, Math.floor(files.length / CAPTURES));
    const sample = files.filter((_, i) => i % step === 0).slice(0, CAPTURES);

    for (const file of sample) {
      captures.push({
        site,
        capture: file.slice(0, 8),
        html: await readFile(`corpus/${site}/${file}`, 'utf8'),
      });
    }
  }

  const result = grade(captures, { tau: TAU, delta: DELTA });

  report(result, [
    `\nASSAY BENCHMARK  -  mutation arm, ground truth exact`,
    `sites ${SITES.join(', ')}  |  ${CAPTURES} captures each  |  ${MUTATIONS.length} mutations`,
  ], { tau: TAU, delta: DELTA });

  await mkdir('results', { recursive: true });
  await writeFile('results/bench.json', JSON.stringify({ ...result,
    config: { tau: TAU, delta: DELTA, captures: CAPTURES, sites: SITES } }, null, 2));
  console.log(`\n${result.events.length} events -> results/bench.json\n`);
};

run();
