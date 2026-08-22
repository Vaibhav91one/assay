// `.env.example` against what the code actually reads, in both directions.
//
// WHY THIS FILE EXISTS. The sign-in screen told operators to set
// `RESEND_API_KEY`; `src/notify.ts` reads `ASSAY_RESEND_KEY` and throws by that
// name. Someone following the screen got a green "Email delivery -- Connected"
// row and every break alert silently recorded as `undelivered`. The same split
// existed for Bright Data: the screen checked `BRIGHT_DATA_TOKEN`,
// `tools/bd-heal.ts` reads `BRIGHTDATA_API_TOKEN`. And Clerk's browser SDK
// wants `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, not `CLERK_PUBLISHABLE_KEY`.
//
// `test/signin-keys.test.ts` had a comment warning about exactly this failure
// and never caught it, because it checked the panel against `.env.example` and
// `.env.example` against the panel -- two sides of a triangle. Both were wrong
// in the same direction, so they agreed. This file adds the third side.
//
// The two failures are not the same failure and both matter:
//
//   declared but never read -- an operator sets it and nothing happens. This is
//     the worse one, because it fails silently and looks like success.
//   read but never declared -- a setting exists and no one can find it. Seven
//     variables were in this state (ASSAY_MAIL_TO, ASSAY_MODEL,
//     ASSAY_CHAT_MODEL, ASSAY_WEBHOOK_URL, ASSAY_WEBHOOK_SECRET,
//     ASSAY_CONNECTORS, ASSAY_CONNECTOR_HOSTS).

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// Where an operator-facing setting can legitimately be read. `test/` is
// excluded on purpose: a variable a test invents is not configuration, and
// declaring it in `.env.example` would be its own kind of lie.
const SOURCE_DIRS = ['src', 'tools', 'bin', 'web'];

// Directories that are output or vendored, not source.
const SKIP_DIR = /^(node_modules|\.next|dist|vendor)$/;

/**
 * Names the environment gives us rather than names Assay defines. Declaring
 * these in `.env.example` would tell an operator to set something the platform
 * already sets.
 */
const NOT_OURS = new Set(['NODE_ENV', 'USER']);

/**
 * Declared for a consumer that is not our code.
 *
 * `@clerk/nextjs` reads its own two variables and is deliberately not a
 * dependency (`test/auth.test.ts` asserts that), so nothing in this repository
 * can be shown to read them -- but an operator running `AUTH_MODE=clerk` still
 * has to set them, so `.env.example` still has to name them. Each entry is a
 * promise that the name was checked against that vendor's own documentation.
 */
const READ_BY_A_VENDOR: Record<string, string> = {
  // clerk.com/docs -- `clerk init` writes exactly these two names.
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: '@clerk/nextjs',
  CLERK_SECRET_KEY: '@clerk/nextjs',
};

/** Every `NAME=` on a non-comment line of `.env.example`, in file order. */
function declared(): string[] {
  const text = readFileSync(join(ROOT, '.env.example'), 'utf8');
  return text
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('#'))
    .map((l) => /^([A-Z][A-Z0-9_]*)=/.exec(l.trim())?.[1])
    .filter((n): n is string => Boolean(n));
}

/** Every `process.env.NAME` under SOURCE_DIRS, mapped to the files reading it. */
function readByCode(): Map<string, string[]> {
  const found = new Map<string, string[]>();
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) {
        if (!SKIP_DIR.test(e.name)) walk(join(dir, e.name));
        continue;
      }
      if (!/\.(ts|tsx|mts|cts|js|mjs|sh)$/.test(e.name)) continue;
      const path = join(dir, e.name);
      const text = readFileSync(path, 'utf8');
      for (const m of text.matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g)) {
        found.set(m[1], [...(found.get(m[1]) ?? []), relative(ROOT, path)]);
      }
      // Shell scripts read the environment too -- `tools/bd-status.sh` is a
      // credential reader. Only the `${NAME:?...}` and `${NAME:-...}` forms
      // count: a bare `${NAME}` is as likely to be the script's own local
      // (`SNAP="${1:?...}"` is not configuration), while those two forms are
      // exactly how a script says "this comes from outside".
      if (e.name.endsWith('.sh')) {
        for (const m of text.matchAll(/\$\{([A-Z][A-Z0-9_]{3,}):[?-]/g)) {
          found.set(m[1], [...(found.get(m[1]) ?? []), relative(ROOT, path)]);
        }
      }
    }
  };
  for (const d of SOURCE_DIRS) walk(join(ROOT, d));
  return found;
}

describe('.env.example against the code', () => {
  it('declares no variable that nothing reads', () => {
    const reads = readByCode();
    const orphans = declared().filter(
      (n) => !reads.has(n) && !(n in READ_BY_A_VENDOR),
    );
    // The message names the fix, because the failure mode is that someone
    // renamed a variable in code and left the declaration behind.
    expect(
      orphans,
      'declared in .env.example but read by nothing: an operator who sets these ' +
        'gets no effect and no error. Either the code was renamed and this was ' +
        'not, or the declaration should go.',
    ).toEqual([]);
  });

  it('declares every variable the code reads', () => {
    const reads = readByCode();
    const known = new Set(declared());
    const undeclared = [...reads.keys()]
      .filter((n) => !known.has(n) && !NOT_OURS.has(n))
      .sort();
    expect(
      undeclared.map((n) => `${n} (${reads.get(n)!.join(', ')})`),
      'read by the code but not declared in .env.example: a setting nobody can find.',
    ).toEqual([]);
  });

  // The specific pair that caused the bug, asserted by name so a future rename
  // has to come here and read why.
  it('names the credential the sending code reads, not the vendor product', () => {
    const notify = readFileSync(join(ROOT, 'src', 'notify.ts'), 'utf8');
    expect(notify).toContain('process.env.ASSAY_RESEND_KEY');
    expect(declared()).toContain('ASSAY_RESEND_KEY');

    const heal = readFileSync(join(ROOT, 'tools', 'bd-heal.ts'), 'utf8');
    expect(heal).toContain('process.env.BRIGHTDATA_API_TOKEN');
    expect(declared()).toContain('BRIGHTDATA_API_TOKEN');
  });

  // Clerk's publishable key is read in the browser. Without the NEXT_PUBLIC_
  // prefix Next never inlines it, and the SDK fails at runtime with a message
  // about a missing key that the operator can see set in their own shell.
  it('gives Clerk’s publishable key the prefix the browser SDK needs', () => {
    const names = declared();
    expect(names).toContain('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY');
    expect(names).not.toContain('CLERK_PUBLISHABLE_KEY');
  });

  it('has no duplicate declarations', () => {
    const names = declared();
    expect(new Set(names).size, names.join(' ')).toBe(names.length);
  });
});
