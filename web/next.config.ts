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
  // Pinned rather than left to default, because `createMDX` below fills this in
  // when it is absent and its default is `['mdx', 'md', 'jsx', 'js', 'tsx',
  // 'ts']` -- which would make every `.md` file anywhere under `app/` a route.
  // Documentation lives in `content/docs`, is read through `lib/source.ts`, and
  // is never a page module, so `app/` has no business compiling markdown.
  pageExtensions: ['ts', 'tsx', 'js', 'jsx'],

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
