// Feature H -- model judgement as a second source of candidates.
//
// The rule this file exists to obey (docs/AI-AND-AGENTS.md 1): the model
// proposes, it never decides. `src/heal.ts` is frozen and untouched; its
// weighted similarity remains the only thing that scores an element. Nothing
// here returns a string that came out of a model.
//
// Every export degrades when ANTHROPIC_API_KEY is absent. Where a non-AI
// behaviour exists it is used and LABELLED, so a caller can tell a model's
// judgement from a string match instead of assuming. Where none exists the
// answer is null. An absence is an absence, not a zero.

import type { CheerioAPI } from 'cheerio';
import { fingerprint, candidates, type Fingerprint } from '../fingerprint.js';
import { sharedWords } from '../heal.js';
import { ask, digest, hasKey, Shapes } from './model.js';

export { hasKey, DISALLOWED_TOOLS, BASE_TOOLS, Shapes } from './model.js';

// TODO(types): elements are domhandler `Element`s, which `fingerprint.ts`
// deliberately hands back untyped (see its header). Same compromise as heal.ts.
type El = any;

const clean = (s: string | null | undefined): string => (s || '').replace(/\s+/g, ' ').trim();

// --- field inference ---------------------------------------------------------

export interface InferredField {
  name: string;
  /** A word from a closed set. Never a percentage -- FEATURES.md 4. */
  confidence: 'high' | 'medium' | 'low';
  element: El;
  fingerprint: Fingerprint;
  /** The reference. What the model actually chose. */
  ref: string;
  /** Read from the DOM at this reference. The model did not produce it. */
  value: string | null;
}

/**
 * Elements that could plausibly BE a field: they carry their own short text and
 * no child carries the same text, which would make this a wrapper.
 */
