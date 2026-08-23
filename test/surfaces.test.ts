// The surfaces layer. Engine tests stay in tools/selftest.js -- assert-based,
// no framework, 34 checks. This covers what D2 added.
//
// DB-backed tests skip when Postgres is absent so `vitest` still runs on a
// clean clone; the pure ones (signing, schemas, tool surface) always run.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { z } from 'zod';
import { sign, verify, EVENTS, deliver, heldObservation } from '../src/api/webhooks.js';
import { loadTools, REFUSED_TOOLS, type McpTool } from '../src/mcp/server.js';
import { getExplain, getHeld, getRow } from '../src/api/handlers.js';
import { createKey } from '../src/api/keys.js';
import { HeldCell, Row, Status } from '../src/api/schemas.js';
import {
  getDb, closeDb, heldCells, sql, targets, runs, fieldRuns, apiKeys,
} from '../src/store/index.js';
import * as schema from '../src/store/schema.js';
import { getTableName, is } from 'drizzle-orm';
import { PgTable } from 'drizzle-orm/pg-core';

let dbUp = false;
let heldFixture: { key: string; proof: string; field: string; reason: string } | null = null;
// The whole merged surface, through the loader rather than one tool file:
// the refusal below is only worth asserting if it covers every module that
// registers tools, which after wave 1 is nine of them.
let TOOLS: Record<string, McpTool> = {};
beforeAll(async () => {
  TOOLS = await loadTools();
  try { getDb(); await heldCells(); dbUp = true; } catch { dbUp = false; }
  if (dbUp) {
    const target = 'surface_withheld';
    const field = 'price';
    const proof = 'pr_surface_withheld';
    const reason = 'below_tau';
    await getDb().execute(sql`DELETE FROM field_runs WHERE proof_id = ${proof}`);
    await getDb().execute(sql`DELETE FROM runs WHERE target_id = ${target}`);
    await getDb().execute(sql`DELETE FROM targets WHERE target_id = ${target}`);
    await getDb().insert(targets).values({
      targetId: target, url: 'https://example.test/item', contract: {},
    });
    const [run] = await getDb().insert(runs).values({ targetId: target, status: 'abstain' })
      .returning({ runId: runs.runId });
    await getDb().insert(fieldRuns).values({
      runId: run!.runId, field, value: null, status: 'quarantined', reason,
      proofId: proof, heldSinceRun: run!.runId,
    });
    const created = await createKey('surface contract test');
    heldFixture = { key: created.key, proof, field, reason };
  }
});
afterAll(async () => {
  if (dbUp && heldFixture) {
    await getDb().execute(sql`DELETE FROM field_runs WHERE proof_id = ${heldFixture.proof}`).catch(() => {});
    await getDb().execute(sql`DELETE FROM runs WHERE target_id = 'surface_withheld'`).catch(() => {});
    await getDb().execute(sql`DELETE FROM targets WHERE target_id = 'surface_withheld'`).catch(() => {});
    await getDb().delete(apiKeys).where(sql`${apiKeys.name} = 'surface contract test'`).catch(() => {});
  }
  await closeDb().catch(() => {});
});

// Next always passes a context; these handlers ignore it, but the type says
// what Next does, not what one handler happens to need.
const noCtx = { params: Promise.resolve({}) };

const req = (url: string, key?: string): Request =>
  new Request(url, { headers: key ? { authorization: `Bearer ${key}` } : {} });

