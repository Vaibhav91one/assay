'use server';

// Asking for a run, and finding out whether anything answered.
//
// NEXT NEVER RUNS A SCRAPE. CONTRIBUTING.md is explicit about it: a scrape holds
// a request open and competes with page loads, and `src/runner.ts` takes `fetch`
// as a parameter so the worker and the Bright Data webhook path share one
// detection and gating path. So this file cannot make a run happen and does not
// try. It moves `next_run_at`, which is the whole of the scheduler -- one indexed
// SELECT against `targets` -- and then reports what became of that.
//
// The reporting is the point. An enqueue whose outcome nobody checks is a
// spinner over a promise, and a product whose entire argument is that it says
// "I could not justify this" cannot ship a control that quietly implies a run
// is coming when nothing is there to take it. `workersUp()` is a real signal --
// an advisory lock held by the worker's own connection -- so a screen can say
// "nothing is consuming the queue" as a fact rather than as a timeout.

import { revalidatePath } from 'next/cache';
import { and, desc, eq, gt, inArray } from 'drizzle-orm';
import { getDb, scheduleTarget, workersUp } from 'assay/store';
import * as schema from 'assay/engine/store/schema';
import { assertOperator } from '@/lib/auth';

export interface Asked {
  ok: boolean;
  /** Target rows moved into the due window. One per field on the page. */
  queued: number;
  /** Workers consuming this database's queue at the moment of the ask. */
  workers: number;
  /** Where to look for what lands. ISO, so the client can hand it straight back. */
  since: string;
  detail: string;
}

/** Every target row that makes up one scraper, with whether it is paused. */
async function rowsFor(slug: string) {
  return getDb()
    .select({ id: schema.targets.targetId, nextRunAt: schema.targets.nextRunAt })
    .from(schema.targets)
    .orderBy(schema.targets.targetId)
    .then((rows) => rows.filter((r) => r.id.split('__')[0] === slug));
}

/**
 * Put one scraper's fields at the front of the queue.
 *
 * A PAUSED SCRAPER IS REFUSED rather than quietly resumed. Pause is the absence
 * of a next run (`src/setup/index.ts` rule 3), so writing one here would restart
 * the schedule permanently -- the worker bumps `next_run_at` by the cadence
 * after it claims, and the operator's pause would be gone with no record that
 * this button removed it. Resume is its own control and says what it does.
 *
 * `at` is a parameter so a test does not race the wall clock.
 */
export async function askForRun(slug: string, at: Date = new Date()): Promise<Asked> {
  await assertOperator();
  const since = new Date(at.getTime() - 1000).toISOString();
  const rows = await rowsFor(slug);

  if (rows.length === 0) {
    return { ok: false, queued: 0, workers: 0, since, detail: `Nothing under watch called ${slug}.` };
  }
  if (rows.every((r) => r.nextRunAt === null)) {
    return {
      ok: false, queued: 0, workers: 0, since,
      detail: `${slug} is paused. Resume it first — asking for a run here would put it back on `
        + 'its cadence for good, and that is a different decision.',
    };
  }

  const live = rows.filter((r) => r.nextRunAt !== null);
  for (const r of live) await scheduleTarget(r.id, at);

  const workers = await workersUp();
  revalidatePath('/schedule');

  return {
    ok: true,
    queued: live.length,
    workers,
    since,
    detail: workers === 0
      // Said plainly, at the moment of the ask, because this is the one thing a
      // progress spinner would have hidden.
      ? `${slug} is queued, but no worker is consuming this queue — nothing will pick it up. `
        + 'Start one with `npm run worker` and it will be claimed on the next poll.'
      : `${slug} is queued. ${workers === 1 ? 'A worker is' : `${workers} workers are`} `
        + 'consuming the queue and will claim it on the next poll.',
  };
}

export interface Landed {
  /** Workers right now — a worker can stop between the ask and the look. */
  workers: number;
  runs: {
    run: number;
    target: string;
    field: string | null;
    /** `live | healed | quarantined | ...`, or the run status on a skipped run. */
    status: string;
    reason: string | null;
  }[];
}

/**
 * What has landed for this scraper since `since`. The answer to "did it run?".
 *
 * Reads the record rather than inferring from elapsed time: a run exists or it
 * does not. `workers` is re-read because the honest answer to a run that never
 * came is usually "because nothing was there to take it", and that can become
 * true after the ask.
 */
export async function landedSince(slug: string, since: string): Promise<Landed> {
  await assertOperator();
  const at = new Date(since);
  if (Number.isNaN(at.getTime())) throw new Error(`unparseable timestamp: ${since}`);

  const ids = (await rowsFor(slug)).map((r) => r.id);
  const workers = await workersUp();
  if (ids.length === 0) return { workers, runs: [] };

  const rows = await getDb()
    .select({
      run: schema.runs.runId,
      target: schema.runs.targetId,
      runStatus: schema.runs.status,
      field: schema.fieldRuns.field,
      cellStatus: schema.fieldRuns.status,
      reason: schema.fieldRuns.reason,
    })
    .from(schema.runs)
    .leftJoin(schema.fieldRuns, eq(schema.fieldRuns.runId, schema.runs.runId))
    .where(and(inArray(schema.runs.targetId, ids), gt(schema.runs.startedAt, at)))
    .orderBy(desc(schema.runs.runId))
    .limit(20);

  return {
    workers,
    runs: rows.map((r) => ({
      run: r.run,
      target: r.target,
      field: r.field,
      // A skipped run has no cell, so the run's own status is the honest one to
      // show. `?? runStatus` is not a default standing in for a missing value --
      // the two columns describe the same run at different grain.
      status: r.cellStatus ?? r.runStatus,
      reason: r.reason,
    })),
  };
}
