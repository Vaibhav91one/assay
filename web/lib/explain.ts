// Server-only. Opens a Postgres pool; see web/lib/queue.ts on why
// `server-only` is deliberately not a dependency.
import { explain, rowByProof, getDb } from 'assay/store';
import * as schema from 'assay/engine/store/schema';
import { heldBecause, type Term } from 'assay/engine/reports/vocabulary';
import { and, desc, eq, lte } from 'drizzle-orm';
import { gateCheck, gateNumbers } from './run-flow';
import { rankedOf, thresholdsOf } from './run-detail';
import { hasCapture } from 'assay/engine/store/captures';

/**
 * F12, assembled: where one published value came from, months later, from a
 * proof id carried on the row itself.
 *
 * Everything here is read back out of the store rather than recomputed. A
 * nomination has to be judged against the page as it was, and "five landmarks
 * agreed" is only true if five landmarks were recorded -- so this file reports
 * what was written and nothing else.
 */

/**
 * The screen's word for a cell, not the store's. `quarantined` is jargon.
 *
 * `held`, and not `withheld`, which is what this said. The two are different
 * words for different things in this product and the difference is load-bearing:
 *
 *   held      a CELL the gate refused. The decisions queue, `HeldCell`, the
 *             Fields filter, and `runOutcome` all say held -- asserted in
 *             test/run-flow.test.ts, which expects an abstain to read `held`.
 *   withheld  a DIFF that will not render, on /compare and in the digest --
 *             asserted in test/reports.test.ts, and the reason the digest
 *             subject is "12 changes, 2 withheld".
 *
 * Explain is a cell surface, so it says held. It used to render `withheld` in
 * the status card while the run-detail screen next door rendered `held` for the
 * same cell, and the run-detail screen said both at once: `held` in its status
 * column and `withheld` in the value column of the same row.
 */
export type Standing = 'live' | 'healed' | 'held' | 'stale' | 'degraded';

const STANDING: Record<string, Standing> = {
  live: 'live',
  healed: 'healed',
  quarantined: 'held',
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
  /**
   * How many elements were ranked on that page.
   *
   * This used to say "Never their scores", and the scores are now reachable --
   * see `gate` below and the note on `GateNumbers`. The count is still the
   * thing this screen DRAWS, because a count is not a dial: it says how wide
   * the field was, and nobody can re-threshold it.
   */
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
  /**
   * The two scores the gate compared, and what it compared them against.
   *
   * OPTIONAL, and null on most cells by construction: `field_runs.ranked` is
   * written at abstain time only, so this exists exactly when the cell was
   * held. That is the hybrid settled on 2026-08-23 -- the band stays the
   * interface and no float is drawn on the screen, but a proof that cannot
   * produce the numbers its own decision was made from is asking to be taken on
   * trust. It arrives behind one collapsed `show the numbers ›`.
   *
   * The arithmetic is not this file's: `gateNumbers` recovers score, runner-up
   * and margin exactly as `healGated` computed them (a sole candidate is given
   * margin 1, per src/heal.ts), and `gateCheck` answers whether the thresholds
   * on hand still explain the recorded reason. When they do not, the contract
   * has been edited since and the screen withholds the thresholds rather than
   * drawing a line the run was never judged against.
   */
  gate?: {
    score: number;
    runnerUp: number | null;
    margin: number;
    tau: number;
    delta: number;
    /** Whether the target declared these, or they are the shipped defaults. */
    declared: boolean;
    reproduces: boolean;
  } | null;
  /**
   * What the top-ranked candidate SAID, on a cell the gate refused.
   *
   * The counterfactual, and the only reason this value is carried at all: a
   * healer without a gate would have published it. Optional and null wherever
   * `ranked` is -- i.e. on every cell that published, where there is no
   * counterfactual to state because the value on the row IS what was published.
   */
  wouldHavePublished?: string | null;
  /**
   * Whether `captureSha` is still on disk. Captures are `rm`-prunable
   * (`src/store/captures.ts`), so a sha on the row is not a promise the page
   * is still readable -- this is checked once, here, rather than by every
   * caller that wants to offer the frozen-page view.
   */
  captureAvailable: boolean;
  /**
   * The top two ranked candidates, labelled for the frozen-page view
   * (`components/capture-view.tsx`) -- the same "Best match"/"Second
   * candidate" wording `decision-card.tsx` uses, so a cell reads the same way
   * whether it's still open in Decisions or being read back months later here.
   * Null wherever `gate` is: there is nothing to box on a cell that published
   * cleanly.
   */
  candidatesForView: { selector: string; label: string }[] | null;
  /**
   * Whether a queue item for this proof is still open (`resolved_by IS
   * NULL`). Null when there is no queue item at all -- most cells never held,
   * so most proofs never had one. This is what tells the page-map view
   * whether "Looks right" has anything left to do here.
   */
  queueOpen: boolean | null;
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

  const [record, heals, [target], unchanged, [queueItem]] = await Promise.all([
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
      ? db.select({ url: schema.targets.url, contract: schema.targets.contract })
          .from(schema.targets)
          .where(eq(schema.targets.targetId, targetId)).limit(1)
      : Promise.resolve([]),
    unchangedSince(targetId, e.field, e.run, e.value),
    db.select({ resolvedBy: schema.queueItems.resolvedBy })
      .from(schema.queueItems)
      .where(eq(schema.queueItems.proofId, proofId))
      .limit(1),
  ]);

  const heal = heals[0];

  // Null on every cell that published, which is most of them: `ranked` is
  // written at abstain time only. The disclosure is absent rather than empty.
  const ranked = rankedOf(e.ranked);
  const numbers = gateNumbers(ranked);
  const th = thresholdsOf(target?.contract ?? null);

  // Hardcoded, not `t()`: this is the only remaining consumer, historical
  // proofs from before healGated was retired (`src/runner.ts`'s header) --
  // a new proof never carries a ranked list to label.
  const OPTION_LABELS = ['BEST MATCH', 'CLOSE SECOND'] as const;
  const candidatesForView = ranked?.length
    ? ranked.slice(0, 2).map((c, i) => ({ selector: c.selector, label: OPTION_LABELS[i] ?? `candidate ${i + 1}` }))
    : null;

  return {
    proof: e.proof,
    run: e.run,
    field: e.field,
    scraper: targetId.split('__')[0] || 'unknown',
    targetId,
    url: target?.url ?? null,
    value: e.value,
    standing: STANDING[e.status] ?? 'held',
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
    gate: numbers
      ? {
          ...numbers,
          tau: th.tau,
          delta: th.delta,
          declared: th.declared,
          reproduces: gateCheck({ ranked, reason: e.reason || null }, th),
        }
      : null,
    // Only when nothing was published. On a published cell the top candidate is
    // what the row already says, and restating it as a counterfactual would be
    // a sentence about a decision that was never in doubt.
    wouldHavePublished: e.value === null ? ranked?.[0]?.value || null : null,
    captureAvailable: e.capture_sha256 ? await hasCapture(e.capture_sha256) : false,
    candidatesForView,
    queueOpen: queueItem ? queueItem.resolvedBy === null : null,
  };
}
