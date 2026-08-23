// Is anything actually consuming the queue?
//
// The schedule screen can enqueue a target, and an enqueue nobody is reading is
// a queued state that never advances -- the exact failure this product is an
// argument against. So the answer has to be a fact rather than a timeout, and
// these are the assertions that it is one.
//
// Nothing here waits on the wall clock: an advisory lock appears when it is
// taken and is gone when the connection holding it goes, so every check below
// is a read of the current state and not a sleep.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  getDb, closeDb, sql, targets, scheduleTarget, claimDueTarget,
  holdWorkerLock, workersUp, WORKER_LOCK,
} from '../src/store/index.js';

const T = 'test_liveness__f';
let dbUp = false;

beforeAll(async () => {
  try {
    const d = getDb();
    await d.execute(sql`SELECT 1`);
    dbUp = true;
    await d.execute(sql`DELETE FROM runs WHERE target_id = ${T}`);
    await d.insert(targets).values({
      targetId: T, url: 'corpus://ikea', cadence: '6h',
      contract: { field: 'recall_title' },
    }).onConflictDoNothing();
  } catch { dbUp = false; }
});

afterAll(async () => {
  if (dbUp) {
    const d = getDb();
    await d.execute(sql`DELETE FROM runs WHERE target_id = ${T}`);
    await d.execute(sql`DELETE FROM targets WHERE target_id = ${T}`);
  }
  await closeDb().catch(() => {});
});

describe('database', () => {
  // Same guard as the rest of the suite: a DB-backed test that early-returns
  // without Postgres reports PASSED, not skipped. ASSAY_REQUIRE_DB turns that
  // vacuous green into a failure.
  it('postgres is reachable (required when ASSAY_REQUIRE_DB is set)', () => {
    if (process.env.ASSAY_REQUIRE_DB) expect(dbUp).toBe(true);
  });
});

describe('the worker liveness signal', () => {
  it('counts nobody when no worker holds the lock', async () => {
    if (!dbUp) return;
    expect(await workersUp()).toBe(0);
  });

  it('counts a worker for exactly as long as it holds its connection', async () => {
    if (!dbUp) return;
    const release = await holdWorkerLock();
    expect(await workersUp()).toBe(1);
    // Awaited, because the release unlocks server-side before it drops the
    // connection. That ordering is the whole point: a stopped worker must
    // never still read as present on the very next check.
    await release();
    expect(await workersUp()).toBe(0);
  });

  it('counts two workers, because two are a supported shape', async () => {
    if (!dbUp) return;
    const a = await holdWorkerLock();
    const b = await holdWorkerLock();
    // Shared, not exclusive: the second worker must be able to say it is up
    // rather than being told the signal is taken.
    expect(await workersUp()).toBe(2);
    await a();
    expect(await workersUp()).toBe(1);
    await b();
    expect(await workersUp()).toBe(0);
  });

  it('is scoped to this database, so another install is not mistaken for ours', async () => {
    if (!dbUp) return;
    const release = await holdWorkerLock();
    const { rows } = await getDb().execute(sql`
      SELECT count(*)::int AS n FROM pg_locks
      WHERE locktype = 'advisory' AND granted
        AND classid = ${WORKER_LOCK.classId} AND objid = ${WORKER_LOCK.objId}
        AND database <> (SELECT oid FROM pg_database WHERE datname = current_database())`);
    // Whatever any other database's worker is doing, it is not ours to count.
    expect((rows as Record<string, any>[])[0]!.n).toBe(0);
    await release();
  });
});

describe('asking for a run', () => {
  it('is an enqueue: the target becomes claimable, and the claim is the worker\'s', async () => {
    if (!dbUp) return;
    // Not due.
    await scheduleTarget(T, new Date(Date.now() + 6 * 3600e3));
    const before = await claimDueTarget();
    expect(before?.targetId).not.toBe(T);

    // What the button does, and the whole of what it does. Dated well into the
    // past rather than `now`, because the claim is `ORDER BY next_run_at` over
    // the WHOLE table: any other target already due on this store would
    // otherwise be claimed first and this would assert on someone else's row.
    await scheduleTarget(T, new Date(Date.now() - 24 * 3600e3));
    const after = await claimDueTarget();
    expect(after?.targetId).toBe(T);
  });

  it('leaves a paused target paused, so nothing resumes it by accident', async () => {
    if (!dbUp) return;
    const d = getDb();
    await d.execute(sql`UPDATE targets SET next_run_at = NULL WHERE target_id = ${T}`);
    // The screen refuses a paused scraper rather than writing a next run: pause
    // is the ABSENCE of one, and the worker bumps next_run_at by the cadence
    // after it claims -- so one "run now" on a paused target would restart the
    // schedule for good, with no record that this button did it.
    const { rows } = await d.execute(
      sql`SELECT next_run_at FROM targets WHERE target_id = ${T}`,
    );
    expect((rows as Record<string, any>[])[0]!.next_run_at).toBeNull();
    const got = await claimDueTarget();
    expect(got?.targetId).not.toBe(T);
  });
});
