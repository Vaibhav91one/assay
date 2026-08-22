// Blast radius (F6) and retraction (F9).
//
// The question this file answers is the one asked after a wrong heal is found:
// what did I already ship that is wrong, and how do I take it back?
//
// Three rules shape everything below.
//
//   1. The walk goes BACKWARDS to the run where the value became suspect --
//      the heal that introduced it, not the run where a human noticed. Those
//      differ by however long the gap was, and the gap IS the incident.
//   2. The walk is honest about its own edges. When history cannot show the
//      clean run before the boundary, the answer is "at least this wide", never
//      a precise number nothing supports.
//   3. A correction is a NEW ROW that supersedes the old one. The wrong value
//      stays in history with its proof intact. Assay's whole claim is that it
//      can say what it published and when; overwriting the record destroys
//      exactly that, and would make the correction itself unauditable.

import { createHash } from 'node:crypto';
import { z } from 'zod';
import { and, asc, desc, eq, inArray, lte, ne } from 'drizzle-orm';
import {
  getDb, sql, reserveRunId, explain,
  runs, fieldRuns, targets, captures, retractions, healHistory,
} from '../store/index.js';
import { toCsv } from './csv.js';

/** A refusal with a code the surfaces map to a status. Never a silent empty result. */
export class BlastError extends Error {
  constructor(readonly code: 'no_such_target' | 'no_history' | 'no_such_run' | 'no_such_cell', message: string) {
    super(message);
    this.name = 'BlastError';
  }
}

export const BlastQuery = z.object({
  target: z.string().min(1),
  field: z.string().min(1),
  /** The run where the problem was noticed. Defaults to the newest cell. */
  at_run: z.number().int().positive().optional(),
  /**
   * Force the boundary instead of walking to it. This is how an operator who
   * knows a value is wrong, and how F10's unheal, re-open a window the run
   * statuses alone would call clean.
   */
  from_run: z.number().int().positive().optional(),
});
export type BlastQuery = z.infer<typeof BlastQuery>;

export interface AffectedRow {
  proof: string;
  run: number;
  value: string;
  status: string;
  reason: string | null;
  published_at: Date;
  capture_sha256: string | null;
}

export interface BlastWindow {
  target: string;
  field: string;
  last_clean_run: number | null;
  first_suspect_run: number;
  detected_run: number;
  suspect_runs: number[];
  rows: AffectedRow[];
  /** Runs inside the window whose cell was held: nothing was published to take back. */
  withheld_runs: number[];
  /** How the boundary was found. `declared` means a caller supplied it. */
  basis: 'walk' | 'declared';
  /** Whether the heal that opened the window is in `heal_history`. */
  introduced_by_heal: number | null;
  /** False when the row count is a floor rather than a total. */
  bounded: boolean;
  caveats: string[];
}

/** A cell is clean only when it published live. Everything else is suspect. */
const CLEAN = 'live';

/** `runs.status` for a correction: a republish, not a scrape. */
const CORRECTION_RUN = 'correction';

/**
 * The window of runs a field's current value is suspect across (F6).
 *
 * Walks backwards from `at_run` through the field's series, stepping over
 * skipped runs -- a skipped page is byte-identical to the last evaluated one,
 * so it published nothing and cannot end a suspect stretch -- and stops at the
 * last run that published a live value. Returns null for a field that has no
 * cells at all rather than inventing an empty window.
 */
