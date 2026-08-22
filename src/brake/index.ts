// F10 unheal + F11 hostile-site brake: memory across heals, and a way back.
//
// The engine decides one heal at a time and has no idea it has made the same
// decision before. That is the failure mode this module exists for: a field
// oscillating between two selectors heals "successfully" every run, and half
// the published values are read off the wrong A/B variant. Self-healing makes
// that invisible, which is worse than breaking (docs/FEATURES.md F11).
//
// The evidence lives in `heal_history`, which is append-only and keeps reverted
// rows. Deleting a reverted heal would erase exactly the pattern being looked
// for, so nothing here deletes.
//
// `field_state` is shared with F1/F3, which own `fragility_grade` and
// `drift_state`. Every write below names only `brake_active` / `brake_reason`
// (plus `updated_at`) in its `set`, because drizzle's onConflictDoUpdate
// updates only the columns named there -- a full-row upsert would blank the
// other feature's columns on every brake write. Proven in test/brake.test.ts
// rather than assumed.

import { getDb, healHistory, fieldState, eq, and, sql } from '../store/index.js';

/**
 * The window the oscillation has to fit inside, in days.
 *
 * 14, for two reasons. F11's own example is "healed 4 times in 9 days", so a
 * window shorter than that never fires on the case the feature was drawn for.
 * And a site running a week-long A/B test flips at each boundary: a 7-day
 * window holds one flip and can never see a pattern, 14 holds two. Longer is
 * worse, not safer -- a selector legitimately revisited a month apart (a site
 * that shipped a redesign and rolled it back) is not evidence of anything, and
 * an unbounded window would hold it against the field forever. The window is
 * also what lets a brake's evidence age out: stop healing for two weeks and
 * the trip condition no longer holds.
 */
export const WINDOW_DAYS = 14;

/**
 * How many times the field has to go BACK inside the window before the brake
 * trips.
 *
 * 2. One return -- a plain A -> B -> A -- is a fact, not a pattern: a site can
 * change and change back, and a human unhealing one wrong heal produces
 * exactly that shape. A brake is a hard stop that costs a person their
 * afternoon, and a stop that trips on a single ordinary event is one people
 * learn to clear reflexively -- which is the behaviour the typed confirmation
 * exists to prevent, so it must not be trained in by a jumpy threshold. Two
 * returns cannot be one site change and its undo. It is also the number F11's
 * own alert text quotes: "healed 4 times in 9 days and twice reverted".
 */
export const RETURN_THRESHOLD = 2;

/** One row of `heal_history`, as the detector needs it. */
export interface HealRow {
  healId: number;
  fromSelector: string | null;
  toSelector: string;
  runId: number;
  reverted: boolean;
  createdAt: Date;
}

export interface PingPong {
  thrashing: boolean;
  /** Times the field went back to somewhere it had already left. */
  returns: number;
  heals: number;
  windowDays: number;
  threshold: number;
  /** Distinct selectors the field has been pulled between, first seen first. */
  selectors: string[];
  /** Null when not thrashing. There is nothing to say, and "" is not a reason. */
  reason: string | null;
}

/**
 * Is this field thrashing?
 *
 * Pure, so the threshold can be argued with in a test that needs no database.
 *
 * Two kinds of event count as "went back", and they are counted once per row:
 *
 *   - the heal's destination is a selector some earlier heal moved AWAY from
 *     (the A -> B -> A shape the site produces on its own), and
 *   - the heal is marked `reverted`, which is a human saying it was wrong.
 *
 * The second is why F10 feeds F11: an unheal is itself a return, so unhealing
 * the same field twice in a fortnight trips the brake without the site having
 * to oscillate on its own.
 *
 * A -> B -> C never revisits and scores zero, however fast it moves. Drift is
 * not thrashing, and braking on drift would stop healing exactly when it works.
 */
export function detectPingPong(
  rows: readonly HealRow[],
  now: Date = new Date(),
  windowDays: number = WINDOW_DAYS,
  threshold: number = RETURN_THRESHOLD,
): PingPong {
  const cutoff = now.getTime() - windowDays * 86_400_000;
  const inWindow = rows
    .filter((r) => r.createdAt.getTime() >= cutoff)
    // createdAt can tie at the same millisecond on a fast replay; healId is the
    // insertion order and breaks it deterministically.
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.healId - b.healId);

  const left = new Set<string>();          // selectors the field has moved away from
  const seen: string[] = [];
  let returns = 0;

  for (const r of inWindow) {
    if (r.reverted) returns++;
    else if (left.has(r.toSelector)) returns++;
    // after the check: a heal cannot return to a place it leaves in the same step
    if (r.fromSelector !== null) left.add(r.fromSelector);
    for (const s of [r.fromSelector, r.toSelector]) {
      if (s !== null && !seen.includes(s)) seen.push(s);
    }
  }

  const thrashing = returns >= threshold;
  return {
    thrashing,
    returns,
    heals: inWindow.length,
    windowDays,
    threshold,
    selectors: seen,
    reason: thrashing
      ? `ping_pong: healed ${inWindow.length} times in ${windowDays} days, `
        + `returning to a previously abandoned selector ${returns} times. `
        + 'That is a site running an experiment, not a site that broke.'
      : null,
  };
}

