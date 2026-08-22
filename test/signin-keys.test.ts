// The key panel is a credentials surface, so its rules are not stylistic.
//
// The property under test is the one that matters: a capability that is
// satisfied can be known to be satisfied, and the credential that satisfied it
// cannot be read back -- not whole, not masked, not truncated, not in an
// aria-label, not in a copyable line. The panel holds that by construction
// (there is no code path from `process.env` to a string it renders), and
// construction is exactly the kind of claim that rots silently, so it is
// asserted rather than asserted-in-a-comment.
//
// WHAT CHANGED, 2026-08-22. `readKeys` used to report one row per variable in
// `.env.example`, and this file asserted that contract. It now reports one row
// per CAPABILITY, because the old contract produced a screen that was true line
// by line and misleading as a whole -- see the header of `keys.ts`.
//
// The assertions are not weakened for it. The leak canaries below are stronger
// than the ones they replace: `readKeys` now carries prose as well as booleans,
// so every field of every row is searched for the canary rather than just the
// two the old shape had, and the canary is planted in all three credentials one
// at a time rather than only in ANTHROPIC_API_KEY. The `.env.example` cross-
// check survives verbatim -- variables are still the contract with the
// operator's shell, they are just no longer the row. And the construction proof
// is unchanged, because it was always the whole proof.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readKeys, type ModelAuth } from '../web/app/sign-in/keys.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// Distinctive enough that a substring match cannot be a coincidence, and
// shaped like the real thing so a truncating render would still be caught:
// any prefix of it longer than a few characters is still unique in the output.
const SECRET = 'sk-ant-api03-KEYPANELCANARY-must-never-be-rendered';

