'use server';

// A scraper's life, from the browser.
//
// Every one of these already existed as a CLI verb and as a REST route, and
// none of them existed on a screen: an operator who wanted to stop a scraper
// that had started hammering somebody's site had to open a terminal. That is
// the gap this file closes, and it closes it by calling THE SAME engine
// functions the routes call -- `pauseTarget`, `resumeTarget`, `deleteTarget`
// out of `src/setup`. It does not fetch `/api/v1/...`; a server action posting
// to its own HTTP API would be a second network hop, a second auth surface and
// a second place for the semantics to drift.
//
// A SCRAPER IS N TARGET ROWS. `src/setup` ids a target `{slug}__{field}`, so
// "pause the scraper" is "pause every row whose id starts with this slug".
// Nothing in the store models the scraper itself, and inventing a row for it
// here would be a second source of truth about what is paused.
//
// PAUSE IS `next_run_at IS NULL` -- `src/setup` rule 3, and the same reading
// `schedule/actions.ts` and `web/lib/scrapers.ts` already take. A scraper is
// paused when every one of its rows is.

import { revalidatePath } from 'next/cache';
import { eq, inArray } from 'drizzle-orm';
import { getDb } from 'assay/store';
import * as schema from 'assay/engine/store/schema';
import { Cadence, pauseTarget, resumeTarget, deleteTarget } from 'assay/engine/setup/index';
import { nextRunAt } from 'assay/engine/schedule';
import { assertOperator } from '@/lib/auth';
import { t } from '@/lib/copy';

/** What every control on this file's screen gets back. One sentence, always. */
export interface Lifecycle {
  ok: boolean;
  detail: string;
}

/** What the controls have to be drawn from. Read live, never cached in a prop. */
export interface ScraperState {
  slug: string;
  /** Every row is paused. A half-paused scraper reads as running, which it is. */
  paused: boolean;
  /** The cadence its rows agree on, or null where they have drifted apart. */
  cadence: string | null;
  fields: number;
  /** Runs on record. Zero is the only state `deleteTarget` will destroy. */
  runs: number;
}

async function rowsFor(slug: string) {
  const rows = await getDb()
    .select({
      id: schema.targets.targetId,
      cadence: schema.targets.cadence,
      nextRunAt: schema.targets.nextRunAt,
    })
    .from(schema.targets)
    .orderBy(schema.targets.targetId);
  return rows.filter((r) => r.id.split('__')[0] === slug);
}

/** Fold N per-target answers into the one sentence the screen shows. */
function folded(
  results: ({ ok: true } | { ok: false; detail: string })[],
  done: string,
): Lifecycle {
  const refused = results.filter((r): r is { ok: false; detail: string } => !r.ok);
  if (refused.length === 0) return { ok: true, detail: done };
  // The engine's own refusal, not a rewrite of it: `has_history` explains what
  // would break and what to do instead, and that sentence is the whole value.
  return { ok: false, detail: refused[0]!.detail };
}

export async function scraperState(slug: string): Promise<ScraperState | null> {
  await assertOperator();
  const rows = await rowsFor(slug);
  if (rows.length === 0) return null;

  const ids = rows.map((r) => r.id);
  const runs = await getDb()
    .select({ runId: schema.runs.runId })
    .from(schema.runs)
    .where(inArray(schema.runs.targetId, ids));

  const cadences = new Set(rows.map((r) => r.cadence));
  return {
    slug,
    paused: rows.every((r) => r.nextRunAt === null),
    cadence: cadences.size === 1 ? [...cadences][0]! : null,
    fields: rows.length,
    runs: runs.length,
  };
}

export async function pauseScraper(slug: string): Promise<Lifecycle> {
  await assertOperator();
  const rows = await rowsFor(slug);
  if (rows.length === 0) return { ok: false, detail: t('lifecycle.notFound', { slug }) };

  const out = await Promise.all(rows.map((r) => pauseTarget(r.id)));
  revalidatePath('/', 'layout');
  return folded(out, t('lifecycle.paused', { slug }));
}

export async function resumeScraper(slug: string): Promise<Lifecycle> {
  await assertOperator();
  const rows = await rowsFor(slug);
  if (rows.length === 0) return { ok: false, detail: t('lifecycle.notFound', { slug }) };

  // `resumeTarget` schedules for NOW rather than now + cadence, deliberately --
  // a scraper paused for a week has missed every run in it. See its header.
  const out = await Promise.all(rows.map((r) => resumeTarget(r.id)));
  revalidatePath('/', 'layout');
  return folded(out, t('lifecycle.resumed', { slug }));
}

/**
 * Forget a scraper that never ran. Refuse one that did.
 *
 * The refusal is the engine's and this does not soften it: a target with runs
 * on record is not deletable, because every published row carries a proof id
 * that has to keep answering "where did this number come from?". `deleteTarget`
 * says so in its own words, and those are the words that reach the screen.
 */
export async function deleteScraper(slug: string): Promise<Lifecycle> {
  await assertOperator();
  const rows = await rowsFor(slug);
  if (rows.length === 0) return { ok: false, detail: t('lifecycle.notFound', { slug }) };

  const out = await Promise.all(rows.map((r) => deleteTarget(r.id)));
  revalidatePath('/', 'layout');
  return folded(out, t('lifecycle.deleted', { slug }));
}

/**
 * How often it runs, changed without stopping it.
 *
 * `Cadence` is the engine's own validator, imported rather than re-expressed --
 * it is the thing that stops "6 hours" or "paused" reaching a scheduler that
 * would then never run this target again. A rejected cadence is not written.
 *
 * A PAUSED ROW STAYS PAUSED. Writing `next_run_at` here would resume a scraper
 * as a side effect of editing a text field, and the operator's pause would be
 * gone with nothing recording that this control removed it. Resume is its own
 * control and says what it does -- the same bargain `askForRun` makes.
 */
export async function setCadence(slug: string, cadence: string): Promise<Lifecycle> {
  await assertOperator();
  const parsed = Cadence.safeParse(cadence);
  if (!parsed.success) {
    return { ok: false, detail: parsed.error.issues[0]?.message ?? t('lifecycle.cadence.bad') };
  }

  const rows = await rowsFor(slug);
  if (rows.length === 0) return { ok: false, detail: t('lifecycle.notFound', { slug }) };

  const db = getDb();
  const at = new Date();
  for (const r of rows) {
    await db
      .update(schema.targets)
      .set({
        cadence: parsed.data,
        // Only where a run was already scheduled. `nextRunAt` cannot return
        // null for a cadence `Cadence` just accepted, but the fallback keeps
        // the row's existing time rather than writing an accidental pause.
        ...(r.nextRunAt === null ? {} : { nextRunAt: nextRunAt(parsed.data, at) ?? r.nextRunAt }),
      })
      .where(eq(schema.targets.targetId, r.id));
  }

  revalidatePath('/', 'layout');
  const paused = rows.every((r) => r.nextRunAt === null);
  return {
    ok: true,
    detail: paused
      ? t('lifecycle.cadence.paused', { slug, cadence: parsed.data })
      : t('lifecycle.cadence.set', { slug, cadence: parsed.data }),
  };
}
