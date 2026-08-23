// The Assay Score: the gate's decision, as one word.
//
// docs/FEATURES.md §4 refuses "a confidence percentage on every cell", on three
// grounds, and every one of them is about a FLOAT:
//
//   1. a float invites every downstream team to pick its own threshold, which
//      relocates the abstain decision to whoever cares least about it;
//   2. 0.94 on everything trains people to ignore the column;
//   3. the gate already made the decision, and exporting the raw score asks the
//      user to make it again with less information.
//
// A band answers all three and is therefore not the thing that was refused.
// It is a word from a closed set of seven, so there is nothing to re-threshold
// (1); it is only ever drawn where the gate reached a decision worth reading,
// not on every cell (2); and it NAMES the decision rather than handing back the
// evidence for it (3). The refusal stands in full for the float: no score, no
// percentage, no bar, no gauge, no ring, and nothing added to the published
// envelope or the proof record. See docs/FEATURES.md §4, amended 2026-08-23.
//
// THE BAND IS READ OFF THE STORED REASON AND NEVER RECOMPUTED. `field_runs.reason`
// is what `src/runner.ts` decided -- the gate's own reason, or the policy that
// overrode it -- and a band derived from the score and the thresholds instead
// would be a second thing that can be wrong. The screens that used to print
// `score` against `tau` did exactly that: they re-ran the arithmetic to work out
// which test failed, which is fine right up until a contract is edited and the
// sentence disagrees with the row it is printed on.
//
// Imports nothing, deliberately. It is read by the CLI-side reports and by
// `web/components/assay-score.tsx` through the `assay/engine/*` specifier, and a
// module with no dependencies can be imported by both without either one
// pulling the other's world in behind it.

/**
 * The seven words. A closed set, like `FieldStatus` in `src/envelope.ts`.
 *
 * Five come from the gate (`healGated` in src/heal.ts returns exactly those
 * five reasons) and two from a policy that overrode a heal the gate allowed
 * (src/runner.ts:230-240). The split matters to the reader: a THIN cell is the
 * arithmetic refusing, and a POLICY cell is the contract refusing something the
 * arithmetic was happy with. Telling them apart is the whole reason
 * `field_runs.reason` stores the override rather than the gate's verdict.
 */
export type Band = 'CLEAR' | 'AGREED' | 'THIN' | 'WEAK' | 'GONE' | 'POLICY' | 'BRAKED';

/**
 * Exact reason codes, mapped one to one.
 *
 * `auto_approve_floor:<n>` carries the floor it tripped and so cannot be a key
 * here; it is matched by prefix in `bandFor`. `brake_engaged` is the exact
 * string `healBlockFor` in src/connectors/ingest.ts:91 passes as `healBlock`
 * when `shouldHeal` says no -- checked against the caller, not guessed.
 */
const BANDS: Readonly<Record<string, Band>> = {
  clear_margin: 'CLEAR',
  benign_tie: 'AGREED',
  thin_margin: 'THIN',
  below_tau: 'WEAK',
  no_candidates: 'GONE',
  brake_engaged: 'BRAKED',
};

/** The one prefix reason: `auto_approve_floor:0.9`, from src/runner.ts:236. */
const FLOOR = 'auto_approve_floor:';

/**
 * The band for a stored `field_runs.reason`, or null.
 *
 * NULL IS A REAL ANSWER AND THE UI MUST DRAW NOTHING FOR IT. Three different
 * facts arrive here as null, and none of them may be given a word:
 *
 *   * A REASON THIS TABLE DOES NOT KNOW. A new reason code added to the engine
 *     reaches this function before anyone updates the table, and the failure
 *     mode of a `?? 'THIN'` fallback is a screen confidently telling an
 *     operator two candidates were too close when something else entirely
 *     happened. `src/reports/vocabulary.ts` already draws this line for
 *     `HELD_BECAUSE` and draws it the same way: a code with no wording prints
 *     AS a code, never as an invented adjective.
 *
 *   * `brake_unreadable:<message>` -- ingest.ts:97, the fail-closed branch when
 *     the brake table cannot be READ. It is deliberately NOT BRAKED. A brake
 *     that could not be read is not a brake that is set: nobody may have
 *     stopped this field, and telling the operator one did would send them to
 *     clear a brake that does not exist while the actual fault -- an
 *     unreachable database -- goes unnamed. The raw code still prints in the
 *     reason column, which is where an operator can act on it.
 *
 *   * NO REASON AT ALL. A published heal writes none: `src/runner.ts:263` gives
 *     the status `{ status: 'healed' }` with no reason field, so `clear_margin`
 *     and `benign_tie` live on the proof record and never reach `field_runs`.
 *     CLEAR and AGREED are in the table because they are the gate's own words
 *     and because `assay_propose` speaks them (src/ai/index.ts:248-251) -- so
 *     the day a heal reason is persisted, the band is already correct. Until
 *     then a healed cell shows the diff and no band, which is the honest shape
 *     of "nothing recorded which of the two heals this was".
 */
export function bandFor(reason: string | null | undefined): Band | null {
  if (!reason) return null;
  if (reason.startsWith(FLOOR)) return 'POLICY';
  return BANDS[reason] ?? null;
}

/**
 * What each word means, in one sentence, for a reader who has never seen it.
 *
 * HERE AND NOT IN THE COMPONENTS, and not in `web/lib/copy.ts` either. The docs
 * page at `/docs/assay-score` is the whole justification for showing a word
 * instead of a number -- the promise is that the curious can go and read the
 * arithmetic -- so the page and the badge have to say the same thing about the
 * same word. Two catalogues would drift, and the drift would land on the one
 * surface whose entire job is to be checkable.
 *
 * No sentence quotes a number, a threshold or a percentage. That is the point.
 */
export const BAND_MEANS: Readonly<Record<Band, string>> = {
  CLEAR: 'One candidate matched, and it was well clear of everything else on the page.',
  AGREED: 'The best candidates were too close to separate, but they all carried the same value, so which one it was read from does not matter.',
  THIN: 'The best candidates were too close to separate and they carried different values, so nothing was published.',
  WEAK: 'Nothing on the page matched this field well enough to be a candidate, so nothing was published.',
  GONE: 'There was nothing on the page to compare against at all, so nothing was published.',
  POLICY: 'The gate would have published this; the field contract asks a person to look first, so nothing was published yet.',
  BRAKED: 'Healing is stopped on this field by an operator, so nothing was published.',
};

/**
 * Where the arithmetic lives. Every band rendered anywhere links here.
 *
 * A constant rather than a literal in each component: the promise that a word
 * can always be turned back into a number is only kept if the link is on every
 * band, and one string is how that stays true when a fourth surface is added.
 */
export const ASSAY_SCORE_DOC = '/docs/assay-score';
