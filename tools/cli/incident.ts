#!/usr/bin/env -S npx tsx
// `assay incident` -- the file you send someone, plus the two reports it is
// built from.
//
//   assay incident list [--target ikea]
//   assay incident show <episode> [--json] [--out incident-12.md]
//   assay incident diff <target> <field> [--limit 50]
//   assay incident digest --since <iso> --until <iso> [--html]
//
// Exported as a command module so bin/assay.ts can register it; also runnable
// on its own, which is what `npm run incident` does. Nothing here sends
// anything -- `digest --html` prints the body a send would carry, and stops.

import { writeFile } from 'node:fs/promises';
import { Command, InvalidArgumentError } from 'commander';
import { closeDb } from '../../src/store/index.js';
import { incidentRecord, episodes } from '../../src/reports/incident.js';
import { fieldHistory } from '../../src/reports/diff.js';
import { composeDigest, digestHtml } from '../../src/reports/digest.js';
import { incidentMarkdown, diffText, digestText } from '../../src/reports/render.js';
import { when } from '../../src/reports/vocabulary.js';

const positiveInt = (raw: string): number => {
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) throw new InvalidArgumentError('expected a positive integer');
  return n;
};

const instant = (raw: string): Date => {
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) throw new InvalidArgumentError(`not a date: ${raw}`);
  return d;
};

export const command = new Command('incident')
  .description('Incident records, field diffs, and the digest — composed, never sent.');

command
  .command('list')
  .description('Break episodes on record, newest first.')
  .option('--target <id>', 'limit to one target')
  .option('--limit <n>', 'how many', positiveInt, 50)
  .action(async (opts: { target?: string; limit: number }) => {
    const rows = await episodes({ targetId: opts.target, limit: opts.limit });
    if (!rows.length) {
      console.log('No break episodes on record.');
      return;
    }
    for (const e of rows) {
      console.log(
        `${String(e.episode).padStart(5)}  ${e.target.padEnd(12)}${e.field.padEnd(16)}`
        + `runs ${e.openedRun}${e.closedRun == null ? '– (still open)' : `–${e.closedRun}`}`
        + `  ${e.cause?.plain ?? e.cause?.code ?? 'cause not recorded'}`,
      );
    }
  });

command
  .command('show')
  .argument('<episode>', 'episode id', positiveInt)
  .description('The incident record: what broke, what was held, what is still suspect.')
  .option('--json', 'the records rather than the document')
  .option('--out <file>', 'write the document to a file')
  .action(async (episode: number, opts: { json?: boolean; out?: string }) => {
    const record = await incidentRecord(episode);
    if (!record) {
      console.error(`No episode ${episode}.`);
      process.exitCode = 1;
      return;
    }
    if (opts.json) {
      console.log(JSON.stringify(record, null, 2));
      return;
    }
    const md = incidentMarkdown(record);
    if (opts.out) {
      await writeFile(opts.out, md);
      console.log(`-> ${opts.out}`);
      return;
    }
    console.log(md);
  });

command
  .command('diff')
  .argument('<target>', 'target id')
  .argument('<field>', 'field name')
  .description('Value history. A withheld run shows as a hole, never as "no change".')
  .option('--limit <n>', 'how many runs', positiveInt, 200)
  .option('--json', 'the entries rather than the table')
  .action(async (target: string, field: string, opts: { limit: number; json?: boolean }) => {
    const h = await fieldHistory({ targetId: target, field, limit: opts.limit });
    console.log(opts.json ? JSON.stringify(h, null, 2) : diffText(h));
  });

command
  .command('digest')
  .description('The periodic report for a window. Composes it; does not send it.')
  .requiredOption('--since <iso>', 'start of the window, inclusive', instant)
  .requiredOption('--until <iso>', 'end of the window, exclusive', instant)
  .option('--html', 'the email body a send would carry')
  .action(async (opts: { since: Date; until: Date; html?: boolean }) => {
    if (!(opts.since < opts.until)) {
      console.error(`--since (${when(opts.since)}) must be before --until (${when(opts.until)}).`);
      process.exitCode = 1;
      return;
    }
    const d = await composeDigest({ since: opts.since, until: opts.until });
    console.log(opts.html ? digestHtml(d) : digestText(d));
  });

// Run standalone. When bin/assay.ts registers this command instead, it owns the
// connection and this branch never fires.
if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    await command.parseAsync(process.argv);
  } finally {
    await closeDb().catch(() => {});
  }
}

export default command;