// ---------------------------------------------------------------------------
// heal_history
// ---------------------------------------------------------------------------

/**
 * Record a heal. Wave 2 calls this wherever a heal is decided.
 *
 * `fromSelector` is null for the first heal of a field -- the baseline it came
 * from is the contract's, not a healed one. That is an absence and it is stored
 * as one; the detector reads it as "nothing was abandoned here".
 */
export async function recordHeal(h: {
  targetId: string;
  field: string;
  fromSelector: string | null;
  toSelector: string;
  runId: number;
}): Promise<number> {
  const [row] = await getDb().insert(healHistory)
    .values(h)
    .returning({ healId: healHistory.healId });
  return row!.healId;
}

/** This field's heals, oldest first. Unbounded: the window is applied by the detector. */
export async function healsFor(targetId: string, field: string): Promise<HealRow[]> {
  const rows = await getDb().select().from(healHistory)
    .where(and(eq(healHistory.targetId, targetId), eq(healHistory.field, field)));
  return rows
    .map((r) => ({
      healId: r.healId,
      fromSelector: r.fromSelector,
      toSelector: r.toSelector,
      runId: r.runId,
      reverted: r.reverted,
      createdAt: r.createdAt,
    }))
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.healId - b.healId);
}

/**
 * The field's live selector: the newest heal that has not been reverted.
 *
 * There is no `current_selector` column anywhere, and that is deliberate --
 * overwriting the stored locator on every heal is precisely how Scrapling's
 * `auto_save` makes one wrong match into ground truth (FEATURES F8). The log is
 * the state. Null means no surviving heal, i.e. the contract's own selector.
 */
export async function currentSelector(targetId: string, field: string): Promise<string | null> {
  const rows = await healsFor(targetId, field);
  for (let i = rows.length - 1; i >= 0; i--) {
    if (!rows[i]!.reverted) return rows[i]!.toSelector;
  }
  return null;
}

// ---------------------------------------------------------------------------
// the brake (F11)
// ---------------------------------------------------------------------------

export interface BrakeState {
  targetId: string;
  field: string;
  brakeActive: boolean;
  brakeReason: string | null;
  updatedAt: Date;
}

/** Column-scoped: never selects, never writes, F1/F3's columns on this row. */
export async function brakeState(targetId: string, field: string): Promise<BrakeState | null> {
  const [row] = await getDb()
    .select({
      targetId: fieldState.targetId,
      field: fieldState.field,
      brakeActive: fieldState.brakeActive,
      brakeReason: fieldState.brakeReason,
      updatedAt: fieldState.updatedAt,
    })
    .from(fieldState)
    .where(and(eq(fieldState.targetId, targetId), eq(fieldState.field, field)))
    .limit(1);
  return row ?? null;
}

/** Every field currently held by a brake. The index on brake_active is for this. */
export async function listBrakes(): Promise<BrakeState[]> {
  return getDb()
    .select({
      targetId: fieldState.targetId,
      field: fieldState.field,
      brakeActive: fieldState.brakeActive,
      brakeReason: fieldState.brakeReason,
      updatedAt: fieldState.updatedAt,
    })
    .from(fieldState)
    .where(eq(fieldState.brakeActive, true));
}

/**
 * Engage the brake.
 *
 * `set` names three columns and no others. drizzle applies exactly the columns
 * listed, so `fragility_grade` and `drift_state` on an existing row survive
 * untouched -- this is the one cross-feature invariant of this module and it is
 * asserted, not assumed.
 */
export async function engageBrake(targetId: string, field: string, reason: string): Promise<void> {
  await getDb().insert(fieldState)
    .values({ targetId, field, brakeActive: true, brakeReason: reason })
    .onConflictDoUpdate({
      target: [fieldState.targetId, fieldState.field],
      set: { brakeActive: true, brakeReason: reason, updatedAt: new Date() },
    });
}

