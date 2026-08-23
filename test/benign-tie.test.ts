// The tie the gate compares, and the one it used to consult.
//
// `healGated` reaches its ambiguity branch on `margin <= delta`, and `margin`
// is `best.score - runnerUp.score` -- the top two, and nothing else. The branch
// then asks whether the tie is benign, meaning the tied candidates carry the
// same value, in which case it does not matter which node the value is read
// from.
//
// It used to ask that question of a DIFFERENT set: every candidate within delta
// of the best. So a third candidate that was never part of the margin could
// veto an answer about the top two, and the gate abstained. One function, two
// notions of "tied".
//
// This file pins both halves of the fix, and the second test is the one that
// matters -- a change that only ever heals more is not a fix, it is a
// regression with a nice name.
//
//   1. top two agree, a third inside the band disagrees  -> heal (was abstain)
//   2. top two themselves disagree                        -> abstain (unchanged)
//
// Test 1 fails on the previous implementation. That is the point of it: it was
// written by reverting the one line, watching it go red, and putting the line
// back. A test that passes either way would be evidence of nothing.
//
// The corpus does not exercise this path at all: `npm run bench` (153 cases),
// `npm run replay` (74 runs) and `results/events.jsonl` are byte-identical
// across the change. The only observed instances are `wrapper_div` and
// `combo_redesign` in `results/headtohead.jsonl`, which is why the shapes below
// are built by hand rather than drawn from a fixture.

import { load } from 'cheerio';
import { describe, expect, it } from 'vitest';
import { fingerprintSelector } from '../src/fingerprint.js';
import { healGated, rank } from '../src/heal.js';

/**
 * One card per value, wrapped the way `wrapper_div` wraps them.
 *
 * The shape matters and it took measuring to get right. Two cards is not
 * enough: with identical text the only other candidates are the wrapper divs,
 * which score 0.55 against the target's 0.99 and fall far outside the delta
 * band -- so the tied set is the top two either way and the old code heals too.
 * A test built on that page passes on both implementations and is worth
 * nothing.
 *
 * Three cards, two agreeing and one near-identical decoy, is the smallest page
 * that separates them. Measured with `rank(limit: 6)`:
 *
 *   0.9910  "£51.77"   <- best
 *   0.9910  "£51.77"   <- runner-up, margin 0.0000, so the thin branch is taken
 *   0.9076  "£51.78"   <- inside the delta band, and it disagrees
 *   0.5512  "£51.77"   <- the wrapper divs, far outside
 *
 * Old tied set: all three above the band edge -> two distinct values -> abstain.
 * New tied set: the top two -> one value -> heal.
 */
const card = (text: string) =>
  `<div class="card"><div class="wrap"><p class="value">${text}</p></div></div>`;

const page = (...values: string[]) =>
  `<html><body><main>${values.map(card).join('')}</main></body></html>`;

/** The element being watched, fingerprinted before the page moved. */
const baseline = () => {
  const $ = load('<html><body><main><div class="card"><p class="value">£51.77</p></div></main></body></html>');
  const fp = fingerprintSelector($, 'p.value');
  if (!fp) throw new Error('the baseline selector did not resolve');
  return fp;
};

describe('benign_tie consults the two candidates the margin compared', () => {
  it('heals when the top two agree, even with a third inside the band that does not', () => {
    const $ = load(page('£51.77', '£51.77', '£51.78'));
    const target = baseline();

    // The premise is guarded rather than assumed. Every one of these held on
    // the old implementation too -- what changed is only which of them the
    // benign-tie question is asked about. If a scorer change ever moves the
    // decoy out of the band, this test would start passing for the wrong
    // reason, and these three assertions are what would catch that.
    const ranked = rank($, target, { limit: 6 });
    const margin = ranked[0]!.score - ranked[1]!.score;
    expect(margin).toBeLessThanOrEqual(0.16);

    const band = ranked.filter((r) => ranked[0]!.score - r.score <= 0.16);
    expect(band.length).toBeGreaterThan(2);
    expect(new Set(band.map((r) => $(r.el).text().trim())).size).toBe(2);

    const g = healGated($, target, { limit: 6 });
    expect(g.decision).toBe('heal');
    expect(g.reason).toBe('benign_tie');
  });

  it('still abstains when the top two themselves disagree', () => {
    // `duplicate_similar` is this shape, and it is one of the two head-to-head
    // variants where abstaining was CORRECT. It must survive the change: this
    // is the wrong-publish path the branch exists to close, and the near
    // identical decoy is the case the delta guard was added for.
    const $ = load(page('£51.77', '£51.78'));
    const target = baseline();

    const ranked = rank($, target, { limit: 6 });
    expect(ranked[0]!.score - ranked[1]!.score).toBeLessThanOrEqual(0.16);

    const g = healGated($, target, { limit: 6 });
    if (g.decision === 'heal') {
      // Publishing one of two disagreeing prices is exactly the failure this
      // project measures. Fail loudly, and name the value it was about to ship.
      throw new Error(
        `expected abstain; healed with reason "${g.reason}" on ${JSON.stringify($(ranked[0]!.el).text().trim())}`,
      );
    }
    expect(g.reason).toBe('thin_margin');
  });
});
