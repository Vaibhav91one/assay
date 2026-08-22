#!/usr/bin/env -S npx tsx
// One binary over what used to be twenty scripts.
//
//   assay --help
//
// The core commands below wrap the existing tools as child processes rather
// than importing them. Those tools read `process.argv` at module scope and two
// of them -- `bench` and `replay` -- produce the invariants this project's whole
// argument rests on. A subprocess cannot change what they measure; an import
// that rewrites `process.argv` eventually can.
//
// Everything else comes from `tools/cli/`, globbed at startup. See the contract
// at the top of `tools/cli/index.ts`.
//
// Exit codes, because this runs in cron:
//   0  the command did its work
//   2  the invocation was wrong -- unknown command, bad argument
//   1  the work failed, or a wrapped tool exited non-zero (its code passes through)
// A failure is always a non-zero exit with the reason on stderr. Never a zero
// exit with an apology on stdout.

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Command } from 'commander';
import { z } from 'zod';
import { SITES } from '../src/sites.js';
import { MUTATIONS } from '../src/mutate.js';
import { explain, closeDb } from '../src/store/index.js';
import { loadCommands } from '../tools/cli/index.js';

const REPO = fileURLToPath(new URL('../', import.meta.url));

/**
 * The message plus whatever it is wrapping.
 *
 * Drizzle reports a dead database as the SQL it could not run and puts
 * `database "x" does not exist` in `cause`. On its own the outer message tells
 * an operator at 3am nothing they can act on.
 */
function reason(e: unknown): string {
  const seen: string[] = [];
  for (let x: unknown = e; x instanceof Error; x = x.cause) {
    if (x.message && !seen.includes(x.message)) seen.push(x.message);
  }
  return seen.join(': ') || String(e);
}

const SITE_IDS = SITES.map((s) => s.id) as [string, ...string[]];
const MUTATION_IDS = MUTATIONS.map((m) => m.id) as [string, ...string[]];

// --- boundaries -------------------------------------------------------------
//
// Everything an operator types is parsed here, so the message they get names
// what they typed and what was allowed. Without this the corpus site arrives at
// `readdir` and comes back as ENOENT on a path they never wrote.

const Site = z.enum(SITE_IDS);
const YearMonth = z.string().regex(/^\d{6}$/, 'a capture month looks like 202401 (YYYYMM)');
const Mutation = z.enum(MUTATION_IDS);
const Positive = z.coerce.number().int().positive();
const ProofId = z
  .string()
  .regex(/^pr_[0-9a-f]+$/, 'a proof id looks like pr_9f21c4… — the _assay block on the row carries it');

/** Validate one operator-supplied value, or exit 2 saying which one was wrong. */
function check<T>(schema: z.ZodType<T>, value: unknown, what: string): T {
  const parsed = schema.safeParse(value);
  if (parsed.success) return parsed.data;
  const why = parsed.error.issues.map((i) => i.message).join('; ');
  console.error(`assay: ${what} — ${why}`);
  process.exit(2);
}

// --- wrapped tools ----------------------------------------------------------

/**
 * Run one of `tools/*.ts` and become its exit code.
 *
 * `cwd` is the repo root because the tools resolve `corpus/` by relative path
 * (CONTRIBUTING.md), which is what `npm run` already gives them. Without it the
 * same command would work from the repo and fail from anywhere else.
 */
function tool(script: string, args: string[]): never {
  const r = spawnSync(process.execPath, ['--import', 'tsx', `tools/${script}`, ...args], {
    cwd: REPO,
    stdio: 'inherit',
  });
  if (r.error) {
    console.error(`assay: could not start tools/${script}: ${r.error.message}`);
    process.exit(1);
  }
  if (r.signal) {
    console.error(`assay: tools/${script} was killed by ${r.signal}`);
    process.exit(1);
  }
  process.exit(r.status ?? 1);
}

const program = new Command('assay')
  .description(
    'Assay watches a page and withholds the cell it cannot justify.\n' +
      'A hole is a ticket; a wrong value is a refund.',
  )
  .showHelpAfterError()
  .configureHelp({ sortSubcommands: false });

// Commander exits 1 for an unknown command or a missing argument, which is the
// same code a wrapped tool uses to say the work failed. A pipeline that has to
// tell "you typed it wrong" from "the scrape broke" cannot read that. Set here,
// before any `.command()`, because subcommands inherit it at creation.
//
// Feature commands are given the same treatment below, because a person typing
// `assay unheal` cannot be expected to know which half of the surface is core.
program.exitOverride((err) => process.exit(err.exitCode === 0 ? 0 : 2));

program.commandsGroup('Run it:');

