// The tier vocabulary and its numbers, in a form the browser can hold.
//
// `src/contracts/index.ts` is the source and is pure -- zod and yaml, no
// database, no clock -- so importing it here would work. It is repeated instead
// because pulling `yaml` into the client bundle to read six constants is a poor
// trade, and because the header popover only ever DISPLAYS these.
//
// The repetition is checked, not trusted: `test/chat-surface.test.ts` imports
// both this file and `src/contracts/index.ts` and fails if any number disagrees.
// That is the same guard `test/contracts.test.ts` already uses to keep
// DEFAULT_THRESHOLDS pinned to `src/heal.ts`.
//
// These numbers are read off `results/sweep.json`, the 110-pair calibration, and
// are not chosen for how they look. Displaying them is a disclosure and never a
// control: FEATURES.md F2 is explicit that a user hand-tuning deltas per field
// is a user the tiers have failed.

export const TIERS = ['strict', 'normal', 'loose'] as const;
export type Tier = (typeof TIERS)[number];

export const TIER_THRESHOLDS: Record<Tier, { tau: number; delta: number }> = {
  strict: { tau: 0.70, delta: 0.20 },
  normal: { tau: 0.60, delta: 0.16 },
  loose: { tau: 0.60, delta: 0.12 },
};

/**
 * The gate's held codes, in plain English.
 *
 * Repeated from `HELD_BECAUSE` in `src/reports/vocabulary.ts`, which reaches the
 * store and cannot come to the browser. The same test asserts the two agree.
 *
 * A code with NO wording here must never be given an invented one -- the lookup
 * misses and the renderer prints the code as a code, marked as untranslated.
 * docs/APP-DESIGN.md 5b rule 5: a reason code never reaches the user raw, and an
 * incident record whose whole value is that it does not fabricate cannot start
 * by fabricating an adjective.
 */
export const HELD_BECAUSE: Record<string, string> = {
  thin_margin: 'two candidates on the page were too close to call',
  below_tau: 'nothing on the page looked enough like this field to be a candidate',
  no_candidates: 'the element is gone and nothing took its place',
};

/** What a contract that says nothing means: exactly what the engine does today. */
export const DEFAULT_THRESHOLDS = {
  policy: 'normal' as Tier,
  tau: 0.60,
  delta: 0.16,
  autoApproveAbove: 0.60,
  onAbstain: 'quarantine' as 'quarantine' | 'publish_last_good',
} as const;
