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
import { readFile, readdir } from 'node:fs/promises';
import { ingestPage } from '../src/connectors/ingest.js';
import { recomputeField } from '../src/health/observe.js';
import { deliver } from '../src/api/webhooks.js';
import { send, breakSubject, breakBody } from '../src/notify.js';
import { getDb, closeDb, claimDueTarget, markNotified } from '../src/store/index.js';

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
 * fetch. The runner takes this as a parameter, so a Bright Data webhook can
 * supply its own and still get identical detection and gating.
 */
function fetcherFor(url: any) {
  if (url.startsWith('corpus://')) {
    const site = url.slice('corpus://'.length).split('/')[0];
    return async () => {
      const files = (await readdir(`corpus/${site}`)).filter((f) => f.endsWith('.html')).sort();
      const html = await readFile(`corpus/${site}/${files.at(-1)}`, 'utf8');
      const $ = load(html); $('script,style,noscript').remove();
      return { $ };
    };
  }
  return async () => {
    const res = await fetch(url, { headers: { 'user-agent': 'assay/0.1 (+self-hosted)' } });
    if (!res.ok) throw new Error(`fetch ${res.status}`);
    const $ = load(await res.text()); $('script,style,noscript').remove();
    return { $ };
  };
}

/** Email first, webhook as the fallback. Never fatal to the run. */
async function notifyBreak({ target, field, diagnosis, runId, episodeId }: any) {
  const to = process.env.ASSAY_MAIL_TO;
  try {
    await send({
      to,
      subject: breakSubject({ target, field }),
      html: breakBody({ target, field, diagnosis, rowsHeld: 1, since: runId }),
    });
    await markNotified(episodeId, 'email');
    return 'email';
  } catch (e) {
    const hook = process.env.ASSAY_WEBHOOK_URL;
    if (hook) {
      try {
        await deliver({
          url: hook, secret: process.env.ASSAY_WEBHOOK_SECRET || '',
          event: 'episode.opened', data: { target, field, diagnosis, run: runId },
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
  const { $ } = await fetcherFor(target.url)();

  const r = await ingestPage({ target, html: $.html(), via: 'worker' });
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

const main = async () => {
  getDb();
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
    if (ONCE || stopping) { if (!claimed) console.log('nothing due'); break; }
    await new Promise((r) => setTimeout(r, POLL_MS));
  } while (!stopping);

  await closeDb();
  console.log('worker down');
};

main().catch(async (e) => { console.error(e); await closeDb(); process.exit(1); });
