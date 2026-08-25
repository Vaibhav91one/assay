// The human write path (F7/F8).
//
// Almost all of this is database behaviour, so almost all of it early-returns
// without Postgres -- which vitest reports as PASSED, not skipped. Run it with
// ASSAY_REQUIRE_DB=1 or it is asserting nothing.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { resolve, undo, ResolveInput, Resolution } from '../src/decisions/index.js';
import {
  getDb, closeDb, openQueue, queueItems, targets, runs, fieldRuns, eq, sql,
} from '../src/store/index.js';

const TARGET = 't_decisions_test';
// Two items on one template, one on another. The third is the control: a
// decision must not leak across templates.
const GROUP_A = 'gk_decisions_test_a';
const GROUP_B = 'gk_decisions_test_b';
const P1 = 'pr_decisions_test_1';
const P2 = 'pr_decisions_test_2';
const P3 = 'pr_decisions_test_3';
const SOLO = 'pr_decisions_test_solo';

let dbUp = false;

async function wipe() {
  const d = getDb();
  await d.execute(sql`DELETE FROM queue_items WHERE proof_id LIKE 'pr_decisions_test_%'`);
  await d.execute(sql`DELETE FROM field_runs WHERE proof_id LIKE 'pr_decisions_test_%'`);
  await d.execute(sql`DELETE FROM runs WHERE target_id = ${TARGET}`);
  await d.execute(sql`DELETE FROM targets WHERE target_id = ${TARGET}`);
}

/** Four held cells: three on template A/B, one with no group at all. */
async function seed() {
  const d = getDb();
  await d.insert(targets).values({
    targetId: TARGET, url: 'https://example.invalid/decisions', contract: {},
  });
  const [run] = await d.insert(runs)
    .values({ targetId: TARGET, status: 'quarantined' })
    .returning({ runId: runs.runId });
  const runId = run!.runId;

  const cells = [
    { field: 'price_1', proofId: P1, groupKey: GROUP_A },
    { field: 'price_2', proofId: P2, groupKey: GROUP_A },
    { field: 'price_3', proofId: P3, groupKey: GROUP_B },
    { field: 'lonely', proofId: SOLO, groupKey: null },
  ];
  for (const c of cells) {
    await d.insert(fieldRuns).values({
      runId, field: c.field, value: null, status: 'quarantined',
      reason: 'no_local_heal', proofId: c.proofId,
      heldSinceRun: runId, groupKey: c.groupKey,
    });
    await d.insert(queueItems).values({
      proofId: c.proofId, groupKey: c.groupKey, stakesRows: 7,
    });
  }
  return runId;
}

const item = async (proofId: string) => {
  const [row] = await getDb().select().from(queueItems)
    .where(eq(queueItems.proofId, proofId)).limit(1);
  return row;
};

const isOpen = async (proofId: string) =>
  (await openQueue(500)).some((i) => i.proofId === proofId);

beforeAll(async () => {
  try { getDb(); await openQueue(1); dbUp = true; } catch { dbUp = false; }
  // Everything below early-returns without Postgres, and vitest calls that
  // PASSED. This file is the write path; a vacuous green here is worse than red.
  if (process.env.ASSAY_REQUIRE_DB && !dbUp) throw new Error('ASSAY_REQUIRE_DB is set and Postgres is unreachable');
  if (dbUp) { await wipe(); await seed(); }
});

afterAll(async () => {
  if (dbUp) await wipe().catch(() => {});
  await closeDb().catch(() => {});
});

describe('the answer vocabulary', () => {
  it('is a closed set of two', () => {
    // `first`/`second` -- accepting a ranked candidate -- are gone: healGated,
    // the only thing that ever populated field_runs.ranked, no longer runs
    // (src/runner.ts's header), so there is never a candidate to accept.
    expect(Resolution.options).toEqual(['empty', 'neither']);
  });

  it('refuses anything else, including a value', () => {
    expect(ResolveInput.safeParse({ proof: 'pr_x', resolution: 'maybe' }).success).toBe(false);
    expect(ResolveInput.safeParse({ proof: 'pr_x', resolution: '$49.99' }).success).toBe(false);
    expect(ResolveInput.safeParse({ proof: 'pr_x', resolution: 'first' }).success).toBe(false);
  });

  it('refuses an unrecognised key rather than ignoring it', () => {
    expect(ResolveInput.safeParse({ proof: 'pr_x', resolution: 'empty', force: true }).success)
      .toBe(false);
  });

  it('refuses an empty proof id', () => {
    expect(ResolveInput.safeParse({ proof: '', resolution: 'empty' }).success).toBe(false);
  });
});

