// One run, from bytes somebody else already fetched.
//
// `src/runner.ts` takes `fetchPage` as a parameter so the local worker and a
// Bright Data delivery share detection and gating. That seam only holds if
// everything AROUND runTarget is shared too -- the skip-if-unchanged check, the
// baseline rebuild, the proof id, what gets persisted. Two copies of this
// sequence would drift, and the first symptom would be a webhook-delivered run
// that the benchmark never exercised.
//
// So the sequence lives here once, `tools/worker.ts` fetches and calls it, and
// a delivery hands it bytes and calls it. Provenance is the only difference,
// and it is carried in `meta.via` rather than in a branch.
//
// Nothing here notifies. A run record and an announcement are different facts,
// and coupling them would make the delivered run differ from the fetched one.

import { z } from 'zod';
import { load } from 'cheerio';
import { createHash } from 'node:crypto';
import { establishBaseline, runTarget, digest, type Baseline, type Evaluation } from '../runner.js';
import { pickTarget } from '../target.js';
import { putCapture, getCapture, CAPTURE_DIR, type StoredCapture } from '../store/captures.js';
import { openEpisode, closeEpisode } from '../api/webhooks.js';
import { latestContract } from '../contracts/store.js';
import { shouldHeal, recordHeal, checkBrake } from '../brake/index.js';
import {
  getDb, reserveRunId, recordRun, lastRunFor, historyFor, baselineFor, setBaseline, sql,
} from '../store/index.js';

// TODO(types): `targets.contract` is jsonb and the full shape is owned by the
// contracts feature (B), being written in parallel. Only the three keys this
// pipeline actually reads are pinned; the rest passes through untouched rather
// than being guessed at.
const Contract = z.looseObject({
  field: z.string().min(1),
  // Mirrors FieldContract in src/target.ts. The three required keys are
  // required here too, so a contract missing them is refused rather than
  // silently resolved with pickTarget's built-in default.
  resolver: z.looseObject({
    tags: z.string().min(1),
    minLen: z.number(),
    maxLen: z.number(),
    include: z.string().nullish(),
    exclude: z.string().nullish(),
    flags: z.string().optional(),
  }),
  expected: z.looseObject({}).optional(),
  thresholds: z.object({ tau: z.number(), delta: z.number() }).optional(),
});

export type TargetRow = { targetId: string; url: string; contract: unknown };

const sha16 = (s: string): string => createHash('sha256').update(s).digest('hex').slice(0, 16);

/** Parse and strip, exactly as the worker's fetcher does. The engine only ever
 *  sees a page in this form, so `runs.page_sha` is a digest of THIS, not of the
 *  bytes on the wire. A caller comparing digests has to use the same function
 *  or it is comparing two different things. */
function normalise(html: string) {
  const $ = load(html);
  $('script,style,noscript').remove();
  return $;
}

/** The digest recorded as `runs.page_sha` for a given page. */
export const pageDigest = (html: string): string => digest(normalise(html).html());

/**
 * Why this field may not heal on this run, or null.
 *
 * `shouldHeal` deliberately does not catch a database error: a brake that
 * cannot be READ is not a brake that is not SET, and answering "yes, heal" on a
 * failed query would be a silent fallback in the one place this product refuses
 * one. It left the decision to the caller. This is the caller, and the decision
 * is to fail CLOSED -- an unreadable brake withholds the heal.
 *
 * The alternatives were worse. Healing anyway is the fallback D refused, and it
 * fails in the expensive direction: a wrong value is a refund, a hole is a
 * ticket. Letting the error abort the run is worse still -- it loses the run
 * RECORD, and detect() guards on history.length >= 3 with robustZ over an
 * unbroken series, so an unreachable brake table would quietly disarm the
 * detector for every field on the target. One outage would become two.
 *
 * Failing closed costs an abstention, which is the product's own designed
 * answer to "I cannot justify this". It is not silent: the reason lands on the
 * proof record and opens an episode, so the operator is told the brake is
 * unreadable rather than discovering it when a bad heal ships.
 */
async function healBlockFor(targetId: string, field: string): Promise<string | null> {
  try {
    return (await shouldHeal(targetId, field)) ? null : 'brake_engaged';
  } catch (e) {
    // First line only: a reason is read back in a table cell and an alert
    // subject, and drizzle's message carries the whole query and its params
    // across several lines. The full error is not swallowed -- it is the thing
    // that produced this line, and the run it stopped is in the proof record.
    return `brake_unreadable:${(e as Error).message.split('\n')[0]}`;
  }
}

