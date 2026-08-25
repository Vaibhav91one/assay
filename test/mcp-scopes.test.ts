// MCP per-tool scoping (`requireKeyForMcp()`, `src/api/keys.ts`).
//
// Every MCP call is a POST to the same URL regardless of which tool it
// invokes, so `requireKey()`'s HTTP-verb-and-path reasoning has nothing to
// read here. This is the real bug that used to make a target-scoped key
// refused on /api/mcp outright (`web/app/api/mcp/route.ts`'s old header said
// so) -- these tests are both the unit-level proof that the resolver in
// `keys.ts` answers each category of tool correctly, and the HTTP-level proof
// that the route actually wires it in.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createKey, requireKeyForMcp } from '../src/api/keys.js';
import {
  apiKeys, closeDb, episodes, fieldRuns, getDb, runs, sql, targets,
} from '../src/store/index.js';

const IN = 'mcp_scope_in';
const OUT = 'mcp_scope_out';
const IN_PROOF = 'pr_mcp_scope_in';
const OUT_PROOF = 'pr_mcp_scope_out';

let dbUp = false;
let fixture: {
  legacy: string; read: string; write: string; outside: string;
  inEpisode: number; outEpisode: number;
};

async function wipe() {
  const d = getDb();
  await d.execute(sql`DELETE FROM episodes WHERE target_id IN (${IN}, ${OUT})`);
  await d.execute(sql`DELETE FROM field_runs WHERE proof_id IN (${IN_PROOF}, ${OUT_PROOF})`);
  await d.execute(sql`DELETE FROM runs WHERE target_id IN (${IN}, ${OUT})`);
  await d.execute(sql`DELETE FROM targets WHERE target_id IN (${IN}, ${OUT})`);
  await d.execute(sql`DELETE FROM api_keys WHERE name LIKE 'mcp scope %'`);
}

beforeAll(async () => {
  try { getDb(); await getDb().select().from(apiKeys).limit(1); dbUp = true; } catch { dbUp = false; }
  if (process.env.ASSAY_REQUIRE_DB && !dbUp) throw new Error('ASSAY_REQUIRE_DB is set and Postgres is unreachable');
  if (!dbUp) return;

  await wipe();
  await getDb().insert(targets).values([
    { targetId: IN, url: 'https://in.example.test', contract: {} },
    { targetId: OUT, url: 'https://out.example.test', contract: {} },
  ]);
  const [inRun] = await getDb().insert(runs).values({ targetId: IN, status: 'abstain' })
    .returning({ id: runs.runId });
  const [outRun] = await getDb().insert(runs).values({ targetId: OUT, status: 'abstain' })
    .returning({ id: runs.runId });
  await getDb().insert(fieldRuns).values([
    { runId: inRun!.id, field: 'price', value: null, status: 'quarantined', reason: 'below_tau', proofId: IN_PROOF, heldSinceRun: inRun!.id },
    { runId: outRun!.id, field: 'price', value: null, status: 'quarantined', reason: 'below_tau', proofId: OUT_PROOF, heldSinceRun: outRun!.id },
  ]);
  const [inEpisode] = await getDb().insert(episodes).values({ targetId: IN, field: 'price', openedRun: inRun!.id })
    .returning({ id: episodes.episodeId });
  const [outEpisode] = await getDb().insert(episodes).values({ targetId: OUT, field: 'price', openedRun: outRun!.id })
    .returning({ id: episodes.episodeId });

  const legacy = await createKey('mcp scope legacy');
  const read = await createKey('mcp scope read', { access: 'read', targets: [IN] });
  const write = await createKey('mcp scope write', { access: 'write', targets: [IN] });
  const outside = await createKey('mcp scope outside', { access: 'write', targets: [OUT] });
  fixture = {
    legacy: legacy.key, read: read.key, write: write.key, outside: outside.key,
    inEpisode: inEpisode!.id, outEpisode: outEpisode!.id,
  };
});

afterAll(async () => {
  if (dbUp) await wipe().catch(() => {});
  await closeDb().catch(() => {});
});

const req = (key: string | null) => new Request('http://localhost/api/mcp', {
  method: 'POST',
  headers: key ? { authorization: `Bearer ${key}` } : {},
});
const call = (name: string, args: Record<string, unknown>, key: string | null) =>
  requireKeyForMcp(req(key), { method: 'tools/call', params: { name, arguments: args } });

describe('protocol-level methods bypass scoping entirely', () => {
  it('initialize and tools/list are answered for any valid key', async () => {
    if (!dbUp) return;
    for (const method of ['initialize', 'tools/list', 'notifications/initialized']) {
      const denied = await requireKeyForMcp(req(fixture.read), { method });
      expect(denied, method).toBeNull();
    }
  });

  it('still refuses no key at all', async () => {
    if (!dbUp) return;
    const denied = await requireKeyForMcp(req(null), { method: 'tools/list' });
    expect(denied?.status).toBe(401);
  });
});

describe('a legacy (null-scope) key is unaffected', () => {
  it('reaches every category of tool', async () => {
    if (!dbUp) return;
    expect(await call('assay_targets', {}, fixture.legacy)).toBeNull();
    expect(await call('assay_contract', { target: OUT }, fixture.legacy)).toBeNull();
    expect(await call('assay_delete_watch', { target: OUT }, fixture.legacy)).toBeNull();
  });
});