describe('key panel', () => {
  const saved: Record<string, string | undefined> = {};
  // CLAUDE_CODE_OAUTH_TOKEN is cleared with the rest: a developer whose own
  // machine has run `claude setup-token` would otherwise read `set: true` here
  // and the absence assertion would pass or fail depending on whose shell ran
  // it. `readKeys` no longer reads it -- the model route arrives as an argument
  // -- but the panel's other consumers do, and clearing it keeps this file
  // honest if that ever changes back.
  const NAMES = [
    'ANTHROPIC_API_KEY', 'CLAUDE_CODE_OAUTH_TOKEN', 'BRIGHTDATA_API_TOKEN', 'ASSAY_RESEND_KEY', 'FIRECRAWL_API_KEY',
  ];

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
    expect(readKeys('none')).toEqual([
      {
        name: 'Model access',
        buys: expect.any(String),
        vars: ['ANTHROPIC_API_KEY', 'CLAUDE_CODE_OAUTH_TOKEN'],
        set: false,
        via: '',
        doc: expect.any(String),
      },
      {
        name: 'Bright Data',
        buys: expect.any(String),
        vars: ['BRIGHTDATA_API_TOKEN'],
        set: false,
        via: '',
        doc: expect.any(String),
      },
      {
        name: 'Firecrawl',
        buys: expect.any(String),
        vars: ['FIRECRAWL_API_KEY'],
        set: false,
        via: '',
        doc: expect.any(String),
      },
      {
        name: 'Email delivery',
        buys: expect.any(String),
        vars: ['ASSAY_RESEND_KEY'],
        set: false,
        via: '',
        doc: expect.any(String),
      },
    ]);

    // The names are the contract with the operator's shell. A rename here that
    // is not a rename there sends someone to set a variable nothing reads.
    // Still every variable the panel offers, now one row deeper.
    //
    // This check is necessary and was never sufficient: it proves the panel and
    // `.env.example` agree with EACH OTHER, and for months they agreed on two
    // names -- BRIGHT_DATA_TOKEN and RESEND_API_KEY -- that no other file in the
    // repository read. `test/env-names.test.ts` closes that: it takes the third
    // side, what the code actually reads, and fails when any of the three drifts.
    const example = readFileSync(join(ROOT, '.env.example'), 'utf8');
    for (const { vars } of readKeys('none')) {
      for (const v of vars) expect(example).toContain(`${v}=`);
    }
    // And no capability may offer zero ways to satisfy it, which would render a
    // row whose third line is an empty string.
    for (const { vars } of readKeys('none')) expect(vars.length).toBeGreaterThan(0);
  });

  // The reason this file's contract changed. Settings reports the model path as
  // connected when the CLI is signed in -- `modelAuth()` returns 'cli' -- and
  // the old panel reported CLAUDE_CODE_OAUTH_TOKEN as NOT SET on the same
  // machine at the same moment. Both were true. Together they were misleading.
  it('counts every route to a model, not just the two variables', () => {
    const model = (auth: ModelAuth) => readKeys(auth)[0];

    expect(model('none').set).toBe(false);
    expect(model('none').via).toBe('');

    for (const auth of ['api-key', 'subscription', 'cli'] as const) {
      expect(model(auth).set).toBe(true);
      // Satisfied is not enough: the row has to say WHICH of the three, because
      // the operator has three and only one of them is carrying it.
      expect(model(auth).via).not.toBe('');
    }

    // The three routes are told apart, so the row cannot report a subscription
    // token on a machine that only has a CLI login.
    const said = (['api-key', 'subscription', 'cli'] as const).map((a) => model(a).via);
    expect(new Set(said).size).toBe(3);
    expect(model('cli').via).toContain('Claude Code');

    // The CLI route needs no variable, and the row must not imply one is
    // missing: it is `set`, so the panel renders `via` and never `vars`.
    expect(model('cli').set).toBe(true);
  });

  // One row for one capability. Two rows would put the panel back where it
  // started the moment the CLI login satisfies the model path: one row green,
  // one row still asking for a credential nothing needs.
  it('gives the model one row, not one per credential that could satisfy it', () => {
    const rows = readKeys('cli');
    expect(rows.filter((r) => r.vars.includes('ANTHROPIC_API_KEY'))).toHaveLength(1);
    expect(rows.filter((r) => r.vars.includes('CLAUDE_CODE_OAUTH_TOKEN'))).toHaveLength(1);
    expect(rows[0].vars).toEqual(['ANTHROPIC_API_KEY', 'CLAUDE_CODE_OAUTH_TOKEN']);
    // Every variable in the panel appears in exactly one row.
    const all = rows.flatMap((r) => r.vars);
    expect(new Set(all).size).toBe(all.length);
  });

  // Each row lands on the section that explains that credential, not all of
  // them on one page the operator then has to search.
  it('deep-links each capability to its own section of the documentation', () => {
    const docs = readKeys('none').map((k) => k.doc);
    expect(new Set(docs).size).toBe(docs.length);
    for (const d of docs) expect(d).toMatch(/^\/docs\/[a-z-]+#[a-z-]+$/);
  });

  it('never returns a key it can see', () => {
    // Every credential, one at a time -- the old version planted the canary in
    // ANTHROPIC_API_KEY only, and a leak of ASSAY_RESEND_KEY would have passed.
    for (const name of ['BRIGHTDATA_API_TOKEN', 'ASSAY_RESEND_KEY', 'FIRECRAWL_API_KEY']) {
      process.env[name] = SECRET;
      const keys = readKeys('none');
      expect(keys.find((k) => k.vars.includes(name))?.set).toBe(true);
      // Not "does not equal" -- does not CONTAIN, anywhere in the whole shape.
      // A masked tail or a `sk-ant-...` prefix would pass an equality check and
      // is still a credential leak.
      expect(JSON.stringify(keys)).not.toContain('KEYPANELCANARY');
      delete process.env[name];
    }

    // The model row is the one whose value never reaches this module at all --
    // it is handed a word, not a credential -- so the canary goes in both model
    // variables at once and the row must still carry no trace of either.
    process.env.ANTHROPIC_API_KEY = SECRET;
    process.env.CLAUDE_CODE_OAUTH_TOKEN = SECRET;
    for (const auth of ['api-key', 'subscription', 'cli', 'none'] as const) {
      expect(JSON.stringify(readKeys(auth))).not.toContain('KEYPANELCANARY');
    }
  });

  // What replaced the paste block. `envLines` used to build `NAME=` lines for
  // the unset variables; it is gone, and with it the only function in this
  // module that ever assembled a string the panel then rendered as machine
  // text. The rows carry the variable names instead -- as data, from literals
  // in the source -- so the assertion that matters now is that every string a
  // row can render is one of those literals and never comes from the
  // environment. Set every variable to the canary and read the whole shape.
  it('renders only strings written in its own source, never any it read', () => {
    for (const n of NAMES) process.env[n] = SECRET;

    for (const auth of ['api-key', 'subscription', 'cli', 'none'] as const) {
      for (const row of readKeys(auth)) {
        // Every field, not just the ones a reviewer thought to check.
        for (const [field, value] of Object.entries(row)) {
          const text = Array.isArray(value) ? value.join(' ') : String(value);
          expect(text, `${row.name}.${field}`).not.toContain('KEYPANELCANARY');
          expect(text, `${row.name}.${field}`).not.toContain('sk-ant');
        }
      }
    }

    // Everything set means every row is Connected and every row says how,
    // rather than a panel that has gone blank because it had nothing to paste.
    const all = readKeys('api-key');
    expect(all.every((k) => k.set)).toBe(true);
    expect(all.every((k) => k.via !== '')).toBe(true);
  });

  it('has no path from process.env to the screen except keys.ts', () => {
    // This is the construction proof, and it is the whole proof. The tests
    // above show that nothing `keys.ts` exports can carry a value; this one
    // shows that `keys.ts` is the only door -- so no component under sign-in/
    // has a key to render even if it wanted to.
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
