// Server-only. This opens a Postgres pool, so importing it from a client
// component would fail at bundle time with a confusing error rather than a
// clear one. The `server-only` package exists to make that message clear and
// is deliberately not installed -- a whole dependency for one guard rail.
import { getDb } from 'assay/store';
import * as schema from 'assay/engine/store/schema';
import { isNull, sql } from 'drizzle-orm';
import { cache } from 'react';

/**
 * How many held cells are waiting on a person. UNCAPPED, and the only place
 * this number is worked out.
 *
 * Four surfaces used to answer this question four ways: the rail counted a
 * list capped at 50, Home counted one capped at 500, the bell counted a mixed
 * list sliced to 12, and /runs counted RUNS containing a quarantined cell --
 * a run fact, which a resolved hold still satisfies. On an instance with 60
 * held cells the same product said 50, 60, 12 and 74 in four places at once.
 *
 * `resolved_by`, not `resolution`: a decide-queue nomination used to write
 * `model_nominated:<n>` into `resolution` while leaving the item OPEN, so
 * reading that column would have counted a nomination as an answer.
 *
 * `cache()` so the rail, the screen inside it and the top bar above it read it
 * once per request instead of three times.
 */
export const waitingCount = cache(async (): Promise<number> => {
  const [row] = await getDb()
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.queueItems)
    .where(isNull(schema.queueItems.resolvedBy));
  return row?.n ?? 0;
});

/**
 * The sidebar's scraper list.
 *
 * A target row is one *field*, and `src/setup` ids them `{slug}__{field}` --
 * so selecting target ids straight out puts `chicco__recall_title` in a rail
 * that means to say "chicco". One scraper is the set of fields watched on one
 * page, so the list is by slug, with how many fields each carries.
 */
export async function scrapers(): Promise<{ id: string; url: string; fields: number }[]> {
  const rows = await getDb()
    .select({ id: schema.targets.targetId, url: schema.targets.url })
    .from(schema.targets)
    .orderBy(schema.targets.targetId);

  const bySlug = new Map<string, { id: string; url: string; fields: number }>();
  for (const r of rows) {
    const slug = r.id.split('__')[0];
    const seen = bySlug.get(slug);
    if (seen) seen.fields += 1;
    else bySlug.set(slug, { id: slug, url: r.url, fields: 1 });
  }
  return [...bySlug.values()];
}
