// Server-only. Reads a file off disk, so importing it from a client component
// would drag `node:fs` into the browser bundle; see web/lib/queue.ts on why
// `server-only` is deliberately not a dependency.
//
// The one claim on the front of this product, read off the artefact that
// supports it rather than typed into a paragraph.
//
// `results/bench.json` is what `npm run bench` writes: three arms over the same
// mutated captures -- `naive` (take the selector's first match), `plain` (rank,
// always publish the winner) and `gated` (rank, publish only past the
// thresholds). The headline "0 wrong values published" is `arms.gated
// .value_wrong` and nothing else, so it is COUNTED here on every render rather
// than quoted. The day a regression makes it 3, the home page says 3.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export interface Bench {
  /** Rows judged: one mutated capture against a known answer. */
  cases: number;
  /** Wrong values the gated arm published. The claim is that this is zero. */
  wrong: number;
  /** Wrong values the ungated baseline published over the same rows. */
  naiveWrong: number;
}

/**
 * The numbers, or null when the file is not there.
 *
 * NULL IS A FIRST-CLASS ANSWER. A checkout without `results/bench.json` -- a
 * fork, a Docker image built from a subset, a tree where the bench has not been
 * run -- must render no strip at all. The alternative is a home page making a
 * measured claim with nothing behind it, which is the exact failure this
 * product exists to argue against.
 *
 * Cached in module scope: the file is an artefact of a build step, not state,
 * and re-reading it per render would put a synchronous disk read on every
 * navigation to Home. A `null` result is cached too -- a missing file is not
 * going to appear between two renders of the same process, and re-`stat`ing for
 * it forever is the cost this cache exists to avoid.
 */
let cached: Bench | null | undefined;

export function bench(): Bench | null {
  if (cached === undefined) cached = read();
  return cached;
}

/**
 * `web/` under `next dev`, the repo root under `npx next start web`.
 *
 * Same split `next.config.ts` documents for `ASSAY_CAPTURES`: the working
 * directory is not the same place in the two cases, so both are tried rather
 * than one being picked and being wrong half the time.
 */
function read(): Bench | null {
  for (const dir of ['..', '.']) {
    try {
      const raw = JSON.parse(readFileSync(resolve(process.cwd(), dir, 'results', 'bench.json'), 'utf8'));
      const cases = Array.isArray(raw?.events) ? raw.events.length : 0;
      const wrong = raw?.arms?.gated?.value_wrong;
      const naiveWrong = raw?.arms?.naive?.value_wrong;
      // Every number checked before any of them is shown. A partially written
      // file is the one shape that would otherwise render "undefined wrong
      // values published" in the product's loudest sentence.
      if (cases > 0 && typeof wrong === 'number' && typeof naiveWrong === 'number') {
        return { cases, wrong, naiveWrong };
      }
    } catch {
      // Missing, unreadable or not JSON: try the other root, then give up.
    }
  }
  return null;
}