/**
 * Rebuild the baseline from the page it was taken from.
 *
 * The stored pointer is a sha and a selector; everything else -- fingerprint,
 * skeleton, anchors, baseline value -- is recomputed by `establishBaseline`
 * from those bytes. That is the reason for storing a page rather than a
 * serialised `Baseline`: the fingerprint's shape stays owned by one function,
 * so adding a property to it does not silently leave every stored baseline
 * describing the old shape. `readAnchors` is a closure and could not be stored
 * at all.
 */
async function rebuild(
  prior: { goldenSha: string; selector: string },
  targetId: string,
  c: z.infer<typeof Contract>,
): Promise<Baseline> {
  let html: string;
  try {
    html = await getCapture(prior.goldenSha);
  } catch (e) {
    // Nothing in this repo prunes captures yet, so reaching this is an
    // operator fault -- ASSAY_CAPTURES moved out from under an existing
    // database. Left as a throw rather than a recorded run because there is no
    // baseline, so nothing was compared and there is no comparison to record. A
    // resolver miss is a different thing and is NOT handled this way: the page
    // is still evaluated against the baseline and the break is recorded. If
    // pruning ever lands, the golden has to be exempt from it -- this must not
    // become a re-baseline, which is the bug this whole change removes.
    throw new Error(
      `baseline capture ${prior.goldenSha} for ${targetId}/${c.field} is not in `
      + `${CAPTURE_DIR}: ${(e as Error).message.split('\n')[0]}`,
    );
  }
  const $b = normalise(html);
  const el = $b(prior.selector).first()[0];
  if (!el) {
    throw new Error(
      `baseline selector "${prior.selector}" matches nothing in capture ${prior.goldenSha}`,
    );
  }
  return establishBaseline({
    $: $b, el, field: c.field, expected: c.expected, goldenSha: prior.goldenSha,
  });
}

export interface IngestResult {
  runId: number;
  /** null on a skipped run: nothing was evaluated, so there is no proof. An
   *  absence is an absence, not an empty string. */
  proofId: string | null;
  /** null when the page was byte-identical to the last run and nothing was evaluated. */
  result: Evaluation | null;
  skipped: boolean;
  /** Set when this run broke a field that was not already in an open episode. */
  episodeId: number | null;
}

/**
 * Evaluate one page against one target and persist the outcome.
 *
 * `html` is the page as bytes. Where it came from is the caller's business:
 * this function cannot tell a webhook delivery from a local fetch, which is the
 * property the whole connector rests on.
 */