program
  .command('run')
  // The append is worth naming on the front page: events.jsonl is committed and
  // checked byte for byte, so this leaves a clone with a dirty working tree.
  .description(
    'The whole pipeline over two real captures: detect, decide, prove.\n' +
      'Appends one proof record to results/events.jsonl.',
  )
  .argument('[site]', `one of ${SITE_IDS.join(', ')}`, 'ikea')
  .argument('[from]', 'first capture month, YYYYMM', '202401')
  .argument('[to]', 'second capture month, YYYYMM', '202608')
  .action((site: string, from: string, to: string) => {
    tool('run.ts', [
      check(Site, site, `site "${site}"`),
      check(YearMonth, from, `from "${from}"`),
      check(YearMonth, to, `to "${to}"`),
    ]);
  });

program
  .command('demo')
  .description('Two breaks, two outcomes: one heals, one publishes a labelled hole.')
  .action(() => tool('demo.ts', []));

program
  .command('ingest')
  .description('Run a site through the pipeline and write every run to Postgres.')
  .argument('[site]', `one of ${SITE_IDS.join(', ')}`, 'ikea')
  .option('--mutate <id>', `plant a break to exercise the gate: ${MUTATION_IDS.join(', ')}`)
  .action((site: string, opts: { mutate?: string }) => {
    const args = [check(Site, site, `site "${site}"`)];
    if (opts.mutate !== undefined) {
      args.push('--mutate', check(Mutation, opts.mutate, `--mutate "${opts.mutate}"`));
    }
    tool('ingest.ts', args);
  });

program
  .command('worker')
  .description('The long-running loop: claim a due target, run it, schedule the next.')
  .option('--once', 'take one due target and exit — the cron shape')
  .option('--poll <seconds>', 'seconds between polls when idle', '30')
  .action((opts: { once?: boolean; poll: string }) => {
    const args = opts.once ? ['--once'] : [];
    args.push('--poll', String(check(Positive, opts.poll, `--poll "${opts.poll}"`)));
    tool('worker.ts', args);
  });

program.commandsGroup('Look at what happened:');

program
  .command('explain')
  .description('Where one published cell came from: value, status, and what the gate ranked.')
  .argument('<proof_id>', 'the proof id on the published row')
  .action(async (proofId: string) => {
    const id = check(ProofId, proofId, `proof id "${proofId}"`);
    try {
      const found = await explain(id);
      if (!found) {
        console.error(`assay: no cell with proof id ${id}`);
        process.exitCode = 1;
        return;
      }
      console.log(JSON.stringify(found, null, 2));
    } finally {
      await closeDb();
    }
  });

program
  .command('diagnose')
  .description('Where the healer loses, measured over the corpus rather than argued.')
  .option('--captures <n>', 'captures sampled per site', '6')
  .action((opts: { captures: string }) => {
    tool('diagnose.ts', [
      '--captures',
      String(check(Positive, opts.captures, `--captures "${opts.captures}"`)),
    ]);
  });

program.commandsGroup('Operate it:');

program
  .command('apikey')
  .description('Mint a consumer API key. Printed once, stored hashed, never recoverable.')
  .argument('<name...>', 'what this key is for, e.g. "warehouse etl"')
  .action((name: string[]) => tool('apikey.ts', name));

// Feature commands. A missing or empty `tools/cli/` is a fresh worktree, not a
// fault: the binary still runs and still helps. A file that is present and
// malformed stops the binary by name, because a feature that merged and then
// quietly failed to appear is the harder bug by a long way.
try {
  const core = program.commands.map((c) => c.name());
  for (const cmd of await loadCommands(core)) {
    // `addCommand` does not inherit, so a feature would otherwise exit 1 on a
    // missing argument while `assay apikey` exits 2 for the same mistake. The
    // exit-code contract belongs to the binary, not to whoever wrote the file.
    program.addCommand(cmd.copyInheritedSettings(program));
  }
} catch (e) {
  console.error(`assay: ${reason(e)}`);
  process.exit(1);
}

// Commander builds its `help` command lazily and files it under a heading of
// its own. Declaring it here puts it in a group with everything else, so the
// surface map has no orphan section at the bottom.
program.commandsGroup('Operate it:');
program.helpCommand('help [command]', 'What one command takes, and what it does.');

program.addHelpText(
  'after',
  '\nEvery number this prints is reproducible: npm test · npm run bench · npm run replay.' +
    '\nExit 0 done, 2 bad invocation, 1 the work failed. Reasons go to stderr.\n',
);

try {
  await program.parseAsync();
} catch (e) {
  console.error(`assay: ${reason(e)}`);
  process.exit(1);
}
