import type { NextConfig } from 'next';

const config: NextConfig = {
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

export default config;