export async function ingestPage({
  target,
  html,
  via,
}: {
  target: TargetRow;
  html: string;
  /** Provenance, recorded on the proof record. Never branched on. */
  via: string;
}): Promise<IngestResult> {
  const $ = normalise(html);
  const normalised = $.html();
  const sha = digest(normalised);
  const last = await lastRunFor(target.targetId);
  const runId = await reserveRunId();

  // Skip-if-unchanged, and the run is still RECORDED with its page size:
  // detect() guards on history.length >= 3 and robustZ needs an unbroken
  // series, so a silent gap here disarms the detector without ever erroring.
  if (last && last.page_sha && last.page_sha === sha) {
    await getDb().execute(
      sql`INSERT INTO runs (run_id, target_id, status, page_bytes, page_sha)
          VALUES (${runId}, ${target.targetId}, 'skipped', ${normalised.length}, ${sha})`,
    );
    return { runId, proofId: null, result: null, skipped: true, episodeId: null };
  }

  // pickTarget falls back to its built-in RECALL_TITLE contract when handed
  // undefined, which on an arbitrary page is a silent wrong answer rather than
  // an error. An absent resolver is an absence, so say so.
  const c = Contract.parse(target.contract);

  // The "then". This used to be established from the page being evaluated on
  // every run, so runTarget compared each page to itself: the gate could not
  // fire, no heal was possible, and a site that broke read as `live`. The
  // corpus path (tools/ingest.ts) never had the bug -- it takes the baseline
  // from the FIRST capture and evaluates every later one against it, which is
  // what produces the measured numbers. This is that, persisted.
  const prior = await baselineFor(target.targetId, c.field);

  // Only the first run of a field has no prior, and it is the only run where
  // establishing from the page in hand is correct. `newBaseline` is what gets
  // written back afterwards -- null means this run is not entitled to move it.
  let newBaseline: { capture: StoredCapture; selector: string } | null = null;
  let baseline: Baseline;

  if (prior) {
    baseline = await rebuild(prior, target.targetId, c);
  } else {
    // pickTarget is how a baseline is CHOSEN, once, from a page believed good.
    // It is not how a later run READS the field -- that is `baseline.selector`,
    // inside evaluate() -- so it is deliberately not consulted again below. A
    // resolver that stops matching on a later page is a break for the engine to
    // diagnose, not a reason to re-derive what "working" looked like.
    const el = pickTarget($, c.resolver);
    if (!el) {
      throw new Error(
        `no target element in the first page for ${target.targetId}/${c.field}, `
        + 'and no baseline to hold it against',
      );
    }
    const golden = await putCapture(normalised);
    baseline = establishBaseline({
      $, el, field: c.field, expected: c.expected, goldenSha: golden.sha,
    });
    newBaseline = { capture: golden, selector: baseline.selector };
  }

  const history = await historyFor(target.targetId);
  // The operator's field contract (F2), if this target has one. Null is "no
  // contract" and leaves the target row's own thresholds in force -- which is
  // every target until somebody writes one, and is why wiring this moved
  // nothing. Read here rather than in each caller so a delivered run and a
  // fetched run are governed by the same document.
  const contract = await latestContract(target.targetId);
  const healBlock = await healBlockFor(target.targetId, c.field);
  // Per RUN, not per page: a page that reverts to an earlier state would
  // otherwise collide on the unique proof_id, and a proof is about a run.
  const proofId = `pr_${sha16(`${target.targetId}${runId}${baseline.field}`)}`;

  const result = await runTarget({
    // The bytes are already here, so the seam is satisfied by handing back the
    // parse. No branch inside the engine knows this happened.
    fetchPage: () => ({ $ }),
    baseline,
    history,
    thresholds: c.thresholds ?? { tau: 0.6, delta: 0.16 },
    contract: contract?.parsed ?? null,
    healBlock,
    meta: { run: runId, site: target.targetId, via },
    proofId,
  });

  const capture = result.event.event === 'ok'
    ? null
    : { ...(await putCapture(normalised)), url: target.url };

  await recordRun({
    runId,
    targetId: target.targetId,
    capture,
    result,
    proofId,
    groupKey: `${result.event.skeleton.after}:${baseline.field}`,
  });

  // The baseline moves here, and only here.
  //
  // A published heal is the only run that may move it. An unverified heal is
  // how a healer poisons its own baseline (src/runner.ts:72), so a candidate
  // the gate refused -- however well it scored -- leaves the "then" exactly
  // where it was, and the field keeps being measured against the page it last
  // worked on. Written after recordRun so the run is durable first: a baseline
  // that advanced past a run nobody has a record of is worse than one that did
  // not advance.
  // `capture` is non-null on every branch that can reach here: a healed status
  // means `event.event === 'heal'`, and only an `ok` event keeps no bytes.
  if (result.status.status === 'healed' && result.event.healed_to && capture) {
    newBaseline = { capture, selector: result.event.healed_to.selector };
  }
  if (newBaseline) {
    await setBaseline({
      targetId: target.targetId,
      field: baseline.field,
      capture: newBaseline.capture,
      url: target.url,
      selector: newBaseline.selector,
    });
  }

  // A heal is the evidence F11 grades. `heal_history` had no writer anywhere in
  // the pipeline, so detectPingPong was reading an empty table on every field
  // and the brake could not engage on its own -- the whole of F11 was
  // unreachable. Recorded after recordRun, so the run is durable first.
  //
  // Left to throw, like every other store call here. A heal that published
  // without leaving a row blinds the oscillation detector against the very
  // field that just moved, and that is not a thing to note and carry on from.
  if (result.status.status === 'healed' && result.event.healed_to) {
    await recordHeal({
      targetId: target.targetId,
      field: baseline.field,
      fromSelector: baseline.selector,
      toSelector: result.event.healed_to.selector,
      runId,
    });
    // Engages the brake if this field is thrashing. It announces itself on the
    // NEXT run, which is the right run: the brake stops the next heal, and that
    // abstention opens an episode carrying `brake_engaged` as its reason.
    await checkBrake(target.targetId, baseline.field);
  }

  // An episode opens on a break and closes when the field recovers. openEpisode
  // returns null when one is already open -- that dedupe is why a template
  // change breaking 400 pages announces once and not 400 times.
  let episodeId: number | null = null;
  if (result.status.status === 'quarantined') {
    const ep = await openEpisode({
      targetId: target.targetId,
      field: baseline.field,
      cause: result.event.attributed_cause,
      runId,
    });
    episodeId = ep?.episodeId ?? null;
  } else {
    await closeEpisode({ targetId: target.targetId, field: baseline.field, runId });
  }

  return { runId, proofId, result, skipped: false, episodeId };
}
