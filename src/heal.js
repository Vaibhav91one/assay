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
import { fingerprint, candidates } from './fingerprint.js';

// --- comparators ------------------------------------------------------------

/** Normalised Levenshtein similarity in [0,1]. */
export function ned(a, b) {
  if (a === b) return 1;
  if (!a || !b) return 0;
  const m = Math.max(a.length, b.length);
  return m === 0 ? 1 : 1 - distance(a, b) / m;
}

/** Jaccard over two arrays of tokens. */
export function jaccard(a, b) {
  const A = new Set(a || []);
  const B = new Set(b || []);
  if (!A.size && !B.size) return 1;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}

/** Fraction of the original's words that survive in the candidate. */
export function sharedWords(a, b) {
  const A = new Set((a || '').toLowerCase().split(/\W+/).filter(Boolean));
  const B = new Set((b || '').toLowerCase().split(/\W+/).filter(Boolean));
  if (!A.size && !B.size) return 1;
  if (!A.size || !B.size) return 0;
  let hit = 0;
  for (const w of A) if (B.has(w)) hit++;
  return hit / A.size;
}

const exact = (a, b) => (a === b ? 1 : 0);

// --- the weighted property spec --------------------------------------------
// weight, how to read the value off a fingerprint, how to compare two values

const SPEC = [
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

const isEmpty = (v) => v === null || v === undefined || v === '' || (Array.isArray(v) && !v.length);

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
export function score(target, cand, { spec = SPEC } = {}) {
  let hit = 0;
  let total = 0;
  const parts = {};
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
export function rank($, target, { limit = 5, spec = SPEC } = {}) {
  const out = [];
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
export function heal($, target, opts = {}) {
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
export function healGated($, target, { tau = 0.6, delta = 0.16, ...opts } = {}) {
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

  if (best.score <= tau) {
    return { ...base, decision: 'abstain', reason: 'below_tau' };
  }
  if (margin <= delta) {
    // a tie whose candidates agree on the VALUE is not a real ambiguity
    const tied = ranked.filter((r) => best.score - r.score <= delta);
    const values = new Set(tied.map((r) => (r.fp.text || '').trim()));
    if (values.size === 1) {
      return { ...base, decision: 'heal', reason: 'benign_tie' };
    }
    return { ...base, decision: 'abstain', reason: 'thin_margin' };
  }
  return { ...base, decision: 'heal', reason: 'clear_margin' };
}

export { SPEC };
