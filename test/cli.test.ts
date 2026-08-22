// The registry, and the exit codes the binary promises.
//
// Fixtures are written to a temp directory rather than checked in, because the
// interesting cases are the malformed ones and a malformed module living in
// `tools/cli/` would break every sibling's CLI the moment it merged. They import
// commander by resolved path so the `instanceof` check sees the same class this
// process loaded, which is the whole point of the check.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { loadCommands, HELP_GROUPS, UNGROUPED } from '../tools/cli/index.js';

const COMMANDER = import.meta.resolve('commander');
const REPO = fileURLToPath(new URL('../', import.meta.url));

let root: string;
beforeAll(async () => { root = await mkdtemp(join(tmpdir(), 'assay-cli-')); });
afterAll(async () => { await rm(root, { recursive: true, force: true }); });

/** A directory holding the given `tools/cli/`-shaped modules, as a URL. */
async function fixture(files: Record<string, string>): Promise<URL> {
  const dir = join(root, Math.random().toString(36).slice(2));
  await mkdir(dir);
  for (const [name, body] of Object.entries(files)) {
    await writeFile(join(dir, name), `import { Command } from ${JSON.stringify(COMMANDER)};\n${body}`);
  }
  return new URL('./', pathToFileURL(join(dir, 'x')));
}

/** One command, declared the way the contract's preferred form does it. */
const cmd = (name: string, desc = 'does a thing', group?: string) =>
  `export default new Command(${JSON.stringify(name)})${desc ? `.description(${JSON.stringify(desc)})` : ''};\n` +
  (group ? `export const GROUP = ${JSON.stringify(group)};\n` : '');

describe('loadCommands tolerates absence', () => {
  it('returns nothing for a directory that does not exist', async () => {
    // A fresh worktree before wave 2. `assay --help` still has to work here.
    expect(await loadCommands([], new URL('./nowhere/', pathToFileURL(join(root, 'x'))))).toEqual([]);
  });

  it('returns nothing for an empty directory', async () => {
    expect(await loadCommands([], await fixture({}))).toEqual([]);
  });

  it('ignores its own index and type declarations', async () => {
    const dir = await fixture({ 'index.ts': cmd('shouldnotload'), 'a.d.ts': cmd('nor-this') });
    expect(await loadCommands([], dir)).toEqual([]);
  });
});

describe('loadCommands takes every shape a feature has actually shipped', () => {
  const names = async (body: string) =>
    (await loadCommands([], await fixture({ 'f.ts': body }))).map((c) => c.name());

  // Feature A, verbatim in shape: one Command, named AND default exported.
  it('takes a single Command from a default export', async () => {
    expect(await names(
      'export const command = new Command("decisions").description("the queue");\n' +
      'export default command;\n',
    )).toEqual(['decisions']);
  });

  // Feature D: F10 is drawn as `assay unheal ...`, a peer of `assay brake ...`,
  // so one file legitimately contributes two TOP-LEVEL commands.
  it('takes an array, so one file can contribute two top-level commands', async () => {
    expect(await names(
      'export const brakeCommand = new Command("brake").description("stop patching");\n' +
      'export const unhealCommand = new Command("unheal").description("revert a heal");\n' +
      'export const COMMANDS = [brakeCommand, unhealCommand];\n' +
      'export default COMMANDS;\n',
    )).toEqual(['brake', 'unheal']);
  });

  it('takes COMMAND or COMMANDS when there is no default export', async () => {
    expect(await names('export const COMMAND = new Command("a").description("x");\n')).toEqual(['a']);
    expect(await names('export const COMMANDS = [new Command("b").description("x")];\n')).toEqual(['b']);
  });

  it('lets a command keep a heading it chose for itself', async () => {
    const [c] = await loadCommands([], await fixture({
      'f.ts': 'export default new Command("a").description("x").helpGroup("Deciding:");\n' +
        'export const GROUP = "Recovering:";\n',
    }));
    expect(c.helpGroup()).toBe('Deciding:');
  });
});

