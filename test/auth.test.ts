// The self-host path must boot with no configuration at all, and the seam
// that makes that possible must stay intact as the app grows.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('auth seam', () => {
  const saved = process.env.AUTH_MODE;
  beforeEach(() => { delete process.env.AUTH_MODE; });
  afterEach(() => { if (saved === undefined) delete process.env.AUTH_MODE; else process.env.AUTH_MODE = saved; });

  it('defaults to single-operator with no env and no Clerk keys', async () => {
    const { getCurrentUser, authMode } = await import('../web/lib/auth.js');
    expect(authMode()).toBe('none');
    const user = await getCurrentUser();
    expect(user).toMatchObject({ id: 'operator', mode: 'none' });
  });

  it('never returns null on the self-host path', async () => {
    // A null user is a "signed out" state. Self-host has no signed-out state;
    // if this ever returns null, every guard downstream starts redirecting to
    // a sign-in page that does not exist on this deployment.
    const { getCurrentUser } = await import('../web/lib/auth.js');
    expect(await getCurrentUser()).not.toBeNull();
  });

  it('explains itself when AUTH_MODE=clerk but the package is absent', async () => {
    process.env.AUTH_MODE = 'clerk';
    const { getCurrentUser } = await import('../web/lib/auth.js');
    await expect(getCurrentUser()).rejects.toThrow(/npm install @clerk\/nextjs/);
  });

  it('is the only module that names Clerk', () => {
    // The seam's whole value is that one file knows about Clerk. This is a
    // grep, not a mock, because the failure mode is a future route handler
    // importing @clerk/nextjs directly -- which no runtime test would catch.
    // Filesystem walk rather than `git grep`: a new file is untracked until
    // it is staged, and a guard that passes only after `git add` is no guard.
    // Prune node_modules and .next DURING the walk. A recursive readdir that
    // filters afterwards still descends into them, and never returns.
    const hits: string[] = [];
    const walk = (rel: string) => {
      for (const e of readdirSync(join(ROOT, rel), { withFileTypes: true })) {
        if (e.name === 'node_modules' || e.name === '.next' || e.name.startsWith('.')) continue;
        const p = join(rel, e.name);
        if (e.isDirectory()) { walk(p); continue; }
        if (!/\.(js|jsx|ts|tsx|mjs)$/.test(e.name)) continue;
        if (readFileSync(join(ROOT, p), 'utf8').includes('@clerk/nextjs')) hits.push(p);
      }
    };
    walk('web'); walk('src');

    expect(hits.sort()).toEqual(['web/lib/auth.ts', 'web/proxy.ts']);
  });

  it('keeps @clerk/nextjs out of the install a self-hoster pays for', () => {
    const root = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
    const web = JSON.parse(readFileSync(join(ROOT, 'web', 'package.json'), 'utf8'));
    const all = { ...root.dependencies, ...web.dependencies };
    expect(all['@clerk/nextjs']).toBeUndefined();
  });
});
