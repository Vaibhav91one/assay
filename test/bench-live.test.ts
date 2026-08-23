// The live arm has two ways to become a lie, and this file is one guard for each.
//
// 1. IT DRIFTS. `tools/sweep.ts` once kept a hand-copy of the gate's arithmetic
//    and ended up reporting 3 wrong values at the shipped thresholds where bench
//    reported zero -- it was grading a healer that does not exist. Two
//    benchmarks over one gate is the same shape of hazard one level up, so both
//    of them go through `tools/bench-core.ts` and neither is allowed to reach
//    for `healGated` on its own. That is checked here as source text, because
//    the failure is a second implementation existing at all, not a number.
//
// 2. IT REPORTS GREEN OVER NOTHING. `npm run bench:live` prints a table whether
//    it graded 26 cases or zero, and a 0.0% wrong rate over an empty set is the
//    exact failure this project exists to name. So: re-grade the committed cache
//    and require that it reproduces `results/bench-live.json`, over a non-empty
//    set of cases.
//
// What is deliberately NOT asserted is the live wrong-rate itself. The archived
// 153-case number is an invariant because the corpus is frozen; the live number
// is a measurement of pages nobody here controls. Pinning it would turn an
// honest refetch into a red test, and the finding would get buried in the fix.

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { grade, type Capture } from '../tools/bench-core.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (p: string) => readFileSync(`${root}${p}`, 'utf8');
const source = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

interface Entry { site: string; file: string; bytes: number; digest: string }

describe('the live arm grades through one implementation', () => {
  it('bench.ts and bench-live.ts both import the shared grader', () => {
    for (const f of ['tools/bench.ts', 'tools/bench-live.ts']) {
      expect(source(f)).toMatch(/import \{[^}]*\bgrade\b[^}]*\} from '\.\/bench-core\.js'/);
    }
  });

  it('neither benchmark calls the gate directly -- that is bench-core.ts\'s job', () => {
    for (const f of ['tools/bench.ts', 'tools/bench-live.ts']) {
      expect(source(f)).not.toMatch(/healGated/);
    }
  });
});

describe('the committed live cache', () => {
  const manifest: Entry[] = JSON.parse(read('corpus-live/manifest.json'));

  it('lists a page for each of the three sites', () => {
    expect(manifest.map((e) => e.site).sort()).toEqual(['chicco', 'ikea', 'mattel']);
  });

  it('matches the bytes on disk, so the numbers are re-runnable without a token', () => {
    for (const e of manifest) {
      expect(existsSync(`${root}${e.file}`), e.file).toBe(true);
      expect(Buffer.byteLength(read(e.file)), e.file).toBe(e.bytes);
    }
  });

  it('reproduces results/bench-live.json, over a non-empty set of cases', () => {
    const published = JSON.parse(read('results/bench-live.json'));
    const captures: Capture[] = manifest
      .map((e): Capture => ({
        site: e.site,
        capture: e.file.split('/').pop()!.replace('.html', ''),
        html: read(e.file),
      }))
      // grade() is order-sensitive in the event log; published order is the
      // declaration order in bench-live.ts, not the manifest's sort.
      .sort((a, b) => ['mattel', 'ikea', 'chicco'].indexOf(a.site) - ['mattel', 'ikea', 'chicco'].indexOf(b.site));

    const result = grade(captures, { tau: published.config.tau, delta: published.config.delta });

    expect(result.arms.gated.n).toBeGreaterThan(0);
    expect(result.events.length).toBe(result.arms.gated.n);
    expect(result.arms).toEqual(published.arms);
    expect(result.events).toEqual(published.events);
  }, 60_000);
});
