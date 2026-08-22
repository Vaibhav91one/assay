// Standing health per field: is this field rotting, and is the page moving
// under it (F1 fragility, F3 drift).
//
// The distinction this module exists for: `detect()` answers "was THIS RUN
// fine". Neither question here is about one run. A field whose anchors churn on
// every build is fragile on the day everything passes, and a page part-way
// through a template rollout is drifting while every cell it publishes is
// correct. Both are properties of a SERIES, so both live outside the runner.
//
// Everything below is pure: observations in, a word out. No database, no clock,
// no IO -- `observe.ts` is what reaches for the store, and it is a thin caller.

import type { Fingerprint } from '../fingerprint.js';
import { robustZ } from '../detect.js';
import { z } from 'zod';

/**
 * The floor, borrowed from `detect()` rather than invented here.
 *
 * `detect()` runs robustZ only at `history.length >= 3`, and CRITIQUE 3.7
 * records that guard as the refutation of the cold-start hypothesis. A grade
 * computed from two runs is a guess wearing a grade's clothing, so below this
 * both vocabularies return their honest state instead of their best guess.
 */
export const MIN_OBSERVATIONS = 3;

/** One run, as far as standing health is concerned. */
export interface FieldObservation {
  runId: number;
  /**
   * The field's element on that page, or null when the resolver found nothing.
   * A run where the field is absent contributes an absence, never a zero.
   */
  fingerprint: Fingerprint | null;
  /**
   * Independent readings of the same field -- the baseline's css anchor and its
   * xpath anchor, evaluated against THIS page.
   *
   * These are FULL extracted text, never `fingerprint.text`. `fingerprint()`
   * truncates text at 200 chars, and CRITIQUE 3.2 is the bug that follows from
   * comparing truncated prefixes of values that are published in full: two
   * anchors identical for 200 chars and divergent at char 300 read as agreement.
   */
  anchors: Record<string, string | null>;
}

// --- fragility (F1) ---------------------------------------------------------

/**
 * The grade vocabulary. A closed set of four words and deliberately not a score
 * -- FEATURES 4 refuses a confidence percentage on any cell, and a fragility
 * number would be one wearing a different hat.
 */
export const FRAGILITY_GRADES = ['sturdy', 'serviceable', 'fragile', 'insufficient_history'] as const;
export type FragilityGrade = (typeof FRAGILITY_GRADES)[number];
export const FragilityGrade = z.enum(FRAGILITY_GRADES);

/**
 * What identifies an element, and whether the identification is intrinsic.
 *
 * `stable: true` means the site had to write it on purpose -- an author-chosen
 * id, a test hook, an ARIA role. `stable: false` means it is a by-product of
 * how the page happens to be built today, which is exactly the "build-generated
 * garbage" F1 exists to count.
 *
 * `text` is absent on purpose. It is the VALUE, it is supposed to change, and
 * it is the truncated field from CRITIQUE 3.2 -- scoring it here would grade
 * every field fragile the day its content updated.
 */
const ANCHORS: { key: string; stable: boolean; read: (fp: Fingerprint) => string | null }[] = [
  { key: 'id', stable: true, read: (fp) => (fp.id_volatile ? null : fp.id) },
  { key: 'testid', stable: true, read: (fp) => fp.testid },
  { key: 'role', stable: true, read: (fp) => fp.role },
  { key: 'aria_label', stable: true, read: (fp) => fp.aria_label },
  { key: 'name', stable: true, read: (fp) => fp.name },
  { key: 'classes', stable: false, read: (fp) => (fp.classes_stable?.length ? fp.classes_stable.join(' ') : null) },
  { key: 'heading_path', stable: false, read: (fp) => (fp.heading_path.length ? fp.heading_path.join(' > ') : null) },
  { key: 'id_xpath', stable: false, read: (fp) => fp.id_xpath },
];

/**
 * Position, kept apart from the anchors above.
 *
 * An element that moves in the DOM while keeping its id has not become harder
 * to find, so absolute position must not be allowed to vote on the grade. It is
 * still worth reporting: churn here with no anchor churn is the signature of a
 * page whose layout moves and whose semantics do not.
 */
const position = (fp: Fingerprint): string => fp.abs_xpath;

/**
 * How many observations may deviate from an anchor's usual value before it has
 * stopped holding the element.
 *
 * One is a blip -- the day the site served an error page, the run where a
 * banner shifted the DOM. Two or more is a move: the anchor took a new value
 * and kept it, which is what a redesign looks like from here. This is the
 * categorical form of the median the engine uses on numbers: the usual value
 * wins, and a single outlier cannot unseat it.
 */
const MAX_BLIPS = 1;

export interface AnchorHold {
  key: string;
  /** Intrinsic (the site wrote it on purpose) rather than a by-product of the build. */
  stable: boolean;
  /** Observations whose reading differed from this anchor's usual value. */
  deviations: number;
  held: boolean;
}

