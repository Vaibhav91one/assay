// Assay's own MCP server, over HTTP -- for a client that cannot spawn a
// local process: claude.ai's custom-connector flow, or any hosted agent that
// is not already on the machine running Assay. `bin/assay.ts mcp` (stdio) is
// the answer for Claude Code and Codex, which run locally and can spawn one.
//
// `src/mcp/server.ts`'s `buildServer()` is the ONLY tool registry -- this
// file adds a transport, not a second copy of the tools. Verified against
// this project's installed SDK (`@modelcontextprotocol/sdk`) rather than
// against remembered docs: `WebStandardStreamableHTTPServerTransport` takes a
// Web-standard `Request` and returns a `Response`, which is what a Next.js
// route handler already speaks, and its own example
// (`dist/esm/examples/server/honoWebStandardStreamableHttp.js`) is a fresh
// transport + server per request with no `sessionIdGenerator` -- stateless
// mode. That is deliberate here too, not a default left unset: an agent
// calling this endpoint reaches it once per tool call over the open internet,
// with no long-lived connection this server could pin a session to.
//
// AUTH: the same `requireKey()` the REST surface uses (`src/api/keys.js`) --
// this is the one MCP transport reachable off the machine, so it needs the
// consumer-key gate stdio never did. ONE REAL LIMIT, stated rather than
// hidden: `requireKey`'s target-scoping (`scopedTarget()`) only recognises
// `/api/v1/...` paths, and every MCP call arrives as a POST regardless of
// which tool it invokes -- there is no one target or one HTTP verb an
// individual tool call maps to. A TARGET-SCOPED key is therefore refused here
// (fails closed, the safe direction), and this endpoint works today only with
// a null-scope (full-access) key. Scoping MCP per-tool is real further work,
// not done by this file.

import { requireKey } from 'assay/api/keys';
import { buildServer } from 'assay/mcp/server';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';

export const dynamic = 'force-dynamic';

async function handle(request: Request): Promise<Response> {
  const denied = await requireKey(request);
  if (denied) return denied;

  const transport = new WebStandardStreamableHTTPServerTransport();
  const server = await buildServer();
  await server.connect(transport);
  return transport.handleRequest(request);
}

export const GET = handle;
export const POST = handle;
export const DELETE = handle;
