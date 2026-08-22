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
import { establishBaseline, runTarget, digest, type Evaluation } from '../runner.js';
import { pickTarget } from '../target.js';
import { putCapture } from '../store/captures.js';
import { openEpisode, closeEpisode } from '../api/webhooks.js';
import { latestContract } from '../contracts/store.js';
import { shouldHeal } from '../brake/index.js';
import {
  getDb, reserveRunId, recordRun, lastRunFor, historyFor, sql,
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
  const el = pickTarget($, c.resolver);
  if (!el) throw new Error('no target element in the delivered page');
  const golden = await putCapture(normalised);
  const baseline = establishBaseline({
    $, el,
    field: c.field,
    expected: c.expected,
    goldenSha: golden.sha,
  });

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