describe('target given directly in the arguments', () => {
  it('allows the in-scope target and refuses the out-of-scope one', async () => {
    if (!dbUp) return;
    expect(await call('assay_contract', { target: IN }, fixture.read)).toBeNull();
    expect((await call('assay_contract', { target: OUT }, fixture.read))?.status).toBe(403);
  });
});

describe('target optional in the schema', () => {
  it('allows a provided in-scope target', async () => {
    if (!dbUp) return;
    expect(await call('assay_status', { target: IN }, fixture.read)).toBeNull();
    expect(await call('assay_runs', { target: IN }, fixture.read)).toBeNull();
  });

  it('refuses an out-of-scope target', async () => {
    if (!dbUp) return;
    expect((await call('assay_status', { target: OUT }, fixture.read))?.status).toBe(403);
  });

  it('refuses when omitted -- "every target" is not a thing a scoped key can mean', async () => {
    if (!dbUp) return;
    expect((await call('assay_status', {}, fixture.read))?.status).toBe(403);
    expect((await call('assay_field_health_stored', {}, fixture.read))?.status).toBe(403);
  });
});

describe('indirect ids, resolved through the store', () => {
  it('resolves a proof to its real target', async () => {
    if (!dbUp) return;
    expect(await call('assay_explain', { proof: IN_PROOF }, fixture.read)).toBeNull();
    expect((await call('assay_explain', { proof: OUT_PROOF }, fixture.read))?.status).toBe(403);
  });

  it('resolves an episode to its real target', async () => {
    if (!dbUp) return;
    expect(await call('assay_incident', { episode: fixture.inEpisode }, fixture.read)).toBeNull();
    expect((await call('assay_incident', { episode: fixture.outEpisode }, fixture.read))?.status).toBe(403);
  });

  it('refuses a proof or episode that does not exist at all', async () => {
    if (!dbUp) return;
    expect((await call('assay_explain', { proof: 'pr_does_not_exist' }, fixture.read))?.status).toBe(403);
    expect((await call('assay_incident', { episode: 999999999 }, fixture.read))?.status).toBe(403);
  });
});

describe('tools with no target a scoped key could ever be checked against', () => {
  it('refuses every one of them, matching their nearest REST equivalent', async () => {
    if (!dbUp) return;
    for (const name of [
      'assay_held', 'assay_decisions', 'assay_connectors',
      'assay_model_status', 'assay_skills', 'assay_targets', 'assay_digest',
      'assay_create_watch',
    ]) {
      expect((await call(name, {}, fixture.read))?.status, name).toBe(403);
    }
  });

  it('refuses assay_blast, which spans targets by field name alone', async () => {
    if (!dbUp) return;
    expect((await call('assay_blast', { field: 'price' }, fixture.read))?.status).toBe(403);
  });
});

describe('assay_watch touches no stored target data', () => {
  it('is allowed for any scope -- it only drafts a contract', async () => {
    if (!dbUp) return;
    const denied = await call('assay_watch', { url: 'https://x.example', fields: ['price'] }, fixture.read);
    expect(denied).toBeNull();
  });
});

describe('write tools require write access, same as the REST surface', () => {
  it('refuses a read-only key on a write tool even in scope', async () => {
    if (!dbUp) return;
    expect((await call('assay_pause_watch', { target: IN }, fixture.read))?.status).toBe(403);
  });

  it('allows a write-scoped key on a write tool in scope', async () => {
    if (!dbUp) return;
    // requireKeyForMcp() only, not the tool itself -- what matters here is
    // that the GATE lets this through, not what assay_pause_watch would do
    // to a target with no real watch on it.
    const denied = await call('assay_pause_watch', { target: IN }, fixture.write);
    expect(denied).toBeNull();
  });

  it('still refuses a write tool outside scope', async () => {
    if (!dbUp) return;
    expect((await call('assay_delete_watch', { target: OUT }, fixture.write))?.status).toBe(403);
  });
});

describe('the real HTTP route', () => {
  const rpc = (method: string, params: unknown = {}, id = 1) => ({ jsonrpc: '2.0', id, method, params });
  const post = async (body: unknown, key: string) => {
    const { POST } = await import('../web/app/api/mcp/route.js');
    return POST(new Request('http://localhost/api/mcp', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        authorization: `Bearer ${key}`,
      },
      body: JSON.stringify(body),
    }));
  };

  it('answers a real tools/call for an in-scope target', async () => {
    if (!dbUp) return;
    const res = await post(rpc('tools/call', { name: 'assay_contract', arguments: { target: IN } }), fixture.read);
    expect(res.status).toBe(200);
  });

  it('refuses a real tools/call for an out-of-scope target with a real 403', async () => {
    if (!dbUp) return;
    const res = await post(rpc('tools/call', { name: 'assay_contract', arguments: { target: OUT } }), fixture.read);
    expect(res.status).toBe(403);
  });

  it('refuses a real tools/call for a global tool even with a valid key', async () => {
    if (!dbUp) return;
    const res = await post(rpc('tools/call', { name: 'assay_targets', arguments: {} }), fixture.read);
    expect(res.status).toBe(403);
  });
});
