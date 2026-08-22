// F10/F11. The pure detector needs no database; everything else does.
//
// DB-backed tests early-return when Postgres is absent, which vitest reports as
// PASSED rather than skipped. ASSAY_REQUIRE_DB=1 turns that vacuous green into
// a failure -- this file is mostly database code, so run it with the flag.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  detectPingPong, recordHeal, healsFor, currentSelector, checkBrake, brakeState,
  listBrakes, shouldHeal, clearBrake, unheal, recordBlastIntent,
  WINDOW_DAYS, RETURN_THRESHOLD, type HealRow,
} from '../src/brake/index.js';
import {
  getDb, closeDb, sql, and, eq, targets, runs, fieldRuns, captures, fieldState,
} from '../src/store/index.js';

const T = 'test_brake';
const F = 'price';
let dbUp = false;

const day = (n: number): Date => new Date(Date.UTC(2026, 0, n));
const row = (o: Partial<HealRow> & { toSelector: string; createdAt: Date }): HealRow => ({
  healId: o.healId ?? 0,
  fromSelector: o.fromSelector ?? null,
  runId: o.runId ?? 1,
  reverted: o.reverted ?? false,
  ...o,
});

/** A -> B -> A -> B ... as heal rows, one per day. */
const seq = (selectors: readonly string[], from: string | null = null): HealRow[] => {
  let prev = from;
  return selectors.map((to, i) => {
    const r = row({ healId: i + 1, fromSelector: prev, toSelector: to, createdAt: day(i + 1) });
    prev = to;
    return r;
  });
};

async function wipe(): Promise<void> {
  const d = getDb();
  await d.execute(sql`DELETE FROM heal_history WHERE target_id = ${T}`);
  await d.execute(sql`DELETE FROM field_state WHERE target_id = ${T}`);
  await d.execute(sql`DELETE FROM queue_items WHERE proof_id LIKE ${`${T}%`}`);
  await d.execute(sql`DELETE FROM field_runs WHERE run_id IN (SELECT run_id FROM runs WHERE target_id = ${T})`);
  await d.execute(sql`DELETE FROM runs WHERE target_id = ${T}`);
}

/**
 * One run with one published cell, so unheal has something to go back to.
 *
 * `status` is the CELL's status (`live` | `healed` | `quarantined`), not the
 * run's -- the two vocabularies differ and unheal reads the cell's.
 */
async function seedRun(runId: number, status: string, value: string | null): Promise<void> {
  const d = getDb();
  const sha = `${T}_cap_${runId}`;
  await d.insert(captures).values({ sha256: sha, bytes: 1, url: 'corpus://test' }).onConflictDoNothing();
  await d.insert(runs).values({
    runId, targetId: T, captureSha: sha, pageBytes: 1,
    status: status === 'live' ? 'ok' : status === 'healed' ? 'heal' : 'abstain',
  });
  await d.insert(fieldRuns).values({
    runId, field: F, value, status, proofId: `${T}_p${runId}`,
    goldenSha: `g${runId}`, captureSha: sha,
  });
}

beforeAll(async () => {
  try {
    const d = getDb();
    await d.execute(sql`SELECT 1`);
    dbUp = true;
    await d.insert(targets).values({
      targetId: T, url: 'corpus://test', cadence: '6h', contract: { field: F },
    }).onConflictDoNothing();
    await wipe();
  } catch { dbUp = false; }
});

afterAll(async () => {
  if (dbUp) {
    await wipe();
    await getDb().execute(sql`DELETE FROM targets WHERE target_id = ${T}`);
  }
  await closeDb().catch(() => {});
});

describe('database', () => {
  it('postgres is reachable (required when ASSAY_REQUIRE_DB is set)', () => {
    if (process.env.ASSAY_REQUIRE_DB) expect(dbUp).toBe(true);
  });
});

