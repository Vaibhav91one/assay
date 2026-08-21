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
import { createHash } from 'node:crypto';
import { establishBaseline, runTarget, digest } from '../src/runner.js';
import { pickTarget } from '../src/target.js';
import { putCapture } from '../src/store/captures.js';
import { openEpisode, closeEpisode, deliver } from '../src/api/webhooks.js';
import { send, breakSubject, breakBody } from '../src/notify.js';
import {
  getDb, closeDb, reserveRunId, recordRun, claimDueTarget,
  lastRunFor, historyFor, markNotified, sql,
} from '../src/store/index.js';

const args = process.argv.slice(2);
const ONCE = args.includes('--once');
const POLL_MS = (Number(args[args.indexOf('--poll') + 1]) || 30) * 1000;
const sha16 = (s) => createHash('sha256').update(s || '').digest('hex').slice(0, 16);

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
function fetcherFor(url) {
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

/** Rebuild the baseline from the target's contract. */
async function baselineFor(target, $) {
  const el = pickTarget($, target.contract.resolver);
  if (!el) throw new Error('no target element in the capture');
  const golden = await putCapture($.html());
  return establishBaseline({
    $, el,
    field: target.contract.field,
    expected: target.contract.expected,
    goldenSha: golden.sha,
  });
}

/** Email first, webhook as the fallback. Never fatal to the run. */
async function notifyBreak({ target, field, diagnosis, runId, episodeId }) {
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
        await markNotified(episodeId, `webhook (email failed: ${e.message})`);
        return 'webhook';
      } catch (e2) {
        await markNotified(episodeId, `undelivered: ${e.message} / ${e2.message}`);
        return 'undelivered';
      }
    }
    await markNotified(episodeId, `undelivered: ${e.message}`);
    return 'undelivered';
  }
}

/** One target, start to finish. Returns a short line for the log. */
async function runOne(target) {
  const { targetId, contract } = target;
  const fetchPage = fetcherFor(target.url);
  const { $ } = await fetchPage();
  const html = $.html();
  const sha = digest(html);

  const last = await lastRunFor(targetId);
  const runId = await reserveRunId();

  // Skip-if-unchanged. The run is still RECORDED, with its page size, because
  // detect() guards on history.length >= 3 and robustZ needs an unbroken
  // series -- a silent gap here disarms the detector without ever erroring.
  if (last && last.page_sha && last.page_sha === sha) {
    await getDb().execute(
      sql`INSERT INTO runs (run_id, target_id, status, page_bytes, page_sha)
          VALUES (${runId}, ${targetId}, 'skipped', ${html.length}, ${sha})`,
    );
    return `${targetId}  run ${runId}  skipped (page unchanged, ${html.length} bytes)`;
  }

  const baseline = await baselineFor(target, $);
  const history = await historyFor(targetId);
  // Per RUN, not per page: a page that reverts to an earlier state would
  // otherwise collide on the unique proof_id, and a proof is about a run.
  const proofId = `pr_${sha16(`${targetId}${runId}${baseline.field}`)}`;

  const r = await runTarget({
    fetchPage, baseline, history,
    thresholds: contract.thresholds || { tau: 0.6, delta: 0.16 },
    meta: { run: runId, site: targetId },
    proofId,
  });

  const capture = r.event.event === 'ok'
    ? null
    : { ...(await putCapture(html)), url: target.url };

  await recordRun({
    runId, targetId, capture, result: r, proofId,
    groupKey: `${r.event.skeleton.after}:${baseline.field}`,
  });

  // An episode opens on a break and closes when the field recovers. openEpisode
  // returns null if one is already open -- that dedupe is why a template change
  // breaking 400 pages sends one message and not 400.
  const broken = r.status.status === 'quarantined';
  let note = '';
  if (broken) {
    const ep = await openEpisode({
      targetId, field: baseline.field, cause: r.event.attributed_cause, runId,
    });
    if (ep) {
      const how = await notifyBreak({
        target: targetId, field: baseline.field,
        diagnosis: r.event.diagnosis, runId, episodeId: ep.episodeId,
      });
      note = `  episode ${ep.episodeId} opened, notified via ${how}`;
    } else {
      note = '  (episode already open — no second alert)';
    }
  } else {
    const closed = await closeEpisode({ targetId, field: baseline.field, runId });
    if (closed) note = `  episode ${closed.episodeId} closed`;
  }

  return `${targetId}  run ${runId}  ${r.event.event}  ${r.status.status}${note}`;
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
      catch (e) { console.error(`${target.targetId}  failed: ${e.message}`); }
    }
    if (ONCE || stopping) { if (!claimed) console.log('nothing due'); break; }
    await new Promise((r) => setTimeout(r, POLL_MS));
  } while (!stopping);

  await closeDb();
  console.log('worker down');
};

main().catch(async (e) => { console.error(e); await closeDb(); process.exit(1); });
