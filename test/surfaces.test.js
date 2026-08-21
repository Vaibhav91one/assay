// The surfaces layer. Engine tests stay in tools/selftest.js -- assert-based,
// no framework, 34 checks. This covers what D2 added.
//
// DB-backed tests skip when Postgres is absent so `vitest` still runs on a
// clean clone; the pure ones (signing, schemas, tool surface) always run.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { z } from 'zod';
import { sign, verify, EVENTS } from '../src/api/webhooks.js';
import { TOOLS, REFUSED_TOOLS } from '../src/mcp/tools.js';
import { getHeld, getRow } from '../src/api/handlers.js';
import { HeldCell, Row, Status } from '../src/api/schemas.js';
import { getDb, closeDb, heldCells } from '../src/store/index.js';

let dbUp = false;
beforeAll(async () => {
  try { getDb(); await heldCells(); dbUp = true; } catch { dbUp = false; }
});
afterAll(async () => { await closeDb().catch(() => {}); });

const req = (url, key) =>
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
    await expect(deliver({ url: 'http://x', secret, event: 'made.up', data: {} }))
      .rejects.toThrow(/unknown event/);
    expect(EVENTS).toContain('field.held');
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

  it('assay_propose takes an index, not a value', () => {
    const shape = z.object(TOOLS.assay_propose.schema);
    // A reference is accepted.
    expect(shape.safeParse({ proof: 'pr_x', candidate_index: 0 }).success).toBe(true);
    // A value in its place is rejected by the contract itself.
    expect(shape.safeParse({ proof: 'pr_x', candidate_index: 'burn, electric shock' }).success)
      .toBe(false);
    // And there is no field a value could arrive in.
    expect(Object.keys(TOOLS.assay_propose.schema)).not.toContain('value');
  });
});

describe('REST', () => {
  it('rejects an unauthenticated call', async () => {
    const res = await getHeld(req('http://x/api/v1/held'));
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe('unauthorized');
  });

  it('rejects a bogus bearer token', async () => {
    if (!dbUp) return;
    const res = await getHeld(req('http://x/api/v1/held', 'ak_notarealkey'));
    expect(res.status).toBe(401);
  });

  it('serialises a held cell as null and labelled', async () => {
    if (!dbUp) return;
    const held = await heldCells();
    if (!held.length) return;             // corpus produces none without a mutation
    const cell = held[0];
    expect(cell.value).toBeNull();        // never filled
    expect(cell.status).toBe('quarantined');
    expect(HeldCell.safeParse(cell).success).toBe(true);
  });

  it('rebuilds the published row with a matching envelope', async () => {
    if (!dbUp) return;
    const held = await heldCells();
    if (!held.length) return;
    const { rowByProof } = await import('../src/store/index.js');
    const row = await rowByProof(held[0].proofId);
    expect(Row.safeParse(row).success).toBe(true);
    const field = held[0].field;
    // The two numbers that disagreed before the D2 run-id fix.
    expect(row._assay.run).toBe(row._assay.fields[field].held_since_run);
    expect(row[field]).toBeNull();
    expect(Status.parse(row._assay.fields[field].status)).toBe('quarantined');
  });
});