describe('webhook signing', () => {
  const secret = 'whsec_test';
  const body = JSON.stringify({ event: 'field.held', data: { field: 'hazard' } });

  it('verifies its own signature', () => {
    expect(verify(body, sign(body, secret), secret)).toBe(true);
  });

  it('rejects a tampered body', () => {
    const sig = sign(body, secret);
    expect(verify(`${body} `, sig, secret)).toBe(false);
  });

  it('rejects the wrong secret', () => {
    expect(verify(body, sign(body, secret), 'whsec_other')).toBe(false);
  });

  it('rejects a replay outside the tolerance window', () => {
    // The timestamp is inside the signed string, so it cannot be refreshed.
    const sig = sign(body, secret);
    expect(verify(body, sig, secret, 300, Date.now() + 600_000)).toBe(false);
  });

  it('rejects a malformed header', () => {
    expect(verify(body, 'garbage', secret)).toBe(false);
  });

  it('refuses an unknown event name', async () => {
    const { deliver } = await import('../src/api/webhooks.js');
    // `as any` on purpose: the type already refuses this, and the point of the
    // test is that the RUNTIME refuses it too, for a name arriving over JSON.
    await expect(deliver({ url: 'http://x', secret, event: 'made.up' as any, data: {} }))
      .rejects.toThrow(/unknown event/);
    expect(EVENTS).toContain('field.held');
  });

  it('signs a withheld observation without losing its null, state, reason, or proof', async () => {
    if (!heldFixture) throw new Error('withheld webhook fixture was not created');
    const secret = 'whsec_withheld';
    let sent: { body: string; signature: string | null } | null = null;

    const result = await deliver({
      url: 'https://consumer.example.test/hooks/assay',
      secret,
      event: 'episode.opened',
      data: heldObservation({
        target: 'surface_withheld', field: heldFixture.field, run: 1,
        proof: heldFixture.proof, reason: heldFixture.reason,
      }),
      fetchImpl: async (_url, init) => {
        sent = {
          body: String(init?.body),
          signature: new Headers(init?.headers).get('x-assay-signature'),
        };
        return new Response(null, { status: 204 });
      },
    });

    expect(result).toMatchObject({ ok: true, status: 204 });
    expect(sent).not.toBeNull();
    expect(verify(sent!.body, sent!.signature, secret)).toBe(true);
    const payload = JSON.parse(sent!.body);
    expect(Object.hasOwn(payload.data, heldFixture.field)).toBe(true);
    expect(payload.data[heldFixture.field]).toBeNull();
    expect(payload.data).toMatchObject({
      status: 'quarantined',
      reason: heldFixture.reason,
      proof: heldFixture.proof,
    });

    const explained = await getExplain(
      req(`http://x/api/v1/explain/${payload.data.proof}`, heldFixture.key),
      { params: Promise.resolve({ proof: payload.data.proof }) },
    );
    expect(explained.status).toBe(200);
  });
});

describe('database', () => {
  // Nine features are about to be built in parallel against the tables wave 0
  // added, in nine worktrees, each of which has to have run the migration. A
  // missing table shows up here as one clear failure rather than as nine
  // confusing ones in nine feature suites.
  it('has every table schema.ts declares', async () => {
    if (!dbUp) return;
    const declared = Object.values(schema).filter((v) => is(v, PgTable)).map(getTableName);
    const { rows } = await getDb().execute(
      sql`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`,
    );
    const present = new Set((rows as { tablename: string }[]).map((r) => r.tablename));
    expect(declared.length).toBeGreaterThan(0);
    expect(declared.filter((t) => !present.has(t))).toEqual([]);
  });

  // A DB-backed test that early-returns without Postgres reports PASSED, not
  // skipped -- vitest cannot tell the difference, so the test count is identical
  // either way. CI sets ASSAY_REQUIRE_DB=1 to turn that vacuous green into a
  // failure. Without it, a clean clone still runs.
  it('postgres is reachable (required when ASSAY_REQUIRE_DB is set)', () => {
    if (process.env.ASSAY_REQUIRE_DB) expect(dbUp).toBe(true);
  });
});

describe('MCP tool surface', () => {
  it('has no assay_resolve — a model proposes, it never decides', () => {
    const names = Object.keys(TOOLS);
    for (const refused of REFUSED_TOOLS) expect(names).not.toContain(refused);
    expect(names).not.toContain('assay_resolve');
  });

  it('exposes the seven documented tools', () => {
    for (const t of ['assay_status', 'assay_held', 'assay_decisions', 'assay_propose',
      'assay_runs', 'assay_blast', 'assay_explain', 'assay_watch']) {
      expect(TOOLS[t]).toBeTruthy();
    }
  });

  it('refuses to start if any tool module exports assay_resolve', async () => {
    // The rule is enforced at the LOADER, not by nine feature agents each
    // remembering it. A refused tool is a boot failure, not a quiet drop.
    const dir = new URL('./fixtures/tools-refused/', import.meta.url);
    await expect(loadTools(dir)).rejects.toThrow(/assay_resolve/);
  });

  it('refuses two modules that claim the same tool name', async () => {
    // Last-file-wins across nine parallel branches is how one feature shadows
    // another's tool and nobody finds out until production.
    const dir = new URL('./fixtures/tools-duplicate/', import.meta.url);
    await expect(loadTools(dir)).rejects.toThrow(/both export "assay_status"/);
  });

  it('assay_propose takes an index, not a value', () => {
    const shape = z.object(TOOLS.assay_propose!.schema);
    // A reference is accepted.
    expect(shape.safeParse({ proof: 'pr_x', candidate_index: 0 }).success).toBe(true);
    // A value in its place is rejected by the contract itself.
    expect(shape.safeParse({ proof: 'pr_x', candidate_index: 'burn, electric shock' }).success)
      .toBe(false);
    // And there is no field a value could arrive in.
    expect(Object.keys(TOOLS.assay_propose!.schema)).not.toContain('value');
  });
});

