// Server-only. Opens a Postgres pool; see web/lib/queue.ts on why
// `server-only` is deliberately not a dependency.
import { getDb } from 'assay/store';
import * as schema from 'assay/engine/store/schema';
import { desc, inArray } from 'drizzle-orm';

/** The closed set the runs list filters on. Not the store's vocabulary. */
export const OUTCOMES = ['all', 'healed', 'held', 'clean'] as const;
export type Outcome = (typeof OUTCOMES)[number];

export interface RunRow {
  runId: number;
  at: Date;
  scraper: string;
  outcome: Exclude<Outcome, 'all'>;
  /** The field this run held, when it held one. */
  heldField: string | null;
  /** A proof id to open, when there is a cell worth opening. */
  proof: string | null;
}

export interface RunsView {
  rows: RunRow[];
  /**
   * The most recent runs regardless of filter. The strip is context -- it says
   * "here is what has been happening" -- so filtering to `held` must not make
   * it claim there were only two runs.
   */
  recent: RunRow[];
  total: number;
  healed: number;
  held: number;
  /** The held cells still waiting, newest first. Drives the banner. */
  needsYou: { runId: number; field: string; at: Date; proof: string }[];
}

/**
 * `runs.status` is the engine's word (`ok` / `heal` / `abstain`) and the screen
 * says something else. The mapping is deliberate and one-way: the screen is
 * allowed a plainer vocabulary, the store is not allowed to drift into it.
 */
function outcomeOf(runStatus: string, fieldStatuses: string[]): RunRow['outcome'] {
  if (fieldStatuses.includes('quarantined')) return 'held';
  if (runStatus === 'heal' || fieldStatuses.includes('healed')) return 'healed';
  return 'clean';
}

export async function runsView(filter: Outcome = 'all', limit = 60): Promise<RunsView> {
  const db = getDb();

  const runs = await db
    .select({
      runId: schema.runs.runId,
      at: schema.runs.startedAt,
      scraper: schema.runs.targetId,
      status: schema.runs.status,
    })
    .from(schema.runs)
    .orderBy(desc(schema.runs.runId))
    .limit(400);

  const cells = runs.length
    ? await db
        .select({
          runId: schema.fieldRuns.runId,
          field: schema.fieldRuns.field,
          status: schema.fieldRuns.status,
          proof: schema.fieldRuns.proofId,
        })
        .from(schema.fieldRuns)
        .where(inArray(schema.fieldRuns.runId, runs.map((r) => r.runId)))
    : [];

  const byRun = new Map<number, typeof cells>();
  for (const c of cells) {
    const list = byRun.get(c.runId);
    if (list) list.push(c);
    else byRun.set(c.runId, [c]);
  }

  const all: RunRow[] = runs.map((r) => {
    const mine = byRun.get(r.runId) ?? [];
    const outcome = outcomeOf(r.status, mine.map((c) => c.status));
    const held = mine.find((c) => c.status === 'quarantined');
    // A held run points at the held cell; anything else points at whatever it
    // published, so `details` always has somewhere honest to go.
    const target = held ?? mine[0];
    return {
      runId: r.runId,
      at: r.at as Date,
      scraper: (r.scraper ?? '').split('__')[0],
      outcome,
      heldField: held?.field ?? null,
      proof: target?.proof ?? null,
    };
  });

  const needsYou = await heldAndWaiting(all);

  return {
    rows: (filter === 'all' ? all : all.filter((r) => r.outcome === filter)).slice(0, limit),
    recent: all.slice(0, 24),
    total: all.length,
    healed: all.filter((r) => r.outcome === 'healed').length,
    held: all.filter((r) => r.outcome === 'held').length,
    needsYou,
  };
}

/**
 * Held is not the same as waiting on you. A cell someone already answered is
 * still `quarantined` in `field_runs` -- resolving settles the queue item, it
 * does not republish the cell -- so the banner reads the queue, not the cell.
 */
async function heldAndWaiting(rows: RunRow[]): Promise<RunsView['needsYou']> {
  const proofs = rows.filter((r) => r.heldField && r.proof).map((r) => r.proof!) as string[];
  if (proofs.length === 0) return [];

  // `resolved_by`, never `resolution`: assay_propose writes
  // `model_nominated:<n>` into `resolution` while leaving an item open, so
  // reading that column would count a nomination as an answer.
  const items = await getDb()
    .select({ proof: schema.queueItems.proofId, by: schema.queueItems.resolvedBy })
    .from(schema.queueItems)
    .where(inArray(schema.queueItems.proofId, proofs));

  const unresolved = new Set(items.filter((q) => q.by === null).map((q) => q.proof));

  return rows
    .filter((r) => r.proof && unresolved.has(r.proof))
    .map((r) => ({ runId: r.runId, field: r.heldField!, at: r.at, proof: r.proof! }));
}

