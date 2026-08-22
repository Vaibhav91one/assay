// The key panel is a credentials surface, so its rules are not stylistic.
//
// The property under test is the one that matters: a key that is set can be
// known to be set, and cannot be read back -- not whole, not masked, not
// truncated, not in an aria-label, not in a copyable line. The panel holds
// that by construction (there is no code path from `process.env` to a string
// it renders), and construction is exactly the kind of claim that rots
// silently, so it is asserted rather than asserted-in-a-comment.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readKeys, envLines } from '../web/app/sign-in/keys.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// Distinctive enough that a substring match cannot be a coincidence, and
// shaped like the real thing so a truncating render would still be caught:
// any prefix of it longer than a few characters is still unique in the output.
const SECRET = 'sk-ant-api03-KEYPANELCANARY-must-never-be-rendered';

describe('key panel', () => {
  const saved: Record<string, string | undefined> = {};
  const NAMES = ['ANTHROPIC_API_KEY', 'BRIGHT_DATA_TOKEN', 'RESEND_API_KEY'];

  beforeEach(() => {
    for (const n of NAMES) {
      saved[n] = process.env[n];
      delete process.env[n];
    }
  });
  afterEach(() => {
    for (const n of NAMES) {
      if (saved[n] === undefined) delete process.env[n];
      else process.env[n] = saved[n];
    }
  });

  it('reports absence as a boolean, and names the variables .env.example names', () => {
    expect(readKeys()).toEqual([
      { name: 'ANTHROPIC_API_KEY', buys: expect.any(String), set: false },
      { name: 'BRIGHT_DATA_TOKEN', buys: expect.any(String), set: false },
      { name: 'RESEND_API_KEY', buys: expect.any(String), set: false },
    ]);

    // The names are the contract with the operator's shell. A rename here that
    // is not a rename there sends someone to set a variable nothing reads.
    const example = readFileSync(join(ROOT, '.env.example'), 'utf8');
    for (const { name } of readKeys()) expect(example).toContain(`${name}=`);
  });

  it('never returns a key it can see', () => {
    process.env.ANTHROPIC_API_KEY = SECRET;
    const keys = readKeys();
    expect(keys.find((k) => k.name === 'ANTHROPIC_API_KEY')?.set).toBe(true);
    // Not "does not equal" -- does not CONTAIN, anywhere in the whole shape.
    // A masked tail or a `sk-ant-...` prefix would pass an equality check and
    // is still a credential leak.
    expect(JSON.stringify(keys)).not.toContain('KEYPANELCANARY');
  });

  it('offers only the unset names to paste, and no values', () => {
    process.env.ANTHROPIC_API_KEY = SECRET;
    const lines = envLines(readKeys());
    expect(lines).toBe('BRIGHT_DATA_TOKEN=\nRESEND_API_KEY=');
    expect(lines).not.toContain('KEYPANELCANARY');

    // Everything set means nothing to paste, rather than an empty box.
    process.env.BRIGHT_DATA_TOKEN = SECRET;
    process.env.RESEND_API_KEY = SECRET;
    expect(envLines(readKeys())).toBe('');
  });

  it('has no path from process.env to the screen except keys.ts', () => {
    // This is the construction proof, and it is the whole proof. The two tests
    // above show that neither thing `keys.ts` exports can carry a value; this
    // one shows that `keys.ts` is the only door -- so no component under
    // sign-in/ has a key to render even if it wanted to.
    //
    // A grep rather than a render, deliberately. The root tsconfig is
    // node-side and excludes `web/` because Next owns that toolchain, so
    // importing a .tsx here would drag JSX and bundler resolution into a
    // config that has neither; `npm run build --workspace web` typechecks the
    // panel in the project that does. And a render test only ever proves
    // today's panel: this one fails on the file someone adds next year.
    const dir = join(ROOT, 'web', 'app', 'sign-in');
    const hits: string[] = [];
    const walk = (rel: string) => {
      for (const e of readdirSync(join(dir, rel), { withFileTypes: true })) {
        const p = join(rel, e.name);
        if (e.isDirectory()) { walk(p); continue; }
        if (!/\.tsx?$/.test(e.name)) continue;
        if (readFileSync(join(dir, p), 'utf8').includes('process.env')) hits.push(p);
      }
    };
    walk('.');
    expect(hits.sort()).toEqual(['keys.ts']);
  });
});
