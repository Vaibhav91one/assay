// Server-only. Opens a Postgres pool; see web/lib/queue.ts on why
// `server-only` is deliberately not a dependency.
import { explain, rowByProof, getDb } from 'assay/store';
import * as schema from 'assay/engine/store/schema';
import { heldBecause, type Term } from 'assay/engine/reports/vocabulary';
import { and, desc, eq, lte } from 'drizzle-orm';

/**
 * F12, assembled: where one published value came from, months later, from a
 * proof id carried on the row itself.
 *
 * Everything here is read back out of the store rather than recomputed. A
 * nomination has to be judged against the page as it was, and "five landmarks
 * agreed" is only true if five landmarks were recorded -- so this file reports
 * what was written and nothing else.
 */

/** The screen's word for a cell, not the store's. `quarantined` is jargon. */
export type Standing = 'live' | 'healed' | 'withheld' | 'stale' | 'degraded';

const STANDING: Record<string, Standing> = {
  live: 'live',
  healed: 'healed',
  quarantined: 'withheld',
  stale: 'stale',
  degraded: 'degraded',
};

export interface Provenance {
  proof: string;
  run: number;
  field: string;
  /** The scraper, which is the slug -- `chicco`, not `chicco__recall_title`. */
  scraper: string;
  targetId: string;
  url: string | null;
  value: string | null;
  standing: Standing;
  /** Why the gate refused, in plain English. Null when it did not refuse. */
  why: Term | null;
  heldSinceRun: number | null;
  startedAt: Date | null;
  /** The element the value was read off, as the gate recorded it. */
  selector: string | null;
  /** How many elements were ranked on that page. Never their scores. */
  considered: number;
  captureSha: string | null;
  goldenSha: string | null;
  groupKey: string | null;
  /** How long this exact value has stood, counted over published runs only. */
  unchanged: { sinceRun: number; runsAgo: number } | null;
  /** The heal that moved this field on this run, if one did. */
  heal: { from: string | null; to: string; reverted: boolean } | null;
  /** The published row, verbatim, for the `full record` disclosure. */
  record: Record<string, unknown> | null;
}

/** `ranked` is jsonb, so it is whatever was written. Narrow it, do not trust it. */
function topSelector(ranked: unknown): { selector: string | null; considered: number } {
  if (!Array.isArray(ranked)) return { selector: null, considered: 0 };
  const first = ranked[0];
  const selector =
    first && typeof first === 'object' && typeof (first as Record<string, unknown>).selector === 'string'
      ? ((first as Record<string, unknown>).selector as string)
      : null;
  return { selector, considered: ranked.length };
}

/**
 * How long this value has been the answer.
 *
 * Counted over runs that published something: a withheld run is neither
 * agreement nor disagreement, and stepping over it is not the same as counting
 * it. `runsAgo` counts every run since, withheld ones included -- that is the
 * elapsed history the operator is actually looking at.
 */
async function unchangedSince(
  targetId: string,
  field: string,
  run: number,
  value: string | null,
): Promise<Provenance['unchanged']> {
  if (value === null) return null;

  const rows = await getDb()
    .select({ runId: schema.fieldRuns.runId, value: schema.fieldRuns.value })
    .from(schema.fieldRuns)
    .innerJoin(schema.runs, eq(schema.runs.runId, schema.fieldRuns.runId))
    .where(and(
      eq(schema.runs.targetId, targetId),
      eq(schema.fieldRuns.field, field),
      lte(schema.fieldRuns.runId, run),
    ))
    .orderBy(desc(schema.fieldRuns.runId))
    .limit(400);

  let sinceRun = run;
  for (const r of rows) {
    if (r.value === null) continue;
    if (r.value !== value) break;
    sinceRun = r.runId;
  }
  const runsAgo = rows.filter((r) => r.runId > sinceRun).length;
  return { sinceRun, runsAgo };
}

export async function provenance(proofId: string): Promise<Provenance | null> {
  const e = await explain(proofId);
  if (!e) return null;

  const targetId = e.target ?? '';
  const db = getDb();

  const [record, heals, [target], unchanged] = await Promise.all([
    rowByProof(proofId),
    db
      .select()
      .from(schema.healHistory)
      .where(and(
        eq(schema.healHistory.targetId, targetId),
        eq(schema.healHistory.field, e.field),
        eq(schema.healHistory.runId, e.run),
      ))
      .limit(1),
    targetId
      ? db.select({ url: schema.targets.url }).from(schema.targets)
          .where(eq(schema.targets.targetId, targetId)).limit(1)
      : Promise.resolve([]),
    unchangedSince(targetId, e.field, e.run, e.value),
  ]);

  const heal = heals[0];

  return {
    proof: e.proof,
    run: e.run,
    field: e.field,
    scraper: targetId.split('__')[0] || 'unknown',
    targetId,
    url: target?.url ?? null,
    value: e.value,
    standing: STANDING[e.status] ?? 'withheld',
    // `|| null`, not `?? null`: a healed row carries reason `''`, and an empty
    // code is an absence of a reason, not a reason with no wording.
    why: heldBecause(e.reason || null),
    heldSinceRun: e.held_since_run,
    startedAt: e.started_at,
    ...topSelector(e.ranked),
    captureSha: e.capture_sha256,
    goldenSha: e.golden_sha256,
    groupKey: e.group_key,
    unchanged,
    heal: heal ? { from: heal.fromSelector, to: heal.toSelector, reverted: heal.reverted } : null,
    record,
  };
}
