// What changed in how one field is read off the page, for one run.
//
// This is the inverse of Bright Data's Self-Healing tool, drawn in the same
// shape. There, an operator notices the break, types a prompt, an LLM rewrites
// the scraper's JavaScript, and a diff appears in the editor with Accept and
// Decline. Detection is manual, the rewrite is unbounded, and the decision is
// a person's -- taken on a diff, in a hurry, with nothing to weigh it against.
//
// Here the break is detected by `detect.ts`, the replacement is scored by
// `heal.ts`, and the gate decides. What this module composes is the diff that
// decision produced, INCLUDING the one Bright Data's editor never draws: the
// change the gate refused, with the margin that was too thin beside it. A tool
// that only ever shows you the edits it accepted cannot show you the ones it
// was right to decline.
//
// Read-only. Everything below is a column that already exists.

import { getDb, sql } from '../store/index.js';
import { latestContract } from '../contracts/store.js';
import { thresholdsFor } from '../contracts/index.js';
import { assayScore, type AssayScore } from './assay-score.js';

export interface Extractor {
  selector: string | null;
  attr: string;
  transform: string | null;
}

export interface Rival {
  selector: string;
  score: number;
  /**
   * The text this candidate held, as the gate saw it.
   *
   * Carried because on a THIN band it is the ONLY thing a person can act on.
   * Two scores four thousandths apart tell a reader nothing they can decide
   * with; two different values do, and the disagreement between them is the
   * whole reason the cell was held rather than published.
   */
  value: string;
}

export interface ExtractorDiff {
  target: string;
  field: string;
  run: number;
  before: Extractor;
  after: Extractor;
  /** healed = the gate allowed it. held = the gate refused and a person must answer. reverted = unhealed later. */
  decision: 'healed' | 'held' | 'reverted';
  /**
   * The gate's outcome as a word. Null when the store does not carry one --
   * see `assayScore`, which documents both cases and why neither is guessed.
   *
   * Declared `| null` against a spec that asked for the bare union, and that is
   * the finding rather than a liberty taken: `field_runs.reason` is null on
   * every healed cell, so a non-nullable band could only be met by inventing
   * CLEAR for runs whose recorded outcome might have been AGREED.
   */
  band: AssayScore | null;
  /**
   * THE FOUR NUMBERS BELOW ARE DATA AND ARE NOT FOR DISPLAY.
   *
   * They stay on the record because the proof is a record: an auditor with a
   * `proof_id` must be able to recover what was actually compared, months
   * later, and `band` is a lossy reading of it by design. What must not happen
   * is any of them reaching a browser as rendered text -- no float, no
   * percentage, no bar, no gauge. `band` is what the UI renders; these are what
   * the record keeps. See docs/FEATURES.md 4.
   */
  score: number | null;
  margin: number | null;
  tau: number;
  delta: number;
  /** The candidates that were scored. Populated for `held` -- this is the whole point. */
  rivals: Rival[];
}

/**
 * `attr` and `transform` ARE CONSTANTS, and are constants on purpose.
 *
 * Assay has no per-field extraction spec to diff. There is no `attr` column and
 * no `transform` column, because the engine has exactly one way of reading a
 * cell: `clean($el.text())` at src/fingerprint.ts:192 -- the element's text,
 * with runs of whitespace squashed and the ends trimmed. That is what the
 * baseline stores, what `heal.ts` scores candidates on, and what
 * `store/index.ts` writes into `field_runs.ranked[].value`.
 *
 * So these two are not per-run data dressed up as constants; they are the
 * engine's behaviour, stated once, so the rendered before/after reads as an
 * extraction spec rather than as a bare selector string. The selector is the
 * only line in that object that can differ between two runs, and it is the only
 * line this module reads from the store. If a per-field attr or transform is
 * ever added, it becomes a column here and these disappear.
 */
const ENGINE_READ = { attr: 'text', transform: 'trim' } as const;

/**
 * `field_runs.ranked` is jsonb, so it is whatever was written. Narrow it.
 *
 * Its actual shape, from `recordRun` in src/store/index.ts:118, is
 * `{ selector, score, value }[]` -- `selectorFor(r.el)`, the score rounded to
 * four places, and the candidate's text capped at 200 characters, ordered best
 * first. All three are kept.
 *
 * `value` defaults to the empty string and deliberately not to null: the column
 * is written as `(r.fp?.text || '').slice(0, 200)`, so an element that is
 * genuinely there and genuinely empty is stored as `''`. Reading that back as
 * an absence would turn "this candidate holds nothing" into "we do not know
 * what this candidate holds", which are different answers to the question a
 * person is being asked.
 */
function rivalsOf(v: unknown): Rival[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((r) => {
    if (!r || typeof r !== 'object') return [];
    const o = r as Record<string, unknown>;
    return typeof o.selector === 'string' && typeof o.score === 'number'
      ? [{
          selector: o.selector,
          score: o.score,
          value: typeof o.value === 'string' ? o.value : '',
        }]
      : [];
  });
}

/**
 * The gate's own arithmetic, recovered from the list it kept.
 *
 * A SECOND COPY of the four lines in `web/lib/run-flow.ts:gateNumbers`, and
 * knowingly so. That file is `web/lib`, which the browser bundles; this one is
 * engine-side and is imported by the CLI and the MCP server as well as by a
 * screen. Neither can import the other -- src must not reach into web, and web
 * must not pull a Postgres client into a client component -- so the choice was
 * a duplicated subtraction or an edit to a frozen file. The subtraction is
 * `src/heal.ts:236` in both places and it is checked there: the sole-candidate
 * case gets margin 1, not 0, because "nothing to be confused with" is the
 * opposite of a tie and scoring it as one would hold every unambiguous heal.
 */
