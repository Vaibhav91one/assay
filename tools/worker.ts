// The long-running process: claim a due target, run it, schedule the next one.
//
//   node tools/worker.js [--once] [--poll <seconds>]
//
// There is no queue. The scheduler is one indexed SELECT against `targets`, and
// the claim is `FOR UPDATE SKIP LOCKED` plus bumping next_run_at in the same
// transaction. Real load is ~100 runs a day, which is 0.07 jobs a minute;
// docs/STACK.md records what would have to change before a broker earns its
// keep (>10 jobs/sec, multi-worker coordination, cross-machine rate limits).
//
// SIGTERM finishes the run in flight and then exits. Abandoning a half-written
// run would leave a run row with no cell, which every reader would then have to
// defend against.

import { load } from 'cheerio';
import { fetchHtml } from '../src/skills/page.js';
import { ingestPage } from '../src/connectors/ingest.js';
import { recomputeField } from '../src/health/observe.js';
import { dueDigests, markDigestSent } from '../src/reports/digest.js';
import { deliver, heldObservation } from '../src/api/webhooks.js';
import { send, breakSubject, breakBody } from '../src/notify.js';
import { getDb, closeDb, claimDueTarget, markNotified, holdWorkerLock } from '../src/store/index.js';

const args = process.argv.slice(2);
const ONCE = args.includes('--once');
const POLL_MS = (Number(args[args.indexOf('--poll') + 1]) || 30) * 1000;

let stopping = false;
for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => { stopping = true; console.log(`\n${sig} — finishing the run in flight`); });
}

/**
 * Fetch for a target url.
 *
 * `corpus://site` reads the newest local capture, so the worker can be exercised
 * against the committed corpus with no network. Everything else is an ordinary
 * fetch -- and, if the operator has enabled a page-source connector AND that
 * ordinary fetch was refused, that connector. `src/skills/page.ts` owns the
 * whole decision so this and `src/setup/index.ts` cannot answer it differently;
 * with nothing enabled it does precisely what the copy that used to be here did.
 *
 * The runner takes this as a parameter, so a Bright Data webhook can supply its
 * own and still get identical detection and gating -- and so can a connector.
 */
function fetcherFor(url: any) {
  return async () => {
    const { html, via } = await fetchHtml(url);
    const $ = load(html); $('script,style,noscript').remove();
    return { $, html, via };
  };
}

/** Email first, webhook as the fallback. Never fatal to the run. */
async function notifyBreak({ target, field, diagnosis, runId, episodeId, proofId, reason }: any) {
  const to = process.env.ASSAY_MAIL_TO;
  try {
    const sent = await send({
      to,
      subject: breakSubject({ target, field }),
      html: breakBody({ target, field, diagnosis, rowsHeld: 1, since: runId }),
    });
    // `email:<resend id>` when Resend handed one back, so a later bounce
    // webhook (`web/app/api/v1/connectors/resend/bounce/route.ts`) can find
    // this episode by it. Plain `'email'` otherwise -- a test transport or a
    // future provider with no id is still a successful send, just not one
    // the bounce webhook can correlate.
    await markNotified(episodeId, sent.id ? `email:${sent.id}` : 'email');
    return 'email';
  } catch (e) {
    const hook = process.env.ASSAY_WEBHOOK_URL;
    if (hook) {
      try {
        await deliver({
          url: hook, secret: process.env.ASSAY_WEBHOOK_SECRET || '',
          event: 'episode.opened',
          data: heldObservation({
            target, field, diagnosis, run: runId, proof: proofId, reason,
          }),
        });
        await markNotified(episodeId, `webhook (email failed: ${(e as Error).message})`);
        return 'webhook';
      } catch (e2) {
        await markNotified(episodeId, `undelivered: ${(e as Error).message} / ${(e2 as Error).message}`);
        return 'undelivered';
      }
    }
    await markNotified(episodeId, `undelivered: ${(e as Error).message}`);
    return 'undelivered';
  }
}

/**
 * One target, start to finish. Returns a short line for the log.
 *
 * The fetch is the worker's, and everything after it is `ingestPage` -- the same
 * function a Bright Data delivery calls. This used to be a second copy of that
 * sequence, which meant the delivered path and the fetched path could drift and
 * the benchmark would only ever exercise one of them.
 *
 * What stays here is what a delivery deliberately does not do: announce. A run
 * record and an announcement are different facts, and coupling them would make
 * the delivered run differ from the fetched one in the engine rather than only
 * in provenance.
 */
