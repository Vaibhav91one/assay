// Server-only. Opens a Postgres pool; see web/lib/queue.ts on why
// `server-only` is deliberately not a dependency.
import { getDb, openQueue } from 'assay/store';
import * as schema from 'assay/engine/store/schema';
import { desc, gte, sql } from 'drizzle-orm';

/** One bar on the run strip. `held` is what makes a bar amber. */
export interface RunBar {
  runId: number;
  at: Date;
  held: boolean;
}

export interface HomeStats {
  /** Runs in the window, and the day the window opens on. */
  runs: number;
  since: Date | null;
  clean: number;
  waiting: number;
  /**
   * Rows Assay published and later took back. This is the number the product
   * is judged on, so it is counted from the retractions table rather than
   * assumed to be zero.
   */
  retracted: number;
  bars: RunBar[];
}

const WINDOW_DAYS = 7;

export async function homeStats(): Promise<HomeStats> {
  const db = getDb();
  const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000);

  const [runs, held, queue, retractions] = await Promise.all([
    db
      .select({ runId: schema.runs.runId, at: schema.runs.startedAt, status: schema.runs.status })
      .from(schema.runs)
      .where(gte(schema.runs.startedAt, since))
      .orderBy(desc(schema.runs.runId))
      .limit(60),
    db
      .select({ runId: schema.fieldRuns.runId })
      .from(schema.fieldRuns)
      .where(sql`${schema.fieldRuns.status} = 'quarantined'`),
    openQueue(500),
    db.select({ n: sql<number>`count(*)::int` }).from(schema.retractions),
  ]);

  const heldRuns = new Set(held.map((h) => h.runId));
  const bars = runs
    .map((r) => ({ runId: r.runId, at: r.at as Date, held: heldRuns.has(r.runId) }))
    .reverse();

  return {
    runs: runs.length,
    since: bars[0]?.at ?? null,
    // A run is clean when it published every field it was asked for. A run
    // that held something is not a failure -- it is the product working -- so
    // it is counted separately rather than subtracted from a success rate.
    clean: runs.length - bars.filter((b) => b.held).length,
    waiting: queue.length,
    retracted: retractions[0]?.n ?? 0,
    bars,
  };
}
