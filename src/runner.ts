// One pipeline: fetch -> detect -> heal -> gate -> publish.
//
// This is the seam. `fetchPage` is a parameter, not an import, so the local
// worker, the replay harness and a Bright Data webhook all run the SAME
// detection and gating. Two loops would mean the benchmark stops testing the
// product, which is the failure this file exists to prevent.
//
// Imports nothing but the engine and the contract vocabulary -- no cheerio, no
// fs, no network, no database. `$` arrives already parsed, so this runs anywhere
// the engine runs, and `npm run bench` and `npm run replay` still need no
// Postgres. `src/contracts/index.ts` is pure yaml and zod for exactly that
// reason; the database half of that feature lives in `src/contracts/store.ts`
// and is not reachable from here.

import { createHash } from 'node:crypto';
import type { CheerioAPI } from 'cheerio';
import { fingerprint, skeletonHash, type Fingerprint } from './fingerprint.js';
import { healGated, type HealGateResult } from './heal.js';
import { detect, type Expected, type HistoryPoint } from './detect.js';
import { publishRow, type FieldVerdict } from './envelope.js';
import { thresholdsFor, type Contract } from './contracts/index.js';

// TODO(types): elements arrive from fingerprint.ts, which may not import
// cheerio's types. See that file's header.
type El = any;

/** What "working" looked like, captured once from a page known to be good. */
export interface Baseline {
  field: string;
  target: Fingerprint;
  selector: string;
  expected?: Expected;
  goldenSha?: string;
  /** Independent ways of reading THE SAME field. Disagreement is drift. */
  readAnchors: ($p: CheerioAPI) => Record<string, string | null>;
  value: string | null;
  skeleton: string;
  anchors: Record<string, string | null>;
  /** Parsed healthy page size. Used only to corroborate generic challenge
   *  markers; vendor-specific markers do not need a size heuristic. */
  pageBytes: number;
}

// TODO(types): the proof record's shape is defined by results/events.jsonl,
// which is a committed byte-identical artifact -- pinning it as an interface is
// a change to that contract, not a typing exercise, so it is left to wave 2.
export type ProofEvent = Record<string, any>;

export interface Evaluation {
  sample: { nullRate: number; pageBytes: number };
  /** Whether the response contained an observation of this field at all. */
  observed: boolean;
  gate: HealGateResult | null;
  event: ProofEvent;
  status: FieldVerdict;
  publishedValue: string | null;
}

const clean = (s: string | null | undefined): string => (s || '').replace(/\s+/g, ' ').trim();

/** Full sha256. Not truncated: a 16-hex prefix in a field named sha256 is a lie. */
export const digest = (s: string | null | undefined): string =>
  createHash('sha256').update(s || '').digest('hex');

/** A stable-ish selector for an element: id, else tag.firstClass, else tag. */
export function selectorFor(el: El): string {
  const a = el.attribs || {};
  if (a.id) return `#${a.id}`;
  const cls = (a.class || '').split(/\s+/).filter(Boolean);
  return cls.length ? `${el.name}.${cls[0]}` : el.name;
}

/**
 * Capture what "working" looked like, once, from a page known to be good.
 *
 * The fingerprint is deliberately NOT refreshed on later runs: refreshing it on
 * an unverified heal is how a healer poisons its own baseline (what Scrapling
 * does with auto_save=True and INSERT OR REPLACE).
 */