describe('ping-pong detection', () => {
  it('one round trip is not yet thrashing', () => {
    // A -> B -> A. A site can change and change back; so can one unheal.
    const v = detectPingPong(seq(['b', 'a'], 'a'), day(3));
    expect(v.returns).toBe(1);
    expect(v.thrashing).toBe(false);
    expect(v.reason).toBeNull();
  });

  it('A -> B -> A -> B trips the brake', () => {
    const v = detectPingPong(seq(['b', 'a', 'b'], 'a'), day(4));
    expect(v.returns).toBe(RETURN_THRESHOLD);
    expect(v.thrashing).toBe(true);
    expect(v.reason).toMatch(/ping_pong/);
  });

  it('drift is not thrashing however far it goes', () => {
    // A -> B -> C -> D -> E: five heals, never revisits, never brakes. Braking
    // here would stop healing exactly where healing is working.
    const v = detectPingPong(seq(['b', 'c', 'd', 'e'], 'a'), day(5));
    expect(v.returns).toBe(0);
    expect(v.thrashing).toBe(false);
  });

  it('counts an unheal as a return, so two unhealed heals brake the field', () => {
    // Neither row revisits a selector; both were marked wrong by a human.
    const rows = [
      row({ healId: 1, fromSelector: 'a', toSelector: 'b', createdAt: day(1), reverted: true }),
      row({ healId: 2, fromSelector: 'a', toSelector: 'c', createdAt: day(2), reverted: true }),
    ];
    const v = detectPingPong(rows, day(3));
    expect(v.returns).toBe(2);
    expect(v.thrashing).toBe(true);
  });

  it('counts one row once, even when it both reverts and returns', () => {
    const rows = [
      row({ healId: 1, fromSelector: 'a', toSelector: 'b', createdAt: day(1) }),
      row({ healId: 2, fromSelector: 'b', toSelector: 'a', createdAt: day(2), reverted: true }),
    ];
    expect(detectPingPong(rows, day(3)).returns).toBe(1);
  });

  it('lets evidence age out of the window', () => {
    const old = seq(['b', 'a', 'b'], 'a');            // days 1-3, thrashing
    expect(detectPingPong(old, day(4)).thrashing).toBe(true);
    // Same rows, read WINDOW_DAYS + 2 later: nothing is in the window any more.
    expect(detectPingPong(old, day(3 + WINDOW_DAYS + 2)).thrashing).toBe(false);
  });

  it('is order-independent of the input array', () => {
    const rows = seq(['b', 'a', 'b'], 'a');
    expect(detectPingPong([...rows].reverse(), day(4)).returns).toBe(2);
  });

  it('says nothing about a field that has never healed', () => {
    const v = detectPingPong([], day(1));
    expect(v).toMatchObject({ thrashing: false, returns: 0, heals: 0, reason: null });
  });
});

describe('the brake', () => {
  it('engages on a real A -> B -> A -> B sequence in the store', async () => {
    if (!dbUp) return;
    await wipe();
    await seedRun(9001, 'live', 'ten');
    await recordHeal({ targetId: T, field: F, fromSelector: '.a', toSelector: '.b', runId: 9001 });
    await recordHeal({ targetId: T, field: F, fromSelector: '.b', toSelector: '.a', runId: 9001 });

    expect((await checkBrake(T, F)).engaged).toBe(false);   // one return: not yet

    await recordHeal({ targetId: T, field: F, fromSelector: '.a', toSelector: '.b', runId: 9001 });
    const tripped = await checkBrake(T, F);
    expect(tripped.returns).toBe(2);
    expect(tripped.engaged).toBe(true);
    expect((await brakeState(T, F))?.brakeActive).toBe(true);
    expect((await listBrakes()).some((b) => b.targetId === T && b.field === F)).toBe(true);
  });

  it('does not engage on A -> B -> C', async () => {
    if (!dbUp) return;
    await wipe();
    await seedRun(9002, 'live', 'ten');
    await recordHeal({ targetId: T, field: F, fromSelector: '.a', toSelector: '.b', runId: 9002 });
    await recordHeal({ targetId: T, field: F, fromSelector: '.b', toSelector: '.c', runId: 9002 });
    const v = await checkBrake(T, F);
    expect(v.thrashing).toBe(false);
    expect(v.engaged).toBe(false);
    expect(await brakeState(T, F)).toBeNull();
  });

  it('is idempotent -- a second check does not rewrite the original evidence', async () => {
    if (!dbUp) return;
    await wipe();
    await seedRun(9003, 'live', 'ten');
    for (const [from, to] of [['.a', '.b'], ['.b', '.a'], ['.a', '.b']] as const) {
      await recordHeal({ targetId: T, field: F, fromSelector: from, toSelector: to, runId: 9003 });
    }
    await checkBrake(T, F);
    const first = await brakeState(T, F);
    const again = await checkBrake(T, F);
    expect(again.engaged).toBe(false);
    expect(again.alreadyBraked).toBe(true);
    expect((await brakeState(T, F))?.brakeReason).toBe(first!.brakeReason);
  });

  it('NEVER writes fragility_grade or drift_state -- feature E owns those', async () => {
    if (!dbUp) return;
    await wipe();
    const d = getDb();
    // Feature E's write, by hand.
    await d.insert(fieldState).values({
      targetId: T, field: F, fragilityGrade: 'brittle', drifting: 'drifting',
    });
    await seedRun(9004, 'live', 'ten');
    for (const [from, to] of [['.a', '.b'], ['.b', '.a'], ['.a', '.b']] as const) {
      await recordHeal({ targetId: T, field: F, fromSelector: from, toSelector: to, runId: 9004 });
    }
    await checkBrake(T, F);
    await clearBrake({ targetId: T, field: F, confirm: F, clearedBy: 'test' });

    // Read the whole row -- including the columns this module must not touch.
    // Scoped to this suite's field: `wipe()` only clears T, so an unscoped
    // select here reads whichever row Postgres returns first and asserts
    // against some other test's target. Every non-corpus run now leaves a
    // field_state row behind (it is where a field's baseline is kept), so that
    // was a flake waiting for a second target to exist.
    const [after] = await d.select().from(fieldState)
      .where(and(eq(fieldState.targetId, T), eq(fieldState.field, F)));
    expect(after!.fragilityGrade).toBe('brittle');
    expect(after!.drifting).toBe('drifting');
  });
});