describe('loadCommands refuses a module it cannot trust', () => {
  const failsWith = async (files: Record<string, string>, pattern: RegExp, reserved: string[] = []) =>
    expect(loadCommands(reserved, await fixture(files))).rejects.toThrow(pattern);

  it('names the file when what it exports is not a Command', async () => {
    await failsWith({ 'blast.ts': 'export default 42;' }, /blast\.ts exports "42" where a commander Command/);
  });

  it('names the file when it exports no commands at all', async () => {
    await failsWith({ 'blast.ts': 'export const helper = 1;' }, /blast\.ts exports no commands/);
  });

  it('names the file when one entry of an array is not a Command', async () => {
    await failsWith(
      { 'blast.ts': 'export default [new Command("a").description("x"), null];' },
      /blast\.ts exports "null" where a commander Command/,
    );
  });

  it('refuses a per-command heading outside the closed set', async () => {
    await failsWith(
      { 'blast.ts': 'export default new Command("a").description("x").helpGroup("Whenever:");' },
      /not one of/,
    );
  });

  it('names the file when the module will not import', async () => {
    await failsWith({ 'blast.ts': 'this is not typescript (((' }, /blast\.ts could not be loaded/);
  });

  it('names the file when a command carries no description', async () => {
    // --help is the surface map; a row on it with nothing to read is a dead end.
    await failsWith({ 'blast.ts': cmd('blast', '') }, /blast\.ts exports "blast" with no description/);
  });

  it('names both files when two modules claim one name', async () => {
    // Commander resolves a duplicate to whichever was added first, so without
    // this one of the two features is simply invisible and nobody is told.
    await failsWith({ 'a.ts': cmd('blast'), 'b.ts': cmd('blast') }, /a\.ts.*both define the command "blast"/s);
  });

  it('refuses to let a feature shadow a core command', async () => {
    await failsWith({ 'blast.ts': cmd('run') }, /bin\/assay\.ts both define the command "run"/, ['run']);
  });

  it('refuses a heading outside the closed set', async () => {
    await failsWith({ 'blast.ts': cmd('blast', 'x', 'Whenever:') }, /not one of/);
  });
});

describe('loadCommands groups what it loads', () => {
  it('files an ungrouped command rather than dropping it', async () => {
    const [c] = await loadCommands([], await fixture({ 'blast.ts': cmd('blast') }));
    expect(c.helpGroup()).toBe(UNGROUPED);
  });

  it('orders groups by lifecycle, not by filename', async () => {
    // `a.ts` sorts first and `z.ts` last; the lifecycle order is the reverse.
    const cmds = await loadCommands([], await fixture({
      'a.ts': cmd('incident', 'x', 'Proving it:'),
      'z.ts': cmd('fragility', 'x', 'Before it breaks:'),
    }));
    expect(cmds.map((c) => c.name())).toEqual(['fragility', 'incident']);
  });

  it('offers exactly the headings docs/FEATURES.md 2 uses', () => {
    expect(HELP_GROUPS).toEqual([
      'Before it breaks:', 'When it breaks:', 'Deciding:', 'Recovering:', 'Proving it:',
    ]);
  });
});

describe('the binary', () => {
  const assay = (...args: string[]) =>
    spawnSync(process.execPath, ['--import', 'tsx', 'bin/assay.ts', ...args], {
      cwd: REPO, encoding: 'utf8',
    });

  it('maps the whole product surface in --help', () => {
    const r = assay('--help');
    expect(r.status).toBe(0);
    for (const c of ['run', 'demo', 'ingest', 'worker', 'explain', 'diagnose', 'apikey']) {
      expect(r.stdout).toContain(c);
    }
  });

  it('exits 2 on an unknown command, with the reason on stderr', () => {
    const r = assay('nosuchcommand');
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/unknown command/);
    expect(r.stdout).toBe('');
  });

  it('exits 2 on an argument it can name, before touching the database', () => {
    const r = assay('explain', 'not-a-proof-id');
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/proof id/);
    expect(r.stdout).toBe('');
  });

  it('exits 2 rather than guessing at a site that is not in the corpus', () => {
    const r = assay('run', 'notasite');
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/mattel/);
  });
});
