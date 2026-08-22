// Several independent strategies read the SAME field. Agreement publishes,
// disagreement holds the cell.
//
// This is the margin gate's idea moved from heal time to every run. The gate
// compares the top two candidates produced by ONE method: it catches "two things
// look equally right to the scorer" and is blind to "the scorer is confidently
// wrong in a way a different method would have noticed". Ranking harder cannot
// see that, because the ranking is the thing that is wrong.
//
// Browse AI ships hundreds of selectors per element and uses the disagreement to
// pick a survivor. Picking a survivor is the part that throws the signal away:
// the moment two independent readings of one field return two different strings,
// at most one of them is the field, and nothing in the disagreement says which.
// Here the disagreement is the output.
//
// INDEPENDENCE IS THE WHOLE MECHANISM. Three variations of one idea agree when
// they are all wrong together, which is exactly the failure this is built to
// catch, so each strategy below is justified by the way it fails, not by how
// often it is right. The four axes:
//
//   selector    the string we stored          -- blind to text, blind to position
//   similarity  the page we remember          -- dominated by text (2.7 of ~21)
//   structure   the position we remember      -- blind to text, tags and classes
//   contract    the definition the operator wrote -- knows nothing of the old page
//
// Nothing here reads the database, the clock or the network: same rule in the
// benchmark and in the product, which is the condition under which the benchmark
// tests the product at all.

import type { CheerioAPI } from 'cheerio';
import { rank } from '../heal.js';
import { pickTarget, RECALL_TITLE, type FieldContract } from '../target.js';
import type { Fingerprint } from '../fingerprint.js';
import type { FieldVerdict } from '../envelope.js';

// TODO(types): elements come back from fingerprint.ts as `any`. See its header.
type El = any;

const clean = (s: string | null | undefined): string => (s || '').replace(/\s+/g, ' ').trim();

/** Everything a strategy is allowed to know. Captured once, from a good page. */
export interface ReadContext {
  /** The element as it was when the scraper last worked. */
  target: Fingerprint;
  /** The CSS selector stored alongside it (`selectorFor` in runner.ts). */
  selector: string;
  /** The operator's field definition, if this field has one. */
  contract?: FieldContract | null;
  /**
   * Which strategies were seen to read THIS field correctly on the capture page.
   * Absent means uncalibrated and every strategy votes. See `calibrate`.
   */
  calibrated?: string[] | null;
}

export interface Strategy {
  id: string;
  /** The argument that this fails differently from the other three. */
  independence: string;
  /** The element this strategy believes holds the field, or null for no vote. */
  read: ($: CheerioAPI, ctx: ReadContext) => El | null;
}

/**
 * Walk an absolute XPath positionally: `/html[1]/body[1]/div[2]/...`.
 *
 * Deliberately NOT translated to CSS `:nth-of-type`. runner.ts learned that the
 * hard way -- the translation produced a selector css-select silently matched
 * nothing with, so the anchor read null on every page for months. A walk either
 * lands on a node or returns null, and null is an absent vote, never a wrong one.
 */
export function byAbsXPath($: CheerioAPI, path: string | null | undefined): El | null {
  if (!path) return null;
  let scope: El[] = ($.root().get(0) as El)?.children || [];
  let node: El = null;
  for (const step of path.split('/').filter(Boolean)) {
    const m = /^([A-Za-z][\w:-]*)\[(\d+)\]$/.exec(step);
    if (!m) return null;
    const want = Number(m[2]);
    let seen = 0;
    let hit: El = null;
    for (const c of scope) {
      if (c.type === 'tag' && c.name === m[1] && ++seen === want) { hit = c; break; }
    }
    if (!hit) return null;
    node = hit;
    scope = hit.children || [];
  }
  return node;
}

