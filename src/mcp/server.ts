#!/usr/bin/env -S npx tsx
// Assay over MCP, on stdio. Keys stay on the machine.
//
// The headline is not "let an agent scrape things" -- every MCP server can do
// that. It is that this one hands an agent the list of calls a scraper REFUSED
// to make, and gives it no way to settle them.
//
// The tool surface is a DIRECTORY, not a file. `src/mcp/tools/*.ts` is globbed
// at startup and everything each module exports as `TOOLS` is registered. That
// is not architecture for its own sake: nine features are being built in
// parallel, and a single tools file would be the one place all nine had to
// write. A feature adds a file; nobody edits a shared list.
//
// Two rules survive that, and both are enforced HERE rather than by convention
// in each file:
//
//   1. `assay_resolve` cannot exist. If any tool module exports a tool by that
//      name the server refuses to start -- loudly, at boot, not by quietly
//      dropping it. A model nominates; it never settles a queue item.
//   2. Two modules cannot claim the same tool name. A silent
//      last-file-wins merge across nine parallel branches is how one feature
//      shadows another's tool and nobody finds out until production.

import { readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tsImport } from 'tsx/esm/api';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { ZodRawShape } from 'zod';

/** What a tool module must export for each tool it defines. */
export interface McpTool {
  description: string;
  /** A Zod raw shape -- the MCP SDK takes the shape, not a wrapped object. */
  schema: ZodRawShape;
  // TODO(types): each tool narrows its own args in its own signature; there is
  // no single argument type across a heterogeneous tool surface.
  run(args: any): Promise<unknown>;
}

/** Deliberately absent, asserted in the tests, and enforced by `loadTools`. */
export const REFUSED_TOOLS = ['assay_resolve'];

// NOT `new URL('./tools/', import.meta.url)`: that literal shape is one
// webpack specifically pattern-matches (it backs `new URL()` asset imports)
// and tries to resolve `./tools/` as a static context module at build time --
// `web/next.config.ts` `transpilePackages`'s this package, so `web/app/api/
// mcp/route.ts` pulls this file through that webpack build and the literal
// pattern above fails it with "Can't resolve './tools/'". Built from
// `fileURLToPath`/`join`/`pathToFileURL` instead, which is opaque to that
// special case -- this directory is read at RUNTIME either way (`readdir`,
// below), on both the stdio path (`bin/assay.ts mcp`, raw tsx) and the HTTP
// path (`webpackIgnore`s the actual per-file `import()` inside the loop),
// so nothing here needs webpack to see it at all.
// The trailing separator is load-bearing: `new URL(file, dir)` below (WHATWG
// URL) resolves a relative path against a base ending in `/tools` by treating
// `tools` as a FILENAME to replace, landing one directory up
// (`src/mcp/ai.ts` instead of `src/mcp/tools/ai.ts`) -- the original
// `new URL('./tools/', import.meta.url)` had the slash baked into its literal
// and this rebuild has to put it back explicitly.
const TOOLS_DIR = pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), 'tools') + '/');

/**
 * Every tool in `src/mcp/tools/`, merged.
 *
 * Files are loaded in sorted order so a boot failure is reproducible rather
 * than filesystem-order-dependent. `.d.ts` is skipped; both `.ts` and `.js` are
 * accepted so this works from source under tsx and from a build.
 */
export async function loadTools(dir: URL = TOOLS_DIR): Promise<Record<string, McpTool>> {
  const files = (await readdir(dir))
    .filter((f) => (f.endsWith('.ts') || f.endsWith('.js')) && !f.endsWith('.d.ts'))
    .sort();

  const tools: Record<string, McpTool> = {};
  for (const file of files) {
    // `tsImport`, not `import()`. Two problems, one fix:
    //
    //  1. `web/next.config.ts` `transpilePackages`'s this package, which pulls
    //     `web/app/api/mcp/route.ts` -> here into a webpack build; a plain
    //     `import(new URL(...))` there is a dynamic-directory import webpack
    //     tries and fails to resolve statically at BUILD time.
    //  2. Even past that (a raw runtime `import()` DOES reach these real .ts
    //     files on disk -- confirmed by hand against the built server, see
    //     `test/mcp-http.test.ts`), Next's production server is plain Node,
    //     with no TypeScript loader registered -- unlike `bin/assay.ts mcp`,
    //     which runs under `tsx`'s shebang. A raw `import()` of a `.ts` file
    //     fails there with `ERR_MODULE_NOT_FOUND` on the FIRST `.js`-suffixed
    //     specifier inside it (this repo's `NodeNext` convention).
    //
    // `tsx/esm/api`'s `tsImport` transforms the target file (and, per its own
    // docs, everything IT imports) through tsx's loader without registering a
    // process-wide loader hook -- `tsx` is already a dependency the CLI's own
    // shebang requires, kept in the production image on purpose (see the
    // Dockerfile's note on `drizzle-kit migrate`), so nothing new is being
    // asked of a deployment that already runs `bin/assay.ts mcp`.
    const mod = (await tsImport(new URL(file, dir).href, import.meta.url)) as { TOOLS?: Record<string, McpTool> };
    for (const [name, tool] of Object.entries(mod.TOOLS ?? {})) {
      if (REFUSED_TOOLS.includes(name)) {
        throw new Error(
          `src/mcp/tools/${file} exports "${name}", which this server refuses to serve. ` +
            'A model nominates an element reference and clears the same two gates as any ' +
            'other candidate, or the cell stays held. See docs/FEATURES.md 4.',
        );
      }
      if (tools[name]) {
        throw new Error(`two tool modules both export "${name}"; the second is ${file}`);
      }
      tools[name] = tool;
    }
  }
  return tools;
}

export async function buildServer(): Promise<McpServer> {
  const server = new McpServer({ name: 'assay', version: '0.1.0' });
  const tools = await loadTools();
  for (const [name, t] of Object.entries(tools)) {
    server.registerTool(
      name,
      { description: t.description, inputSchema: t.schema },
      async (args: unknown) => ({
        content: [
          { type: 'text' as const, text: JSON.stringify(await t.run(args ?? {}), null, 2) },
        ],
      }),
    );
  }
  return server;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const server = await buildServer();
  await server.connect(new StdioServerTransport());
}
