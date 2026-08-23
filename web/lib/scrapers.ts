// Server-only. Opens a Postgres pool; see web/lib/queue.ts on why
// `server-only` is deliberately not a dependency.
//
// Which scraper "run this" would apply to, on a screen that has not said.
//
// Asking for a run needs a target. Some screens have one in hand -- a run
// detail knows its scraper, a proof knows the target it came off, a
// conversation knows the scraper it built. The list screens do not: Runs,
// Decisions and Fields are each a table ACROSS scrapers, and there is no
// "current" one on them to act on.
//
// So the fallback is the only case where an answer exists: an instance
// watching exactly one page. Then "the scraper" is not a guess, it is the only
// thing the word can mean. Two of them and no name given, this returns null
// and the control is not drawn -- picking one would be a guess with a side
// effect, and the side effect is a fetch against somebody's site.

import { getDb, workersUp } from 'assay/store';
import * as schema from 'assay/engine/store/schema';

export interface RunTarget {
  slug: string;
  /** Every field watched on this page. `askForRun` moves one row per field. */
  fields: number;
  /** Null `next_run_at` on every row IS pause -- `src/setup` rule 3. */
  paused: boolean;
  /** Workers consuming this database's queue, read at render. */
  workers: number;
}

/**
 * The scraper a run control on this screen would act on, or null for none.
 *
 * `slug` is what the screen knows. Passing one that no longer exists returns
 * null rather than silently falling through to the single-scraper case: a
 * stale link must not aim a button at a different site than the one named.
 */
export async function runTarget(slug?: string | null): Promise<RunTarget | null> {
  const bySlug = await grouped();

  const pick = slug ?? (bySlug.size === 1 ? [...bySlug.keys()][0]! : null);
  const found = pick === null ? undefined : bySlug.get(pick);
  if (pick === null || !found) return null;

  return { slug: pick, fields: found.fields, paused: found.paused, workers: await workersUp() };
}

/**
 * Every scraper this instance watches, for a control that can offer a choice.
 *
 * The paragraph at the top of this file is still true and this does not soften
 * it: nothing here PICKS a scraper. Two scrapers and no name given used to draw
 * no control at all, so the commonest action on the product -- ask for a run --
 * was reachable from Home and from a run detail and nowhere else, and an
 * instance watching four pages had it nowhere but Schedule. Offering all four
 * and letting a person press one is not a guess with a side effect; it is the
 * same refusal, moved from "no button" to "say which".
 *
 * Ordered by slug, like `runTarget`'s query, so the rows do not shuffle between
 * renders. `workersUp()` is read ONCE for the whole list rather than per row:
 * it is a fact about the database, not about a scraper.
 */
export async function runTargets(): Promise<RunTarget[]> {
  const [bySlug, workers] = await Promise.all([grouped(), workersUp()]);
  return [...bySlug].map(([slug, f]) => ({ slug, fields: f.fields, paused: f.paused, workers }));
}

/**
 * Target rows folded to one entry per scraper.
 *
 * A target row is one FIELD (`{slug}__{field}`), so counting rows counts fields
 * and grouping them is what makes "a scraper" exist at all. Null `next_run_at`
 * on every row IS pause -- one row with a date is enough to make the scraper
 * live -- so `paused` starts true and is cleared, never accumulated.
 */
async function grouped(): Promise<Map<string, { fields: number; paused: boolean }>> {
  const rows = await getDb()
    .select({ id: schema.targets.targetId, nextRunAt: schema.targets.nextRunAt })
    .from(schema.targets)
    .orderBy(schema.targets.targetId);

  const bySlug = new Map<string, { fields: number; paused: boolean }>();
  for (const r of rows) {
    const s = r.id.split('__')[0];
    if (!s) continue;
    const seen = bySlug.get(s) ?? { fields: 0, paused: true };
    seen.fields += 1;
    if (r.nextRunAt !== null) seen.paused = false;
    bySlug.set(s, seen);
  }
  return bySlug;
}