describe('shouldHeal -- the runner hook', () => {
  it('is true for a field with no row at all', async () => {
    if (!dbUp) return;
    await wipe();
    expect(await shouldHeal(T, F)).toBe(true);
  });

  it('is true for a field whose row exists but is not braked', async () => {
    if (!dbUp) return;
    await wipe();
    await getDb().insert(fieldState).values({ targetId: T, field: F, fragilityGrade: 'stable' });
    expect(await shouldHeal(T, F)).toBe(true);
  });

  it('is false only once a brake is actually set', async () => {
    if (!dbUp) return;
    await wipe();
    await seedRun(9005, 'live', 'ten');
    for (const [from, to] of [['.a', '.b'], ['.b', '.a'], ['.a', '.b']] as const) {
      await recordHeal({ targetId: T, field: F, fromSelector: from, toSelector: to, runId: 9005 });
    }
    await checkBrake(T, F);
    expect(await shouldHeal(T, F)).toBe(false);
    // ... and true again the moment a human clears it.
    await clearBrake({ targetId: T, field: F, confirm: F, clearedBy: 'test' });
    expect(await shouldHeal(T, F)).toBe(true);
  });
});

describe('clearing a brake', () => {
  const brakeIt = async (runId: number): Promise<void> => {
    await wipe();
    await seedRun(runId, 'ok', 'ten');
    for (const [from, to] of [['.a', '.b'], ['.b', '.a'], ['.a', '.b']] as const) {
      await recordHeal({ targetId: T, field: F, fromSelector: from, toSelector: to, runId });
    }
    await checkBrake(T, F);
  };

  it('refuses the wrong confirmation and leaves the brake on', async () => {
    if (!dbUp) return;
    await brakeIt(9006);
    for (const confirm of ['', 'Price', ' price', 'price ', 'yes', T]) {
      const r = await clearBrake({ targetId: T, field: F, confirm, clearedBy: 'test' });
      expect(r).toEqual({ cleared: false, reason: 'confirmation_mismatch' });
    }
    expect(await shouldHeal(T, F)).toBe(false);
  });

  it('clears on the exact field name and records who did it and what it was', async () => {
    if (!dbUp) return;
    await brakeIt(9007);
    const before = (await brakeState(T, F))!.brakeReason;
    const r = await clearBrake({ targetId: T, field: F, confirm: F, clearedBy: 'alice' });
    expect(r).toMatchObject({ cleared: true, clearedBy: 'alice', was: before });

    const after = await brakeState(T, F);
    expect(after!.brakeActive).toBe(false);
    expect(after!.brakeReason).toContain('cleared by alice');
    expect(after!.brakeReason).toContain('ping_pong');    // the evidence survives the clear
  });

  it('refuses to clear a brake that is not set, rather than inventing a row', async () => {
    if (!dbUp) return;
    await wipe();
    expect(await clearBrake({ targetId: T, field: F, confirm: F, clearedBy: 'test' }))
      .toEqual({ cleared: false, reason: 'no_brake' });
    expect(await brakeState(T, F)).toBeNull();
  });
});

