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
 * Persist one evaluated run: the capture it read, the run, and the cell.
 *
 * Takes the runner's result as-is rather than a bespoke shape, so the worker
 * and the webhook path write identically.
 */
export async function recordRun({ targetId, capture, result, proofId, groupKey, stakesRows = 0 }) {
  const d = getDb();
  return d.transaction(async (tx) => {
    if (capture) {
      await tx.insert(schema.captures)
        .values({ sha256: capture.sha, bytes: capture.bytes, url: capture.url })
        .onConflictDoNothing();
    }

    const [run] = await tx.insert(schema.runs).values({
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

/** Every held cell. The one query F4 exists to answer. */
export async function heldCells() {
  const d = getDb();
  return d.select().from(schema.fieldRuns).where(eq(schema.fieldRuns.status, 'quarantined'));
}