function leafTextElements($: CheerioAPI, limit: number): { el: El; fp: Fingerprint }[] {
  const out: { el: El; fp: Fingerprint }[] = [];
  for (const el of candidates($)) {
    const t = clean($(el).text());
    if (t.length < 2 || t.length > 200) continue;
    if ($(el).children().toArray().some((k) => clean($(k as El).text()) === t)) continue;
    out.push({ el, fp: fingerprint($, el) });
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Which elements on this page are the fields worth watching?
 *
 * Returns null with no key: there is no non-AI field inference to fall back to,
 * and inventing one would be a fabricated answer wearing a fallback's clothes.
 *
 * Feeds F2 via docs/AI-AND-AGENTS.md 4 -- the agent drafts a field set, a human
 * signs it, and no scraper is built until they do. Being wrong here is cheap
 * precisely because nothing has been scraped yet.
 */
export async function inferFields(
  $: CheerioAPI,
  { limit = 60, abort }: { limit?: number; abort?: AbortController } = {},
): Promise<{ source: 'model'; fields: InferredField[] } | null> {
  if (!hasKey()) return null;

  const pool = leafTextElements($, limit);
  if (!pool.length) return { source: 'model', fields: [] };

  const reply = await ask(
    Shapes.fields,
    'Which of these page elements are the data fields worth watching over time '
      + '(prices, titles, hazards, dates, identifiers)? Skip navigation, boilerplate '
      + 'and legal text. Give each a short snake_case name.\n\n'
      + digest(pool.map((p) => p.fp)),
    { abort },
  );
  if (!reply) return null;

  const fields: InferredField[] = [];
  const taken = new Set<number>();
  for (const f of reply.fields) {
    const hit = pool[f.index];
    // Out of range or repeated is DROPPED, not clamped. Clamping would silently
    // reassign a field to whatever element happened to sit at the edge.
    if (!hit || taken.has(f.index)) continue;
    taken.add(f.index);
    fields.push({
      name: f.name,
      confidence: f.confidence,
      element: hit.el,
      fingerprint: hit.fp,
      ref: hit.fp.abs_xpath,
      value: clean($(hit.el).text()) || null,
    });
  }
  return { source: 'model', fields };
}

// --- the second opinion ------------------------------------------------------

export interface ModelPick {
  /** null is a real answer: "none of these is the field". */
  index: number | null;
  confidence: 'high' | 'medium' | 'low';
}

/**
 * Ask the model where one field went, over a candidate list somebody else built.
 *
 * Takes the LIST, not a page, so it can be run against the ranked list persisted
 * at abstain time. Re-fetching would score a different page and be silently
 * wrong (CRITIQUE 2.4, and the reason `field_runs.ranked` is a stored column).
 *
 * Returns null when there is no opinion to be had. A caller must not read that
 * as "the model says none".
 */
export async function pickElement(
  target: Pick<Fingerprint, 'tag' | 'text' | 'neighbor_text'>,
  pool: readonly { tag?: string | null; text?: string | null; neighbor_text?: string | null }[],
  { abort }: { abort?: AbortController } = {},
): Promise<ModelPick | null> {
  if (!hasKey() || !pool.length) return null;

  const reply = await ask(
    Shapes.pick,
    'A scraper used to read a field described as:\n'
      + `  tag: ${target.tag}\n`
      + `  text was: ${(target.text || '').slice(0, 160)}\n`
      + `  nearby was: ${(target.neighbor_text || '').slice(0, 120)}\n\n`
      + 'The page changed. Which element below is that same field now? '
      + `Answer null if none of them is.\n\n${digest(pool)}`,
    { abort },
  );
  if (!reply) return null;
  // An index past the end is no opinion, not a guess at the nearest one.
  if (reply.index !== null && !pool[reply.index]) return null;
  return reply;
}

// --- nomination scoring ------------------------------------------------------

/**
 * One entry of the ranked list persisted at abstain time.
 * Shape written by `src/store/index.ts`: selector, score, value.
 */
export interface RankedCandidate {
  selector: string | null;
  score: number;
  value?: string | null;
}

export type NominationReason =
  | 'clear_margin'
  | 'benign_tie'
  | 'below_tau'
  | 'thin_margin'
  | 'not_top_candidate'
  | 'method_disagreement'
  | 'no_such_candidate';

export interface NominationScore {
  /**
   * ALWAYS null. `assay_propose` records a nomination and holds; this function
   * is the scoring it holds against, and it must never be the thing that turns
   * a nomination into a publish. The field exists so that is visible at every
   * call site rather than being a property of the documentation.
   */
  decision: null;
  verdict: 'clears_gate' | 'still_holding';
  reason: NominationReason;
  nominated: { index: number; selector: string | null; score: number } | null;
  scorer: { index: number; selector: string | null; score: number } | null;
  agreement: 'corroborates' | 'disagrees' | 'unscored';
  margin: number | null;
  tau: number;
  delta: number;
}

/**
 * Score a nomination against the persisted ranked list. IT DOES NOT DECIDE.
 *
 * The hook `src/mcp/tools/core.ts` (`assay_propose`) is to be wired to in wave
 * 2, replacing the threshold arithmetic currently inline there. Same thresholds,
 * same persisted page, same conclusion -- plus two things that arithmetic cannot
 * express:
 *
 *   benign_tie          a thin margin whose tied candidates carry the same VALUE
 *                       is not a real ambiguity. `healGated` already recovers
 *                       this for free and a nomination should not be held to a
 *                       stricter rule than the gate it is being compared with.
 *
 *   method_disagreement docs/AI-AND-AGENTS.md 3. When `modelPick` is supplied and
 *                       points somewhere other than the scorer's top candidate,
 *                       the verdict is `still_holding` however good the score is.
 *                       This can only ever ADD a reason to hold; there is no
 *                       input to this function that turns a hold into a publish.
 *
 * `modelPick` is optional and `undefined` means "not consulted", which is
 * reported as `agreement: 'unscored'`. It is NOT the same as the model saying
 * "none of these" (`null`), which is a disagreement with any nomination.
 */
export function scoreNomination(
  ranked: readonly RankedCandidate[],
  candidateIndex: number,
  {
    tau = 0.6,
    delta = 0.16,
    modelPick,
  }: { tau?: number; delta?: number; modelPick?: number | null } = {},
): NominationScore {
  const best = ranked[0];
  const runnerUp = ranked[1];
  const margin = best ? (runnerUp ? Number((best.score - runnerUp.score).toFixed(4)) : 1) : null;
  const scorer = best ? { index: 0, selector: best.selector, score: best.score } : null;

  const agreement: NominationScore['agreement'] =
    modelPick === undefined
      ? 'unscored'
      : modelPick !== null && modelPick === 0
        ? 'corroborates'
        : 'disagrees';

  const base = { decision: null as null, scorer, margin, tau, delta, agreement };

  const pick = ranked[candidateIndex];
  if (!pick) {
    return { ...base, verdict: 'still_holding', reason: 'no_such_candidate', nominated: null };
  }
  const nominated = { index: candidateIndex, selector: pick.selector, score: pick.score };
  const hold = (reason: NominationReason): NominationScore =>
    ({ ...base, verdict: 'still_holding', reason, nominated });

  // The gate, in the order healGated applies it, against the persisted list.
  if (pick.score <= tau) return hold('below_tau');
  if (candidateIndex !== 0) return hold('not_top_candidate');
  if (margin !== null && margin <= delta) {
    // benign tie: everything within delta carries the same value
    const tied = ranked.filter((r) => pick.score - r.score <= delta);
    const values = new Set(tied.map((r) => clean(r.value)));
    if (values.size !== 1) return hold('thin_margin');
    if (agreement === 'disagrees') return hold('method_disagreement');
    return { ...base, verdict: 'clears_gate', reason: 'benign_tie', nominated };
  }
  if (agreement === 'disagrees') return hold('method_disagreement');
  return { ...base, verdict: 'clears_gate', reason: 'clear_margin', nominated };
}

// --- discovery ranking -------------------------------------------------------

export interface DiscoveryTarget {
  label: string;
  [k: string]: unknown;
}

/**
 * Order candidate targets by how likely each is to be what the operator meant.
 *
 * Always returns an ordering and always says where it came from. Without a key
 * that is deterministic word overlap using the same `sharedWords` the scorer
 * uses -- worse, and labelled `source: 'lexical'` so nobody mistakes a string
 * match for judgement. The label is also correct when a model call FAILS, not
 * only when the key is missing.
 */
export async function rankDiscovery(
  targets: readonly DiscoveryTarget[],
  intent: string,
  { abort }: { abort?: AbortController } = {},
): Promise<{ source: 'model' | 'lexical'; ranked: DiscoveryTarget[] }> {
  // ponytail: sharedWords is exact-token, so "recalls" does not match "recall"
  // and this fallback ranks by luck on inflected words. Reused rather than
  // improved on purpose -- a stemmer here would be a second, unmeasured ranking
  // method competing with the one this feature is about. Upgrade path if the
  // lexical path ever has to carry weight: stem both sides before comparing.
  const lexical = (): { source: 'lexical'; ranked: DiscoveryTarget[] } => ({
    source: 'lexical',
    ranked: [...targets].sort((a, b) => sharedWords(intent, b.label) - sharedWords(intent, a.label)),
  });
  if (!hasKey() || !targets.length) return lexical();

  const reply = await ask(
    Shapes.order,
    `An operator asked for: ${intent}\n\n`
      + 'Order these candidates best-first by how likely each is to be what they '
      + 'meant. Answer with indices.\n\n'
      + targets.map((t, i) => `[${i}] ${clean(t.label).slice(0, 160)}`).join('\n'),
    { abort },
  );
  if (!reply) return lexical();

  const seen = new Set<number>();
  const ranked: DiscoveryTarget[] = [];
  for (const i of reply.order) {
    if (targets[i] && !seen.has(i)) {
      seen.add(i);
      ranked.push(targets[i]!);
    }
  }
  // anything the model dropped keeps its original position rather than vanishing
  targets.forEach((t, i) => {
    if (!seen.has(i)) ranked.push(t);
  });
  return { source: 'model', ranked };
}
