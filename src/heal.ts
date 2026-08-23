// The plain self-healing algorithm. No gate, no abstain, no probe.
//
// Given a fingerprint captured when the scraper last worked, score every element
// on the changed page and return the best match. This is deliberately the SAME
// contract every existing healer offers (Scrapling, Healenium, COLOR): always
// answer, never refuse. It is the baseline arm of the benchmark -- you cannot
// show that gating helps without first measuring what not gating costs.
//
// Weighted-similarity approach follows Similo (TOSEM) with the GA-optimised
// weights from Kluge & Stocco (EMSE 2026). Two deviations, both deliberate and
// both documented in PLAN.md:
//   - geometry (location 1.7, dimension 1.1) dropped: Cheerio has no layout engine
//   - absent-on-both properties are SKIPPED, not scored as agreement

import { distance } from 'fastest-levenshtein';
import type { CheerioAPI } from 'cheerio';
import { fingerprint, candidates, type Fingerprint } from './fingerprint.js';

// TODO(types): elements are domhandler `Element`s, but fingerprint.ts may not
// import cheerio (see its header) so it hands them back as `any`. Naming the
// type here and `any` there would be a lie in one of the two places.
type El = any;

/** How two property values are compared. Values are heterogeneous by design. */
type Cmp = (a: any, b: any) => number;

/** One row of the weighted property spec: name, weight, reader, comparator. */
export type SpecEntry = [
  name: string,
  weight: number,
  get: (f: Partial<Fingerprint>) => any,
  cmp: Cmp,
];

/** One scored candidate element. */
export interface Ranked {
  score: number;
  fp: Fingerprint;
  parts: Record<string, number>;
  el: El;
}

export interface RankOptions {
  limit?: number;
  spec?: SpecEntry[];
}

/** What the plain healer returns. It always answers -- that is the point of it. */
export interface HealResult {
  element: El;
  fingerprint: Fingerprint;
  score: number;
  parts: Record<string, number>;
  runnerUp: number | null;
  margin: number | null;
  ranked: Ranked[];
}

/** Everything the gate reports when it actually had candidates to weigh. */
interface GateEvidence {
  score: number;
  runnerUp: number | null;
  margin: number;
  tau: number;
  delta: number;
  ranked: Ranked[];
  fingerprint: Fingerprint;
  element: El;
}

/**
 * The gate's answer. Three shapes, not one: `no_candidates` fires before
 * anything has been weighed, so it genuinely has no score, no margin and no
 * element to report. Modelling that as a union rather than a bag of optional
 * numbers is what makes `g.decision === 'heal' && g.fingerprint.text` type-check
 * at the call sites that already write it.
 */
export type HealGateResult =
  | ({ decision: 'heal'; reason: 'benign_tie' | 'clear_margin' } & GateEvidence)
  | ({ decision: 'abstain'; reason: 'below_tau' | 'thin_margin' } & GateEvidence)
  | ({ decision: 'abstain'; reason: 'no_candidates'; tau: number; delta: number } &
      Partial<GateEvidence>);

// --- comparators ------------------------------------------------------------

/** Normalised Levenshtein similarity in [0,1]. */
export function ned(a: string | null | undefined, b: string | null | undefined): number {
  if (a === b) return 1;
  if (!a || !b) return 0;
  const m = Math.max(a.length, b.length);
  return m === 0 ? 1 : 1 - distance(a, b) / m;
}

/** Jaccard over two arrays of tokens. */
export function jaccard(a: readonly string[] | null | undefined, b: readonly string[] | null | undefined): number {
  const A = new Set(a || []);
  const B = new Set(b || []);
  if (!A.size && !B.size) return 1;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}

/** Fraction of the original's words that survive in the candidate. */
export function sharedWords(a: string | null | undefined, b: string | null | undefined): number {
  const A = new Set((a || '').toLowerCase().split(/\W+/).filter(Boolean));
  const B = new Set((b || '').toLowerCase().split(/\W+/).filter(Boolean));
  if (!A.size && !B.size) return 1;
  if (!A.size || !B.size) return 0;
  let hit = 0;
  for (const w of A) if (B.has(w)) hit++;
  return hit / A.size;
}

const exact: Cmp = (a, b) => (a === b ? 1 : 0);

// --- the weighted property spec --------------------------------------------
// weight, how to read the value off a fingerprint, how to compare two values