export function establishBaseline({
  $,
  el,
  field,
  expected,
  goldenSha,
  pageHtml,
}: {
  $: CheerioAPI;
  el: El;
  field: string;
  expected?: Expected;
  goldenSha?: string;
  /**
   * `$.html()` for THIS `$`, when the caller already has it.
   *
   * Re-serialising a multi-megabyte page costs as much as parsing it, and a
   * caller that normalised the bytes itself has the string in hand already.
   * Optional and defaulted, so nobody has to pass it -- but a caller that does
   * must pass the serialisation of the very `$` it is handing over, or
   * `pageBytes` describes a different page from the one being fingerprinted.
   */
  pageHtml?: string;
}): Baseline {
  const target = fingerprint($, el);
  const selector = selectorFor(el);

  // Anchors are independent ways of reading THE SAME field, not unrelated page
  // furniture. If css and xpath stop agreeing, the field drifted even though
  // both still resolve -- which no null-rate alarm can see.
  const readAnchors = ($p: CheerioAPI): Record<string, string | null> => ({
    css: clean($p(selector).first().text()).slice(0, 200) || null,
    xpath: (() => {
      // `/` is a CHILD COMBINATOR, not a separator to leave lying around.
      // abs_xpath is `/html[1]/body[1]/...`; replacing only the predicates left
      // `html:nth-of-type(1)/body:nth-of-type(1)/...`, which is not a CSS
      // selector. css-select does not throw on it, it simply matches nothing --
      // so this anchor read null on every page since the file was written, and
      // `anchors_disagree` in detect() had never once fired.
      const css = target.abs_xpath
        .replace(/^\//, '')
        .replace(/\[(\d+)\]/g, ':nth-of-type($1)')
        .replace(/\//g, ' > ');
      // An unparseable selector is an anchor that did not resolve, which is an
      // absence. It must not become an empty string that agrees with nothing.
      try { return clean($p(css).first().text()).slice(0, 200) || null; } catch { return null; }
    })(),
  });

  return {
    field,
    target,
    selector,
    expected,
    goldenSha,
    readAnchors,
    value: target.text,
    skeleton: skeletonHash($).hash,
    anchors: readAnchors($),
    pageBytes: (pageHtml ?? $.html()).length,
  };
}

/**
 * Evaluate one run against a baseline. Pure: no IO, no clock, no randomness.
 *
 * Returns the proof record (`event`), the published row (`row`), and the raw
 * gate decision (`gate`) for callers that need the ranked list -- which the
 * queue does, because assay_propose must score against the list the item is
 * about, not a re-fetch of a page that has since moved.
 */
export function evaluate({
  $,
  baseline,
  history = [],
  thresholds,
  contract,
  healBlock = null,
  meta = {},
  receivedHtml = null,
  pageHtml,
}: {
  $: CheerioAPI;
  baseline: Baseline;
  history?: HistoryPoint[];
  thresholds: { tau: number; delta: number };
  /**
   * The operator's field contract (F2), if this target has one. Absent -- which
   * is every caller today -- leaves `thresholds` exactly as the caller gave
   * them, which is why wiring this moved no number.
   *
   * Present, it governs: a contract is the operator saying what scepticism this
   * field is owed, and a contract silent on a field means the field takes the
   * tier vocabulary's default rather than whatever the caller happened to pass.
   */
  contract?: Contract | null;
  /**
   * Why this field may not heal on this run, or null. Resolved by the caller,
   * because the answer lives in Postgres and this file reaches no database --
   * `tools/worker.ts` and a Bright Data delivery both get it from D's
   * `shouldHeal` via `ingestPage`, and `npm run replay` supplies nothing.
   *
   * A string, not a boolean: a withheld heal has to say what withheld it, or
   * the operator who set the brake reads back the gate's reason instead of
   * their own.
   */
  healBlock?: string | null;
  meta?: Record<string, any>;
  receivedHtml?: string | null;
  /**
   * `$.html()` for THIS `$`, when the caller already has it. Same contract as
   * `establishBaseline`: it is read twice here -- once as a size and once as a
   * digest -- and serialising a page is as expensive as parsing one.
   */
  pageHtml?: string;
}): Evaluation {
  const policy = contract ? thresholdsFor(contract, baseline.field) : null;
  const { tau, delta } = policy ?? thresholds;
  const skel = skeletonHash($).hash;
  const hit = $(baseline.selector).first();
  const value = hit.length ? clean(hit.text()).slice(0, 200) : null;
  // Once, not twice: the size below and the digest in `base` are two readings
  // of the same serialisation, and this used to re-serialise the whole page for
  // each of them.
  const page = pageHtml ?? $.html();
  const pageBytes = page.length;

  const diag = detect({
    field: baseline.field,
    value,
    expected: baseline.expected,
    history: history.slice(-6),
    skeleton: { before: baseline.skeleton, after: skel },
    anchors: baseline.readAnchors($),
    anchorsBefore: baseline.anchors,
    pageBytes,
    receivedHtml,
    baselinePageBytes: baseline.pageBytes,
  });

  const base = {
    ...meta,
    field: baseline.field,
    mode: 'tiered',
    thresholds: { tau, delta },
    // Only when a contract actually governed this run. Spread conditionally
    // rather than left undefined: a proof record is a committed artifact and a
    // key that appears on every event is a change to its shape.
    ...(policy ? { policy: policy.policy } : {}),
    skeleton: { before: baseline.skeleton, after: skel, changed: baseline.skeleton !== skel },
    value_now: value,
    baseline_value: baseline.value,
    golden_sha256: baseline.goldenSha,
    capture_sha256: digest(page),
  };

  const sample = { nullRate: value == null ? 1 : 0, pageBytes };

  if (diag.blocked) {
    return {
      sample,
      observed: false,
      gate: null,
      event: {
        ...base,
        event: 'blocked',
        diagnosis: diag.diagnosis,
        attributed_cause: 'blocked',
        signals: diag.signals,
        decision: 'withheld',
        reason: 'fetch_blocked',
      },
      // `degraded` is already part of the closed publication vocabulary and
      // means the fetch could not support an observation. `quarantined` would
      // falsely say the field broke and would put a block page in the heal
      // queue, which is the exact state this branch exists to refuse.
      status: { status: 'degraded', reason: 'fetch_blocked' },
      publishedValue: null,
    };
  }

  if (!diag.broken) {
    return {
      sample,
      observed: true,
      gate: null,
      event: { ...base, event: 'ok', decision: 'no_action',
        diagnosis: diag.diagnosis, attributed_cause: 'ok' },
      status: { status: 'live' },
      publishedValue: value,
    };
  }

  const g = healGated($, baseline.target, { tau, delta, limit: 5 });
  const candidates = (g.ranked || []).slice(0, 3).map((r) => ({
    selector: selectorFor(r.el),
    score: Number(r.score.toFixed(4)),
    value: clean(r.fp.text).slice(0, 90),
  }));
  // A heal the GATE allowed and a POLICY withheld. Two different facts, and the
  // proof record has to say which, or an operator reading `thin_margin` on a
  // field they set to `auto_approve: never` is being told the wrong reason.
  //
  // The brake is checked before the floor: an operator saying "stop healing this
  // field" outranks an arithmetic threshold, and reporting the threshold when a
  // brake is what stopped it would send them to tune the wrong number.
  const withheld: string | null =
    g.decision !== 'heal'
      ? null
      : healBlock
        ? healBlock
        : policy && g.score <= policy.autoApproveAbove
          ? `auto_approve_floor:${policy.autoApproveAbove}`
          : null;

  const healed = g.decision === 'heal' && withheld === null;
  const reason = withheld ?? g.reason;

  return {
    sample,
    observed: true,
    gate: g,
    event: {
      ...base,
      event: healed ? 'heal' : 'abstain',
      diagnosis: diag.diagnosis,
      attributed_cause: diag.cause,
      signals: diag.signals,
      candidates,
      score: g.score != null ? Number(g.score.toFixed(4)) : null,
      runner_up: g.runnerUp != null ? Number(g.runnerUp.toFixed(4)) : null,
      margin: g.margin != null ? Number(g.margin.toFixed(4)) : null,
      decision: healed ? 'auto_approved' : 'abstain',
      reason,
      healed_to: healed
        ? { selector: selectorFor(g.element), value: clean(g.fingerprint.text).slice(0, 120) }
        : null,
      approved_by: 'assay',
    },
    // A held cell is quarantined, never filled. envelope.js enforces the null.
    status: healed
      ? { status: 'healed', reason }
      : { status: 'quarantined', reason, held_since_run: meta.run },
    publishedValue: healed ? clean(g.fingerprint.text) : null,
  };
}

/**
 * The IO seam. `fetchPage` returns `{ $ }` however the caller likes -- read from
 * disk, hit the network, or accept a Bright Data webhook payload.
 */
export async function runTarget({
  fetchPage,
  baseline,
  history,
  thresholds,
  contract,
  healBlock,
  meta,
  proofId,
}: {
  // `pageHtml` is `$.html()` when the caller already has it -- it rides on the
  // parse that produced it rather than on the options bag, so the string and
  // the `$` it describes cannot be supplied by two different hands.
  fetchPage: () => Promise<{ $: CheerioAPI; receivedHtml?: string; pageHtml?: string }> | {
    $: CheerioAPI;
    receivedHtml?: string;
    pageHtml?: string;
  };
  baseline: Baseline;
  history?: HistoryPoint[];
  thresholds: { tau: number; delta: number };
  contract?: Contract | null;
  healBlock?: string | null;
  meta: Record<string, any>;
  proofId: unknown;
}): Promise<Evaluation & { row: Record<string, unknown> }> {
  const { $, receivedHtml, pageHtml } = await fetchPage();
  const r = evaluate({
    $, baseline, history, thresholds, contract, healBlock, meta,
    receivedHtml: receivedHtml ?? null,
    pageHtml,
  });
  const row = publishRow({
    values: { [baseline.field]: r.publishedValue },
    statuses: { [baseline.field]: r.status },
    run: meta.run,
    proof: proofId,
  });
  return { ...r, row };
}