export const STRATEGIES: Strategy[] = [
  {
    id: 'similarity',
    independence:
      'Weighted fingerprint similarity, text at 2.7 of ~21 weight. Survives class, '
      + 'id, tag and position churn; loses to any decoy that copies the wording, '
      + 'which is the one thing the other three do not read.',
    read: ($, { target }) => rank($, target, { limit: 1 })[0]?.el ?? null,
  },
  {
    id: 'selector',
    independence:
      'The stored CSS selector, resolved literally. Reads no text at all, so a '
      + 'reworded page cannot fool it and a duplicated wording cannot split it; '
      + 'dies outright on the class rename and id strip that similarity shrugs off.',
    read: ($, { selector }) => (selector ? $(selector).first().get(0) ?? null : null),
  },
  {
    id: 'structure',
    independence:
      'The remembered absolute path, walked positionally. Ignores every attribute '
      + 'and every character of text -- a full rewrite leaves it correct -- and is '
      + 'the only one of the four that a wrapper div or a sibling reorder breaks.',
    read: ($, { target }) => byAbsXPath($, target.abs_xpath),
  },
  {
    id: 'contract',
    independence:
      'The operator\'s field definition, re-resolved against the live page. Carries '
      + 'no memory of the old element whatsoever, so no amount of redesign moves it; '
      + 'it fails where the definition itself stops matching (a translated page) and '
      + 'where a decoy satisfies the definition earlier in document order.',
    read: ($, { contract }) => pickTarget($, contract ?? RECALL_TITLE),
  },
];

/**
 * Which strategies actually read this field, on the page where it worked.
 *
 * Run once, at capture, against the element a human confirmed. A strategy that
 * cannot reproduce the baseline value on the UNCHANGED page has never been seen
 * to read this field at all, and its later opinions are noise dressed as
 * evidence -- under a unanimity rule that noise is not merely useless, it vetoes
 * every run.
 *
 * This is not hypothetical. `selectorFor` returns `tag.firstClass`, and on the
 * chicco corpus the target is a bare `<a>` with no class, so the stored selector
 * is `a` and `$('a').first()` is a navigation link. Uncalibrated, that one
 * strategy dissents on all 51 chicco cases and drags the arm from 68.6%
 * abstention down to nothing useful -- while being wrong about the field on a
 * page that had not changed. Calibration turns a broken reader into a silent one.
 *
 * It is the same principle as the fingerprint itself: capture from a page known
 * to be good, and never refresh on an unverified heal.
 */
export function calibrate(
  $: CheerioAPI,
  el: El,
  ctx: ReadContext,
  { strategies = STRATEGIES }: { strategies?: Strategy[] } = {},
): string[] {
  const want = clean($(el).text());
  return strategies
    .filter((s) => {
      try {
        const got = s.read($, ctx);
        return !!got && clean($(got).text()) === want;
      } catch {
        return false;
      }
    })
    .map((s) => s.id);
}

/** One strategy's answer. `error` is an absence, and is never read as agreement. */
export interface Vote {
  strategy: string;
  /** The string this strategy would publish, or null if it did not resolve. */
  value: string | null;
  element: El | null;
  error?: string;
}

export interface ConsensusResult {
  decision: 'publish' | 'abstain';
  reason: string;
  /** The agreed string, or null. A held cell is never filled -- see envelope.ts. */
  value: string | null;
  element: El | null;
  votes: Vote[];
  /** Strategies that returned an element. */
  voted: number;
  /** Voters carrying the winning string. */
  agreed: number;
  /** Distinct strings among the voters. More than one is a split. */
  distinct: number;
  quorum: number;
}

export interface ConsensusOptions {
  /**
   * How many independent readings must agree before a value is published.
   *
   * Two, not one. A single strategy that resolves while the other three come back
   * empty is unanimous only in the arithmetic sense -- there is nothing to
   * corroborate it, which is precisely the situation the plain healer is already
   * in and precisely the situation this mechanism exists to stop trusting.
   */
  quorum?: number;
  strategies?: Strategy[];
}

