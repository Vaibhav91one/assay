// Server-only. Opens a Postgres pool; see web/lib/queue.ts on why
// `server-only` is deliberately not a dependency.
//
// What the calendar is allowed to know.
//
// Two kinds of thing, and the difference between them is the whole screen:
//
//   RUNS      happened. `runs.started_at` is when, `field_runs` is what came
//             of it, and none of it changes again.
//   NEXT RUN  is one column, `targets.next_run_at`. It is the only fact Assay
//             holds about the future, and there is exactly one per target.
//
// Everything after that next run is arithmetic on the cadence, and this file
// deliberately does not do it -- `calendar.ts` does, on the client, for the
// window being drawn, and the screen labels the result a projection. Computing
// projections here would put them in the same array as the runs and the first
// person to render that array would draw them the same.

import { getDb } from 'assay/store';
import * as schema from 'assay/engine/store/schema';
import { cadenceMs } from 'assay/engine/schedule';
import { desc, inArray } from 'drizzle-orm';

/**
 * How far back the calendar reads. Past this it says so rather than drawing
 * an empty August that only means "I stopped looking".
 */
const CAP = 1500;

/** One published cell -- what a run decided about one field, and why. */
export interface Cell {
  field: string;
  /** The store's closed vocabulary: live | healed | quarantined | stale | degraded. */
  status: string;
  /** Null on a held cell, and that is an absence, not a missing lookup. */
  value: string | null;
  reason: string | null;
  proof: string;
}

/** A run that happened. ISO strings: `pg` hands back a Date under tsx and a
 *  string inside Next's bundle, and this crosses to a client component. */
export interface RanEntry {
  runId: number;
  at: string;
  targetId: string;
  scraper: string;
  /** The screen's plainer word, from `web/lib/runs.ts`. Not the store's. */
  outcome: 'clean' | 'healed' | 'held';
  cells: Cell[];
}

/** A scraper's clock: its cadence, and the one future run that is recorded. */
export interface Clock {
  scraper: string;
  targetIds: string[];
  cadence: string;
  /** Null where the cadence is unparseable or the target is paused. */
  cadenceMs: number | null;
  /** The stored next run. Null IS pause -- `src/setup` rule 3. */
  nextRunAt: string | null;
  paused: boolean;
  fields: number;
}

export interface CalendarData {
  runs: RanEntry[];
  clocks: Clock[];
  /** The oldest run actually read, so the list can say what it covers. */
  earliest: string | null;
  /** True when there are older runs this page did not read. */
  capped: boolean;
  now: string;
  workers: number;
}

/**
 * `runs.status` is `ok` / `heal` / `abstain`; the screen says something else.
 * Same one-way mapping `web/lib/runs.ts` makes, repeated rather than imported
 * because importing `runsView` would drag its queue join along with it -- and
 * kept identical on purpose: a run that reads "held" on /runs and "clean" here
 * would be two screens disagreeing about the same row.
 */
function outcomeOf(runStatus: string, fieldStatuses: string[]): RanEntry['outcome'] {
  if (fieldStatuses.includes('quarantined')) return 'held';
  if (runStatus === 'heal' || fieldStatuses.includes('healed')) return 'healed';
  return 'clean';
}

export async function calendarData(now = new Date(), workers = 0): Promise<CalendarData> {
  const db = getDb();

  const [runRows, targetRows] = await Promise.all([
    db
      .select({
        runId: schema.runs.runId,
        at: schema.runs.startedAt,
        targetId: schema.runs.targetId,
        status: schema.runs.status,
      })
      .from(schema.runs)
      .orderBy(desc(schema.runs.runId))
      .limit(CAP + 1),
    db
      .select({
        targetId: schema.targets.targetId,
        cadence: schema.targets.cadence,
        nextRunAt: schema.targets.nextRunAt,
      })
      .from(schema.targets)
      .orderBy(schema.targets.targetId),
  ]);

  const capped = runRows.length > CAP;
  const kept = capped ? runRows.slice(0, CAP) : runRows;

  const cells = kept.length
    ? await db
        .select({
          runId: schema.fieldRuns.runId,
          field: schema.fieldRuns.field,
          status: schema.fieldRuns.status,
          value: schema.fieldRuns.value,
          reason: schema.fieldRuns.reason,
          proof: schema.fieldRuns.proofId,
        })
        .from(schema.fieldRuns)
        .where(inArray(schema.fieldRuns.runId, kept.map((r) => r.runId)))
    : [];

  const byRun = new Map<number, Cell[]>();
  for (const c of cells) {
    const list = byRun.get(c.runId);
    const cell: Cell = { field: c.field, status: c.status, value: c.value, reason: c.reason, proof: c.proof };
    if (list) list.push(cell);
    else byRun.set(c.runId, [cell]);
  }

  const runs: RanEntry[] = kept.map((r) => {
    const mine = (byRun.get(r.runId) ?? []).sort((a, b) => a.field.localeCompare(b.field));
    return {
      runId: r.runId,
      at: new Date(r.at as unknown as string | Date).toISOString(),
      targetId: r.targetId,
      scraper: (r.targetId ?? '').split('__')[0]!,
      outcome: outcomeOf(r.status, mine.map((c) => c.status)),
      cells: mine,
    };
  });

  // A scraper is the set of fields watched on one page, so the clock is by
  // slug -- the same reduction `web/lib/schedule.ts` makes. Where two targets
  // on one page disagree, the faster cadence wins: it is the one that decides
  // how fresh the page is, and the one whose next run comes first.
  const bySlug = new Map<string, Clock>();
  for (const t of targetRows) {
    const scraper = t.targetId.split('__')[0]!;
    const next = (t.nextRunAt as Date | null) ?? null;
    const ms = cadenceMs(t.cadence);
    const paused = next === null || ms === null;
    const seen = bySlug.get(scraper);
    if (!seen) {
      bySlug.set(scraper, {
        scraper,
        targetIds: [t.targetId],
        cadence: t.cadence,
        cadenceMs: ms,
        nextRunAt: next ? new Date(next).toISOString() : null,
        paused,
        fields: 1,
      });
      continue;
    }
    seen.targetIds.push(t.targetId);
    seen.fields += 1;
    if (!paused && (seen.paused || seen.cadenceMs === null || ms! < seen.cadenceMs)) {
      seen.cadence = t.cadence;
      seen.cadenceMs = ms;
      seen.nextRunAt = new Date(next!).toISOString();
      seen.paused = false;
    }
  }

  return {
    runs,
    clocks: [...bySlug.values()],
    earliest: runs.length ? runs[runs.length - 1]!.at : null,
    capped,
    now: now.toISOString(),
    workers,
  };
}