/**
 * Look at the history and brake if it says to. Idempotent: an already-braked
 * field is re-reported, not re-engaged, so the reason keeps its original
 * evidence rather than being rewritten on every run.
 */
export async function checkBrake(
  targetId: string,
  field: string,
  now: Date = new Date(),
): Promise<PingPong & { engaged: boolean; alreadyBraked: boolean }> {
  const verdict = detectPingPong(await healsFor(targetId, field), now);
  const existing = await brakeState(targetId, field);
  const alreadyBraked = existing?.brakeActive === true;

  if (verdict.thrashing && !alreadyBraked) {
    await engageBrake(targetId, field, verdict.reason!);
    return { ...verdict, engaged: true, alreadyBraked: false };
  }
  return { ...verdict, engaged: false, alreadyBraked };
}

/**
 * THE HOOK. Wave 2 wires this into `src/runner.ts` to gate a heal.
 *
 * True unless this field is explicitly braked, so wiring it in changes nothing
 * until somebody sets a brake -- which is what keeps `npm run replay` at 24
 * heals through the integration.
 *
 * It does not swallow a database error. A brake that cannot be read is not the
 * same as a brake that is not set, and answering "true" on a failed query would
 * be a silent fallback in the one place the product refuses to have one. The
 * caller decides what an unreachable store means; this function will not decide
 * it quietly.
 */
export async function shouldHeal(targetId: string, field: string): Promise<boolean> {
  const state = await brakeState(targetId, field);
  return state?.brakeActive !== true;
}

export type ClearResult =
  | { cleared: true; targetId: string; field: string; clearedBy: string; was: string | null }
  | { cleared: false; reason: 'no_brake' | 'confirmation_mismatch' };

/**
 * Clear a brake. The operator must type the field name.
 *
 * A one-click clear is a button people press to make a warning go away, and the
 * brake exists precisely because the alternative -- healing forever and calling
 * it resilience -- is comfortable. Typing the field name is the smallest
 * friction that cannot be supplied by muscle memory from a different field.
 *
 * ponytail: who cleared it, and what it was cleared from, are recorded as prose
 * in `brake_reason` because migrations are frozen at 0004 for this wave and a
 * tenth column is not worth nine agents colliding on a 0005. Ceiling: this is
 * not queryable -- "show me every brake alice cleared" is a LIKE. Upgrade path
 * is a `brake_events` table (target, field, action, actor, reason, at) in 0005,
 * which also gets clear/re-engage history rather than only the last event.
 */
export async function clearBrake(c: {
  targetId: string;
  field: string;
  confirm: string;
  clearedBy: string;
  now?: Date;
}): Promise<ClearResult> {
  const state = await brakeState(c.targetId, c.field);
  if (!state?.brakeActive) return { cleared: false, reason: 'no_brake' };
  if (c.confirm !== c.field) return { cleared: false, reason: 'confirmation_mismatch' };

  const at = (c.now ?? new Date()).toISOString();
  const was = state.brakeReason;
  await getDb().update(fieldState)
    .set({
      brakeActive: false,
      brakeReason: `cleared by ${c.clearedBy} at ${at}; was: ${was ?? '(no reason recorded)'}`,
      updatedAt: c.now ?? new Date(),
    })
    // An UPDATE, never an upsert: clearing a brake on a field that has no row
    // is a no-op, and inserting one would be inventing state to satisfy a verb.
    .where(and(eq(fieldState.targetId, c.targetId), eq(fieldState.field, c.field)));

  return { cleared: true, targetId: c.targetId, field: c.field, clearedBy: c.clearedBy, was };
}

// ---------------------------------------------------------------------------
// unheal (F10)
// ---------------------------------------------------------------------------

/** The window a bad heal published wrong values across. */
export interface BlastWindow {
  targetId: string;
  field: string;
  fromRun: number;
  toRun: number;
}

/**
 * The seam to F6/F9. Feature C owns blast radius and exports the real
 * implementation; this module never computes one, because two definitions of
 * "which rows are affected" is how the second incident gets made out of the
 * first.
 */
export type ReopenBlast = (window: BlastWindow) => Promise<unknown> | unknown;

/**
 * The default: does nothing, and says so. Not a stub of C's logic -- it records
 * the intent and hands it back, so an unheal run before the seam is wired
 * reports "the blast window was NOT re-opened, here is the window" instead of
 * quietly reporting success.
 */
export const recordBlastIntent: ReopenBlast = (window) => ({ reopened: false, window });

