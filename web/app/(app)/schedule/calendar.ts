/**
 * The calendar's arithmetic. No React, no database, no `new Date()` without
 * being asked for one -- every function that needs "now" takes it, so a test
 * never races the wall clock.
 *
 * Local time throughout, deliberately. An operator asks "did it run today"
 * about their own midnight, not UTC's, and `web/lib/schedule.ts` already draws
 * its day the same way. The cost is that `addDays` must go through the
 * `Date(y, m, d)` constructor rather than adding 86,400,000ms: on the two DST
 * days a year the second one lands an hour into the previous or next day and
 * a run drops out of its cell.
 */

export const VIEWS = ['month', 'week', 'day', 'list'] as const;
export type ViewKind = (typeof VIEWS)[number];

export const startOfDay = (d: Date): Date =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** n days on, through the calendar rather than through milliseconds. */
export const addDays = (d: Date, n: number): Date =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds());

export const addMonths = (d: Date, n: number): Date =>
  new Date(d.getFullYear(), d.getMonth() + n, 1);

/** Monday. `getDay()` calls Sunday 0, which would start the week in the wrong place. */
export const startOfWeek = (d: Date): Date => addDays(startOfDay(d), -((d.getDay() + 6) % 7));

/** A stable key for a day, safe to use as a map key and a React key. */
export const dayKey = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const sameDay = (a: Date, b: Date): boolean => dayKey(a) === dayKey(b);

/**
 * Six weeks starting on the Monday on or before the 1st.
 *
 * Always 42 cells, never 35: a month that starts on a Sunday and has 31 days
 * spans six rows, and a grid that changes height between months moves every
 * control below it. The spilled days belong to the neighbouring months and are
 * drawn dimmer, but they are real days and runs land in them.
 */
