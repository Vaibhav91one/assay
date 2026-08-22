// Server-only. This opens a Postgres pool, so importing it from a client
// component would fail at bundle time with a confusing error rather than a
// clear one. The `server-only` package exists to make that message clear and
// is deliberately not installed -- a whole dependency for one guard rail.
import { openQueue, explain, getDb } from 'assay/store';
import * as schema from 'assay/engine/store/schema';
import { and, desc, eq, lt } from 'drizzle-orm';

/**
 * Everything the Decisions screen needs, assembled server-side.
 *
 * This is a Server Component data source, not a REST client: it calls the
 * store directly, so N candidates cost N in-process queries rather than N
 * HTTP round-trips through our own API.
 */

/** One thing the gate ranked. Deliberately carries no score. */
export interface Candidate {
  value: string;
  selector: string;
  /** Derived from history, not from the model. Null when history cannot say. */
  evidence: { kind: 'steady' | 'unseen'; text: string } | null;
}

export interface Decision {
  proof: string;
  target: string;
  run: number;
  field: string;
  reason: string | null;
  heldSinceRun: number | null;
  heldAt: Date | null;
  startedAt: Date | null;
  stakesRows: number;
  groupKey: string | null;
  /** The gate's own ordering, best first. Two at most on the card. */
  candidates: Candidate[];
  /** A nomination recorded by assay_propose. Still an OPEN item. */
  nominated: number | null;
}

/** `ranked` is jsonb, so it is whatever was written. Narrow it, do not trust it. */
function candidatesOf(ranked: unknown): { value: string; selector: string }[] {
  if (!Array.isArray(ranked)) return [];
  return ranked.flatMap((r) => {
    if (!r || typeof r !== 'object') return [];
    const { value, selector } = r as Record<string, unknown>;
    if (typeof value !== 'string' || typeof selector !== 'string') return [];
    return [{ value, selector }];
  });
}

/**
 * Why one candidate is worth believing, in a sentence a person can check.
 *
 * The gate's score is deliberately not shown and not returned: no cell in this
 * product carries a confidence number. What an operator can actually act on is
 * whether this exact value has been on the page before, so that is what we
 * count -- from the published record, not from the ranker that is being judged.
 */
async function evidenceFor(
  targetId: string,
  field: string,
  beforeRun: number,
  value: string,
): Promise<Candidate['evidence']> {
  const rows = await getDb()
    .select({ runId: schema.fieldRuns.runId, value: schema.fieldRuns.value })
    .from(schema.fieldRuns)
    .innerJoin(schema.runs, eq(schema.runs.runId, schema.fieldRuns.runId))
    .where(and(
      eq(schema.runs.targetId, targetId),
      eq(schema.fieldRuns.field, field),
      lt(schema.fieldRuns.runId, beforeRun),
    ))
    .orderBy(desc(schema.fieldRuns.runId))
    .limit(200);

  // A withheld run published nothing, so it is neither agreement nor
  // disagreement -- stepping over it is not the same as counting it.
  const published = rows.filter((r) => r.value !== null);
  if (published.length === 0) return null;

  let streak = 0;
  for (const r of published) {
    if (r.value !== value) break;
    streak += 1;
  }
  if (streak > 0) {
    return {
      kind: 'steady',
      text: streak === 1 ? 'The same as the run before' : `The same for the last ${streak} runs`,
    };
  }
  if (!published.some((r) => r.value === value)) {
    return { kind: 'unseen', text: 'Not seen in any earlier run' };
  }
  return null;
}

/** `assay_propose` writes `model_nominated:<n>` while leaving resolved_by null. */
function nominationOf(resolution: string | null): number | null {
  const m = /^model_nominated:(\d+)$/.exec(resolution ?? '');
  return m ? Number(m[1]) : null;
}

export async function openDecisions(limit = 50): Promise<Decision[]> {
  const items = await openQueue(limit);

  return Promise.all(items.map(async (item): Promise<Decision> => {
    const e = await explain(item.proofId);
    const target = e?.target ?? 'unknown';
    const raw = candidatesOf(e?.ranked).slice(0, 2);

    const candidates = await Promise.all(raw.map(async (c) => ({
      ...c,
      evidence: e ? await evidenceFor(target, e.field, e.run, c.value) : null,
    })));

    return {
      proof: item.proofId,
      target,
      run: e?.run ?? 0,
      field: e?.field ?? 'unknown',
      reason: e?.reason ?? null,
      heldSinceRun: e?.held_since_run ?? null,
      heldAt: item.ts ?? null,
      startedAt: e?.started_at ?? null,
      stakesRows: item.stakesRows,
      groupKey: item.groupKey,
      candidates,
      nominated: nominationOf(item.resolution),
    };
  }));
}

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