function gateNumbers(rivals: Rival[]): { score: number; margin: number } | null {
  if (rivals.length === 0) return null;
  const best = rivals[0]!.score;
  return { score: best, margin: rivals.length > 1 ? best - rivals[1]!.score : 1 };
}

// TODO(types): drizzle's `execute` hands back Record<string, unknown> rows, so
// the shape is named here beside the query that produces it rather than derived.
type Row = {
  target_id: string;
  status: string;
  reason: string | null;
  ranked: unknown;
  from_selector: string | null;
  to_selector: string | null;
  reverted: boolean | null;
  baseline_selector: string | null;
  queued: number | null;
};

/**
 * The extraction diff for one field on one run, or null.
 *
 * NULL FOR A CLEAN RUN, and that is the contract rather than a shortcut. A run
 * where the field read cleanly off the baseline moved no selector and wrote no
 * `heal_history` row, so there is no before and no after -- and rendering the
 * baseline against itself, with two identical sides and a "no change" label,
 * would be inventing a diff to fill a slot on a screen. The screen draws
 * nothing instead, which is the honest shape of "nothing happened here".
 *
 * The three decisions, and where each is read from:
 *
 *   healed    a `heal_history` row for this run and field, not reverted. The
 *             gate cleared it, so the selector really did move.
 *   reverted  the same row with `reverted` set. Unheal is a column, never a
 *             delete: a heal that was taken back is a different fact from a
 *             heal that never happened, and the brake reads the difference.
 *   held      no heal row and `field_runs.status = 'quarantined'`. Nothing was
 *             applied and nothing was published. This is the arm the module
 *             exists for, and the only one with rivals to show.
 */
export async function extractorDiff(runId: number, field: string): Promise<ExtractorDiff | null> {
  if (!Number.isInteger(runId) || !field) return null;

  // One query rather than five round trips. `heal_history` is keyed on
  // (run_id, field) and `queue_items` on the cell's proof id, so every join
  // below is on a real edge -- there is no fan-out to collapse and no ORDER BY
  // deciding which of several rows wins.
  const res = await getDb().execute(sql`
    SELECT r.target_id,
           fr.status,
           fr.reason,
           fr.ranked,
           h.from_selector,
           h.to_selector,
           h.reverted,
           fs.baseline_selector,
           q.item_id AS queued
    FROM field_runs fr
    JOIN runs r ON r.run_id = fr.run_id
    LEFT JOIN heal_history h ON h.run_id = fr.run_id AND h.field = fr.field
    LEFT JOIN field_state fs ON fs.target_id = r.target_id AND fs.field = fr.field
    LEFT JOIN queue_items q ON q.proof_id = fr.proof_id
    WHERE fr.run_id = ${runId} AND fr.field = ${field}
    LIMIT 1
  `);
  const row = (res.rows as Row[])[0];
  if (!row) return null;

  const healed = row.to_selector !== null;
  const held = row.status === 'quarantined';
  if (!healed && !held) return null;

  const rivals = rivalsOf(row.ranked);
  const n = gateNumbers(rivals);

  // The thresholds this run was judged under, from the contract in force. A
  // target with no contract gets `DEFAULT_THRESHOLDS`, which `thresholdsFor`
  // returns unchanged -- 0.60 and 0.16, the same two numbers `healGated`
  // defaults to. Imported, never restated: src/contracts/tiers.ts is the one
  // copy, and test/contracts.test.ts reads src/heal.ts to keep it honest.
  const contract = await latestContract(row.target_id);
  const { tau, delta } = thresholdsFor(contract?.parsed, field);

  // Where each side comes from, and why they differ per decision:
  //
  //   healed / reverted -- `heal_history` recorded both ends of the move, so
  //     both are read from it. `from_selector` is nullable: a first heal on a
  //     field whose baseline predates the table has no recorded origin, and a
  //     null there is an unrecorded origin, not an empty selector.
  //
  //   held -- nothing moved, so `before` is the selector STILL in force, which
  //     is `field_state.baseline_selector`. `after` is the best candidate on
  //     the page: the change that would have been applied had the gate allowed
  //     it. That pair is the refused diff, and it is the thing Bright Data's
  //     editor cannot show, because there the refusal never happens.
  const before: Extractor = {
    selector: healed ? row.from_selector : row.baseline_selector,
    ...ENGINE_READ,
  };
  const after: Extractor = {
    selector: healed ? row.to_selector : (rivals[0]?.selector ?? null),
    ...ENGINE_READ,
  };

  return {
    target: row.target_id,
    field,
    run: runId,
    before,
    after,
    decision: healed ? (row.reverted ? 'reverted' : 'healed') : 'held',
    // Read from the recorded reason and mapped, never recomputed from the
    // numbers below. Recomputing would let the word and the decision disagree
    // the day a threshold is edited -- the band would describe a gate that did
    // not run, beside a cell decided by one that did.
    band: assayScore(row.reason),
    // Null on a heal, and not for want of looking: `recordRun` keeps `ranked`
    // only when the run abstained, because the list exists so a later
    // nomination can be scored against the page the gate actually saw. A run
    // that published had nothing to nominate against. So a healed diff carries
    // no score and no margin, and says so with a null rather than with a zero.
    score: n?.score ?? null,
    margin: n?.margin ?? null,
    tau,
    delta,
    rivals,
  };
}
