// The tier vocabulary and its numbers. Values only -- this file imports
// nothing at all, and must not start.
//
// WHY IT IS SPLIT OUT OF `./index.ts`, WHICH OWNS THE CONTRACT FORMAT.
//
// The header popover and the schema table DISPLAY these numbers, so the browser
// needs them exactly. `./index.ts` is pure -- zod and yaml, no database, no
// clock -- so importing it into a client component would work, but it would
// pull the whole YAML parser into the bundle to read six constants. They were
// copied into `web/lib/contract-shape.ts` instead, kept honest by a drift test.
//
// One import-free module is the better answer: no second copy, so nothing to
// drift, and nothing heavy to leak into the client. `./index.ts` re-exports
// everything below, so the engine's callers are unaffected.
//
// Displaying these is a disclosure and never a control: FEATURES.md F2 is
// explicit that a user hand-tuning deltas per field is a user the tiers have
// failed.

export const TIERS = ['strict', 'normal', 'loose'] as const;
export type Tier = (typeof TIERS)[number];

/**
 * Three tiers, and the numbers are read off `results/sweep.json` -- the
 * 110-pair calibration -- not chosen for how they look.
 *
 *   tier    tau   delta   correct  wrong        abstained
 *   strict  0.70  0.20    84/135   0  (0.0%)    37.8%
 *   normal  0.60  0.16    93/135   0  (0.0%)    31.1%
 *   loose   0.60  0.12   105/135   6  (4.4%)    17.8%
 *
 * `normal` is the sweep's own `best` entry: the least-abstaining pair on the
 * grid that still reaches zero wrong values, and the pair `healGated` already
 * defaults to. A contract that says nothing gets it, unchanged.
 *
 * `strict` is the cheapest point on the wrong-zero frontier that is strictly
 * more sceptical than `normal`: (0.70, 0.20) and (0.75, 0.25) score
 * identically on the corpus, so the lower pair is taken. Honestly: on THIS
 * corpus strict buys nothing measurable, because normal is already at 0.0%
 * wrong. What it buys is headroom against mutations the corpus does not
 * contain, and the price of that headroom is measured -- 9 fewer correct
 * values and 6.7 more points of abstention. A field marked strict interrupts
 * a human more often, on purpose.
 *
 * `loose` lowers the margin and NOT the floor, which looks asymmetric and is
 * the finding rather than an oversight. Below tau 0.60 the sweep buys 4.5
 * points of abstention and doubles the wrong values (6 -> 12) for it, so the
 * floor stays. tau guards "the right element is gone" -- nothing on the page
 * is good enough -- and prose cannot tolerate grabbing a nav link because the
 * field vanished any more than a price can. delta guards "two things look
 * equally right", and picking either of two near-identical blurbs is exactly
 * the risk a description field is willing to take.
 *
 * Choosing `loose` forfeits the product's 0.0% claim for that field. On the
 * benchmark it publishes a wrong value in 4.4% of breaks. That is the trade,
 * stated in numbers, and it is why the tier is opt-in per field.
 */
export const TIER_THRESHOLDS: Record<Tier, { tau: number; delta: number }> = {
  strict: { tau: 0.70, delta: 0.20 },
  normal: { tau: 0.60, delta: 0.16 },
  loose: { tau: 0.60, delta: 0.12 },
};

export const ON_ABSTAIN = ['quarantine', 'publish_last_good'] as const;
export type OnAbstain = (typeof ON_ABSTAIN)[number];

/** The thresholds in force for one field, after `thresholdsFor` resolves them. */
export interface FieldThresholds {
  policy: Tier;
  tau: number;
  delta: number;
  /** Gated heals scoring at or below this are held anyway. See `AutoApprove`. */
  autoApproveAbove: number;
  onAbstain: OnAbstain;
  /** Where an abstention goes. Null is "nowhere", never a default channel. */
  alert: string | null;
}

/**
 * What a contract that says nothing means: exactly what the engine does today.
 * These two numbers are `healGated`'s own defaults in `src/heal.ts`, repeated
 * here because that file is frozen and cannot export them. `test/contracts.test.ts`
 * reads heal.ts and fails if the two ever drift apart.
 */
export const DEFAULT_THRESHOLDS: FieldThresholds = Object.freeze({
  policy: 'normal',
  tau: 0.60,
  delta: 0.16,
  autoApproveAbove: 0.60,
  onAbstain: 'quarantine',
  alert: null,
});

