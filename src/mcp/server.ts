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

const TOOLS_DIR = new URL('./tools/', import.meta.url);

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
    const mod = (await import(new URL(file, dir).href)) as { TOOLS?: Record<string, McpTool> };
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