export interface FragilityReport {
  grade: FragilityGrade;
  /** Anchors present on the most recent observation, and whether each held. */
  anchors: AnchorHold[];
  /** Median anchors changed between consecutive runs. Null below the floor. */
  median_anchor_moves: number | null;
  /** MAD of the same series: is the churn itself steady, or does it come in bursts? */
  mad_anchor_moves: number | null;
  /** Median position changes between consecutive runs. Reported, never graded on. */
  median_position_moves: number | null;
  observations: number;
  /** One sentence, the way F1 asks for it. */
  note: string;
}

/** How many identifying anchors read differently on `b` than they did on `a`. */
const anchorMoves = (a: Fingerprint, b: Fingerprint): number =>
  ANCHORS.filter(({ read }) => read(a) !== read(b)).length;

/** How many of `values` differ from the most common one. Nulls count: a vanished anchor deviated. */
function deviationsFromUsual(values: (string | null)[]): number {
  const tally = new Map<string | null, number>();
  for (const v of values) tally.set(v, (tally.get(v) ?? 0) + 1);
  const usual = Math.max(...tally.values());
  return values.length - usual;
}

/**
 * Median and MAD of a series, from the engine's own implementation.
 *
 * `robustZ` is imported rather than re-derived so this module's median is the
 * engine's median down to the even-length averaging. `x` is the most recent
 * transition, which is the observation a z-score would be about; only `med` and
 * `mad` are used here, because a grade is a standing state and a z-score is an
 * event. Median, not mean, is the whole point: one day the site was broken must
 * not be able to promote a field to fragile.
 */
const medianMad = (series: number[]): { med: number; mad: number } => {
  const { med, mad } = robustZ(series, series[series.length - 1]!);
  return { med, mad };
};

/**
 * Grade one field from its observed history, newest LAST.
 *
 * Two axes, because either alone grades the wrong thing. WHAT holds the element
 * (an author-written id versus a build-hashed class) is most of F1's question,
 * but a `serviceable` anchor that has already been observed to move is not
 * serviceable -- it is the fragility, already happening. And WHETHER anchors
 * move is not enough either: a field pinned by a testid and a field pinned by
 * nothing both sit still on a quiet corpus.
 *
 * Movement is measured between CONSECUTIVE runs, not against the first one: a
 * site that changed once two years ago and has not moved since is not moving,
 * and comparing everything to run 1 would say it was.
 */
export function fragility(observations: readonly FieldObservation[]): FragilityReport {
  const seen = observations.filter((o) => o.fingerprint != null);
  const latest = seen[seen.length - 1]?.fingerprint ?? null;
  const present = latest ? ANCHORS.filter(({ read }) => read(latest) != null) : [];

  if (seen.length < MIN_OBSERVATIONS) {
    return {
      grade: 'insufficient_history',
      anchors: present.map(({ key, stable }) => ({ key, stable, deviations: 0, held: false })),
      median_anchor_moves: null,
      mad_anchor_moves: null,
      median_position_moves: null,
      observations: seen.length,
      note:
        `${seen.length} observation(s) of this field; ${MIN_OBSERVATIONS} are needed before `
        + 'its anchors can be said to move or hold still.',
    };
  }

  const anchors: AnchorHold[] = present.map(({ key, stable, read }) => {
    const deviations = deviationsFromUsual(seen.map((o) => read(o.fingerprint!)));
    return { key, stable, deviations, held: deviations <= MAX_BLIPS };
  });

  const moves: number[] = [];
  const posMoves: number[] = [];
  for (let i = 1; i < seen.length; i++) {
    const a = seen[i - 1]!.fingerprint!;
    const b = seen[i]!.fingerprint!;
    moves.push(anchorMoves(a, b));
    posMoves.push(position(a) === position(b) ? 0 : 1);
  }

  const { med, mad } = medianMad(moves);
  const pos = medianMad(posMoves);
  const held = anchors.filter((a) => a.held);

  // `med >= 1` is the churn gate: whatever identifies this field moves on a
  // TYPICAL run, so nothing needs checking per-anchor. Below it the question is
  // what survived, and only an anchor that both exists and held counts.
  const grade: FragilityGrade = med >= 1 || held.length === 0
    ? 'fragile'
    : held.some((a) => a.stable) ? 'sturdy' : 'serviceable';

  const name = (list: AnchorHold[]) => list.map((a) => a.key).join(', ');
  const note =
    grade === 'fragile'
      ? med >= 1
        ? `Identified by ${name(anchors)}, and a typical run moves ${med} of them. The next deploy will probably move it.`
        : anchors.length === 0
          ? 'Identified by nothing but its position on the page: no id, no test hook, no role, no stable class.'
          : `Identified by ${name(anchors)}, and every one of them has already moved across ${seen.length} runs. Nothing is holding it.`
      : grade === 'sturdy'
        ? `Identified by ${name(held.filter((a) => a.stable))}, which the site wrote on purpose and which held across ${seen.length} runs.`
        : `Held only by ${name(held)} -- no id, no test hook, no role. It has not moved in ${seen.length} runs, but a redesign is under no obligation to keep it.`;

  return {
    grade,
    anchors,
    median_anchor_moves: med,
    mad_anchor_moves: mad,
    median_position_moves: pos.med,
    observations: seen.length,
    note,
  };
}