export async function blastRadius(input: BlastQuery): Promise<BlastWindow> {
  const q = BlastQuery.parse(input);
  const d = getDb();

  const [t] = await d.select({ id: targets.targetId }).from(targets)
    .where(eq(targets.targetId, q.target)).limit(1);
  if (!t) throw new BlastError('no_such_target', `No target "${q.target}".`);

  // LEFT JOIN, not inner: a skipped run has no cell, and dropping it here would
  // hide the gap the walk has to step over knowingly.
  const series = await d.select({
    runId: runs.runId,
    runStatus: runs.status,
    startedAt: runs.startedAt,
    proofId: fieldRuns.proofId,
    value: fieldRuns.value,
    status: fieldRuns.status,
    reason: fieldRuns.reason,
    captureSha: fieldRuns.captureSha,
  })
    .from(runs)
    .leftJoin(fieldRuns, and(eq(fieldRuns.runId, runs.runId), eq(fieldRuns.field, q.field)))
    // A correction run is a human retyping a value, not an observation of the
    // site. Left in, the newest one becomes the anchor and its live status ends
    // the walk on the spot -- correcting one row would hide the whole window.
    .where(and(eq(runs.targetId, q.target), ne(runs.status, CORRECTION_RUN)))
    .orderBy(asc(runs.runId));

  const cells = series.filter((r) => r.proofId !== null);
  if (!cells.length) {
    throw new BlastError('no_history', `No runs have published "${q.field}" on ${q.target}.`);
  }

  const anchorIdx = q.at_run === undefined
    ? series.findIndex((r) => r.runId === cells[cells.length - 1]!.runId)
    : series.findIndex((r) => r.runId === q.at_run);
  if (anchorIdx < 0) {
    throw new BlastError('no_such_run', `Run ${q.at_run} is not a run of ${q.target}.`);
  }

  const caveats: string[] = [];
  // Runs that evaluated but left no cell for this field. A skipped run is a
  // normal absence; an evaluated one with nothing recorded is a hole, and the
  // window cannot be a total when one is inside it.
  const unrecorded: number[] = [];

  let firstSuspectIdx: number | null = null;
  let lastCleanRun: number | null = null;
  let reachedStart = false;

  if (q.from_run === undefined) {
    let i = anchorIdx;
    for (; i >= 0; i--) {
      const r = series[i]!;
      if (r.proofId === null) {
        // A skipped run published nothing and is byte-identical to the last
        // evaluated one, so it cannot end a suspect stretch -- step over it. A
        // run that evaluated and left no cell is a different thing: we cannot
        // see what it published, so we stop rather than assume it was clean.
        if (r.runStatus === 'skipped') continue;
        unrecorded.push(r.runId);
        break;
      }
      if (r.status === CLEAN) { lastCleanRun = r.runId; break; }
      firstSuspectIdx = i;
    }
    reachedStart = i < 0;
    if (firstSuspectIdx === null) {
      const anchor = series[anchorIdx]!;
      return {
        target: q.target, field: q.field,
        last_clean_run: lastCleanRun,
        first_suspect_run: anchor.runId,
        detected_run: anchor.runId,
        suspect_runs: [], rows: [], withheld_runs: [],
        basis: 'walk', introduced_by_heal: null,
        bounded: !unrecorded.length,
        caveats: [
          `Walking back from run ${anchor.runId} found no suspect run for ${q.field}. `
          + 'If you know the value is wrong anyway, declare the boundary with from_run.',
          ...(unrecorded.length
            ? [`Run ${unrecorded[0]} evaluated but recorded no ${q.field} cell, so the walk `
               + 'could not see past it.']
            : []),
        ],
      };
    }
  } else {
    firstSuspectIdx = series.findIndex((r) => r.runId === q.from_run);
    if (firstSuspectIdx < 0) {
      throw new BlastError('no_such_run', `Run ${q.from_run} is not a run of ${q.target}.`);
    }
    if (firstSuspectIdx > anchorIdx) {
      throw new BlastError('no_such_run', `from_run ${q.from_run} is after at_run ${series[anchorIdx]!.runId}.`);
    }
    const before = series.slice(0, firstSuspectIdx).reverse().find((r) => r.proofId !== null);
    lastCleanRun = before?.status === CLEAN ? before.runId : null;
    for (const r of series.slice(firstSuspectIdx, anchorIdx + 1)) {
      if (r.proofId === null && r.runStatus !== 'skipped') unrecorded.push(r.runId);
    }
  }

  const window = series.slice(firstSuspectIdx, anchorIdx + 1);
  const firstSuspectRun = window[0]!.runId;
  const detectedRun = series[anchorIdx]!.runId;

  const rows: AffectedRow[] = [];
  const withheld: number[] = [];
  for (const r of window) {
    if (r.proofId === null) continue;
    // A held cell published null. There is nothing downstream to take back, and
    // counting it as a retracted row would overstate the damage.
    if (r.value === null) { withheld.push(r.runId); continue; }
    rows.push({
      proof: r.proofId, run: r.runId, value: r.value, status: r.status!,
      reason: r.reason, published_at: r.startedAt, capture_sha256: r.captureSha,
    });
  }

  // Run ids are one global sequence, so an id in this range belonging to no
  // target is ambiguous by construction: a reserved-then-abandoned run is
  // normal, a deleted one means history is holed. Either way the count below
  // stops being a total.
  const { rows: gapRows } = await d.execute(sql`
    SELECT g AS id FROM generate_series(${firstSuspectRun}::int, ${detectedRun}::int) g
    WHERE NOT EXISTS (SELECT 1 FROM runs WHERE run_id = g)`);
  const unaccounted = (gapRows as { id: number }[]).map((r) => Number(r.id));

  const [heal] = await d.select({ runId: healHistory.runId })
    .from(healHistory)
    .where(and(
      eq(healHistory.targetId, q.target),
      eq(healHistory.field, q.field),
      eq(healHistory.runId, firstSuspectRun),
    )).limit(1);

  if (reachedStart) {
    caveats.push(
      `Run ${firstSuspectRun} is the oldest run on record for ${q.target}, so no clean run `
      + 'before the boundary can be shown. The window is at least this wide, not exactly.',
    );
  }
  if (unrecorded.length) {
    caveats.push(
      `${unrecorded.length} run(s) in or below the window evaluated but recorded no ${q.field} `
      + `cell (${unrecorded.slice().sort((a, b) => a - b).join(', ')}). What they published is `
      + 'unknown, so the window is at least this wide and the row count is a floor.',
    );
  }
  if (unaccounted.length) {
    caveats.push(
      `${unaccounted.length} run id(s) in this range belong to no run on record `
      + `(${unaccounted.slice(0, 10).join(', ')}${unaccounted.length > 10 ? ', …' : ''}). `
      + 'They were either reserved and abandoned, which is normal, or deleted, which means '
      + 'history is holed. The row count is a floor either way.',
    );
  }
  caveats.push(
    'Anchor disagreement is not proof. These runs published values that LOOK right; '
    + 'they may be the wrong value.',
  );

  return {
    target: q.target,
    field: q.field,
    last_clean_run: lastCleanRun,
    first_suspect_run: firstSuspectRun,
    detected_run: detectedRun,
    suspect_runs: window.filter((r) => r.proofId !== null).map((r) => r.runId),
    rows,
    withheld_runs: withheld,
    basis: q.from_run === undefined ? 'walk' : 'declared',
    introduced_by_heal: heal?.runId ?? null,
    bounded: !reachedStart && !unrecorded.length && !unaccounted.length,
    caveats,
  };
}

