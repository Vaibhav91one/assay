// Where the observations come from, and where the two words go.
//
// The store keeps no per-run fingerprint and no per-run anchor reading -- the
// runner has both in memory and throws them away, and wave 1 may not add a
// column. So the pages themselves are the series: `runs.page_sha` is the
// content digest of every page ever fetched, recorded on EVERY run including
// skipped ones, and the capture store is addressed by that same digest.
//
// The consequence is stated rather than hidden. A run whose page has been
// pruned cannot be observed, and `unobserved_runs` carries that count all the
// way out to the API. `historyFor` learned this the hard way with an inner join
// that dropped skipped runs and left robustZ a holed series with no error to
// show for it; a hole here is a number a reader can see.

import { load, type CheerioAPI } from 'cheerio';
import { z } from 'zod';
import { fingerprint } from '../fingerprint.js';
import { selectorFor } from '../runner.js';
import { pickTarget, type FieldContract } from '../target.js';
import { getCapture } from '../store/captures.js';
import { getDb, sql, fieldState } from '../store/index.js';
import {
  fragility, drift, FieldHealth,
  type FieldObservation, type FragilityGrade, type DriftState,
} from './index.js';

// TODO(types): drizzle's `execute` hands back `Record<string, unknown>` rows,
// so each raw read below names the shape it expects, as `src/store/index.ts`
// does for the same reason.
type Row = Record<string, any>;

/**
 * How far back a grade looks. Longer than the detector's six-run window on
 * purpose: F1's user is looking for a field that has been rotting for weeks,
 * which is a slower question than "did this run break".
 */
export const WINDOW = 30;

/**
 * The half of `targets.contract` this module needs, parsed rather than trusted.
 *
 * It arrives from jsonb, so it is parsed input like any other -- and the
 * resolver's patterns are strings for the reason `target.ts` documents: a
 * RegExp literal JSON-stringifies to `{}` and silently matches nothing.
 */
const Contract = z.object({
  field: z.string(),
  resolver: z.object({
    tags: z.string(),
    minLen: z.number(),
    maxLen: z.number(),
    include: z.string().nullable().optional(),
    exclude: z.string().nullable().optional(),
    flags: z.string().optional(),
  }),
});

const clean = (s: string | null | undefined): string => (s || '').replace(/\s+/g, ' ').trim();

/**
 * Parse a stored page exactly as the runner did.
 *
 * `script,style,noscript` are stripped because `tools/ingest.ts` strips them
 * before establishing the baseline. Fingerprinting a page the runner never saw
 * would compare this module's idea of the DOM against the engine's, and the
 * difference would show up as anchor churn that never happened.
 */
const parse = (html: string): CheerioAPI => {
  const $ = load(html);
  $('script,style,noscript').remove();
  return $;
};

/**
 * The baseline's two anchors, read off a later page, on FULL text.
 *
 * Two departures from `establishBaseline`, both deliberate.
 *
 * 1. FULL text, not the first 200 characters. That truncation is the bug
 *    CRITIQUE 3.2 records inside `benign_tie`, and it is worse here: drift IS
 *    the comparison, so a prefix match is a missed signal rather than a wrong
 *    publish. Two anchors agreeing for 200 characters and diverging at 300 are
 *    disagreeing, and this reads far enough to say so.
 *
 * 2. `/` becomes a child combinator. `abs_xpath` is `/html[1]/body[1]/...`;
 *    replacing only the predicates leaves the slashes in place, and
 *    `html:nth-of-type(1)/body:nth-of-type(1)` is not a CSS selector. It does
 *    not throw -- css-select matches nothing -- so the anchor silently reads
 *    null on every page. Measured on the real corpus: 0 of 74 runs ever had a
 *    second anchor to compare, which is why `anchors_disagree` in `detect()`
 *    has never fired. Named in the report; `src/runner.ts` is frozen.
 */