const SPEC: SpecEntry[] = [
  ['text',          2.7, (f) => f.text,           ned],
  ['name',          2.3, (f) => f.name,           ned],
  ['aria_label',    2.0, (f) => f.aria_label,     ned],
  ['type',          1.9, (f) => f.type,           exact],
  ['neighbor_text', 1.9, (f) => f.neighbor_text,  sharedWords],
  ['id',            1.6, (f) => (f.id_volatile ? null : f.id), ned],
  ['tag',           1.5, (f) => f.tag,            exact],
  ['href',          1.5, (f) => f.href,           ned],
  ['alt',           1.2, (f) => f.alt,            ned],
  ['classes',       0.9, (f) => f.classes_stable, jaccard],
  ['id_xpath',      0.8, (f) => f.id_xpath,       ned],
  ['abs_xpath',     0.3, (f) => f.abs_xpath,      ned],
];

const isEmpty = (v: unknown): boolean => v === null || v === undefined || v === '' || (Array.isArray(v) && !v.length);

/**
 * Similarity of a candidate to the stored fingerprint, in [0,1].
 *
 * The absent-on-both rule is the important line. Awarding points when a property
 * is missing from BOTH sides inflates featureless elements toward the top -- a
 * bare <div> with no id, no classes and no attributes collects free agreement on
 * every one of them. Healenium does exactly this (+40 for no class, +30 for no
 * attributes = 20% of its maximum score before anything is compared) and it is
 * the clearest mechanism for a confident wrong heal in that codebase. Skipping
 * renormalises over the properties that actually carry signal.
 */
// `Partial<Fingerprint>` rather than `Fingerprint`, and not as a concession:
// the absent-on-both rule below means a missing property is a first-class input
// to this function, so a caller weighing two hand-built partial descriptions --
// which is exactly what the selftest does -- is using it as designed.
export function score(
  target: Partial<Fingerprint>,
  cand: Partial<Fingerprint>,
  { spec = SPEC }: { spec?: SpecEntry[] } = {},
): { score: number; weighed: number; parts: Record<string, number> } {
  let hit = 0;
  let total = 0;
  const parts: Record<string, number> = {};
  for (const [name, w, get, cmp] of spec) {
    const a = get(target);
    const b = get(cand);
    if (isEmpty(a) && isEmpty(b)) continue; // <-- absent on both: no numerator, no denominator
    total += w;
    const s = cmp(a, b);
    hit += w * s;
    parts[name] = Number(s.toFixed(3));
  }
  return { score: total ? hit / total : 0, weighed: total, parts };
}

/**
 * Rank every element on the page against a stored fingerprint.
 * Returns candidates sorted best-first. Caller decides what to do with them.
 */
export function rank($: CheerioAPI, target: Fingerprint, { limit = 5, spec = SPEC }: RankOptions = {}): Ranked[] {
  const out: Ranked[] = [];
  for (const el of candidates($)) {
    const fp = fingerprint($, el);
    const { score: s, parts } = score(target, fp, { spec });
    out.push({ score: s, fp, parts, el });
  }
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, limit);
}

/**
 * The plain healer: always returns its best guess.
 *
 * This is what the field ships today. It has no way to say "I do not know", which
 * means its failure rate IS a mismatch rate -- every wrong answer is returned with
 * the same confidence as every right one. Measuring that is the point of having it.
 */
export function heal($: CheerioAPI, target: Fingerprint, opts: RankOptions = {}): HealResult | null {
  const ranked = rank($, target, opts);
  if (!ranked.length) return null;
  const [best, runnerUp] = ranked;
  return {
    element: best.el,
    fingerprint: best.fp,
    score: best.score,
    parts: best.parts,
    // recorded but NOT acted on -- this is what the gate will consume next
    runnerUp: runnerUp ? runnerUp.score : null,
    margin: runnerUp ? best.score - runnerUp.score : null,
    ranked,
  };
}

/**
 * The gated healer. Same ranking, one extra decision.
 *
 *   heal iff  score > tau  AND  margin > delta
 *
 * tau   guards "the right element is gone" -- nothing on the page is good enough.
 * delta guards "two things look equally right" -- a near-tie is not an answer.
 *
 * Neither guard exists in Scrapling (floor only, no margin), Healenium (cap only,
 * no margin) or COLOR (suggests a fix for every broken locator). The margin is the
 * cheap one and it is the one nobody has: comparing the top two candidates costs
 * a subtraction, and it is the only signal that distinguishes "confident" from
 * "least bad".
 *
 * Benign ties are recovered for free: if the tied candidates carry the SAME value,
 * the ambiguity is harmless -- we do not care which node we read it from.
 */
