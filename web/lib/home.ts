// Server-only. Opens a Postgres pool; see web/lib/queue.ts on why
// `server-only` is deliberately not a dependency.
import { getDb, openQueue } from 'assay/store';
import * as schema from 'assay/engine/store/schema';
import { and, desc, eq, gte, sql } from 'drizzle-orm';

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

  const [window, runs, held, queue, retractions] = await Promise.all([
    // Counted in the database, not in the page. `bars` is capped at 60 because
    // the strip draws 60 bars; the HEADLINE is a count of the window, and
    // reading it off the capped list is how Home came to say "60 runs today"
    // while Schedule said 62. `min(started_at)` comes from the same row so the
    // label describes the same set the number does -- taking it from the oldest
    // BAR would date a 62-run window from its 60th-newest run.
    db
      .select({
        n: sql<number>`count(*)::int`,
        first: sql<Date | null>`min(${schema.runs.startedAt})`,
      })
      .from(schema.runs)
      .where(gte(schema.runs.startedAt, since)),
    db
      .select({ runId: schema.runs.runId, at: schema.runs.startedAt, status: schema.runs.status })
      .from(schema.runs)
      .where(gte(schema.runs.startedAt, since))
      .orderBy(desc(schema.runs.runId))
      .limit(60),
    // Scoped to the window as well. Unscoped it read every quarantined field
    // run this install has ever recorded to colour at most 60 bars, and it fed
    // a `clean` count that has to be a count of the window or it is a count of
    // nothing in particular.
    db
      .selectDistinct({ runId: schema.fieldRuns.runId })
      .from(schema.fieldRuns)
      .innerJoin(schema.runs, eq(schema.runs.runId, schema.fieldRuns.runId))
      .where(and(
        sql`${schema.fieldRuns.status} = 'quarantined'`,
        gte(schema.runs.startedAt, since),
      )),
    openQueue(500),
    db.select({ n: sql<number>`count(*)::int` }).from(schema.retractions),
  ]);

  const total = window[0]?.n ?? 0;
  const heldRuns = new Set(held.map((h) => h.runId));
  const bars = runs
    .map((r) => ({ runId: r.runId, at: r.at as Date, held: heldRuns.has(r.runId) }))
    .reverse();

  return {
    runs: total,
    since: window[0]?.first ? new Date(window[0].first) : null,
    // A run is clean when it published every field it was asked for. A run
    // that held something is not a failure -- it is the product working -- so
    // it is counted separately rather than subtracted from a success rate.
    clean: total - heldRuns.size,
    waiting: queue.length,
    retracted: retractions[0]?.n ?? 0,
    bars,
  };
}
