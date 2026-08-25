// Every Server Action refuses an anonymous caller on the hosted deployment.
//
// WHY THIS TEST EXISTS AS A CALL AND NOT A GREP. A Server Action is reachable by
// POST to the page's own url with an action id. It goes through no route
// handler, so `web/proxy.ts` was its only gate -- and Next documents a proxy as
// an OPTIMISTIC check, not authorisation. An audit demonstrated the consequence:
// with AUTH_MODE=clerk and no session, an anonymous same-origin POST of
// `resolveCell` reached the database and was answered from it.
//
// WHY THE FILES ARE DISCOVERED AND NOT LISTED. This test was written with a
// hand-written list of four action files, and it was out of date before it was
// committed: the tracker library landed `library/actions.ts` and the proof sheet
// landed `explain/actions.ts` on the same day, both taking operator input, both
// unguarded. A list only covers the actions someone remembered. So the tree is
// walked for `'use server'`, every export is called, and a new action file is
// covered on the day it is added rather than the day someone updates a test.
//
// Every export is called WITH NO ARGUMENTS, which is not laziness about the
// signature -- it is the assertion. The guard is the first statement in each
// action, so it must answer before any argument is read. Anything that gets far
// enough to complain about its arguments has already run further than an
// anonymous caller should get.

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = join(ROOT, 'web', 'app');

// The hosted deployment's auth package is deliberately NOT a dependency (see
// web/lib/auth.ts), so there is nothing on disk to mock -- the factory IS the
// module. `auth()` answering `{ userId: null }` is exactly a signed-out visitor
// on a hosted instance, which is the case that was open.
vi.mock('@clerk/nextjs/server', () => ({ auth: async () => ({ userId: null }) }));

const saved = process.env.AUTH_MODE;
beforeAll(() => { process.env.AUTH_MODE = 'clerk'; });
afterAll(() => {
  if (saved === undefined) delete process.env.AUTH_MODE;
  else process.env.AUTH_MODE = saved;
});

/**
 * The one action file that must stay open, and why.
 *
 * `sign-in/actions.ts` is how a signed-out visitor signs in. Guarding it with
 * "you must be signed in" would be a locked door with the key inside. It is on
 * the proxy's PUBLIC list for the same reason, and test/auth.test.ts pins that
 * list at exactly three entries.
 */
const PUBLIC = ['app/sign-in/actions.ts'];

/** Every `'use server'` module under web/app, found by walking rather than listed. */
function actionFiles(dir = APP): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) { out.push(...actionFiles(p)); continue; }
    if (!e.name.endsWith('.ts') && !e.name.endsWith('.tsx')) continue;
    // The directive has to be the first statement in the module, so this is the
    // same thing Next itself keys on.
    if (/^\s*(['"])use server\1/.test(readFileSync(p, 'utf8'))) out.push(p);
  }
  return out;
}

const FILES = actionFiles()
  .map((p) => relative(join(ROOT, 'web'), p))
  .filter((p) => !PUBLIC.includes(p))
  .sort();

describe('AUTH_MODE=clerk, no session', () => {
  it('found the action files to check', () => {
    // Not an exact list -- that is the thing this test stopped relying on. A
    // floor, so a walk that silently finds nothing cannot pass.
    expect(FILES.length).toBeGreaterThanOrEqual(6);
    // The two the merge added on the day the audit landed, named so a
    // refactor that moves them is visible here. (`decisions/actions.ts` --
    // the file the audit actually reached the database through -- is gone
    // with the decide-queue; this file's walk still covers whatever replaces
    // it, which is the point of walking rather than listing.)
    expect(FILES).toContain('app/(app)/library/actions.ts');
    expect(FILES).toContain('app/(app)/explain/actions.ts');
  });

  it.each(FILES)('%s refuses every export before touching the store', async (rel) => {
    const { Unauthorized } = await import('../web/lib/auth.js');
    const mod = await import(join(ROOT, 'web', rel));

    const exported = Object.entries(mod).filter(([, v]) => typeof v === 'function');
    expect(exported.length, `${rel} exports no callable action`).toBeGreaterThan(0);

    for (const [name, fn] of exported) {
      const outcome = await (fn as () => Promise<unknown>)().then(
        (value) => ({ kind: 'returned' as const, value }),
        (e: Error) => ({ kind: 'threw' as const, value: e }),
      );

      expect(outcome.kind, `${rel} ${name} answered an anonymous caller instead of refusing`)
        .toBe('threw');
      // Specifically the guard. A store error or an argument complaint here
      // would mean the action ran and merely happened to fail, which is not the
      // property being asserted.
      expect(outcome.value, `${rel} ${name} failed for a reason other than authorisation`)
        .toBeInstanceOf(Unauthorized);
    }
  });
});

describe('self-host is untouched', () => {
  // The guard's job is to make HOSTED correct. Self-host has no accounts, no
  // sign-in and no signed-out state -- `getCurrentUser()` returns the single
  // operator and never null. If this ever fails, the security fix has become a
  // wall across the product for the deployment that has nobody to check.
  it('AUTH_MODE unset lets the operator through', async () => {
    const before = process.env.AUTH_MODE;
    delete process.env.AUTH_MODE;
    try {
      const { assertOperator, authMode } = await import('../web/lib/auth.js');
      expect(authMode()).toBe('none');
      await expect(assertOperator()).resolves.toBeUndefined();
    } finally {
      process.env.AUTH_MODE = before;
    }
  });
});
