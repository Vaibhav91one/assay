// F14 — the incident record. One artefact an operator can send someone.
//
// Pure composition over records that already exist: episodes, runs, field_runs,
// heal_history, retractions, queue_items, captures. Nothing here computes a new
// fact about the world, and nothing here writes. If a sentence in the output
// cannot be pointed back at a row, it is a bug in this file.
//
// The section that makes it a record rather than marketing is `held`. A report
// listing only what we fixed is a brochure; the times the gate refused are the
// evidence it was working, and they are recorded with the same rigour as the
// heals precisely so this document can carry them.
//
// `suspect` is the other half of that honesty. Rows published while the field
// was known to be broken did not error and did not come back empty -- and we
// still cannot say they were right. They are counted separately from the clean
// ones rather than folded in.

import { getDb, sql } from '../store/index.js';
import { asDate, causeOf, resolutionOf, type Term } from './vocabulary.js';
import { fieldHistory, type DiffEntry } from './diff.js';

// TODO(types): one named row shape per raw query, kept beside its query rather
// than derived -- drizzle's `execute` returns Record<string, unknown>.
type EpisodeRow = {
  episode_id: number; target_id: string; field: string; cause: string | null;
  opened_run: number; closed_run: number | null; notified: string | null;
};

export interface HeldCellRecord {
  run: number;
  at: Date | null;
  proof: string;
  why: Term | null;
  heldSinceRun: number | null;
  goldenSha: string | null;
  captureSha: string | null;
  /** Whether the bytes behind captureSha are still kept. A pruned capture is a normal state. */
  capturePruned: boolean | null;
  decision: {
    resolvedBy: string | null;
    what: Term | null;
    at: Date | null;
    undoneAt: Date | null;
    /** A model nomination sitting on a still-open item. Not a decision. */
    nominated: string | null;
  } | null;
}

export interface IncidentRecord {
  episode: number;
  target: string;
  field: string;
  open: boolean;
  cause: Term | null;
  /** How the alert left the process, or why it did not. A bounced alert is unread. */
  notified: string | null;
  openedRun: number;
  openedAt: Date | null;
  closedRun: number | null;
  closedAt: Date | null;
  /** Every run in the window, in order, with what the cell said. */
  timeline: DiffEntry[];
  /** The refusals. The part of this document worth reading. */
  held: HeldCellRecord[];
  /** Selector changes applied inside the window, and whether they were taken back. */
  heals: {
    healId: number; run: number; from: string | null; to: string;
    reverted: boolean; at: Date | null;
  }[];
  /** Published ranges now believed wrong. `exportedAt` null means nobody has acted. */
  retractions: {
    retractionId: number; fromRun: number; toRun: number;
    rows: number | null; exportedAt: Date | null; at: Date | null;
  }[];
  /** Published while the field was broken: not errors, not verified either. */
  suspect: { run: number; at: Date | null; proof: string; status: string }[];
}

/** Raise the whole record for one episode, or null if there is no such episode. */
export async function incidentRecord(episodeId: number): Promise<IncidentRecord | null> {
  const d = getDb();

  const { rows: eps } = await d.execute(sql`
    SELECT episode_id, target_id, field, cause, opened_run, closed_run, notified
    FROM episodes WHERE episode_id = ${episodeId}`);
  const ep = (eps as EpisodeRow[])[0];
  if (!ep) return null;

  const openedAt = await runStartedAt(ep.opened_run);
  const closedAt = ep.closed_run == null ? null : await runStartedAt(ep.closed_run);

  // The window is closed at the top when the episode is closed and open-ended
  // when it is not. `upper` is a run id, not a timestamp: an episode is defined
  // by the runs that opened and closed it.
  const upper = ep.closed_run;

  const { entries } = await fieldHistory({ targetId: ep.target_id, field: ep.field, limit: 1000 });
  const timeline = entries.filter(
    (e) => e.run >= ep.opened_run && (upper == null || e.run <= upper),
  );

  const held: HeldCellRecord[] = [];
  for (const e of timeline) {
    if (e.state !== 'withheld') continue;
    held.push(await heldDetail(e));
  }

  return {
    episode: ep.episode_id,
    target: ep.target_id,
    field: ep.field,
    open: ep.closed_run == null,
    cause: causeOf(ep.cause),
    notified: ep.notified,
    openedRun: ep.opened_run,
    openedAt,
    closedRun: ep.closed_run,
    closedAt,
    timeline,
    held,
    heals: await healsIn(ep.target_id, ep.field, ep.opened_run, upper),
    retractions: await retractionsIn(ep.target_id, ep.field, ep.opened_run, upper),
    // Strictly inside the window: the closing run IS the recovery, and calling
    // the run that proved the field healthy "suspect" would be wrong.
    suspect: timeline
      .filter((e) => e.state !== 'withheld' && (upper == null || e.run < upper))
      .map((e) => ({ run: e.run, at: e.at, proof: e.proof, status: e.status })),
  };
}

