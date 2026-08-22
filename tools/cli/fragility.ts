// `assay fragility` -- the F1 report, run on adoption day and after a redesign.
//
// A command MODULE, not a binary: `bin/assay.ts` (owned by the CLI feature)
// registers the exported `command`, and `npm run fragility` runs this file
// directly. Both paths call the same function, so the two cannot drift.

import { Command } from 'commander';
import { recomputeAll, standingState, WINDOW } from '../../src/health/observe.js';
import { closeDb } from '../../src/store/index.js';

/** Order the report the way F1 asks: worst first, and unknowns not pretended into a grade. */
const RANK: Record<string, number> = { fragile: 0, serviceable: 1, sturdy: 2, insufficient_history: 3 };

export const command = new Command('fragility')
  .description('Per-field fragility grade and drift state, from the pages the store still has.')
  .argument('[target]', 'limit to one target id')
  .option('--window <n>', `runs to look back over (default ${WINDOW})`, String(WINDOW))
  .option('--read', 'print the stored standing state without recomputing it')
  .action(async (target: string | undefined, opts: { window: string; read?: boolean }) => {
    const window = Number(opts.window);
    // No silent coercion: a window of "abc" must not become the default and
    // report a grade the operator did not ask for.
    if (!Number.isInteger(window) || window < 1) {
      throw new Error(`--window must be a positive integer, got "${opts.window}"`);
    }

    if (opts.read) {
      for (const s of await standingState(target ?? null)) {
        console.log(
          `${s.target}/${s.field}  ${s.fragility_grade ?? 'not assessed'}  `
          + `${s.drift_state ?? 'not assessed'}  ${s.assessed_at ?? ''}`,
        );
      }
      return;
    }

    const all = (await recomputeAll(target ?? null, window))
      .sort((a, b) => RANK[a.fragility_grade]! - RANK[b.fragility_grade]!);

    for (const h of all) {
      console.log(`\n${h.target}/${h.field}`);
      console.log(`  fragility  ${h.fragility_grade}`);
      console.log(`             ${h.fragility.note}`);
      console.log(`  drift      ${h.drift_state}`);
      console.log(`             ${h.drift.note}`);
      // The denominator, always. A grade over 6 of 30 runs is a different claim
      // from a grade over 30, and the reader has to be able to see which it is.
      console.log(
        `  observed   ${h.fragility.observations} of ${h.total_runs} runs`
        + (h.unobserved_runs ? `  (${h.unobserved_runs} page(s) pruned)` : ''),
      );
    }
    console.log(`\n${all.length} field(s) assessed.`);
  });

// The loader reads `default` / `COMMAND` / `COMMANDS`; a lowercase `command`
// alone is not one of them, and an unsatisfied module stops the whole binary.
export default command;

if (import.meta.url === `file://${process.argv[1]}`) {
  await command.parseAsync(process.argv);
  await closeDb();
}
