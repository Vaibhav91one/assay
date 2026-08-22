// `assay watch` -- putting a page under watch from a terminal.
//
// Same contract as every other module in this directory: a default export of
// commander Commands, a description on each, and importing this file does
// nothing. The store is only reached inside an action, so `assay --help` still
// works with no database.
//
// Also runnable on its own (`tsx tools/cli/setup.ts list`), like the others, so
// it is testable before the binary that mounts it is involved.

import { Command } from 'commander';
import type { HelpGroup } from './index.js';
import {
  createTarget, listTargets, showTarget, pauseTarget, resumeTarget, deleteTarget,
} from '../../src/setup/index.js';
import { closeDb } from '../../src/store/index.js';

const out = (v: unknown) => console.log(JSON.stringify(v, null, 2));

/** Non-zero on a refusal: a script that adds watches in a loop has to notice. */
async function report(result: { ok: boolean } & Record<string, unknown>) {
  out(result);
  if (!result.ok) process.exitCode = 1;
  await closeDb();
}

const command = new Command('watch')
  .description('Put a page under watch, and list, pause or forget what is watched.');

command
  .command('add')
  .description('Watch one field on a page. Establishes the baseline before it returns.')
  .argument('<url>', 'the page to watch')
  .requiredOption('--field <name>', 'snake_case name for the field, e.g. recall_title')
  .requiredOption('--tags <selector>', 'CSS selector the field lives at, e.g. "h2,h3" or p.hazard')
  .option('--min <n>', 'shortest plausible text for this field', '1')
  .option('--max <n>', 'longest plausible text for this field', '400')
  .option('--include <pattern>', 'text that must appear -- a STRING, never a /regex/ literal')
  .option('--exclude <pattern>', 'text that disqualifies a match')
  .option('--flags <flags>', 'regex flags for --include and --exclude', 'i')
  .option('--cadence <cadence>', 'hourly | daily | weekly | 6h | 2d', '6h')
  .option('--id <id>', 'override the id derived from the url')
  .action(async (url: string, o: Record<string, string>) => {
    // Zod does the validating, once, at the boundary in src/setup. Parsing the
    // numbers here and letting it refuse the rest keeps one set of rules.
    await report(await createTarget({
      url,
      cadence: o.cadence,
      ...(o.id ? { id: o.id } : {}),
      fields: [{
        name: o.field!,
        resolver: {
          tags: o.tags!,
          minLen: Number(o.min),
          maxLen: Number(o.max),
          ...(o.include ? { include: o.include } : {}),
          ...(o.exclude ? { exclude: o.exclude } : {}),
          flags: o.flags,
        },
      }],
    }) as { ok: boolean } & Record<string, unknown>);
  });

command
  .command('list')
  .description('Every page under watch, with its run and held counts.')
  .action(async () => { await report(await listTargets()); });

command
  .command('show')
  .description('One target: cadence, next run, and what it is holding.')
  .argument('<id>', 'the target id from `watch list`')
  .action(async (id: string) => { await report(await showTarget(id)); });

command
  .command('pause')
  .description('Stop running a target. Keeps the cadence and the history.')
  .argument('<id>', 'the target id')
  .action(async (id: string) => { await report(await pauseTarget(id)); });

command
  .command('resume')
  .description('Put a paused target back in the queue, due immediately.')
  .argument('<id>', 'the target id')
  .action(async (id: string) => { await report(await resumeTarget(id)); });

command
  .command('delete')
  .description('Forget a target that never ran. One with history is refused -- pause it.')
  .argument('<id>', 'the target id')
  .action(async (id: string) => { await report(await deleteTarget(id)); });

/** The lifecycle heading this belongs under: watching a page is step one. */
export const GROUP: HelpGroup = 'Before it breaks:';

export default command;

if (import.meta.url === `file://${process.argv[1]}`) {
  await command.parseAsync(process.argv);
}
