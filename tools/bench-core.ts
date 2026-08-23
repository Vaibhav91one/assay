// THE ONE IMPLEMENTATION of the mutation loop, the arms and the scoring.
//
// There are two benchmarks over this now. `tools/bench.ts` grades the frozen
// Wayback corpus -- 153 cases, reproducible forever, and the headline number.
// `tools/bench-live.ts` grades the same three sites fetched today through Bright
// Data. They differ in exactly one thing: where the HTML comes from. So that is
// the only thing either of them is allowed to own, and everything below this
// line is shared by construction rather than by agreement.
//
// This file exists because of a specific bug. `tools/sweep.ts` used to hold its
// own hand-copy of the gate's arithmetic. The copy drifted, and the sweep began
// reporting 3 wrong values at the shipped thresholds where bench reported zero
// -- it was grading a healer that does not exist. The fix (commit 0efaa3c) was
// to extract `decide()` in `src/heal.ts` so there was one implementation. A
// second live benchmark that re-typed this loop would have re-opened the same
// hole one level up: a second copy that agrees today is a second copy that
// disagrees next month, and the disagreement is discovered by a reader who
// trusts the wrong one.

import { load } from 'cheerio';
import { fingerprint, candidates } from '../src/fingerprint.js';
import { heal, healGated } from '../src/heal.js';
import { MUTATIONS, markTarget, TRUTH_ATTR } from '../src/mutate.js';
import { pickTarget } from '../src/target.js';

/** One page, already read. `capture` labels it in the event log and in errors. */
export interface Capture {
  site: string;
  capture: string;
  html: string;
}

/** One arm's running score. Two notions of correct -- see `tally` below. */
export interface Tally {
  correct: number;
  wrong: number;
  value_ok: number;
  value_wrong: number;
  abstain_right: number;
  abstain_wrong: number;
  n: number;
}

export interface MutationTally {
  label: string;
  expect: string;
  plain: Tally;
  gated: Tally;
}

export interface BenchResult {
  arms: { naive: Tally; plain: Tally; gated: Tally };
  byMutation: Record<string, MutationTally>;
  events: unknown[];
}

export const blank = (): Tally => ({ correct: 0, wrong: 0, value_ok: 0, value_wrong: 0,
  abstain_right: 0, abstain_wrong: 0, n: 0 });

/** Naive baseline: first element sharing the original tag. What a beginner writes. */
function healNaive($: any, target: any) {
  for (const el of candidates($)) {
    if (el.name === target.tag) return { element: el };
  }
  return null;
}

/**
 * Two notions of correct, and the difference matters.
 *
 *   exact  -- did we return THE node we fingerprinted?   (test-automation metric)
 *   value  -- did we return the right STRING?            (scraping metric)
 *
 * They diverge when the scorer picks a parent or child of the true node, which
 * carries identical text. Similo's own M1 metric quietly counts that as a match
 * and M4 does not; for a scraper it genuinely IS a match, because the extracted
 * value is the same. We report BOTH rather than picking the flattering one.
 */
function tally(
  bucket: Tally,
  expect: string,
  decision: string,
  chose: unknown,
  valueMatch: unknown,
) {
  bucket.n++;
  if (decision === 'abstain') {
    if (expect === 'none') bucket.abstain_right++;
    else bucket.abstain_wrong++;
    return;
  }
  if (expect === 'none') { bucket.wrong++; bucket.value_wrong++; return; }
  if (chose) bucket.correct++; else bucket.wrong++;
  if (valueMatch) bucket.value_ok++; else bucket.value_wrong++;
}

export const pct = (x: number, n: number): string => (n ? ((x / n) * 100).toFixed(1) + '%' : '-');

/**
 * Every mutation, every arm, over the captures handed in. Callers supply the
 * pages and nothing else; the grading is not theirs to vary.
 */
