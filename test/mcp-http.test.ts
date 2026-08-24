// web/app/api/mcp/route.ts -- Assay's MCP tool surface, reachable over HTTP
// for a client that cannot spawn `bin/assay.ts mcp` locally (claude.ai's
// custom-connector flow). Asserts the HTTP transport is not a second,
// drifted tool registry: its `tools/list` must match `loadTools()` exactly.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createKey } from '../src/api/keys.js';
import { loadTools } from '../src/mcp/server.js';
import { apiKeys, closeDb, getDb, sql } from '../src/store/index.js';

let dbUp = false;
let nullScopeKey: string;

beforeAll(async () => {
  try {
    await getDb().select().from(apiKeys).limit(1);
    dbUp = true;
  } catch {
    if (process.env.ASSAY_REQUIRE_DB) throw new Error('DATABASE_URL required (ASSAY_REQUIRE_DB=1)');
    return;
  }
  const created = await createKey('mcp-http-test');
  nullScopeKey = created.key;
});

afterAll(async () => {
  if (!dbUp) return;
  await getDb().delete(apiKeys).where(sql`${apiKeys.name} = 'mcp-http-test'`);
  await closeDb();
});

const rpc = (method: string, params: unknown = {}, id = 1) => ({
  jsonrpc: '2.0', id, method, params,
});

const post = async (body: unknown, auth?: string) => {
  const { POST } = await import('../web/app/api/mcp/route.js');
  return POST(new Request('http://localhost/api/mcp', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      ...(auth ? { authorization: `Bearer ${auth}` } : {}),
    },
    body: JSON.stringify(body),
  }));
};

describe('MCP over HTTP', () => {
  it('refuses a request with no bearer key', async () => {
    if (!dbUp) return;
    const res = await post(rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'x', version: '1' } }));
    expect(res.status).toBe(401);
  });

  it('points an unauthenticated caller at the protected-resource metadata', async () => {
    // The MCP authorization spec (and RFC9728 with it) requires this
    // parameter so a real OAuth client -- claude.ai, chiefly -- can find
    // `/.well-known/oauth-protected-resource` and, from there,
    // `src/api/oauth.ts`'s endpoints, off a bare 401 with no other guidance.
    if (!dbUp) return;
    const res = await post(rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'x', version: '1' } }));
    expect(res.status).toBe(401);
    expect(res.headers.get('www-authenticate')).toBe(
      'Bearer resource_metadata="http://localhost/.well-known/oauth-protected-resource"',
    );
  });

  it('points at the reverse proxy\'s public origin, not the internal Host header', async () => {
    // Same real bug as the .well-known routes (see test/oauth-routes.test.ts):
    // behind ngrok, `request.url`'s own origin is the proxy's internal
    // target. A resource_metadata pointer built from it sends a real client
    // to a URL it cannot reach.
    if (!dbUp) return;
    const { POST } = await import('../web/app/api/mcp/route.js');
    const res = await POST(new Request('http://localhost:3911/api/mcp', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        'x-forwarded-host': 'unloved-isolation-script.ngrok-free.dev',
        'x-forwarded-proto': 'https',
      },
      body: JSON.stringify(rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'x', version: '1' } })),
    }));
    expect(res.status).toBe(401);
    expect(res.headers.get('www-authenticate')).toBe(
      'Bearer resource_metadata="https://unloved-isolation-script.ngrok-free.dev/.well-known/oauth-protected-resource"',
    );
  });

  it('initializes and lists the same tools loadTools() registers', async () => {
    if (!dbUp) return;
    const init = await post(
      rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } }, 1),
      nullScopeKey,
    );
    expect(init.status).toBe(200);
    const initBody = await readJsonRpc(init);
    expect(initBody.result?.serverInfo?.name).toBe('assay');

    const list = await post(rpc('tools/list', {}, 2), nullScopeKey);
    expect(list.status).toBe(200);
    const listBody = await readJsonRpc(list);
    const httpNames = new Set((listBody.result.tools as { name: string }[]).map((t) => t.name));

    const real = new Set(Object.keys(await loadTools()));
    expect(httpNames).toEqual(real);
  });

  it('never serves assay_resolve', async () => {
    if (!dbUp) return;
    const list = await post(rpc('tools/list', {}, 3), nullScopeKey);
    const body = await readJsonRpc(list);
    const names = (body.result.tools as { name: string }[]).map((t) => t.name);
    expect(names).not.toContain('assay_resolve');
  });
});

/** The route answers either plain JSON or one SSE frame carrying JSON, per the SDK's own choice. */
async function readJsonRpc(res: Response): Promise<{ result?: any }> {
  const ct = res.headers.get('content-type') ?? '';
  const text = await res.text();
  if (ct.includes('text/event-stream')) {
    const dataLine = text.split('\n').find((l) => l.startsWith('data:'));
    return JSON.parse(dataLine!.slice(5).trim());
  }
  return JSON.parse(text);
}
