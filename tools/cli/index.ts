// The command surface is a DIRECTORY, not a file.
//
// `tools/cli/*.ts` is globbed at startup and every commander `Command` a module
// contributes is attached to the binary. Nine features are being built in
// parallel branches, and a list of imports in `bin/assay.ts` would be the one
// file all nine had to edit. A feature adds a file; nobody edits the binary.
//
// Same pattern, deliberately, as `src/mcp/server.ts`. Two loaders in one repo
// should not be two conventions.
//
// ---------------------------------------------------------------------------
// THE CONTRACT a module in this directory must satisfy
// ---------------------------------------------------------------------------
//
//   export default <Command | Command[]>          // preferred
//   export const COMMAND  = <Command | Command[]>  // accepted, same meaning
//   export const COMMANDS = <Command | Command[]>  // accepted, same meaning
//   export const GROUP    = <one of HELP_GROUPS>   // optional
//
// The first of `default`, `COMMAND`, `COMMANDS` that is present wins; the rest
// are ignored. An array is how one file contributes more than one TOP-LEVEL
// command -- `assay unheal ...` is drawn as a peer of `assay brake ...`, not as
// `assay brake unheal`, so a feature is not obliged to invent a parent noun.
//
// Every command must carry a `.description()`. `GROUP` files the whole module
// under one `--help` heading; a command that set its own `.helpGroup()` keeps
// it. Both are checked against the closed set below.
//
// Two things the contract asks of the file itself:
//
//   * Importing it does nothing. `assay --help` imports every module in here,
//     so a module that queries Postgres at load time makes `--help` need a
//     database. A file that is also runnable on its own (`npm run blast`)
//     guards that behind `import.meta.url === ...`, the way the tools do.
//   * Exit codes are the binary's. `bin/assay.ts` copies its own settings onto
//     every command it attaches, so a commander parse error exits 2 here as it
//     does everywhere else -- a person typing `assay unheal` cannot be expected
//     to know which half of the surface is core.
//
// Three rules are enforced here rather than trusted to nine authors:
//
//   1. A module that fails any of this names itself and stops the binary. A
//      feature that merged and then silently did not appear in `--help` is the
//      worse bug by a long way -- nobody goes looking for a command they were
//      told exists.
//   2. Two modules cannot claim the same command name, and neither can shadow a
//      core command. Commander resolves a duplicate to whichever was added
//      first, so a collision makes one feature invisible rather than noisy.
//   3. Every command carries a description. `assay --help` is the surface map;
//      an undescribed row on it is a dead end for the person reading it.

import { readdir } from 'node:fs/promises';
import { Command } from 'commander';
import { z } from 'zod';

/**
 * The headings `assay --help` groups feature commands under.
 *
 * Closed on purpose. Eight authors each inventing a heading produces a help
 * screen that lists everything and maps nothing; the set below is the lifecycle
 * in `docs/FEATURES.md` §2, which is the order the user meets these problems in.
 */
export const HELP_GROUPS = [
  'Before it breaks:',
  'When it breaks:',
  'Deciding:',
  'Recovering:',
  'Proving it:',
] as const;

export type HelpGroup = (typeof HELP_GROUPS)[number];

/** A module that declared no group still gets a place to land. */
export const UNGROUPED = 'Features:';

/** What a feature module in `tools/cli/` may export. See the contract above. */
export interface CliModule {
  default?: Command | Command[];
  COMMAND?: Command | Command[];
  COMMANDS?: Command | Command[];
  GROUP?: HelpGroup;
}

const Group = z.enum(HELP_GROUPS);

const CLI_DIR = new URL('./', import.meta.url);

/** `index.ts` is this file; `.d.ts` is a type, not a command. */
const isFeatureFile = (f: string) =>
  (f.endsWith('.ts') || f.endsWith('.js')) &&
  !f.endsWith('.d.ts') &&
  !/^index\.[tj]s$/.test(f);