async function runOne(target: any) {
  const { targetId } = target;
  const { html, via } = await fetcherFor(target.url)();

  // `ingestPage` deliberately receives the response bytes, not the stripped
  // extraction DOM: challenge scripts are evidence that the response is not
  // the site, and removing them here would make the local worker disagree with
  // the Bright Data delivery path at the exact provider boundary they share.
  const r = await ingestPage({ target, html, via });
  if (r.skipped) return `${targetId}  run ${r.runId}  skipped (page unchanged)`;

  const result = r.result!;
  const field = result.event.field;

  // An episode opens on a break and closes when the field recovers. ingestPage
  // returns a null episode id when one was already open -- that dedupe is why a
  // template change breaking 400 pages sends one message and not 400.
  let note = '';
  if (result.status.status === 'quarantined') {
    if (r.episodeId != null) {
      const how = await notifyBreak({
        target: targetId, field,
        diagnosis: result.event.diagnosis, runId: r.runId, episodeId: r.episodeId,
        proofId: r.proofId, reason: result.status.reason ?? null,
      });
      note = `  episode ${r.episodeId} opened, notified via ${how}`;
    } else {
      note = '  (episode already open — no second alert)';
    }
  }

  // F1/F3 standing state, refreshed from the run that just landed. Writes only
  // E's two columns on field_state, so it cannot disturb a brake sharing the row.
  //
  // Not fatal, and not silent. A grade is an OBSERVATION about the run; the run
  // record is the run. Losing the record because the grader could not read a
  // pruned capture would be letting a report break the thing it reports on --
  // and detect() needs an unbroken series, so it would break the detector too.
  // The failure is named on the same line the operator is already reading.
  try {
    const h = await recomputeField(targetId, field);
    note += `  ${h.fragility_grade}/${h.drift_state}`;
  } catch (e) {
    note += `  (health not recomputed: ${(e as Error).message.split('\n')[0]})`;
  }

  return `${targetId}  run ${r.runId}  ${result.event.event}  ${result.status.status}${note}`;
}

/**
 * Send every digest that has come due (F14). Returns a line per digest, or none.
 *
 * The claim and the send are two calls on purpose and are wired as two. dueDigests
 * bumps next_run_at inside the same transaction as its FOR UPDATE SKIP LOCKED,
 * which is what stops two workers sending the same digest twice; markDigestSent
 * moves last_sent_at and runs ONLY after the send returns. A failed send moves
 * neither window, so the next run composes over the period nobody received.
 * Calling markDigestSent alongside the claim would turn a failed send into a
 * silently skipped reporting period.
 *
 * Empty until an operator inserts a digests row, which is why wiring it moved
 * nothing.
 */
async function sendDueDigests(): Promise<string[]> {
  const out: string[] = [];
  for (const d of await dueDigests()) {
    try {
      // Null recipients is "this install's address", the same one a break alert
      // uses. If that is unset too, send() refuses rather than inventing one --
      // and because markDigestSent is never reached, the period is re-covered.
      await send({ to: d.recipients ?? process.env.ASSAY_MAIL_TO, subject: d.subject, html: d.html });
      await markDigestSent(d.digestId);
      out.push(`digest ${d.digestId} (${d.cadence}) sent`);
    } catch (e) {
      out.push(`digest ${d.digestId} (${d.cadence}) NOT sent: ${(e as Error).message.split('\n')[0]}`);
    }
  }
  return out;
}

const main = async () => {
  getDb();
  // Held for as long as this process is willing to claim work, and dropped by
  // Postgres the moment the connection goes -- SIGTERM, SIGKILL or a panic.
  // Without it the schedule screen can say a target is due but cannot say
  // whether anything is coming to take it, which makes "queued" a promise
  // nobody is keeping.
  const releaseLock = await holdWorkerLock();
  console.log(`worker up — polling every ${POLL_MS / 1000}s${ONCE ? ' (once)' : ''}`);

  do {
    let claimed = 0;
    for (;;) {
      if (stopping) break;
      const target = await claimDueTarget();
      if (!target) break;
      claimed++;
      try { console.log(await runOne(target)); }
      catch (e) { console.error(`${target.targetId}  failed: ${(e as Error).message}`); }
    }

    // After the runs, so a digest covers the cycle that just finished rather
    // than the one before it. Never fatal to the loop: a mail outage must not
    // stop the scrapes, which are the thing that has a deadline.
    try { for (const line of await sendDueDigests()) console.log(line); }
    catch (e) { console.error(`digests failed: ${(e as Error).message.split('\n')[0]}`); }

    if (ONCE || stopping) { if (!claimed) console.log('nothing due'); break; }
    await new Promise((r) => setTimeout(r, POLL_MS));
  } while (!stopping);

  // Before closeDb: `pool.end()` waits for checked-out clients, and the lock
  // is held by one.
  await releaseLock();
  await closeDb();
  console.log('worker down');
};

main().catch(async (e) => { console.error(e); await closeDb(); process.exit(1); });
