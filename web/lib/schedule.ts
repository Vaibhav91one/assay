// Server-only. Opens a Postgres pool; see web/lib/queue.ts on why
// `server-only` is deliberately not a dependency.
import { getDb } from 'assay/store';
import * as schema from 'assay/engine/store/schema';
import { cadenceMs } from 'assay/engine/schedule';
import { and, gte, inArray, lt } from 'drizzle-orm';

/**
 * How often Assay checks each page, over one day.
 *
 * The window is today, midnight to midnight, because that is the unit an
 * operator asks the question in ("has it run yet, when is the next one").
 * Runs that happened are read from the store; runs that are coming are
 * projected forward from `next_run_at` at the target's own cadence -- and
 * stop at the edge of the day rather than being extrapolated into next week.
 */

export interface ScraperSchedule {
  scraper: string;
  /** Every target row that makes up this scraper -- one per field. */
  targets: string[];
  cadence: string;
  paused: boolean;
  nextRunAt: Date | null;
  /** Fractions of the day, 0 to 1. */
  /** One mark per minute the scraper ran, with how many runs landed in it. */
  ran: { at: number; when: Date; runs: number }[];
  upcoming: { at: number; when: Date }[];
}

export interface ScheduleView {
  scrapers: ScraperSchedule[];
  /** Runs today, counted -- not marks drawn. The two are not the same. */
  runsToday: number;
  dayStart: Date;
  dayEnd: Date;
  now: Date;
}

const DAY = 86_400_000;

export async function scheduleView(now = new Date()): Promise<ScheduleView> {
  const db = getDb();
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayEnd = new Date(dayStart.getTime() + DAY);

  const targets = await db
    .select({
      targetId: schema.targets.targetId,
      cadence: schema.targets.cadence,
      nextRunAt: schema.targets.nextRunAt,
    })
    .from(schema.targets)
    .orderBy(schema.targets.targetId);

  const runs = targets.length
    ? await db
        .select({ targetId: schema.runs.targetId, at: schema.runs.startedAt })
        .from(schema.runs)
        .where(and(
          inArray(schema.runs.targetId, targets.map((t) => t.targetId)),
          gte(schema.runs.startedAt, dayStart),
          lt(schema.runs.startedAt, dayEnd),
        ))
    : [];

  // A scraper is the set of fields watched on one page, so the lane is by
  // slug. Two targets on the same slug share a cadence in practice; if they
  // ever disagree the lane shows the one that runs most often, which is the
  // one that decides how fresh the page is.
  const bySlug = new Map<string, ScraperSchedule>();

  // Paused is `next_run_at IS NULL`, which is how `src/setup` defines it and
  // how the claim query behaves: a null next_run_at is never selected, whatever
  // the cadence column still says. Reading the cadence instead would have
  // printed "6h" beside "paused" on the same row.
  for (const t of targets) {
    const slug = t.targetId.split('__')[0];
    const next = (t.nextRunAt as Date | null) ?? null;
    const ms = cadenceMs(t.cadence);
    const seen = bySlug.get(slug);
    if (!seen) {
      bySlug.set(slug, {
        scraper: slug,
        targets: [t.targetId],
        cadence: t.cadence,
        paused: next === null || ms === null,
        nextRunAt: next,
        ran: [],
        upcoming: [],
      });
      continue;
    }
    seen.targets.push(t.targetId);
    const fastest = cadenceMs(seen.cadence);
    if (next !== null && ms !== null && (seen.paused || fastest === null || ms < fastest)) {
      seen.cadence = t.cadence;
      seen.paused = false;
      seen.nextRunAt = next;
    }
  }

  const frac = (d: Date) => (d.getTime() - dayStart.getTime()) / DAY;

  // One mark per minute. Two fields on the same page run together, and a
  // backfill can put thirty runs in the same second -- at a day's scale those
  // are one moment, and thirty circles on one pixel are one circle anyway.
  // The count of runs is reported separately rather than inferred from marks.
  for (const r of runs) {
    const lane = bySlug.get(r.targetId.split('__')[0]);
    const at = r.at as Date;
    if (!lane) continue;
    const same = lane.ran.find((x) => Math.abs(x.when.getTime() - at.getTime()) < 60_000);
    if (same) {
      same.runs += 1;
      continue;
    }
    lane.ran.push({ at: frac(at), when: at, runs: 1 });
  }

  for (const lane of bySlug.values()) {
    lane.ran.sort((a, b) => a.at - b.at);
    const ms = cadenceMs(lane.cadence);
    if (ms === null || !lane.nextRunAt) continue;
    for (let t = lane.nextRunAt.getTime(); t < dayEnd.getTime(); t += ms) {
      if (t < dayStart.getTime()) continue;
      lane.upcoming.push({ at: (t - dayStart.getTime()) / DAY, when: new Date(t) });
    }
  }

  return { scrapers: [...bySlug.values()], runsToday: runs.length, dayStart, dayEnd, now };
}

/** `in 4 hours` / `overdue` / `paused`. The next event, not a timestamp. */
export function until(next: Date | null, now: Date): string {
  if (!next) return 'paused';
  const mins = Math.round((next.getTime() - now.getTime()) / 60_000);
  if (mins <= 0) return 'due now';
  if (mins < 60) return `in ${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `in ${hours}h`;
  return `in ${Math.round(hours / 24)}d`;
}