/** The export the module meant as its commands, in precedence order. */
function contributed(mod: CliModule): unknown {
  for (const key of ['default', 'COMMAND', 'COMMANDS'] as const) {
    if (mod[key] !== undefined) return mod[key];
  }
  return undefined;
}

/**
 * Every feature command in `tools/cli/`, grouped and ready to attach.
 *
 * An absent or empty directory is not an error — it is what a fresh worktree
 * looks like before wave 2 merges, and `assay --help` has to work there. A file
 * that is present and wrong IS an error, loudly and by name.
 *
 * `reserved` are the binary's own command names. Passing them in is how a
 * feature that picks `run` gets told, rather than being quietly dropped.
 */
export async function loadCommands(
  reserved: readonly string[] = [],
  dir: URL = CLI_DIR,
): Promise<Command[]> {
  let files: string[];
  try {
    // Sorted, so a boot failure is reproducible rather than dependent on the
    // order the filesystem happens to hand back.
    files = (await readdir(dir)).filter(isFeatureFile).sort();
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw e;
  }

  const taken = new Map<string, string>(reserved.map((n) => [n, 'bin/assay.ts']));
  const loaded: Command[] = [];

  for (const file of files) {
    const where = `tools/cli/${file}`;
    const fail = (why: string): never => {
      throw new Error(`${where} ${why}`);
    };

    let mod: CliModule;
    try {
      mod = (await import(new URL(file, dir).href)) as CliModule;
    } catch (e) {
      fail(`could not be loaded: ${(e as Error).message}`);
    }

    const given = contributed(mod!);
    if (given === undefined) {
      fail(
        'exports no commands. Default-export a commander Command, or an array of ' +
          'them (COMMAND / COMMANDS are accepted too). See tools/cli/index.ts.',
      );
    }
    const cmds = Array.isArray(given) ? given : [given];
    if (!cmds.length) fail('exports an empty array of commands');

    // One GROUP applies to the whole file, because a file is one feature.
    let fileGroup: string | undefined;
    if (mod!.GROUP !== undefined) {
      const parsed = Group.safeParse(mod!.GROUP);
      if (!parsed.success) {
        fail(
          `exports GROUP ${JSON.stringify(mod!.GROUP)}, which is not one of: ` +
            HELP_GROUPS.join(' | '),
        );
      }
      fileGroup = parsed.data;
    }

    for (const cmd of cmds) {
      if (!(cmd instanceof Command)) {
        fail(
          `exports ${JSON.stringify(String(cmd))} where a commander Command was expected. ` +
            'See the contract at the top of tools/cli/index.ts.',
        );
      }
      const name = cmd.name();
      if (!name) fail('exports a Command with no name');
      if (!cmd.description()) {
        fail(
          `exports "${name}" with no description. ` +
            'Every row of `assay --help` has to tell someone what to do next.',
        );
      }

      const clash = taken.get(name);
      if (clash) fail(`and ${clash} both define the command "${name}"`);
      taken.set(name, where);

      // A command that chose its own heading keeps it — but it is held to the
      // same closed set, or the map stops being one.
      const own = cmd.helpGroup();
      if (own && !Group.safeParse(own).success) {
        fail(`gives "${name}" the heading ${JSON.stringify(own)}, which is not one of: ` +
          HELP_GROUPS.join(' | '));
      }
      loaded.push(own ? cmd : cmd.helpGroup(fileGroup ?? UNGROUPED));
    }
  }

  // Commander orders help groups by the order the commands are added, and the
  // files arrive alphabetically. Sorting restores the lifecycle: a reader meets
  // these problems in this order, which is the only thing that makes a list of
  // fifteen commands a map instead of an inventory.
  const rank = (c: Command) => {
    const i = (HELP_GROUPS as readonly string[]).indexOf(c.helpGroup());
    return i === -1 ? HELP_GROUPS.length : i;
  };
  return loaded.sort((a, b) => rank(a) - rank(b));
}