/**
 * Re-open the window an unheal invalidates (F10 -> F6). Feature D's entry point.
 *
 * `fromRun` is the run that made the bad heal and is INCLUSIVE -- that run
 * published the first wrong value. D declares it rather than letting the walk
 * infer it, because by the time this is called the unheal has already committed
 * and the statuses the walk reads no longer describe what was published.
 *
 * Safe to call twice: the window is derived, and `recordRetraction` returns the
 * existing record for a range already filed. Safe to call on an already
 * reverted field for the same reason -- nothing here reads current state.
 *
 * `toRun` is clamped to the newest run at or before it that this target
 * actually has, and says so in a caveat: D passes the newest run for the
 * target, which may be a correction or another field's run.
 */
export async function reopenBlast(args: {
  targetId: string; field: string; fromRun: number; toRun: number; record?: boolean;
}): Promise<{ window: BlastWindow; retraction_id: number | null }> {
  const d = getDb();
  const [end] = await d.select({ runId: runs.runId }).from(runs)
    .innerJoin(fieldRuns, and(eq(fieldRuns.runId, runs.runId), eq(fieldRuns.field, args.field)))
    .where(and(
      eq(runs.targetId, args.targetId),
      ne(runs.status, CORRECTION_RUN),
      lte(runs.runId, args.toRun),
    ))
    .orderBy(desc(runs.runId)).limit(1);
  if (!end) {
    throw new BlastError('no_history', `No ${args.field} cell on ${args.targetId} at or before run ${args.toRun}.`);
  }

  const window = await blastRadius({
    target: args.targetId, field: args.field, from_run: args.fromRun, at_run: end.runId,
  });
  if (end.runId !== args.toRun) {
    window.caveats.unshift(
      `Run ${args.toRun} published no ${args.field} cell, so the window ends at run ${end.runId}, `
      + 'the newest run that did.',
    );
  }
  const retraction_id = args.record === false ? null : (await recordRetraction(window)).retraction_id;
  return { window, retraction_id };
}

/**
 * Write the window to `retractions` (F9). `exported_at` stays null: computed is
 * not the same fact as acted on, and an operator needs to see which is which.
 *
 * Re-computing the same window returns the existing record rather than a second
 * one -- a retraction is a statement about a range, and the range has not
 * changed just because someone asked twice.
 */
export async function recordRetraction(window: BlastWindow): Promise<{
  retraction_id: number; created: boolean; exported_at: Date | null;
}> {
  const d = getDb();
  const [existing] = await d.select().from(retractions).where(and(
    eq(retractions.targetId, window.target),
    eq(retractions.field, window.field),
    eq(retractions.fromRun, window.first_suspect_run),
    eq(retractions.toRun, window.detected_run),
  )).limit(1);
  if (existing) {
    return { retraction_id: existing.retractionId, created: false, exported_at: existing.exportedAt };
  }
  const [row] = await d.insert(retractions).values({
    targetId: window.target,
    field: window.field,
    fromRun: window.first_suspect_run,
    toRun: window.detected_run,
    rowIds: window.rows.map((r) => r.proof),
  }).returning({ retractionId: retractions.retractionId });
  return { retraction_id: row!.retractionId, created: true, exported_at: null };
}

