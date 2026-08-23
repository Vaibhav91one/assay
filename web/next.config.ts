import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { NextConfig } from 'next';
import { createMDX } from 'fumadocs-mdx/next';

// Page captures are addressed relative to the process's working directory
// (`ASSAY_CAPTURES`, default `captures`), and every other consumer -- the
// worker, the CLIs, vitest -- runs from the repo root. Next runs from `web/`,
// where that path does not exist.
//
// Nothing throws when it is wrong. `hasCapture` simply answers false, so
// `src/health` grades every run as unobserved and the Fields screen reports
// "0 observations of this field" for a field with twenty-eight of them --
// a false statement, rendered confidently, from a missing directory. This
// config runs before any route module, which is where CAPTURE_DIR is read.
process.env.ASSAY_CAPTURES ||= resolve(process.cwd(), '..', 'captures');

// The same mistake, one directory up. `.env.example` sits at the repo root and
// every doc tells an operator to copy it to `.env` there -- but Next roots its
// own env loading at `web/`, so a root `.env` is never read and the web process
// starts without credentials that are, as far as the operator is concerned, set.
//
// The failure is silent and confidently wrong in the same shape as the capture
// path above: `keys.ts` reports BRIGHTDATA_API_TOKEN as NOT SET on an instance
// whose `.env` declares it, because presence is read from THIS process and this
// process never saw the file. The panel is telling the truth about the wrong
// scope.
//
// `||=` per key, so a variable already exported into the environment wins over
// the file -- the file is a default, not an override -- and a missing file is
// simply nothing to read rather than a throw.
// Anchored on this file, not on `process.cwd()`. The working directory is
// `web/` under `next dev` but the repo root under `npx next start web`, so a
// cwd-relative '..' finds the repo root in one case and the directory ABOVE
// the repo in the other -- where it silently finds nothing and every
// credential reads as unset. `import.meta.dirname` is always `web/`.
const envFile = resolve(import.meta.dirname, '..', '.env');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (value) process.env[key] ||= value;
  }
}

const config: NextConfig = {
  // `X-Powered-By: Next.js` names the framework and, near enough, its major
  // version to anyone scanning. It buys nobody anything.
  poweredByHeader: false,

  /**
   * The three headers that hold whether or not anything is in front of this.
   *
   * docs/self-host.mdx is explicit that Assay authenticates nobody and that
   * reaching it on a network means a reverse proxy someone configured on
   * purpose. That posture is exactly why these live here rather than in the
   * proxy: a proxy is a thing an operator MIGHT have, and the default compose
   * path -- bound to 127.0.0.1, port-forwarded over ssh -- has none at all. A
   * header only the proxy sets is a header the canonical install does not get.
   *
   * NO Content-Security-Policy, and that is a decision rather than an
   * oversight: Next inlines its own bootstrap and flight payloads, the app
   * ships inline `style` attributes on the charts and the travelling tab
   * highlight, and `next dev` adds its own eval-backed client. A real policy
   * means threading a per-request nonce through the render and a separate
   * relaxation for dev -- its own project, not a line in this object.
   */
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          // Stop a capture served back to a browser being sniffed into
          // something executable, whatever the store said its type was.
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // Nothing here is meant to be framed. Every consequential control on
          // this console -- resolve a decision, clear a brake -- is one click,
          // which is the whole clickjacking shape.
          { key: 'X-Frame-Options', value: 'DENY' },
          // Assay URLs carry target ids, run ids and proof ids. None of that
          // belongs in the Referer of an outbound click to a vendor's docs.
          { key: 'Referrer-Policy', value: 'no-referrer' },
        ],
      },
    ];
  },

  // Pinned rather than left to default, because `createMDX` below fills this in
  // when it is absent and its default is `['mdx', 'md', 'jsx', 'js', 'tsx',
  // 'ts']` -- which would make every `.md` file anywhere under `app/` a route.
  // Documentation lives in `content/docs`, is read through `lib/source.ts`, and
  // is never a page module, so `app/` has no business compiling markdown --
  // hence no `md` here.
  //
  // `mdx` IS here, and not so `.mdx` files can become routes (there are none
  // under `app/`). Next applies the RSC layer's `react-server` resolve
  // condition only to files matching pageExtensions; without `mdx`, every
  // compiled docs page pulled the CLIENT jsx-dev-runtime into the server
  // graph and dev rendering of /docs died on
  // `undefined.recentlyCreatedOwnerStacks` (prod was fine -- its runtime never
  // touches owner stacks).
  pageExtensions: ['ts', 'tsx', 'js', 'jsx', 'mdx'],

  // The root `exports` map makes `assay/engine/*` and `assay/store` real
  // specifiers, so no `externalDir` escape hatch is needed. Since the migration
  // those specifiers resolve to TypeScript SOURCE -- the engine is a workspace
  // sibling, never a published build -- so Next has to be told to compile it.
  transpilePackages: ['assay'],

  // Why this app builds with webpack rather than Turbopack.
  //
  // The engine is `module: NodeNext`, so every relative import inside it is
  // written `./schema.js` and resolves to `./schema.ts` -- that is TypeScript's
  // extension substitution, and it is not optional under NodeNext. Turbopack
  // has no equivalent of webpack's `resolve.extensionAlias` and cannot follow
  // those specifiers (vercel/next.js#82945, open as of 2026-08-22), so a
  // Turbopack build fails on `Can't resolve './schema.js'` the moment a route
  // imports `assay/store`.
  //
  // The alternatives were worse: dropping `.js` from ~50 engine specifiers ties
  // the whole repo to a non-standard resolver forever, and compiling the engine
  // to `dist/` first puts a build step between editing an engine file and
  // seeing it in the app. Six lines here, deletable the day #82945 lands.
  webpack: (cfg) => {
    cfg.resolve.extensionAlias = {
      ...cfg.resolve.extensionAlias,
      '.js': ['.ts', '.tsx', '.js'],
    };
    return cfg;
  },
};

// Fumadocs compiles `content/docs/**` and generates `.source/`.
//
// It composes rather than replaces: the wrapper's own webpack callback ends
// `return nextConfig.webpack?.(config, options) ?? config`, so the
// `extensionAlias` above still runs and `assay/store` still resolves. That is
// the one thing worth checking on every upgrade of this package -- the engine
// becomes unresolvable the moment it stops calling through.
export default createMDX()(config);