export function monthGrid(anchor: Date): Date[] {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const start = startOfWeek(first);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

export function weekGrid(anchor: Date): Date[] {
  const start = startOfWeek(anchor);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/** The days a view draws, in reading order. */
export function daysFor(view: ViewKind, anchor: Date): Date[] {
  if (view === 'month') return monthGrid(anchor);
  if (view === 'week') return weekGrid(anchor);
  return [startOfDay(anchor)];
}

/**
 * The half-open window a view covers, `[from, to)`.
 *
 * `list` is the exception: it is not a window onto a date, it is everything
 * that has been read, newest first. So it reports the widest span it can and
 * lets the caller decide -- a list that silently showed one month while the
 * header said "all" would be the same lie the projections are about.
 */
export function windowFor(view: ViewKind, anchor: Date, earliest: Date | null, now: Date): { from: Date; to: Date } {
  if (view === 'list') {
    return { from: earliest ? startOfDay(earliest) : startOfDay(now), to: addDays(startOfDay(now), 366) };
  }
  const days = daysFor(view, anchor);
  return { from: days[0]!, to: addDays(days[days.length - 1]!, 1) };
}

/** Which way `prev` and `next` move, per view. */
export function step(view: ViewKind, anchor: Date, direction: -1 | 1): Date {
  if (view === 'month') return addMonths(anchor, direction);
  if (view === 'week') return addDays(anchor, 7 * direction);
  if (view === 'day') return addDays(anchor, direction);
  return anchor; // the list does not navigate; it is already all of it
}

/**
 * Runs the cadence implies between `from` and `to`, exclusive of `next` itself.
 *
 * THESE ARE NOT FACTS AND THE SCREEN MUST NOT DRAW THEM AS ONE. Assay stores
 * exactly one future run per target -- `targets.next_run_at` -- and everything
 * after it is this function's opinion. It is a good opinion, and stepping by
 * the cadence is exactly what `scheduleTarget` does, but a run moves when the
 * page is unchanged, when no worker is up, and when someone pauses the target,
 * and none of those are visible from here.
 *
 * `next` is excluded because it is the one stored fact and gets its own mark.
 * A null cadence or a null next run projects nothing: pause is the absence of
 * a next run (`src/setup` rule 3), so a paused target has no future at all and
 * inventing one would put it back on a clock it was taken off.
 *
 * The step is `+ms`, matching `src/schedule.ts` rather than correcting for DST
 * -- the projection should be wrong in the same direction the engine is.
 */
export function projectRuns(
  next: Date | null,
  cadenceMs: number | null,
  from: Date,
  to: Date,
  cap = 400,
): Date[] {
  if (!next || cadenceMs === null || cadenceMs <= 0) return [];
  const out: Date[] = [];
  const end = to.getTime();
  // Start one cadence past the stored run, and skip forward in one arithmetic
  // step rather than looping from `next` -- a weekly target with a next run
  // three years ago would otherwise cost 150 iterations to reach the window.
  const begin = next.getTime() + cadenceMs;
  const skip = Math.max(0, Math.ceil((from.getTime() - begin) / cadenceMs));
  for (let t = begin + skip * cadenceMs; t < end && out.length < cap; t += cadenceMs) {
    if (t >= from.getTime()) out.push(new Date(t));
  }
  return out;
}

/** Group anything with an `at` into day buckets. The placement the grid reads. */
export function bucketByDay<T extends { at: Date }>(items: T[]): Map<string, T[]> {
  const byDay = new Map<string, T[]>();
  for (const item of items) {
    const key = dayKey(item.at);
    const bucket = byDay.get(key);
    if (bucket) bucket.push(item);
    else byDay.set(key, [item]);
  }
  for (const bucket of byDay.values()) bucket.sort((a, b) => a.at.getTime() - b.at.getTime());
  return byDay;
}

/* --------------------------------------------------------------- grouping */

/** The screen's vocabulary for what a run did. `web/lib/runs.ts` owns the mapping. */
export type Outcome = 'clean' | 'healed' | 'held';

/**
 * Which outcome wins when a scraper's runs disagree.
 *
 * A HELD RUN IS NEVER AVERAGED AWAY. A backfill of thirty clean runs and one
 * hold is a cell that must read as holding something: the refusal is the
 * product, and "mostly fine" is the one summary that would hide it. So the
 * group takes the most serious outcome present, not the most common one.
 */
const SEVERITY: Record<Outcome, number> = { clean: 0, healed: 1, held: 2 };

export interface RunGroup<T> {
  scraper: string;
  /** The earliest run in the group -- where it sorts in the day. */
  at: Date;
  /** Every run in the group. The count below is this length, never a cap. */
  runs: T[];
  counts: Record<Outcome, number>;
  worst: Outcome;
}

/**
 * One entry per scraper per cell, instead of one per run.
 *
 * Two targets on a 6h cadence put four near-identical marks in a day; a
 * backfill puts thirty. Thirty marks that differ only in a run id is a cell
 * nobody reads, and the one held run in it is indistinguishable from the
 * twenty-nine that were not.
 *
 * Grouped by scraper and nothing else. Grouping by host was considered and
 * dropped: it helps an install with fifty targets across five sites, and on
 * three targets it invents a level of hierarchy with one child each.
 */
export function groupRuns<T extends { at: Date; scraper: string; outcome: Outcome }>(
  runs: T[],
): RunGroup<T>[] {
  const by = new Map<string, RunGroup<T>>();
  for (const r of runs) {
    let g = by.get(r.scraper);
    if (!g) {
      g = { scraper: r.scraper, at: r.at, runs: [], counts: { clean: 0, healed: 0, held: 0 }, worst: r.outcome };
      by.set(r.scraper, g);
    }
    g.runs.push(r);
    g.counts[r.outcome] += 1;
    if (r.at < g.at) g.at = r.at;
    if (SEVERITY[r.outcome] > SEVERITY[g.worst]) g.worst = r.outcome;
  }
  for (const g of by.values()) g.runs.sort((a, b) => a.at.getTime() - b.at.getTime());
  return [...by.values()].sort(
    (a, b) => a.at.getTime() - b.at.getTime() || a.scraper.localeCompare(b.scraper),
  );
}

/**
 * What a group says about itself. The held count is named first and always,
 * because it is the only one somebody has to act on.
 */
export function summariseGroup(counts: Record<Outcome, number>): string {
  const total = counts.clean + counts.healed + counts.held;
  const runs = `${total} run${total === 1 ? '' : 's'}`;
  if (counts.held > 0) return `${runs}, ${counts.held} held`;
  if (counts.healed > 0) return `${runs}, ${counts.healed} moved`;
  return `${runs}, clean`;
}

/**
 * `in 4 hours` / `due now` / `paused`. The next event, not a timestamp.
 *
 * A copy of `until()` in `web/lib/schedule.ts` rather than an import: that file
 * opens a Postgres pool on its first line, and importing it from a client
 * component pulls drizzle and `pg` into the browser bundle. The boundary is the
 * reason for the duplication, and it is nine lines of arithmetic.
 */
export function untilText(next: Date | null, now: Date): string {
  if (!next) return 'paused';
  const mins = Math.round((next.getTime() - now.getTime()) / 60_000);
  if (mins < 0) return 'overdue';
  if (mins === 0) return 'due now';
  if (mins < 60) return `in ${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `in ${hours}h`;
  return `in ${Math.round(hours / 24)}d`;
}

const MONTH = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' });
const DAY_LONG = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
const DAY_SHORT = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });

/** What the header says it is showing. */
export function titleFor(view: ViewKind, anchor: Date, earliest: Date | null): string {
  if (view === 'month') return MONTH.format(anchor);
  if (view === 'day') return DAY_LONG.format(anchor);
  if (view === 'week') {
    const days = weekGrid(anchor);
    return `${DAY_SHORT.format(days[0]!)} – ${DAY_SHORT.format(days[6]!)}`;
  }
  return earliest ? `Every run since ${DAY_SHORT.format(earliest)}` : 'Every run';
}
