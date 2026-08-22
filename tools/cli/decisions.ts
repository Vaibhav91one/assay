// `assay decisions` -- the queue, from a terminal.
//
// Exported as a command module for bin/assay.ts to register; also runnable on
// its own (`tsx tools/cli/decisions.ts list`) so it is testable before the
// binary that mounts it exists.

import { Command } from 'commander';
import { openQueue, explain, closeDb } from '../../src/store/index.js';
import { Resolution, resolve, undo } from '../../src/decisions/index.js';

const out = (v: unknown) => console.log(JSON.stringify(v, null, 2));

/** Non-zero on a refusal: a script that resolves in a loop has to notice. */
async function report(result: { ok: boolean } & Record<string, unknown>) {
  out(result);
  if (!result.ok) process.exitCode = 1;
}

export const command = new Command('decisions')
  .description('The abstain queue: what is waiting on a human, and answering it.');

command
  .command('list')
  .description('Open decisions, with the candidates the gate ranked.')
  .option('--limit <n>', 'how many', '50')
  .action(async (opts: { limit: string }) => {
    const limit = Number(opts.limit);
    if (!Number.isInteger(limit) || limit < 1) {
      console.error('--limit must be a positive integer.');
      process.exitCode = 1;
      return;
    }
    const items = await openQueue(limit);
    const decisions = [];
    for (const it of items) {
      const x = await explain(it.proofId);
      if (!x) continue;
      decisions.push({
        proof: it.proofId,
        field: x.field,
        run: x.run,
        reason: x.reason,
        stakes_rows: it.stakesRows,
        group_key: it.groupKey,
        // Raw, and deliberately not labelled "nomination": on an OPEN item this
        // column is either a model's nomination (`model_nominated:<n>`) or the
        // receipt of a human decision that was undone. `undone_at` is what tells
        // the two apart, so both go out rather than one guessed label.
        resolution: it.resolution,
        undone_at: it.undoneAt,
        candidates: x.ranked ?? [],
      });
    }
    out({ decisions });
    await closeDb();
  });

command
  .command('resolve')
  .description('Answer a held cell -- and every open item on the same template.')
  .argument('<proof>', 'the proof id from `decisions list`')
  .argument('<answer>', 'first | second | empty | neither')
  .action(async (proof: string, answer: string) => {
    const parsed = Resolution.safeParse(answer);
    if (!parsed.success) {
      console.error(`answer must be one of: ${Resolution.options.join(', ')}`);
      process.exitCode = 1;
      return;
    }
    await report(await resolve({ proof, resolution: parsed.data }));
    await closeDb();
  });

command
  .command('undo')
  .description('Take a decision back. The whole group, and nothing is deleted.')
  .argument('<proof>', 'the proof id of any item in the decision')
  .action(async (proof: string) => {
    await report(await undo({ proof }));
    await closeDb();
  });

export default command;

if (import.meta.url === `file://${process.argv[1]}`) {
  await command.parseAsync(process.argv);
}
