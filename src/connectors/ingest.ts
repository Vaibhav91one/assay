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
import { detectBlockedPage } from '../detect.js';
import { pickTarget } from '../target.js';
import { putCapture, getCapture, CAPTURE_DIR, type StoredCapture } from '../store/captures.js';
import { openEpisode, closeEpisode } from '../api/webhooks.js';
import { latestContract } from '../contracts/store.js';
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

/**
 * A page parsed once, stripped once, and serialised once.
 *
 * Both halves are needed by every run -- `$` to read the field off, the string
 * to digest, size and store -- and both cost roughly what the page is big. A
 * caller with more than one field to run over the SAME bytes builds this once
 * and hands it to each `ingestPage`; `createTarget` is that caller, and doing
 * it per field is what made a twelve-field watch parse an 8 MiB page thirteen
 * times inside one server action.
 */
export interface NormalisedPage {
  $: ReturnType<typeof load>;
  /** `$.html()` -- the form every digest, byte count and capture is taken of. */
  normalised: string;
}

/** Parse, strip and serialise a page once. The only way to build one. */
export function normalisePage(html: string): NormalisedPage {
  const $ = normalise(html);
  return { $, normalised: $.html() };
}

/** The digest recorded as `runs.page_sha` for a given page. */
export const pageDigest = (html: string): string => digest(normalise(html).html());

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
  page,
}: {
  target: TargetRow;
  html: string;
  /**
   * Which fetch path served this page -- `web-unlocker`, `local-fetch`,
   * `corpus`, `firecrawl`, or `brightdata` for a webhook delivery, which never
   * calls `fetchHtml` at all. Recorded on `runs.via`. Never branched on: this
   * is for an operator auditing a run after the fact, not a decision the
   * pipeline makes differently per source.
   */
  via: string;
  /**
   * `html`, already normalised, when the caller has it. Optional and defaulted,
   * so no existing caller changes -- but a caller running SEVERAL fields over
   * one page must pass it, or each field pays for its own parse of the same
   * bytes. It has to be `normalisePage(html)` for THIS `html`: the digest below
   * becomes `runs.page_sha`, and a mismatched pair would record one page's
   * fingerprint against another page's reading.
   */
  page?: NormalisedPage;
}): Promise<IngestResult> {
  const { $, normalised } = page ?? normalisePage(html);
  const sha = digest(normalised);
  const last = await lastRunFor(target.targetId);
  const runId = await reserveRunId();

  // Skip-if-unchanged, and the run is still RECORDED with its page size:
  // detect() guards on history.length >= 3 and robustZ needs an unbroken
  // series, so a silent gap here disarms the detector without ever erroring.
  if (last && last.page_sha && last.page_sha === sha) {
    await getDb().execute(
      sql`INSERT INTO runs (run_id, target_id, status, page_bytes, page_sha, via)
          VALUES (${runId}, ${target.targetId}, 'skipped', ${normalised.length}, ${sha}, ${via})`,
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
    const blocked = detectBlockedPage(html);
    if (blocked) {
      // Detection normally runs against a healthy baseline. On the first fetch
      // there is no such thing yet, but a vendor-specific block signature is
      // already enough to refuse the page. Use <html> only as a transient
      // engine input so the ordinary run/proof path records what arrived; it is
      // deliberately not assigned to `newBaseline`, regardless of whether the
      // interstitial happens to contain a heading the field resolver likes.
      const root = $('html').first()[0];
      if (!root) throw new Error(`blocked first page for ${target.targetId} was not parseable HTML`);
      baseline = establishBaseline({
        $, el: root, field: c.field, expected: c.expected, pageHtml: normalised,
      });
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
        $, el, field: c.field, expected: c.expected, goldenSha: golden.sha, pageHtml: normalised,
      });
      newBaseline = { capture: golden, selector: baseline.selector };
    }
  }

  const history = await historyFor(target.targetId);
  // The operator's field contract (F2), if this target has one. Null is "no
  // contract" and leaves the target row's own thresholds in force -- which is
  // every target until somebody writes one, and is why wiring this moved
  // nothing. Read here rather than in each caller so a delivered run and a
  // fetched run are governed by the same document.
  const contract = await latestContract(target.targetId);
  // Per RUN, not per page: a page that reverts to an earlier state would
  // otherwise collide on the unique proof_id, and a proof is about a run.
  const proofId = `pr_${sha16(`${target.targetId}${runId}${baseline.field}`)}`;

  const result = await runTarget({
    // The bytes are already here, so the seam is satisfied by handing back the
    // parse. No branch inside the engine knows this happened.
    fetchPage: () => ({ $, receivedHtml: html, pageHtml: normalised }),
    baseline,
    history,
    thresholds: c.thresholds ?? { tau: 0.6, delta: 0.16 },
    contract: contract?.parsed ?? null,
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
    via,
  });

  // The baseline moves here, and only here -- on the first run that
  // establishes one (`newBaseline` set above), never on a heal. `healGated`
  // used to also move it here on a published heal; it is gone
  // (`src/runner.ts`'s header), and so is the F10/F11 heal-history bookkeeping
  // (`src/brake/index.ts`) that used to run alongside it -- `evaluate()` can no
  // longer produce `status: 'healed'` from this pipeline at all, so there is
  // no heal left to advance the baseline from or record. Written after
  // recordRun so the run is durable first: a baseline that advanced past a run
  // nobody has a record of is worse than one that did not advance.
  if (newBaseline && result.observed) {
    await setBaseline({
      targetId: target.targetId,
      field: baseline.field,
      capture: newBaseline.capture,
      url: target.url,
      selector: newBaseline.selector,
    });
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
  } else if (result.observed) {
    await closeEpisode({ targetId: target.targetId, field: baseline.field, runId });
  }

  return { runId, proofId, result, skipped: false, episodeId };
}