export function grade(captures: Capture[], opts: { tau: number; delta: number }): BenchResult {
  const arms = { naive: blank(), plain: blank(), gated: blank() };
  const byMutation: Record<string, MutationTally> = {};
  const events: unknown[] = [];

  // Reloading from the source string per mutation is what keeps mutations from
  // compounding: each arm sees the original page with exactly one change.
  const fresh = (html: string) => {
    const $ = load(html);
    $('script,style,noscript').remove();
    return $;
  };

  for (const { site, capture, html } of captures) {
    const $clean = fresh(html);
    const targetEl = pickTarget($clean);
    if (!targetEl) continue;
    const target = fingerprint($clean, targetEl);

    for (const mut of MUTATIONS) {
      const $m = fresh(html);
      const el = pickTarget($m);
      if (!el) continue;
      markTarget($m, el);
      let applied = false;
      try {
        applied = mut.apply($m, el);
      } catch {
        applied = false;
      }
      if (applied === false) continue;

      // Read ground truth AFTER mutating. For translate_text the page is
      // rewritten, so the correct value is the translated string -- comparing
      // against the pre-mutation text would score every correct heal as wrong.
      // The marked node is re-found because swap_tag replaces the element.
      const truthEl = $m(`[${TRUTH_ATTR}]`).get(0) || null;
      const truthText = truthEl ? $m(truthEl).text().replace(/\s+/g, ' ').trim() : null;

      // Strip the truth marker BEFORE any arm sees the page. The scorer never
      // reads it, but a future model arm reads raw HTML -- an answer key
      // visible in the input is contamination (docs/CRITIQUE.md). Identity
      // survives as a node reference; the canary fails the bench loudly if
      // the attribute ever leaks back into arm input.
      if (truthEl) $m(truthEl).removeAttr(TRUTH_ATTR);
      if ($m.html().includes(TRUTH_ATTR)) {
        throw new Error(`canary: ${TRUTH_ATTR} leaked into arm input (${site}/${capture} ${mut.id})`);
      }
      const isTruth = (el2: any) => !!el2 && el2 === truthEl;

      byMutation[mut.id] ||= { label: mut.label, expect: mut.expect, plain: blank(), gated: blank() };

      // --- naive
      const sameValue = (el2: any) =>
        el2 && $m(el2).text().replace(/\s+/g, ' ').trim() === truthText;

      const n = healNaive($m, target);
      tally(arms.naive, mut.expect, n ? 'heal' : 'abstain',
        n && isTruth(n.element), n && sameValue(n.element));

      // --- plain (always answers)
      const p = heal($m, target, { limit: 3 });
      const pOk = p && isTruth(p.element);
      const pVal = p && sameValue(p.element);
      tally(arms.plain, mut.expect, p ? 'heal' : 'abstain', pOk, pVal);
      tally(byMutation[mut.id]!.plain, mut.expect, p ? 'heal' : 'abstain', pOk, pVal);

      // --- gated
      const g = healGated($m, target, { tau: opts.tau, delta: opts.delta, limit: 3 });
      const gOk = g.decision === 'heal' && isTruth(g.element);
      const gVal = g.decision === 'heal' && sameValue(g.element);
      tally(arms.gated, mut.expect, g.decision, gOk, gVal);
      tally(byMutation[mut.id]!.gated, mut.expect, g.decision, gOk, gVal);

      events.push({
        site, capture, mutation: mut.id, expect: mut.expect,
        plain: { correct: !!pOk, score: p ? Number(p.score.toFixed(4)) : null,
                 margin: p && p.margin !== null ? Number(p.margin.toFixed(4)) : null },
        gated: { decision: g.decision, reason: g.reason, correct: gOk,
                 score: g.score ? Number(g.score.toFixed(4)) : null,
                 margin: g.margin !== undefined && g.margin !== null ? Number(g.margin.toFixed(4)) : null },
      });
    }
  }

  return { arms, byMutation, events };
}

/**
 * The report. Shared for the same reason the scoring is: two benchmarks whose
 * tables are laid out differently are two benchmarks a reader compares wrongly.
 * `head` is the only part a caller writes, because it is the only part that
 * describes where the pages came from.
 */
export function report(result: BenchResult, head: string[], opts: { tau: number; delta: number }): void {
  const { arms, byMutation } = result;
  const line = '-'.repeat(84);
  for (const h of head) console.log(h);
  console.log(`tau ${opts.tau}   delta ${opts.delta}\n`);

  console.log(line);
  console.log(
    'arm'.padEnd(28) + 'n'.padStart(5) + 'exact'.padStart(9) +
    'VALUE OK'.padStart(11) + 'VALUE WRONG'.padStart(13) + 'abstained'.padStart(12)
  );
  console.log(line);
  for (const [name, a] of Object.entries(arms)) {
    const label = { naive: 'naive (first tag match)', plain: 'similarity, no gate',
      gated: `margin gate (t${opts.tau}/d${opts.delta})` }[name];
    console.log(
      label!.padEnd(28) + String(a.n).padStart(5) +
      pct(a.correct, a.n).padStart(9) +
      pct(a.value_ok, a.n).padStart(11) +
      pct(a.value_wrong, a.n).padStart(13) +
      pct(a.abstain_right + a.abstain_wrong, a.n).padStart(12)
    );
  }
  console.log(line);
  console.log('\nVALUE WRONG = returned a confidently incorrect VALUE. This is the number');
  console.log('nobody in the field publishes, and it is the whole point of the project.');
  console.log('exact = returned the identical node. Lower than VALUE OK because picking a');
  console.log('parent or child with the same text is a scraping success, not a failure.\n');

  console.log(line);
  console.log('per mutation'.padEnd(38) + 'plain V-WRONG'.padStart(14) + 'gated V-WRONG'.padStart(14) + 'gated abstain'.padStart(16));
  console.log(line);
  for (const m of Object.values(byMutation)) {
    const tag = m.expect === 'none' ? ' [tau]' : m.expect === 'ambiguous' ? ' [delta]' : '';
    console.log(
      (m.label + tag).padEnd(38) +
      pct(m.plain.value_wrong, m.plain.n).padStart(14) +
      pct(m.gated.value_wrong, m.gated.n).padStart(14) +
      pct(m.gated.abstain_right + m.gated.abstain_wrong, m.gated.n).padStart(16)
    );
  }
  console.log(line);
}
