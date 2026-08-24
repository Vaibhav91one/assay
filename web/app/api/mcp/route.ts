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
// AUTH: `requireKeyForMcp()` (`src/api/keys.ts`), a sibling of the REST
// surface's `requireKey()` rather than that function itself -- every MCP call
// arrives as a POST regardless of which tool it invokes, so the HTTP verb
// carries none of the read/write information `requireKey()` reads off it, and
// the URL is the same for every tool, so it carries no target either. The
// JSON-RPC BODY is where both live: `params.name` is the tool, and
// `params.arguments` is what a per-tool resolver in `keys.ts` (`mcpTarget()`)
// reads a target id out of, the same way `scopedTarget()` reads one out of a
// REST route's path or params. A null-scope (full-access) key is unaffected;
// a target-scoped one is now checked per call instead of refused outright.

import { requireKeyForMcp } from 'assay/api/keys';
import { canonicalOrigin } from 'assay/api/oauth';
import { buildServer } from 'assay/mcp/server';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';

export const dynamic = 'force-dynamic';

/**
 * `requireKey()`'s 401 carries a bare `WWW-Authenticate: Bearer` -- correct
 * for the REST surface, where nothing downstream of a 401 knows what to do
 * with more. An MCP client does: the authorization spec (and RFC9728 with
 * it) requires the `resource_metadata` parameter so it can find
 * `/.well-known/oauth-protected-resource` and, from there, this server's own
 * OAuth endpoints (`src/api/oauth.ts`). Added here, not in `requireKey()`
 * itself, because every other consumer of that function is a plain REST
 * route with no OAuth server behind it -- the parameter would be a pointer
 * to nothing.
 */
function withResourceMetadata(denied: Response, request: Request): Response {
  if (denied.status !== 401) return denied;
  const origin = canonicalOrigin(request);
  const headers = new Headers(denied.headers);
  headers.set('WWW-Authenticate', `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource"`);
  return new Response(denied.body, { status: denied.status, headers });
}

async function handle(request: Request): Promise<Response> {
  // Read as text ONCE, not via request.clone() -- measured live that a clone
  // read here left the SDK transport's own read of the ORIGINAL request
  // seeing an empty or already-disturbed body under Next's real route
  // runtime (a `-32700 Parse error` on every call), even though the same
  // clone-then-read pattern works against a bare Node `Request` outside it. A
  // fresh Request built from the same raw text has no such history, so the
  // transport reads it exactly as it would have read the original.
  //
  // A GET or DELETE (session management, no JSON-RPC body) reads as '', which
  // fails to parse below -- fine, `rpc.method` comes back undefined, and
  // `requireKeyForMcp()` treats anything that is not `tools/call` as carrying
  // no target-specific data to check.
  const raw = await request.text();
  let rpc: { method?: unknown; params?: { name?: unknown; arguments?: unknown } } = {};
  try {
    rpc = raw ? JSON.parse(raw) : {};
  } catch {
    // Not JSON. Left as {} -- see above.
  }

  const denied = await requireKeyForMcp(request, rpc);
  if (denied) return withResourceMetadata(denied, request);

  const forwarded = new Request(request.url, {
    method: request.method,
    headers: request.headers,
    body: raw || undefined,
  });

  const transport = new WebStandardStreamableHTTPServerTransport();
  const server = await buildServer();
  await server.connect(transport);
  return transport.handleRequest(forwarded);
}

export const GET = handle;
export const POST = handle;
export const DELETE = handle;
