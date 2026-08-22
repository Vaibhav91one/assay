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

/**
 * The hosted gate, asserted against the SOURCE.
 *
 * A runtime test would need a Clerk account, a publishable key and a live
 * instance, so there is no honest way to exercise this path in CI -- and the
 * failure mode does not need one. It is a deletion: `clerkMiddleware()` called
 * bare protects nothing ("by default, clerkMiddleware() will not protect any
 * routes" -- clerk.com/docs/reference/nextjs/clerk-middleware), and that is
 * exactly how this file was written until 2026-08-22. With AUTH_MODE=clerk and
 * no session, every operator screen answered 200 and a same-origin POST of the
 * `resolveCell` Server Action reached the store.
 *
 * Same argument as the grep above: the thing that rots is a line someone
 * removes, and a source assertion is what catches that.
 *
 * The proxy is now the OUTER gate rather than the only one: every Server Action
 * calls `assertOperator()` on its first line, and test/actions-auth.test.ts
 * proves it by calling each of them with no session.
 */
describe('hosted gate', () => {
  const proxy = readFileSync(join(ROOT, 'web', 'proxy.ts'), 'utf8');

  it('passes a handler to clerkMiddleware and protects with it', () => {
    // Bare `clerkMiddleware()` is the bug. It must be called WITH a handler,
    // and that handler must protect.
    expect(proxy).not.toMatch(/clerkMiddleware\(\)\s*\(/);
    expect(proxy).toMatch(/auth\.protect\(\)/);
  });

  it('protects by default and lists what is public', () => {
    // Deny-by-default: the guard runs unless the path is on a named list, not
    // the other way round. A route added tomorrow must be closed on the day it
    // is added.
    expect(proxy).toMatch(/if \(!PUBLIC\.test\(/);
    // Only these three. /sign-in or the guard loops, /api/health because a load
    // balancer has no session, /__clerk because it issues the session.
    const [, list] = /const PUBLIC = \/\^\\\/\(([^)]+)\)/.exec(proxy) ?? [];
    expect(list?.split('|').sort()).toEqual(['__clerk', 'api\\/health', 'sign-in']);
  });

  it('keeps /api/v1 out of the session matcher', () => {
    // That surface is machine-to-machine and carries its own Bearer key. If it
    // ever falls INSIDE the matcher, every consumer breaks at once.
    expect(proxy).toMatch(/matcher: \['\/\(\(\?!_next\|api\/v1\|/);
  });
});

/**
 * Nothing under /api/v1 answers without a key.
 *
 * Every route file there is imported and actually CALLED with a bearer-less
 * Request. That is deliberately not a grep: a route can import `requireKey`,
 * look guarded, and still export a handler that never calls it. The only proof
 * is the status code.
 *
 * This is the test that fails when someone adds a route and forgets the guard.
 */
describe('/api/v1 refuses an unauthenticated request', () => {
  const V1 = join(ROOT, 'web', 'app', 'api', 'v1');
  const routes: string[] = [];
  const collect = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) collect(p);
      else if (e.name === 'route.ts') routes.push(p);
    }
  };
  collect(V1);

  // Params good enough for every folder in the tree. Most guards answer before
  // reading them, but the delivery webhook checks `kind` FIRST and 404s an
  // unknown one, so an empty object would test the 404 rather than the gate.
  const ctx = {
    params: Promise.resolve({
      kind: 'brightdata', target: 'audit', proof: 'audit', episode: '1',
    } as Record<string, string>),
  };

  it('found the routes to check', () => {
    expect(routes.length).toBeGreaterThan(20);
  });

  it.each(routes.map((p) => [p.slice(V1.length) || '/', p]))('%s', async (_name, file) => {
    const mod = await import(file);
    const verbs = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].filter((v) => typeof mod[v] === 'function');
    expect(verbs.length).toBeGreaterThan(0);

    for (const verb of verbs) {
      const url = 'http://localhost/api/v1' + (file.slice(V1.length).replace(/\/route\.ts$/, '') || '/');
      const request = new Request(url, {
        method: verb,
        ...(verb === 'GET' || verb === 'DELETE'
          ? {}
          : { headers: { 'content-type': 'application/json' }, body: '{}' }),
      });
      const res: Response = await mod[verb](request, ctx);

      // The Bright Data delivery endpoint is the one route in this tree that
      // does NOT take a consumer key: it is a webhook, authenticated with the
      // per-connector bearer stored on the connector (src/connectors/brightdata.ts
      // `authorise`). With no connector configured it fails CLOSED with 503,
      // which is the property that matters -- an unconfigured receiver must
      // never accept an anonymous delivery.
      const expected = file.includes('delivery') ? [401, 503] : [401];
      expect(
        expected,
        `${verb} ${file.slice(ROOT.length)} answered ${res.status} without a key`,
      ).toContain(res.status);
    }
  });
});
