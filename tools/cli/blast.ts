#!/usr/bin/env -S npx tsx
// `assay blast` -- the gap between the boundary and the detection, drawn as one
// screen, plus the CSV an operator hands to whoever consumed the data.
//
// Two commands are exported rather than one because a correction is not a
// blast: it writes a new published row, and burying a write behind a flag on a
// read command is how someone runs it by accident. `commands` is the pair, for
// whichever shape bin/assay.ts registers.

import { writeFile } from 'node:fs/promises';
import { Command } from 'commander';
import {
  blastRadius, recordRetraction, markExported, retractionCsv, rescrapeList,
  publishCorrection, BlastError, type BlastWindow,
} from '../../src/blast/index.js';
import { closeDb } from '../../src/store/index.js';

const SPEC = /^([^/\s]+)\/([^/\s]+)$/;

const parseSpec = (spec: string): { target: string; field: string } => {
  const m = SPEC.exec(spec);
  if (!m) throw new BlastError('no_such_target', `Expected <target>/<field>, got "${spec}".`);
  return { target: m[1]!, field: m[2]! };
};

const intOpt = (name: string) => (raw: string): number => {
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) throw new BlastError('no_such_run', `--${name} takes a run id.`);
  return n;
};

// STATES.md: dates read `4 Aug 2026`, never 2026-08-04.
const day = (d: Date) => new Intl.DateTimeFormat('en-GB', {
  day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
}).format(d);

const dateOf = (w: BlastWindow, run: number): string => {
  const row = w.rows.find((r) => r.run === run);
  return row ? `  (${day(row.published_at)})` : '';
};

function render(w: BlastWindow): string {
  const span = w.first_suspect_run === w.detected_run
    ? `run ${w.first_suspect_run}`
    : `runs ${w.first_suspect_run}-${w.detected_run}`;
  const count = w.bounded ? `${w.rows.length}` : `at least ${w.rows.length}`;
  const lines = [
    `target            : ${w.target}/${w.field}`,
    `last clean run    : ${w.last_clean_run ?? 'none on record'}`,
    `first suspect run : ${w.first_suspect_run}${dateOf(w, w.first_suspect_run)}`
      + (w.introduced_by_heal ? '  <- the heal that introduced the value' : '  <- boundary'),
    `break detected    : ${w.detected_run}${dateOf(w, w.detected_run)}`,
    `suspect rows      : ${count} across ${span}`,
  ];
  if (w.withheld_runs.length) {
    lines.push(`withheld          : ${w.withheld_runs.length} run(s) published nothing (held, not wrong)`);
  }
  if (w.basis === 'declared') lines.push('boundary          : declared, not walked to');
  for (const [i, c] of w.caveats.entries()) {
    lines.push(`${i === 0 ? 'confidence        : ' : '                    '}${c}`);
  }
  return lines.join('\n');
}

export const blastCommand = new Command('blast')
  .description('Which rows a wrong value covers, and how far back (F6/F9).')
  .argument('<target/field>', 'e.g. ikea/recall_title')
  .option('--at-run <run>', 'the run where the problem was noticed', intOpt('at-run'))
  .option('--from-run <run>', 'declare the boundary instead of walking to it', intOpt('from-run'))
  .option('--json', 'the window as JSON')
  .option('--csv [path]', 'the retraction list; stdout when no path is given')
  .option('--rescrape', 'the re-scrape list instead of the rows')
  .option('--record', 'write the window to the retractions table')
  .action(async (spec: string, opts: {
    atRun?: number; fromRun?: number; json?: boolean;
    csv?: string | boolean; rescrape?: boolean; record?: boolean;
  }) => {
    const { target, field } = parseSpec(spec);
    const w = await blastRadius({ target, field, at_run: opts.atRun, from_run: opts.fromRun });

    let retractionId: number | null = null;
    if (opts.record || opts.csv !== undefined) {
      retractionId = (await recordRetraction(w)).retraction_id;
    }

    if (opts.csv !== undefined) {
      const csv = await retractionCsv(w);
      if (typeof opts.csv === 'string') {
        await writeFile(opts.csv, csv, 'utf8');
        process.stdout.write(`${w.rows.length} rows exported · ${opts.csv}\n`);
      } else {
        process.stdout.write(csv);
      }
      // exported_at is set only once the list has actually left: computed and
      // acted on are different facts, and the table keeps them apart.
      if (retractionId !== null) await markExported(retractionId);
      return;
    }

    if (opts.rescrape) {
      process.stdout.write(JSON.stringify(await rescrapeList(w), null, 2) + '\n');
      return;
    }
    if (opts.json) {
      process.stdout.write(JSON.stringify({ ...w, retraction_id: retractionId }, null, 2) + '\n');
      return;
    }
    process.stdout.write(render(w) + '\n');
    if (retractionId !== null) process.stdout.write(`retraction        : #${retractionId} (not yet exported)\n`);
  });

export const correctCommand = new Command('correct')
  .description('Publish a corrected value as a new row that supersedes the wrong one (F9).')
  .argument('<proof>', 'the proof id of the wrong cell')
  .argument('<value>', 'the corrected value')
  .action(async (proof: string, value: string) => {
    const c = await publishCorrection({ proof, value });
    process.stdout.write(
      `published ${c.proof} · run ${c.run} · ${c.field}\n`
      + `supersedes ${c.supersedes}, which stays readable at /api/v1/rows/${c.supersedes}\n`,
    );
  });

// Both, as peers: `assay correct` is not a subcommand of `assay blast`. The
// default export is the array because the loader takes the first of
// `default` / `COMMAND` / `COMMANDS` and ignores the rest -- defaulting to
// `blastCommand` alone dropped `correct` from the binary without saying so.
export const commands = [blastCommand, correctCommand];
export default commands;

if (import.meta.url === `file://${process.argv[1]}`) {
  // Run directly (`npm run blast ikea/price`) the argv has no `assay` in front
  // of it, so parse from the user's words rather than from process.argv.
  const args = process.argv.slice(2);
  const correcting = args[0] === 'correct';
  try {
    await (correcting ? correctCommand : blastCommand)
      .parseAsync(correcting ? args.slice(1) : args, { from: 'user' });
  } catch (e) {
    process.stderr.write(`${(e as Error).message}\n`);
    process.exitCode = 1;
  } finally {
    await closeDb().catch(() => {});
  }
}
