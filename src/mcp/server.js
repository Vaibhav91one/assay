#!/usr/bin/env node
// Assay over MCP, on stdio. Keys stay on the machine.
//
// The headline is not "let an agent scrape things" -- every MCP server can do
// that. It is that this one hands an agent the list of calls a scraper REFUSED
// to make, and gives it no way to settle them.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { TOOLS } from './tools.js';

export function buildServer() {
  const server = new McpServer({ name: 'assay', version: '0.1.0' });
  for (const [name, t] of Object.entries(TOOLS)) {
    server.registerTool(
      name,
      { description: t.description, inputSchema: t.schema },
      async (args) => ({
        content: [{ type: 'text', text: JSON.stringify(await t.run(args ?? {}), null, 2) }],
      }),
    );
  }
  return server;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const server = buildServer();
  await server.connect(new StdioServerTransport());
}