// --- drift (F3) -------------------------------------------------------------

/**
 * The drift vocabulary. Five words, and `never_agreed` is the one that keeps
 * the other four honest.
 *
 * FEATURES F3 says drift is a state that clears itself and never pages, and
 * that a drift signal people mute is worth nothing. Anchors that have NEVER
 * agreed are not drifting -- the baseline is reading two different things --
 * and calling that `drifting` produces exactly the permanent amber that gets
 * muted, taking the real ones with it.
 */
export const DRIFT_STATES = ['steady', 'drifting', 'settled', 'never_agreed', 'insufficient_history'] as const;
export type DriftState = (typeof DRIFT_STATES)[number];
export const DriftState = z.enum(DRIFT_STATES);

export interface DriftReport {
  state: DriftState;
  /** Observations where at least two anchors resolved -- the only ones that vote. */
  verdicts: number;
  /** How many of those disagreed. */
  disagreements: number;
  /** Runs where fewer than two anchors resolved: an absence, not agreement. */
  unreadable: number;
  note: string;
}

/**
 * Do this run's anchors agree?
 *
 * `null` when fewer than two of them resolved. One anchor cannot disagree with
 * itself, and counting a lone reading as agreement is the silent fallback that
 * would make a half-broken baseline look healthy forever.
 */
function agrees(anchors: Record<string, string | null>): boolean | null {
  const resolved = Object.values(anchors).filter((v): v is string => v != null);
  if (resolved.length < 2) return null;
  return new Set(resolved.map((v) => v.trim())).size === 1;
}

/** The standing drift state for one field, from its observed history, newest LAST. */
export function drift(observations: readonly FieldObservation[]): DriftReport {
  const verdicts = observations
    .map((o) => agrees(o.anchors))
    .filter((v): v is boolean => v != null);
  const unreadable = observations.length - verdicts.length;

  if (verdicts.length < MIN_OBSERVATIONS) {
    return {
      state: 'insufficient_history',
      verdicts: verdicts.length,
      disagreements: verdicts.filter((v) => !v).length,
      unreadable,
      note:
        `${verdicts.length} run(s) had two anchors to compare; ${MIN_OBSERVATIONS} are needed `
        + 'before agreement or disagreement is a trend rather than a coincidence.',
    };
  }

  const disagreements = verdicts.filter((v) => !v).length;
  const nowAgrees = verdicts[verdicts.length - 1]!;
  const everAgreed = verdicts.some((v) => v);

  const state: DriftState = nowAgrees
    ? disagreements === 0 ? 'steady' : 'settled'
    : everAgreed ? 'drifting' : 'never_agreed';

  const note = {
    steady: `The anchors agreed on all ${verdicts.length} comparable runs.`,
    settled: `The anchors disagreed on ${disagreements} of ${verdicts.length} comparable runs and agree again now -- a rollout that was reverted looks like this.`,
    drifting: `The anchors used to agree and disagree on the most recent run. Nothing has broken yet; the page is moving underneath this field.`,
    never_agreed: `The anchors have never agreed in ${verdicts.length} comparable runs. That is not drift -- they are reading two different things, and the baseline is wrong.`,
    insufficient_history: '',
  }[state];

  return { state, verdicts: verdicts.length, disagreements, unreadable, note };
}

// --- the one shape both surfaces publish ------------------------------------

/**
 * What REST, MCP and the CLI all return for one field. Declared as a schema
 * rather than an interface because it is a boundary contract: the API asserts
 * responses against it, and it is the executable statement that no cell here
 * carries a number a reader could mistake for confidence.
 */
export const FieldHealth = z.object({
  target: z.string(),
  field: z.string(),
  fragility_grade: FragilityGrade,
  drift_state: DriftState,
  fragility: z.object({
    anchors: z.array(z.object({
      key: z.string(), stable: z.boolean(),
      deviations: z.number().int(), held: z.boolean(),
    })),
    median_anchor_moves: z.number().nullable(),
    mad_anchor_moves: z.number().nullable(),
    median_position_moves: z.number().nullable(),
    observations: z.number().int(),
    note: z.string(),
  }),
  drift: z.object({
    verdicts: z.number().int(),
    disagreements: z.number().int(),
    unreadable: z.number().int(),
    note: z.string(),
  }),
  /**
   * Runs that could not be observed because their page is no longer on disk.
   * Named rather than hidden: a grade over 6 of 30 runs is a different claim
   * from a grade over 30, and a reader has to be able to tell them apart.
   */
  unobserved_runs: z.number().int(),
  total_runs: z.number().int(),
});
export type FieldHealth = z.infer<typeof FieldHealth>;
