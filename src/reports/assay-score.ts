// The Assay score: a word, not a number.
//
// This partially overturns the anti-feature in docs/FEATURES.md 4, and it is
// worth being exact about which part. What that section refuses is a
// CONFIDENCE PERCENTAGE -- a float on a cell, which relocates the abstain
// decision to whoever cares least about it, because 0.74 invites a person to
// decide what 0.74 is worth and the whole product is the claim that they should
// not have to. A closed set of five words does not do that. There is nothing to
// tune, nothing to compare across fields, and no threshold a reader can talk
// themselves past.
//
// The band is a BIJECTION over `healGated()`'s five outcomes in src/heal.ts.
// Not a summary of them, not a bucketing of the score: one word per outcome,
// both directions, so nothing is invented and nothing is collapsed. That is
// what makes it safe to show where a number was refused -- it carries exactly
// the information the gate already recorded, in a form that cannot be treated
// as a dial.
//
// Zero imports, and it must stay that way. The browser renders these words, the
// docs page renders them, and `src/reports/` renders them; one import-free
// module is what keeps that from becoming three copies free to drift. Same rule
// as `src/contracts/tiers.ts` and `src/reports/vocabulary.ts`, for the same
// reason.

export const ASSAY_SCORES = ['CLEAR', 'AGREED', 'THIN', 'WEAK', 'GONE'] as const;
export type AssayScore = (typeof ASSAY_SCORES)[number];

/**
 * The five outcomes `healGated()` can return, and the word for each.
 *
 * Read in the order the gate reaches them: it heals on a clear margin or on a
 * tie whose candidates agree, and abstains when the margin is thin, when
 * nothing clears tau, or when there was nothing to weigh at all.
 *
 *   clear_margin   CLEAR   one candidate, well clear of the rest
 *   benign_tie     AGREED  candidates tied, and they carry the same value
 *   thin_margin    THIN    candidates too close, and they disagreed
 *   below_tau      WEAK    nothing on the page matched well enough
 *   no_candidates  GONE    nothing to compare against at all
 *
 * THIN AND AGREED ARE THE PAIR THAT MATTERS, and the reason the band is not
 * just "did it heal". Both are ties. The gate publishes one and refuses the
 * other, and the only thing separating them is whether the tied candidates
 * carried the same value -- which is `src/heal.ts`'s benign-tie rule, and the
 * single most useful thing this vocabulary can tell a person. A band that
 * folded them together would throw away the distinction the engine was built
 * to make.
 */
export const ASSAY_SCORE: Record<string, AssayScore> = {
  clear_margin: 'CLEAR',
  benign_tie: 'AGREED',
  thin_margin: 'THIN',
  below_tau: 'WEAK',
  no_candidates: 'GONE',
};

/** One line per band, for any surface that shows one. Never a second copy. */
export const ASSAY_SCORE_MEANS: Record<AssayScore, string> = {
  CLEAR: 'one candidate, well clear of the rest',
  AGREED: 'the candidates tied, and they carried the same value',
  THIN: 'the candidates were too close to separate, and they disagreed',
  WEAK: 'nothing on the page matched well enough',
  GONE: 'there was nothing on the page to compare against',
};

/** Where a reader goes to find out what a band means. One copy of the path. */
export const ASSAY_SCORE_DOC = '/docs/assay-score';

/**
 * The band for a recorded gate reason, or null.
 *
 * NULL IS A REAL ANSWER HERE AND NOT A FALLBACK, which is the finding this
 * function exists to make visible rather than paper over. Two things return it:
 *
 *   1. A POLICY REASON. `src/runner.ts` writes `brake:<...>` or
 *      `auto_approve_floor:<n>` into the same column when something withheld a
 *      heal the GATE ITSELF ALLOWED. Those are not gate outcomes and have no
 *      band -- mapping them to WEAK or THIN would tell an operator to go and
 *      tune a threshold that had nothing to do with it, which is precisely the
 *      confusion the runner splits the two facts apart to avoid.
 *
 *   2. A HEALED CELL, which is the big one. `src/runner.ts:263` returns
 *      `{ status: 'healed' }` with NO reason, so `recordRun` writes
 *      `field_runs.reason = null` on every run that published. The gate's own
 *      word for it -- `clear_margin` or `benign_tie` -- is written to the proof
 *      EVENT and the event is not persisted to the store. So CLEAR and AGREED
 *      are computable at run time and are NOT recoverable per cell afterwards.
 *
 * The second one is a gap in the store, not in this table, and it is not closed
 * by guessing. Returning CLEAR for every healed cell would be right roughly as
 * often as heals are unambiguous and silently wrong the rest of the time -- and
 * AGREED, the case it would erase, is exactly the interesting one. Closing it
 * properly is one field on the healed status in `src/runner.ts`, which is
 * frozen; it is named in the handover instead.
 */
export function assayScore(reason: string | null | undefined): AssayScore | null {
  return reason ? ASSAY_SCORE[reason] ?? null : null;
}