/** What the arithmetic alone can conclude, before a page or a policy is involved. */
export type GateVerdict =
  | { decision: 'heal'; reason: 'benign_tie' | 'clear_margin' }
  | { decision: 'abstain'; reason: 'below_tau' | 'thin_margin' | 'no_candidates' };

/**
 * The gate's arithmetic, with no page attached.
 *
 * SPLIT OUT BECAUSE THERE WAS A SECOND COPY OF IT. `tools/sweep.ts` fits tau
 * and delta by ranking each case once and then replaying ~90 threshold pairs
 * over the stored ranking, which it cannot do by calling `healGated` -- that
 * re-ranks. So it reimplemented these fifteen lines, and the copy drifted:
 * it compared `fp.text`, which the fingerprint truncates at 200 characters,
 * where this function has always compared the FULL element text. On the
 * `duplicate_longtail` mutation -- a decoy identical for 200 characters and
 * divergent after -- the copy saw a benign tie where the gate sees two
 * different values, and published.
 *
 * The consequence was not theoretical. `results/sweep.json` reported 3 wrong
 * values at tau 0.60 / delta 0.16 on the same 153 cases where `npm run bench`,
 * which calls the real gate, reports zero. The sweep was measuring a healer
 * with a known wrong-publish bug and recommending thresholds to compensate for
 * it, which is how it came to recommend tau 0.75.
 *
 * `textAt` is a callback rather than an array so the caller only pays for
 * reading text off the DOM in the branch that needs it, which is the branch
 * this function used to compute inline. The hot path is unchanged, and
 * `results/events.jsonl` staying byte-identical across the extraction is the
 * evidence for that.
 */
export function decide(
  scores: readonly number[],
  textAt: (i: number) => string,
  tau: number,
  delta: number,
): GateVerdict {
  if (!scores.length) return { decision: 'abstain', reason: 'no_candidates' };
  const best = scores[0]!;
  const margin = scores.length > 1 ? best - scores[1]! : 1;

  if (best <= tau) return { decision: 'abstain', reason: 'below_tau' };
  if (margin <= delta) {
    // THE TIE IS THE TOP TWO, because the margin that got us here is the top
    // two. A third candidate inside the delta band was never part of the
    // question being asked, and letting it veto the answer meant one function
    // held two different notions of "tied". See test/benign-tie.test.ts.
    const tied = scores.length > 1 ? [0, 1] : [0];
    // FULL text off the element, not `fp.text` -- the fingerprint truncates at
    // 200 chars, and two candidates identical to char 200 can carry different
    // values after it. Publishing on a prefix match is a wrong-publish path
    // inside the safety mechanism (docs/CRITIQUE.md; pinned by the
    // duplicate_longtail mutation).
    const values = new Set(tied.map(textAt));
    return values.size === 1
      ? { decision: 'heal', reason: 'benign_tie' }
      : { decision: 'abstain', reason: 'thin_margin' };
  }
  return { decision: 'heal', reason: 'clear_margin' };
}

export function healGated(
  $: CheerioAPI,
  target: Fingerprint,
  { tau = 0.6, delta = 0.16, ...opts }: RankOptions & { tau?: number; delta?: number } = {},
): HealGateResult {
  const ranked = rank($, target, opts);
  if (!ranked.length) {
    return { decision: 'abstain', reason: 'no_candidates', tau, delta };
  }
  const [best, runnerUp] = ranked;
  const margin = runnerUp ? best.score - runnerUp.score : 1;
  const base = {
    score: best.score,
    runnerUp: runnerUp ? runnerUp.score : null,
    margin,
    tau,
    delta,
    ranked,
    fingerprint: best.fp,
    element: best.el,
  };

  // One implementation of the arithmetic, shared with `tools/sweep.ts`. The
  // text callback is only invoked in the tie branch, so the common path still
  // reads nothing off the DOM.
  const verdict = decide(
    ranked.map((r) => r.score),
    (i) => $(ranked[i]!.el).text().replace(/\s+/g, ' ').trim(),
    tau,
    delta,
  );
  return { ...base, ...verdict } as HealGateResult;
}

export { SPEC };
