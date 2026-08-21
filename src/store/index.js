// Connection + the handful of writes the runner needs. Nothing speculative:
// queries get added when a caller wants one, not in anticipation of one.

import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq, and, isNull } from 'drizzle-orm';
import * as schema from './schema.js';

export * from './schema.js';
export { eq, and, isNull };

export const DATABASE_URL =
  process.env.DATABASE_URL || 'postgres://localhost:5432/assay';

let pool;
let db;

export function getDb() {
  if (!db) {
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    db = drizzle(pool, { schema });
  }
  return db;
}

export async function closeDb() {
  if (pool) { await pool.end(); pool = undefined; db = undefined; }
}

/**
 * Reserve the run id BEFORE the run is evaluated.
 *
 * The store's id is the canonical one: it is what REST and MCP publish, so the
 * envelope, the proof record and the queue item all have to agree on it. The
 * runner needs that number while it evaluates (`held_since_run`), which is
 * earlier than the insert -- so take it from the sequence rather than inserting
 * a half-built row and updating it later. A gap in the sequence when a run
 * throws is normal; an orphan run row with no cell would not be.
 */
export async function reserveRunId() {
  const d = getDb();
  const { rows } = await d.execute(
    "SELECT nextval(pg_get_serial_sequence('runs','run_id'))::int AS id",
  );
  return rows[0].id;
}

/**
 * Persist one evaluated run: the capture it read, the run, and the cell.
 *
 * Takes the runner's result as-is rather than a bespoke shape, so the worker
 * and the webhook path write identically. `runId` comes from reserveRunId().
 */
export async function recordRun({ runId, targetId, capture, result, proofId, groupKey, stakesRows = 0 }) {
  const d = getDb();
  return d.transaction(async (tx) => {
    if (capture) {
      await tx.insert(schema.captures)
        .values({ sha256: capture.sha, bytes: capture.bytes, url: capture.url })
        .onConflictDoNothing();
    }

    const [run] = await tx.insert(schema.runs).values({
      runId,
      targetId,
      captureSha: capture?.sha ?? null,
      skeletonHash: result.event.skeleton?.after ?? null,
      status: result.event.event,
    }).returning({ runId: schema.runs.runId });

    const field = result.event.field;
    await tx.insert(schema.fieldRuns).values({
      runId: run.runId,
      field,
      value: result.publishedValue,
      status: result.status.status,
      reason: result.status.reason ?? null,
      proofId,
      goldenSha: result.event.golden_sha256 ?? null,
      captureSha: result.event.capture_sha256 ?? null,
      // Only an abstain needs the ranked list kept -- it is what a later
      // nomination must be scored against.
      ranked: result.status.status === 'quarantined' ? (result.gate?.ranked ?? []).map((r) => ({
        selector: r.fp?.tag ?? null,
        score: Number(r.score.toFixed(4)),
        value: (r.fp?.text || '').slice(0, 200),
      })) : null,
      heldSinceRun: result.status.held_since_run ?? null,
      groupKey: groupKey ?? null,
    });

    if (result.status.status === 'quarantined') {
      await tx.insert(schema.queueItems).values({ proofId, groupKey: groupKey ?? null, stakesRows });
    }

    return run.runId;
  });
}

/**
 * Drop one target's prior runs so an ingest over a fixed corpus is re-runnable.
 *
 * proof_id is derived from (site, capture, field), so re-ingesting the same
 * corpus collides on the unique constraint. Re-ingesting IS a replacement, so
 * clear first. Scoped to one target: never touches anything else in the store.
 */
export async function resetTarget(targetId) {
  const d = getDb();
  return d.transaction(async (tx) => {
    // FK order: queue_items -> field_runs -> runs.
    await tx.execute(
      `DELETE FROM queue_items WHERE proof_id IN (
         SELECT fr.proof_id FROM field_runs fr
         JOIN runs r ON r.run_id = fr.run_id WHERE r.target_id = '${targetId}')`,
    );
    await tx.execute(
      `DELETE FROM field_runs WHERE run_id IN (
         SELECT run_id FROM runs WHERE target_id = '${targetId}')`,
    );
    const res = await tx.execute(`DELETE FROM runs WHERE target_id = '${targetId}'`);
    return res.rowCount ?? 0;
  });
}

/** The published row for a cell, rebuilt from the store. The warehouse join. */
export async function rowByProof(proofId) {
  const d = getDb();
  const [fr] = await d.select().from(schema.fieldRuns)
    .where(eq(schema.fieldRuns.proofId, proofId)).limit(1);
  if (!fr) return null;
  return {
    [fr.field]: fr.value,
    _assay: {
      run: fr.runId,
      proof: fr.proofId,
      fields: {
        [fr.field]: {
          status: fr.status,
          ...(fr.reason ? { reason: fr.reason } : {}),
          ...(fr.heldSinceRun != null ? { held_since_run: fr.heldSinceRun } : {}),
        },
      },
    },
  };
}

/** Run history for a target, newest first. */
export async function runsFor(targetId, limit = 50) {
  const d = getDb();
  const q = d.select().from(schema.runs);
  const rows = await (targetId ? q.where(eq(schema.runs.targetId, targetId)) : q);
  return rows.sort((a, b) => b.runId - a.runId).slice(0, limit);
}

/** Open queue items -- the decisions the gate refused to make. */
export async function openQueue(limit = 50) {
  const d = getDb();
  const rows = await d.select().from(schema.queueItems)
    .where(isNull(schema.queueItems.resolvedBy));
  return rows.sort((a, b) => b.itemId - a.itemId).slice(0, limit);
}

/**
 * Full provenance for one cell: where the value came from and what was
 * considered. This is F12 -- the answer to "where did this number come from?"
 * months later, from a proof id carried on the published row.
 */
export async function explain(proofId) {
  const d = getDb();
  const [fr] = await d.select().from(schema.fieldRuns)
    .where(eq(schema.fieldRuns.proofId, proofId)).limit(1);
  if (!fr) return null;
  const [run] = await d.select().from(schema.runs)
    .where(eq(schema.runs.runId, fr.runId)).limit(1);
  return {
    proof: fr.proofId,
    run: fr.runId,
    field: fr.field,
    value: fr.value,
    status: fr.status,
    reason: fr.reason ?? null,
    held_since_run: fr.heldSinceRun ?? null,
    golden_sha256: fr.goldenSha ?? null,
    capture_sha256: fr.captureSha ?? null,
    // The list the gate actually ranked. Kept, not recomputed: a nomination has
    // to be scored against this page, not whatever the site shows today.
    ranked: fr.ranked ?? null,
    group_key: fr.groupKey ?? null,
    target: run?.targetId ?? null,
    started_at: run?.startedAt ?? null,
    skeleton_hash: run?.skeletonHash ?? null,
  };
}

/** Every held cell. The one query F4 exists to answer. */
export async function heldCells() {
  const d = getDb();
  return d.select().from(schema.fieldRuns).where(eq(schema.fieldRuns.status, 'quarantined'));
}
