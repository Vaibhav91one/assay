// One pipeline: fetch -> detect -> heal -> gate -> publish.
//
// This is the seam. `fetchPage` is a parameter, not an import, so the local
// worker, the replay harness and a Bright Data webhook all run the SAME
// detection and gating. Two loops would mean the benchmark stops testing the
// product, which is the failure this file exists to prevent.
//
// Imports nothing but the engine -- no cheerio, no fs, no network. `$` arrives
// already parsed, so this runs anywhere the engine runs.

import { fingerprint, skeletonHash } from './fingerprint.js';
import { healGated } from './heal.js';
import { detect } from './detect.js';
import { publishRow } from './envelope.js';

const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();

/** A stable-ish selector for an element: id, else tag.firstClass, else tag. */
export function selectorFor(el) {
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
export function establishBaseline({ $, el, field, expected, goldenSha }) {
  const target = fingerprint($, el);
  const selector = selectorFor(el);

  // Anchors are independent ways of reading THE SAME field, not unrelated page
  // furniture. If css and xpath stop agreeing, the field drifted even though
  // both still resolve -- which no null-rate alarm can see.
  const readAnchors = ($p) => ({
    css: clean($p(selector).first().text()).slice(0, 200) || null,
    xpath: (() => {
      const css = target.abs_xpath
        .replace(/^\//, '')
        .replace(/\[(\d+)\]/g, ':nth-of-type($1)');
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
export function evaluate({ $, baseline, history = [], thresholds, meta = {} }) {
  const { tau, delta } = thresholds;
  const skel = skeletonHash($).hash;
  const hit = $(baseline.selector).first();
  const value = hit.length ? clean(hit.text()).slice(0, 200) : null;
  const pageBytes = $.html().length;

  const diag = detect({
    field: baseline.field,
    value,
    expected: baseline.expected,
    history: history.slice(-6),
    skeleton: { before: baseline.skeleton, after: skel },
    anchors: baseline.readAnchors($),
    anchorsBefore: baseline.anchors,
    pageBytes,
  });

  const base = {
    ...meta,
    field: baseline.field,
    mode: 'tiered',
    thresholds: { tau, delta },
    skeleton: { before: baseline.skeleton, after: skel, changed: baseline.skeleton !== skel },
    value_now: value,
    baseline_value: baseline.value,
    golden_sha256: baseline.goldenSha,
  };

  const sample = { nullRate: value == null ? 1 : 0, pageBytes };

  if (!diag.broken) {
    return {
      sample,
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
  const healed = g.decision === 'heal';

  return {
    sample,
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
      reason: g.reason,
      healed_to: healed
        ? { selector: selectorFor(g.element), value: clean(g.fingerprint.text).slice(0, 120) }
        : null,
      approved_by: 'assay',
    },
    // A held cell is quarantined, never filled. envelope.js enforces the null.
    status: healed
      ? { status: 'healed' }
      : { status: 'quarantined', reason: g.reason, held_since_run: meta.run },
    publishedValue: healed ? clean(g.fingerprint.text) : null,
  };
}

/**
 * The IO seam. `fetchPage` returns `{ $ }` however the caller likes -- read from
 * disk, hit the network, or accept a Bright Data webhook payload.
 */
export async function runTarget({ fetchPage, baseline, history, thresholds, meta, proofId }) {
  const { $ } = await fetchPage();
  const r = evaluate({ $, baseline, history, thresholds, meta });
  const row = publishRow({
    values: { [baseline.field]: r.publishedValue },
    statuses: { [baseline.field]: r.status },
    run: meta.run,
    proof: proofId,
  });
  return { ...r, row };
}