async function runStartedAt(runId: number): Promise<Date | null> {
  const { rows } = await getDb().execute(
    sql`SELECT started_at FROM runs WHERE run_id = ${runId}`);
  return asDate((rows as { started_at: Date | string }[])[0]?.started_at);
}

/** The proofs and the decision behind one held cell. */
async function heldDetail(e: DiffEntry & { state: 'withheld' }): Promise<HeldCellRecord> {
  const { rows } = await getDb().execute(sql`
    SELECT fr.golden_sha256, fr.capture_sha256, c.pruned,
           q.item_id, q.resolved_by, q.resolution, q.resolved_at, q.undone_at
    FROM field_runs fr
    LEFT JOIN captures c ON c.sha256 = fr.capture_sha256
    LEFT JOIN queue_items q ON q.proof_id = fr.proof_id
    WHERE fr.proof_id = ${e.proof}`);
  const r = (rows as {
    golden_sha256: string | null; capture_sha256: string | null; pruned: boolean | null;
    item_id: number | null; resolved_by: string | null; resolution: string | null;
    resolved_at: Date | string | null; undone_at: Date | string | null;
  }[])[0];

  const nominated = r?.resolution?.startsWith('model_nominated:') ? r.resolution : null;

  return {
    run: e.run,
    at: e.at,
    proof: e.proof,
    why: e.why,
    heldSinceRun: e.heldSinceRun,
    goldenSha: r?.golden_sha256 ?? null,
    captureSha: r?.capture_sha256 ?? null,
    capturePruned: r?.pruned ?? null,
    // A held cell with no queue item is possible: the queue is written at
    // abstain time, so a cell held any other way never entered it. `null` here
    // means "no item", which is not the same fact as "an item nobody answered".
    decision: r?.item_id == null ? null : {
      resolvedBy: r.resolved_by,
      // resolved_by is the settled flag, never resolution -- assay_propose
      // writes a nomination into resolution while leaving the item open.
      what: r.resolved_by ? resolutionOf(r.resolution) : null,
      at: asDate(r.resolved_at),
      undoneAt: asDate(r.undone_at),
      nominated,
    },
  };
}

async function healsIn(targetId: string, field: string, from: number, to: number | null) {
  const { rows } = await getDb().execute(sql`
    SELECT heal_id, run_id, from_selector, to_selector, reverted, created_at
    FROM heal_history
    WHERE target_id = ${targetId} AND field = ${field} AND run_id >= ${from}
      ${to == null ? sql.empty() : sql`AND run_id <= ${to}`}
    ORDER BY heal_id`);
  return (rows as {
    heal_id: number; run_id: number; from_selector: string | null;
    to_selector: string; reverted: boolean; created_at: Date | string;
  }[]).map((r) => ({
    healId: r.heal_id, run: r.run_id, from: r.from_selector,
    to: r.to_selector, reverted: r.reverted, at: asDate(r.created_at),
  }));
}

async function retractionsIn(targetId: string, field: string, from: number, to: number | null) {
  // Overlap, not containment: a retraction opened before this episode and still
  // running through it covers rows this incident is about.
  const { rows } = await getDb().execute(sql`
    SELECT retraction_id, from_run, to_run, row_ids, exported_at, created_at
    FROM retractions
    WHERE target_id = ${targetId} AND field = ${field}
      AND to_run >= ${from} ${to == null ? sql.empty() : sql`AND from_run <= ${to}`}
    ORDER BY retraction_id`);
  return (rows as {
    retraction_id: number; from_run: number; to_run: number;
    row_ids: unknown; exported_at: Date | string | null; created_at: Date | string;
  }[]).map((r) => ({
    retractionId: r.retraction_id,
    fromRun: r.from_run,
    toRun: r.to_run,
    // A null row_ids is "we did not record the ids", not "zero rows". The
    // difference matters to whoever has to go and pull them.
    rows: Array.isArray(r.row_ids) ? r.row_ids.length : null,
    exportedAt: asDate(r.exported_at),
    at: asDate(r.created_at),
  }));
}

/** Episodes, newest first, so a CLI can offer a list rather than demand an id. */
export async function episodes({ targetId, limit = 50 }: { targetId?: string; limit?: number } = {}) {
  const { rows } = await getDb().execute(sql`
    SELECT episode_id, target_id, field, cause, opened_run, closed_run, notified
    FROM episodes
    ${targetId ? sql`WHERE target_id = ${targetId}` : sql.empty()}
    ORDER BY episode_id DESC LIMIT ${limit}`);
  return (rows as EpisodeRow[]).map((r) => ({
    episode: r.episode_id, target: r.target_id, field: r.field,
    cause: causeOf(r.cause), openedRun: r.opened_run, closedRun: r.closed_run,
    open: r.closed_run == null, notified: r.notified,
  }));
}