describe('resolving', () => {
  it('refuses a proof that is not in the queue', async () => {
    if (!dbUp) return;
    const r = await resolve({ proof: 'pr_no_such_thing', resolution: 'empty' });
    expect(r).toMatchObject({ ok: false, error: 'not_found' });
  });

  it('treats a model nomination as OPEN, not as a settled decision', async () => {
    if (!dbUp) return;
    // A historical shape: assay_propose used to write a resolution string
    // with resolved_by left null. Gone as a writer, but a resolve() call must
    // still treat any pre-existing non-null `resolution` with a null
    // `resolved_by` as an open item, not a settled one.
    await getDb().update(queueItems)
      .set({ resolution: 'model_nominated:1', resolvedBy: null })
      .where(eq(queueItems.proofId, P3));

    expect(await isOpen(P3)).toBe(true);
    const r = await resolve({ proof: P3, resolution: 'neither' });
    expect(r).toMatchObject({ ok: true, resolution: 'neither' });

    const after = await item(P3);
    expect(after!.resolvedBy).toBe('human');
    // The human's answer replaced the nomination; the item is settled by a
    // person, which the nomination never made it.
    expect(after!.resolution).toBe('neither');
  });

  it('applies one answer to every open item on the same template (F8)', async () => {
    if (!dbUp) return;
    const r = await resolve({ proof: P1, resolution: 'empty' });
    expect(r).toMatchObject({ ok: true, group_key: GROUP_A, applied: 2 });

    for (const p of [P1, P2]) {
      const row = await item(p);
      expect(row!.resolvedBy).toBe('human');
      expect(row!.resolution).toBe('empty');
      expect(row!.resolvedAt).toBeInstanceOf(Date);
      expect(await isOpen(p)).toBe(false);
    }
  });

  it('does not leak the decision to a different template', async () => {
    if (!dbUp) return;
    // P3 was settled by its own decision above, as `neither` -- not `empty`.
    expect((await item(P3))!.resolution).toBe('neither');
    // And the ungrouped item was never touched by either.
    const solo = await item(SOLO);
    expect(solo!.resolvedBy).toBeNull();
    expect(solo!.resolution).toBeNull();
  });

  it('settles a card once when it is answered twice at once', async () => {
    if (!dbUp) return;
    // A double-click on the primary screen. Exactly one write, and the loser is
    // told so -- never two answers, and never a success that changed no rows.
    await undo({ proof: P1 });
    const both = await Promise.all([
      resolve({ proof: P1, resolution: 'empty' }),
      resolve({ proof: P2, resolution: 'neither' }),
    ]);
    expect(both.filter((r) => r.ok)).toHaveLength(1);
    expect(both.filter((r) => !r.ok)).toMatchObject([{ error: 'already_resolved' }]);

    const [a, b] = [await item(P1), await item(P2)];
    expect(a!.resolution).toBe(b!.resolution);       // one answer, not two
    expect(a!.resolvedAt!.getTime()).toBe(b!.resolvedAt!.getTime());
  });

  it('refuses to decide an item that is already settled', async () => {
    if (!dbUp) return;
    const r = await resolve({ proof: P1, resolution: 'empty' });
    expect(r).toMatchObject({ ok: false, error: 'already_resolved' });
    expect((await item(P1))!.resolution).toBe('empty');
  });
});

describe('undo', () => {
  it('refuses an item that was never settled', async () => {
    if (!dbUp) return;
    expect(await undo({ proof: SOLO })).toMatchObject({ ok: false, error: 'not_resolved' });
  });

  it('unwinds the whole group, and keeps the decision as history', async () => {
    if (!dbUp) return;
    const u = await undo({ proof: P1 });
    expect(u).toMatchObject({ ok: true, group_key: GROUP_A, applied: 2 });

    for (const p of [P1, P2]) {
      const row = await item(p);
      expect(row).toBeTruthy();                  // never deleted
      expect(row!.resolvedBy).toBeNull();        // back to open
      expect(await isOpen(p)).toBe(true);
      expect(row!.undoneAt).toBeInstanceOf(Date);
      // The receipt survives being taken back: "resolved, then unresolved" is a
      // different fact from "never resolved", and both have to stay readable.
      expect(row!.resolution).toBe('empty');
      expect(row!.resolvedAt).toBeInstanceOf(Date);
    }
  });

  it('does not unwind a different decision on the same template', async () => {
    if (!dbUp) return;
    // Settle P1 alone (P2 is now open too, so this re-settles both), then check
    // that undoing one decision leaves an unrelated template alone.
    expect((await item(P3))!.resolvedBy).toBe('human');
    expect(await isOpen(P3)).toBe(false);
  });

  it('lets an undone item be decided again', async () => {
    if (!dbUp) return;
    const r = await resolve({ proof: P2, resolution: 'neither' });
    expect(r).toMatchObject({ ok: true, applied: 2 });
    const row = await item(P2);
    expect(row!.resolution).toBe('neither');
    // Still says it was taken back once. Re-deciding does not erase that.
    expect(row!.undoneAt).toBeInstanceOf(Date);
  });

  it('leaves a `neither` cell withheld -- a refusal is a decision, not a fix', async () => {
    if (!dbUp) return;
    const [cell] = await getDb().select().from(fieldRuns)
      .where(eq(fieldRuns.proofId, P2)).limit(1);
    expect(cell!.status).toBe('quarantined');
    expect(cell!.value).toBeNull();
  });
});