describe('unheal (F10)', () => {
  it('reverts the named heal, keeps the row, and re-opens the blast window', async () => {
    if (!dbUp) return;
    await wipe();
    await seedRun(9101, 'live', 'good');          // the last verified value
    await seedRun(9102, 'healed', 'wrong');       // the bad heal published here
    await seedRun(9103, 'healed', 'wrong again');
    const healId = await recordHeal({
      targetId: T, field: F, fromSelector: '.good', toSelector: '.bad', runId: 9102,
    });

    const windows: unknown[] = [];
    const r = await unheal({
      targetId: T, field: F, runId: 9102,
      reopenBlast: (w) => { windows.push(w); return { reopened: true }; },
    });

    expect(r.unhealed).toBe(true);
    if (!r.unhealed) return;
    expect(r.healId).toBe(healId);
    expect(r.revertedFrom).toBe('.bad');
    expect(r.revertedTo).toBe('.good');
    // From the run that made the bad heal, inclusive, to the newest run.
    expect(r.blast).toMatchObject({ targetId: T, field: F, fromRun: 9102, toRun: 9103 });
    expect(windows).toHaveLength(1);
    expect(r.blastResult).toEqual({ reopened: true });

    // The last run that published `live`, not the healed ones.
    expect(r.verified).toMatchObject({ runId: 9101, value: 'good' });

    // The row stays, marked. Deleting it would erase the brake's evidence.
    const history = await healsFor(T, F);
    expect(history).toHaveLength(1);
    expect(history[0]!.reverted).toBe(true);
    // ... and the field is back to the contract's own selector.
    expect(await currentSelector(T, F)).toBeNull();
  });

  it('reports a missing verified capture as an absence, not a fabricated one', async () => {
    if (!dbUp) return;
    await wipe();
    await seedRun(9111, 'healed', 'wrong');       // nothing was ever published live
    await recordHeal({ targetId: T, field: F, fromSelector: null, toSelector: '.bad', runId: 9111 });
    const r = await unheal({ targetId: T, field: F, runId: 9111 });
    expect(r.unhealed).toBe(true);
    if (!r.unhealed) return;
    expect(r.verified).toBeNull();
    expect(r.revertedTo).toBeNull();
  });

  it('does not claim a blast re-open that did not happen', async () => {
    if (!dbUp) return;
    await wipe();
    await seedRun(9121, 'healed', 'wrong');
    await recordHeal({ targetId: T, field: F, fromSelector: '.a', toSelector: '.b', runId: 9121 });
    const r = await unheal({ targetId: T, field: F });      // default seam
    expect(r.unhealed).toBe(true);
    if (!r.unhealed) return;
    expect(r.blastResult).toEqual({ reopened: false, window: r.blast });
    expect(recordBlastIntent(r.blast)).toEqual({ reopened: false, window: r.blast });
  });

  it('refuses a field with no heal, and a heal already reverted', async () => {
    if (!dbUp) return;
    await wipe();
    await seedRun(9131, 'live', 'good');
    expect(await unheal({ targetId: T, field: F })).toEqual({ unhealed: false, reason: 'no_heal' });

    await recordHeal({ targetId: T, field: F, fromSelector: '.a', toSelector: '.b', runId: 9131 });
    await unheal({ targetId: T, field: F, runId: 9131 });
    expect(await unheal({ targetId: T, field: F, runId: 9131 }))
      .toEqual({ unhealed: false, reason: 'already_reverted' });
  });

  it('feeds F11: a second unheal inside the window brakes the field', async () => {
    if (!dbUp) return;
    await wipe();
    await seedRun(9141, 'live', 'good');
    await seedRun(9142, 'healed', 'wrong');
    await recordHeal({ targetId: T, field: F, fromSelector: '.a', toSelector: '.b', runId: 9141 });
    await recordHeal({ targetId: T, field: F, fromSelector: '.a', toSelector: '.c', runId: 9142 });

    const first = await unheal({ targetId: T, field: F, runId: 9141 });
    expect(first.unhealed && first.brake.engaged).toBe(false);

    const second = await unheal({ targetId: T, field: F, runId: 9142 });
    expect(second.unhealed && second.brake.engaged).toBe(true);
    expect(await shouldHeal(T, F)).toBe(false);
  });
});