describe('REST', () => {
  it('rejects an unauthenticated call', async () => {
    const res = await getHeld(req('http://x/api/v1/held'), noCtx);
    expect(res.status).toBe(401);
    expect(((await res.json()) as { error: string }).error).toBe('unauthorized');
  });

  it('rejects a bogus bearer token', async () => {
    if (!dbUp) return;
    const res = await getHeld(req('http://x/api/v1/held', 'ak_notarealkey'), noCtx);
    expect(res.status).toBe(401);
  });

  it('serialises a held cell as null and labelled', async () => {
    if (!dbUp) return;
    const held = await heldCells();
    if (!held.length) return;             // corpus produces none without a mutation
    const cell = held[0]!;
    expect(cell.value).toBeNull();        // never filled
    expect(cell.status).toBe('quarantined');
    expect(HeldCell.safeParse(cell).success).toBe(true);
  });

  it('rebuilds the published row with a matching envelope', async () => {
    if (!dbUp) return;
    const held = await heldCells();
    if (!held.length) return;
    const { rowByProof } = await import('../src/store/index.js');
    // `any`: this test asserts the shape with Zod on the next line, which is a
    // stronger check than anything the static type would give it here.
    const row: any = await rowByProof(held[0]!.proofId);
    expect(Row.safeParse(row).success).toBe(true);
    const field = held[0]!.field;
    // The two numbers that disagreed before the D2 run-id fix.
    expect(row._assay.run).toBe(row._assay.fields[field].held_since_run);
    expect(row[field]).toBeNull();
    expect(Status.parse(row._assay.fields[field].status)).toBe('quarantined');
  });

  it('keeps a withheld observation distinct and its proof resolvable on list and detail', async () => {
    if (!heldFixture) throw new Error('withheld REST fixture was not created');
    const auth = heldFixture.key;

    const listed = await getHeld(req('http://x/api/v1/held', auth), noCtx);
    expect(listed.status).toBe(200);
    const listBody: any = await listed.json();
    const cell = listBody.held.find((x: any) => x.proofId === heldFixture!.proof);
    expect(cell).toMatchObject({
      field: heldFixture.field,
      value: null,
      status: 'quarantined',
      reason: heldFixture.reason,
      proofId: heldFixture.proof,
    });
    expect(Object.hasOwn(cell, 'value')).toBe(true);

    const ctx = { params: Promise.resolve({ proof: heldFixture.proof }) };
    const detailed = await getRow(req(`http://x/api/v1/rows/${heldFixture.proof}`, auth), ctx);
    expect(detailed.status).toBe(200);
    const row: any = await detailed.json();
    expect(Object.hasOwn(row, heldFixture.field)).toBe(true);
    expect(row[heldFixture.field]).toBeNull();
    expect(row._assay.proof).toBe(heldFixture.proof);
    expect(row._assay.fields[heldFixture.field]).toMatchObject({
      status: 'quarantined', reason: heldFixture.reason,
    });

    const explained = await getExplain(
      req(`http://x/api/v1/explain/${heldFixture.proof}`, auth), ctx,
    );
    expect(explained.status).toBe(200);
    expect(await explained.json()).toMatchObject({
      proof: heldFixture.proof,
      field: heldFixture.field,
      value: null,
      status: 'quarantined',
      reason: heldFixture.reason,
    });
  });
});