/** Record that the operator actually took the list. */
export async function markExported(retractionId: number, at: Date = new Date()): Promise<Date> {
  const d = getDb();
  const [row] = await d.update(retractions).set({ exportedAt: at })
    .where(eq(retractions.retractionId, retractionId))
    .returning({ exportedAt: retractions.exportedAt });
  if (!row) throw new BlastError('no_such_cell', `No retraction ${retractionId}.`);
  return row.exportedAt!;
}

const CORRECTION_OF = 'correction_of:';

/** Corrections published for these proofs, as `wrong proof -> correcting proof`. */
async function supersededBy(proofs: string[]): Promise<Map<string, string>> {
  if (!proofs.length) return new Map();
  const rows = await getDb().select({ reason: fieldRuns.reason, proofId: fieldRuns.proofId })
    .from(fieldRuns)
    .where(inArray(fieldRuns.reason, proofs.map((p) => CORRECTION_OF + p)));
  return new Map(rows.map((r) => [r.reason!.slice(CORRECTION_OF.length), r.proofId]));
}

/**
 * The artifact an operator hands to whoever consumed the data.
 *
 * `superseded_by` is a column rather than a footnote because the consumer's
 * next question is always "what is the right value then?", and the answer is a
 * proof id they can fetch from the same API that gave them the wrong one.
 */
export async function retractionCsv(window: BlastWindow): Promise<string> {
  const corrections = await supersededBy(window.rows.map((r) => r.proof));
  return toCsv(
    ['proof_id', 'run_id', 'target_id', 'field', 'value', 'status', 'reason',
      'published_at', 'capture_sha256', 'superseded_by'],
    window.rows.map((r) => [
      r.proof, String(r.run), window.target, window.field, r.value, r.status,
      r.reason, r.published_at.toISOString(), r.capture_sha256,
      corrections.get(r.proof) ?? null,
    ]),
  );
}

export interface RescrapeItem {
  run: number;
  url: string;
  capture_sha256: string | null;
  /** False when the page bytes are gone, so this row needs a live fetch. */
  capture_available: boolean;
}

/** What has to be fetched again to replace the window (F9's other half). */
export async function rescrapeList(window: BlastWindow): Promise<RescrapeItem[]> {
  const d = getDb();
  const [t] = await d.select({ url: targets.url }).from(targets)
    .where(eq(targets.targetId, window.target)).limit(1);
  if (!t) throw new BlastError('no_such_target', `No target "${window.target}".`);

  const shas = window.rows.map((r) => r.capture_sha256).filter((s): s is string => s !== null);
  const kept = shas.length
    ? new Set((await d.select({ sha: captures.sha256 }).from(captures)
        .where(and(inArray(captures.sha256, shas), eq(captures.pruned, false))))
        .map((c) => c.sha))
    : new Set<string>();

  return window.rows.map((r) => ({
    run: r.run,
    url: t.url,
    capture_sha256: r.capture_sha256,
    capture_available: r.capture_sha256 !== null && kept.has(r.capture_sha256),
  }));
}

/**
 * Publish a corrected value as a NEW row that supersedes the wrong one.
 *
 * Not an UPDATE. The superseded cell keeps its value, its status and its proof
 * id, and `rowByProof` keeps answering for it forever -- anyone who consumed
 * the wrong number has to be able to see what it was and that it changed.
 * Silently repairing history makes a second, worse incident out of the first.
 *
 * The correction run carries no page bytes, which also keeps it out of the
 * detector's series: a human retyping a value is not a sample of the site.
 */
export async function publishCorrection(args: {
  proof: string; value: string;
}): Promise<{ proof: string; run: number; supersedes: string; field: string; value: string }> {
  const prior = await explain(args.proof);
  if (!prior) throw new BlastError('no_such_cell', `No cell with proof ${args.proof}.`);
  if (!prior.target) throw new BlastError('no_history', `Proof ${args.proof} has no run to correct against.`);

  const d = getDb();
  const runId = await reserveRunId();
  const proofId = 'pr_' + createHash('sha256')
    .update(`${args.proof}|${runId}|${args.value}`).digest('hex').slice(0, 16);

  await d.transaction(async (tx) => {
    await tx.insert(runs).values({
      runId,
      targetId: prior.target!,
      status: CORRECTION_RUN,
      captureSha: null,
      skeletonHash: prior.skeleton_hash,
    });
    await tx.insert(fieldRuns).values({
      runId,
      field: prior.field,
      value: args.value,
      status: 'live',
      reason: CORRECTION_OF + args.proof,
      proofId,
      goldenSha: prior.golden_sha256,
      captureSha: prior.capture_sha256,
    });
  });

  return { proof: proofId, run: runId, supersedes: args.proof, field: prior.field, value: args.value };
}