const xpathAsCss = (absXPath: string): string =>
  absXPath.replace(/^\//, '').replace(/\[(\d+)\]/g, ':nth-of-type($1)').replace(/\//g, ' > ');

const readAnchors = (
  $: CheerioAPI,
  baseline: { selector: string; absXPath: string },
): Record<string, string | null> => ({
  css: clean($(baseline.selector).first().text()) || null,
  xpath: (() => {
    try {
      return clean($(xpathAsCss(baseline.absXPath)).first().text()) || null;
    } catch {
      // An unparseable selector is an anchor that did not resolve, which is an
      // absence. It must not become an empty string that agrees with nothing.
      return null;
    }
  })(),
});

export interface Observed {
  observations: FieldObservation[];
  totalRuns: number;
  unobservedRuns: number;
}

/**
 * Rebuild the observation series for one field, oldest first.
 *
 * Two different elements are involved and the distinction matters. Fragility
 * fingerprints where the field ACTUALLY IS on each page, via the resolver, so
 * that a field which moved is measured as having moved rather than as missing.
 * Drift reads the BASELINE's anchors against each later page, which is the only
 * way two independent readings of one field can disagree.
 */
export async function observeField(targetId: string, field: string, window = WINDOW): Promise<Observed> {
  const d = getDb();

  const { rows: tRows } = await d.execute(
    sql`SELECT contract FROM targets WHERE target_id = ${targetId}`,
  );
  const target = (tRows as Row[])[0];
  if (!target) throw new Error(`no target "${targetId}"`);
  const contract = Contract.parse(target.contract);
  if (contract.field !== field) {
    // No silent fallback: grading field X with field Y's resolver would produce
    // a confident grade for an element this target never watched.
    throw new Error(`target "${targetId}" watches "${contract.field}", not "${field}"`);
  }
  const resolver = contract.resolver as FieldContract;

  const { rows } = await d.execute(sql`
    SELECT run_id, page_sha FROM runs
    WHERE target_id = ${targetId} AND page_sha IS NOT NULL
    ORDER BY run_id DESC LIMIT ${window}`);
  const runs = (rows as Row[]).reverse();

  let baseline: { selector: string; absXPath: string } | null = null;
  const observations: FieldObservation[] = [];
  let unobserved = 0;

  for (const r of runs) {
    // A pruned capture is an unobserved run, not a failed report. `pruned` is a
    // normal state (src/store/captures.ts), and the count travels all the way
    // out to the API rather than being swallowed here.
    let html: string;
    try {
      html = await getCapture(r.page_sha);
    } catch {
      unobserved++;
      continue;
    }
    const $ = parse(html);
    const el = pickTarget($, resolver);
    const fp = el ? fingerprint($, el) : null;

    // The oldest observable page is the baseline the anchors are read from --
    // the same relationship `establishBaseline` has with every later run.
    if (!baseline && fp) baseline = { selector: selectorFor(el), absXPath: fp.abs_xpath };

    observations.push({
      runId: r.run_id,
      fingerprint: fp,
      anchors: baseline ? readAnchors($, baseline) : {},
    });
  }

  return { observations, totalRuns: runs.length, unobservedRuns: unobserved };
}

/** Grade one field from the pages the store still has. Does not write. */
export async function assessField(targetId: string, field: string, window = WINDOW): Promise<FieldHealth> {
  const { observations, totalRuns, unobservedRuns } = await observeField(targetId, field, window);
  const f = fragility(observations);
  const dr = drift(observations);
  return FieldHealth.parse({
    target: targetId,
    field,
    fragility_grade: f.grade,
    drift_state: dr.state,
    fragility: {
      anchors: f.anchors,
      median_anchor_moves: f.median_anchor_moves,
      mad_anchor_moves: f.mad_anchor_moves,
      median_position_moves: f.median_position_moves,
      observations: f.observations,
      note: f.note,
    },
    drift: {
      verdicts: dr.verdicts, disagreements: dr.disagreements,
      unreadable: dr.unreadable, note: dr.note,
    },
    unobserved_runs: unobservedRuns,
    total_runs: totalRuns,
  });
}

/**
 * Write the two words, and ONLY the two words.
 *
 * `field_state` is shared with the brake (F10/F11), which owns `brake_active`
 * and `brake_reason` on the same row. `set` names this feature's columns
 * explicitly: a full-row upsert would carry the INSERT's default `brake_active
 * = false` over a live brake and silently release it. Column-scoped, and
 * `test/health.test.ts` proves it against a row with a brake set rather than
 * arguing it.
 */
export async function writeFieldState(
  targetId: string,
  field: string,
  grade: FragilityGrade,
  drifting: DriftState,
): Promise<void> {
  await getDb().insert(fieldState)
    .values({ targetId, field, fragilityGrade: grade, drifting })
    .onConflictDoUpdate({
      target: [fieldState.targetId, fieldState.field],
      set: { fragilityGrade: grade, drifting, updatedAt: new Date() },
    });
}

/** Assess one field and persist its standing state. The operator's F1 gesture. */
export async function recomputeField(targetId: string, field: string, window = WINDOW): Promise<FieldHealth> {
  const health = await assessField(targetId, field, window);
  await writeFieldState(targetId, field, health.fragility_grade, health.drift_state);
  return health;
}

/** Every (target, field) the store has ever published a cell for. */
export async function knownFields(targetId?: string | null): Promise<{ target: string; field: string }[]> {
  const { rows } = await getDb().execute(sql`
    SELECT DISTINCT r.target_id, fr.field FROM field_runs fr
    JOIN runs r ON r.run_id = fr.run_id
    WHERE ${targetId ? sql`r.target_id = ${targetId}` : sql`TRUE`}
    ORDER BY r.target_id, fr.field`);
  return (rows as Row[]).map((r) => ({ target: r.target_id, field: r.field }));
}

/** Recompute every known field. What the CLI runs after a redesign. */
export async function recomputeAll(targetId?: string | null, window = WINDOW): Promise<FieldHealth[]> {
  const out: FieldHealth[] = [];
  for (const { target, field } of await knownFields(targetId)) {
    out.push(await recomputeField(target, field, window));
  }
  return out;
}

/** The standing state as stored: cheap, and null where nothing was ever assessed. */
export interface StandingState {
  target: string;
  field: string;
  fragility_grade: FragilityGrade | null;
  drift_state: DriftState | null;
  assessed_at: string | null;
}

/**
 * Read the two columns back for every known field.
 *
 * A LEFT JOIN, so a field that has never been assessed comes back with nulls
 * and is visible as an unanswered question. An inner join would make the
 * un-assessed fields disappear, which reads as "everything is graded".
 */
export async function standingState(targetId?: string | null): Promise<StandingState[]> {
  const { rows } = await getDb().execute(sql`
    SELECT DISTINCT ON (r.target_id, fr.field)
           r.target_id, fr.field, fs.fragility_grade, fs.drift_state, fs.updated_at
    FROM field_runs fr
    JOIN runs r ON r.run_id = fr.run_id
    LEFT JOIN field_state fs ON fs.target_id = r.target_id AND fs.field = fr.field
    WHERE ${targetId ? sql`r.target_id = ${targetId}` : sql`TRUE`}
    ORDER BY r.target_id, fr.field`);
  return (rows as Row[]).map((r) => ({
    target: r.target_id,
    field: r.field,
    fragility_grade: r.fragility_grade ?? null,
    drift_state: r.drift_state ?? null,
    // Present only when the row was assessed; `updated_at` is NOT NULL on the
    // table, so a null here means there is no row, not an unknown timestamp.
    assessed_at: r.fragility_grade == null && r.drift_state == null ? null : iso(r.updated_at),
  }));
}

/**
 * One ISO string, whatever the driver handed back.
 *
 * node-postgres returns `timestamptz` as a Date under tsx and as a STRING
 * inside Next's bundle, which registers no type parsers of its own. Asserting
 * either shape works in one runtime and throws in the other -- this route
 * returned 500 in `next dev` while every test passed. Normalising is not a
 * silent fallback: a value that is neither is an error, not a null.
 */
function iso(v: unknown): string {
  const d = v instanceof Date ? v : new Date(String(v));
  if (Number.isNaN(d.getTime())) throw new Error(`unparseable timestamp: ${String(v)}`);
  return d.toISOString();
}