/**
 * Run every strategy, then decide.
 *
 *   unanimous among >= quorum voters  ->  publish
 *   any voter disagrees               ->  hold the cell
 *   fewer than quorum voters          ->  hold the cell
 *
 * THE SPLIT ABSTAINS. It is worth being explicit about the rule not taken:
 * majority-of-three would publish while one independent method is saying the
 * value is something else. That dissent is not noise to be outvoted -- it is the
 * only evidence available that the other two agree for a reason other than being
 * right, and it is the entire reason for running four methods instead of one. A
 * majority rule is a survivor picker with extra steps and it ships wrong values
 * on exactly the cases a survivor picker ships them on. Unanimity is a different
 * product: it buys a held cell with a wrong one.
 *
 * Agreement is on the VALUE, not the node, and on the FULL text rather than the
 * fingerprint's 200-char prefix -- same rule, and the same reason, as the
 * benign-tie branch in healGated. A parent and its child carrying one string are
 * not a disagreement for a scraper; two nodes identical to character 200 are.
 */
export function consensus(
  $: CheerioAPI,
  ctx: ReadContext,
  { quorum = 2, strategies = STRATEGIES }: ConsensusOptions = {},
): ConsensusResult {
  const panel = ctx.calibrated
    ? strategies.filter((s) => ctx.calibrated!.includes(s.id))
    : strategies;
  const votes: Vote[] = panel.map((s) => {
    // A strategy that throws has not agreed with anything. Reading an exception
    // as assent is the one bug that would turn this mechanism into a liability:
    // it manufactures unanimity out of a broken reader, silently, on the cases
    // most likely to be broken. It is an absence, it is recorded as one, and it
    // still counts against the quorum.
    try {
      const el = s.read($, ctx);
      return { strategy: s.id, element: el ?? null, value: el ? clean($(el).text()) || null : null };
    } catch (err) {
      return { strategy: s.id, element: null, value: null, error: (err as Error).message };
    }
  });

  const cast = votes.filter((v) => v.value !== null);
  const distinct = new Set(cast.map((v) => v.value));
  const base = { votes, voted: cast.length, distinct: distinct.size, quorum };

  if (!cast.length) {
    return { ...base, decision: 'abstain', reason: 'no_candidates',
      value: null, element: null, agreed: 0 };
  }
  if (distinct.size > 1) {
    return { ...base, decision: 'abstain',
      reason: `consensus_split:${cast.length} readings, ${distinct.size} values`,
      value: null, element: null, agreed: 0 };
  }
  if (cast.length < quorum) {
    return { ...base, decision: 'abstain',
      reason: `no_corroboration:${cast.length} of ${quorum} readings`,
      value: null, element: null, agreed: cast.length };
  }

  // All voters carry one string, so this choice cannot move VALUE OK or VALUE
  // WRONG -- only which node the proof record names. Take the node the most
  // voters landed on, and break a tie by the order the strategies are declared in.
  const tallies = new Map<El, number>();
  for (const v of cast) tallies.set(v.element, (tallies.get(v.element) ?? 0) + 1);
  let element = cast[0]!.element;
  for (const v of cast) if (tallies.get(v.element)! > tallies.get(element)!) element = v.element;

  return { ...base, decision: 'publish', reason: `unanimous:${cast.length} readings agree`,
    value: cast[0]!.value, element, agreed: cast.length };
}

/**
 * The same decision, expressed in the vocabulary `publishRow` enforces.
 *
 * `was` is the value the baseline recorded. A unanimous reading that matches it
 * is `live` -- nothing moved, and calling that a heal would inflate the heal
 * count with runs where nothing happened. A unanimous reading that differs is
 * `healed`. Anything short of unanimous is `quarantined`, and envelope.ts nulls
 * the cell whatever we pass alongside it.
 *
 * `stale` and `degraded` stay unreachable from here. Both are defined by F13 as
 * policy outcomes; emitting `degraded` for "agreed, but one strategy errored"
 * would be inventing a policy this file has no standing to set.
 */
export function consensusVerdict(
  $: CheerioAPI,
  ctx: ReadContext & { was?: string | null },
  opts: ConsensusOptions = {},
): { verdict: FieldVerdict; result: ConsensusResult } {
  const result = consensus($, ctx, opts);
  if (result.decision === 'abstain') {
    return { verdict: { status: 'quarantined', reason: result.reason }, result };
  }
  const moved = clean(ctx.was) !== result.value;
  return { verdict: { status: moved ? 'healed' : 'live', reason: result.reason }, result };
}
