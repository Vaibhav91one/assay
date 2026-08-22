// Server-only. Opens a Postgres pool and reads capture files off disk; see
// web/lib/queue.ts on why `server-only` is deliberately not a dependency.
import { getDb, openQueue } from 'assay/store';
import * as schema from 'assay/engine/store/schema';
import { assessField, knownFields } from 'assay/engine/health/observe';
import type { FragilityGrade, DriftState } from 'assay/engine/health/index';
import { asc, eq, inArray } from 'drizzle-orm';

/**
 * What each field looks like when it is right, and how reliably it has been
 * there.
 *
 * The `how it is found` sentence is `src/health`'s own note, not a rewrite of
 * it: it names the anchors holding the field up and how often they have moved.
 * A model never writes this column -- a fluent narrator would eventually
 * produce a reason that contradicts the evidence, and the reader would believe
 * the fluent one.
 */

export const FIELD_FILTERS = ['all', 'held', 'fragile'] as const;
export type FieldFilter = (typeof FIELD_FILTERS)[number];

export interface FieldRow {
  targetId: string;
  scraper: string;
  field: string;
  /** Runs that published a value, out of runs that happened. */
  seen: number;
  runs: number;
  /** The health module's own sentence. Null when it could not be assessed. */
  how: string | null;
  grade: FragilityGrade | null;
  drift: DriftState | null;
  /** Open queue items on this field. Held, and still waiting on someone. */
  held: number;
  /** When the published value last differed. Null if it never has. */
  lastChange: Date | null;
  /** Runs the grade could not see -- captures pruned, or never kept. */
  unobserved: number;
}

export interface FieldsView {
  rows: FieldRow[];
  tracked: number;
  fragile: number;
  /** Fields the schema promises that have never once arrived. */
  missing: number;
  heldTotal: number;
}

/**
 * The most recent run whose published value differed from the one before it.
 *
 * Withheld runs are stepped over rather than counted as a change: a hole is
 * not a new value, and calling it one would put "changed today" against a
 * field that published nothing today.
 */
function lastChangeOf(rows: { runId: number; value: string | null; at: Date }[]): Date | null {
  const published = rows.filter((r) => r.value !== null).sort((a, b) => b.runId - a.runId);
  for (let i = 0; i + 1 < published.length; i += 1) {
    if (published[i].value !== published[i + 1].value) return published[i].at;
  }
  return null;
}

export async function fieldsView(filter: FieldFilter = 'all'): Promise<FieldsView> {
  const db = getDb();
  const fields = await knownFields();

  const [cells, open] = await Promise.all([
    fields.length
      ? db
          .select({
            targetId: schema.runs.targetId,
            runId: schema.fieldRuns.runId,
            field: schema.fieldRuns.field,
            value: schema.fieldRuns.value,
            proof: schema.fieldRuns.proofId,
            at: schema.runs.startedAt,
          })
          .from(schema.fieldRuns)
          .innerJoin(schema.runs, eq(schema.runs.runId, schema.fieldRuns.runId))
          .where(inArray(schema.runs.targetId, fields.map((f) => f.target)))
          .orderBy(asc(schema.fieldRuns.runId))
      : [],
    openQueue(500),
  ]);

  const waiting = new Set(open.map((q) => q.proofId));

  const rows = await Promise.all(
    fields.map(async (f): Promise<FieldRow> => {
      const mine = cells.filter((c) => c.targetId === f.target && c.field === f.field);
      // Assessing re-parses up to 30 stored pages, so one field failing --
      // a pruned capture, a target that has since been reset -- must not take
      // the whole table down with it. It becomes an absence, not an error.
      let how: string | null = null;
      let grade: FragilityGrade | null = null;
      let drift: DriftState | null = null;
      let unobserved = 0;
      try {
        const h = await assessField(f.target, f.field);
        how = h.fragility.note;
        grade = h.fragility_grade;
        drift = h.drift_state;
        unobserved = h.unobserved_runs;
      } catch {
        how = null;
      }

      return {
        targetId: f.target,
        scraper: f.target.split('__')[0],
        field: f.field,
        seen: mine.filter((c) => c.value !== null).length,
        runs: mine.length,
        how,
        grade,
        drift,
        held: mine.filter((c) => waiting.has(c.proof)).length,
        lastChange: lastChangeOf(mine.map((c) => ({ runId: c.runId, value: c.value, at: c.at as Date }))),
        unobserved,
      };
    }),
  );

  const keep =
    filter === 'held'
      ? rows.filter((r) => r.held > 0)
      : filter === 'fragile'
        ? rows.filter((r) => r.grade === 'fragile')
        : rows;

  return {
    rows: keep,
    tracked: rows.length,
    fragile: rows.filter((r) => r.grade === 'fragile').length,
    missing: rows.filter((r) => r.seen === 0 && r.runs > 0).length,
    heldTotal: rows.reduce((n, r) => n + r.held, 0),
  };
}