export type UnhealResult =
  | { unhealed: false; reason: 'no_heal' | 'already_reverted' }
  | {
      unhealed: true;
      healId: number;
      runId: number;
      /** What the field is back to. Null: the contract's own selector. */
      revertedTo: string | null;
      /** What was rolled back. */
      revertedFrom: string;
      /**
       * The last run that published this field `live` before the bad heal, and
       * the capture it read. Null when there is none -- the field has never
       * been verified good, which is a real answer and not a zero.
       */
      verified: { runId: number; captureSha: string | null; goldenSha: string | null; value: string | null } | null;
      blast: BlastWindow;
      blastResult: unknown;
      brake: PingPong & { engaged: boolean; alreadyBraked: boolean };
    };

/**
 * Revert a field to its last verified selector and re-open the blast window.
 *
 * The revert is a flag on the existing row, not a new row and not a delete.
 * `currentSelector()` reads the newest un-reverted heal, so flipping the flag
 * IS the revert -- and it is the only form that also works for the first heal
 * of a field, whose "previous selector" is the contract's and has no row to
 * point at. The reverted row stays visible to the detector, which is the whole
 * reason F10 feeds F11.
 */
export async function unheal(u: {
  targetId: string;
  field: string;
  /** Which heal was wrong. Omitted: the most recent surviving one. */
  runId?: number;
  reopenBlast?: ReopenBlast;
  now?: Date;
}): Promise<UnhealResult> {
  const reopen = u.reopenBlast ?? recordBlastIntent;
  const history = await healsFor(u.targetId, u.field);

  // A run can heal more than one field and, on a replay, record more than one
  // heal for the same field. The LAST one at that run is the one in force.
  const bad = u.runId != null
    ? history.filter((h) => h.runId === u.runId).at(-1)
    : history.filter((h) => !h.reverted).at(-1);
  if (!bad) return { unhealed: false, reason: 'no_heal' };
  if (bad.reverted) return { unhealed: false, reason: 'already_reverted' };

  const d = getDb();

  // The last time this field published a value nobody has disputed. `live`
  // only: a `healed` cell is the very thing being rolled back, and a
  // `quarantined` one published nothing to go back to.
  const { rows: verifiedRows } = await d.execute(sql`
    SELECT fr.run_id, fr.capture_sha256, fr.golden_sha256, fr.value
    FROM field_runs fr JOIN runs r ON r.run_id = fr.run_id
    WHERE r.target_id = ${u.targetId} AND fr.field = ${u.field}
      AND fr.status = 'live' AND fr.run_id < ${bad.runId}
    ORDER BY fr.run_id DESC LIMIT 1`);
  // TODO(types): drizzle's execute returns Record<string, unknown> rows; this
  // names the shape this one query returns.
  const v = (verifiedRows as Record<string, any>[])[0];

  const { rows: lastRows } = await d.execute(sql`
    SELECT max(run_id) AS run_id FROM runs WHERE target_id = ${u.targetId}`);
  // Unreachable in practice -- heal_history.run_id is a foreign key into runs,
  // so a heal existing means a run exists. Guarded anyway rather than coercing
  // a null into a run number nobody published anything at.
  const lastRun = (lastRows as Record<string, any>[])[0]?.run_id;
  if (lastRun == null) return { unhealed: false, reason: 'no_heal' };

  await d.update(healHistory).set({ reverted: true })
    .where(eq(healHistory.healId, bad.healId));

  const blast: BlastWindow = {
    targetId: u.targetId,
    field: u.field,
    // Everything published from the bad heal forward is suspect, inclusive of
    // the run that made it -- that run published the first wrong value.
    fromRun: bad.runId,
    toRun: Number(lastRun),
  };

  return {
    unhealed: true,
    healId: bad.healId,
    runId: bad.runId,
    revertedTo: bad.fromSelector,
    revertedFrom: bad.toSelector,
    verified: v
      ? {
          runId: Number(v.run_id),
          captureSha: v.capture_sha256 ?? null,
          goldenSha: v.golden_sha256 ?? null,
          value: v.value ?? null,
        }
      : null,
    blast,
    // The revert is already committed, and it is the durable half: the field is
    // off the bad selector whatever happens next. A blast re-open that throws
    // must therefore not throw away the unheal -- a retry would only come back
    // `already_reverted` and the operator would be left with no window at all.
    // It is reported as a failure in the result instead, which the CLI prints.
    blastResult: await Promise.resolve()
      .then(() => reopen(blast))
      .catch((e: unknown) => ({ reopened: false, error: (e as Error).message, window: blast })),
    // The revert just added a return event. It may be the second one.
    brake: await checkBrake(u.targetId, u.field, u.now),
  };
}
