// Drive Bright Data's REST self-healing flow and capture everything verbatim.
//
// Three separate invocations, deliberately. Starting a heal CANNOT approve one:
// `cmdHeal` has no path to `resume()` -- it polls to the approval gate, writes the
// transcript, prints the preview and exits. Approval is a second command a human
// types after reading that transcript. This is structural, not a default that can
// be flipped by a flag.
//
//   node tools/bd-heal.js --collector c_xxx --prompt "..."   [--out path]
//   node tools/bd-heal.js --collector c_xxx --approve
//   node tools/bd-heal.js --collector c_xxx --reject
//   node tools/bd-heal.js --verify [--out path]
//
// Endpoints (docs/BRIGHTDATA-CAPABILITIES.md 2):
//   POST /dca/collectors/{id}/refactor_template            body {prompt, custom_input?}
//   GET  /dca/collectors/{id}/refactor_template/progress
//   POST /dca/collectors/{id}/resume_automation_job        body {message, auto_save?}
//
// WHAT IS DOCUMENTED: only the gate. `status:"pending_answer"` with
// `step:"user_approval"` means it is waiting for a human. The pre-gate statuses,
// the post-approval statuses, the terminal statuses and the shape of
// `preview_result` are all UNDOCUMENTED. So this script assumes none of them: it
// records the full raw body of every poll and logs each distinct status string it
// has never seen before. Discovering the real state machine is half the point.

import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

import { diffGate, type DiffGateResult } from '../src/bd/diffgate.js';
import {
  liveCorroborationCheck, agentVerify, type LiveCheckResult, type AgentVerdict,
} from '../src/bd/verify.js';

const API = 'https://api.brightdata.com/dca/collectors';
const POLL_MS = 20_000;
const MAX_MS = 25 * 60_000;

const HELP = `
bright data self-healing driver -- capture mode, never auto-approves

  node tools/bd-heal.js --collector <id> --prompt "<text>" [--custom-input <json>] [--out <path>]
      start a heal, poll to the approval gate, write the transcript, print the
      preview, exit. Does not approve. Cannot approve. Also captures, once: a
      live re-fetch of the page (src/bd/verify.ts, real Web Unlocker traffic)
      re-checking the OLD selector on any field the code gate flags as newly
      derived from another, and an independent model's read of all of it
      (real Claude Agent SDK call, if a model is configured). Both are saved
      to the transcript and never re-run by --approve or --verify.

  node tools/bd-heal.js --collector <id> --approve [--no-save] [--force]
      approve the pending heal.  {"message": true, "auto_save": true}
      REFUSED if the captured preview fails the code gate (src/bd/diffgate.ts).
      --force approves over that refusal. The live re-fetch and model read
      captured at heal time print alongside it -- advisory only, neither blocks.

  node tools/bd-heal.js --collector <id> --reject
      reject the pending heal.   {"message": false}

  node tools/bd-heal.js --verify [--out <path>]
      apply every check to the preview captured in a transcript, offline: the
      output acceptance rules, the code gate over the proposed diff, and the
      live re-fetch / model read captured when the heal ran -- no new network
      calls, this replays what was already saved.

  --out <path>   transcript file. default: results/bd-heal-transcript.json
  --poll-ms N    override poll interval (default ${POLL_MS})
  --help

Auth: BRIGHTDATA_API_TOKEN in the environment. Never printed, never written.
`;

// --- args -------------------------------------------------------------------

const argv = process.argv.slice(2);
const flag = (n: any) => argv.includes(`--${n}`);
const arg = (n: any, d: any = null) => {
  const i = argv.indexOf(`--${n}`);
  return i > -1 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d;
};

if (flag('help') || !argv.length) {
  console.log(HELP);
  process.exit(0);
}

const COLLECTOR = arg('collector');
const OUT = arg('out', 'results/bd-heal-transcript.json');
const INTERVAL = Number(arg('poll-ms', POLL_MS));

// --- token ------------------------------------------------------------------

const TOKEN = process.env.BRIGHTDATA_API_TOKEN;

/**
 * Belt and braces. The token should never appear in a response body, but this
 * script writes raw bodies to disk verbatim, and "verbatim" plus "secret" is how
 * credentials end up in a repo. Everything printed or written goes through here.
 */
const redact = (s: any) =>
  TOKEN && typeof s === 'string' ? s.split(TOKEN).join('[REDACTED]') : s;
const safeJson = (obj: any) => redact(JSON.stringify(obj, null, 2));

function requireToken() {
  if (!TOKEN) {
    console.error(
      '\nerror: BRIGHTDATA_API_TOKEN is not set.\n' +
        '  export BRIGHTDATA_API_TOKEN=...   (get it from the Bright Data control panel)\n'
    );
    process.exit(2);
  }
}

function requireCollector() {
  if (!COLLECTOR) {
    console.error('\nerror: --collector <id> is required\n');
    process.exit(2);
  }
}

// --- http -------------------------------------------------------------------

/** Returns the RAW text alongside the parsed body. The raw text is what goes in
 *  the transcript -- parsing is a convenience, not the record. */
async function call(method: any, path: any, body?: any) {
  const res = await fetch(`${API}/${COLLECTOR}/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(60_000),
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* not JSON -- the raw text is still recorded */
  }
  return { http: res.status, ok: res.ok, raw: redact(text), json };
}

const sleep = (ms: any) => new Promise((r) => setTimeout(r, ms));
const stamp = () => new Date().toISOString();

async function save(transcript: any) {
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, safeJson(transcript));
}

// --- the acceptance check ---------------------------------------------------

/**
 * ACCEPTANCE GATE -- NOT ASSAY'S MARGIN GATE. THESE ARE DIFFERENT THINGS.
 *
 * Assay's gate (src/heal.js healGated) is a CONFIDENCE gate: it compares the top
 * two candidate scores and refuses when they are too close, before knowing
 * anything about whether the answer is right. It runs on Assay's own ranking and
 * has no access to Bright Data's internals.
 *
 * This function is an OUTPUT gate: it looks at a value Bright Data already
 * produced and asks whether it is shaped like a recall title. It is the check a
 * human would run by eye before clicking approve. It sees no scores, no runners
 * up, no margin -- it could not compute one if it wanted to.
 *
 * Reporting a Bright Data approval as having gone "through the margin gate" would
 * be a false claim about how the decision was made. It went through this.
 */
/**
 * A rule returns true (PASS), false (FAIL) or N_A. N_A means the preview does not
 * carry the evidence the rule needs, which is not the same as the rule being
 * violated, and must never be counted as one.
 */
const N_A = null;
const mark = (v: any) => (v === N_A ? 'N/A ' : v ? 'PASS' : 'FAIL');

function acceptance(row: any) {
  const t = row?.recall_title ?? null;
  const norm = (s: any) => String(s ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
  // recall_title and title_on_detail are produced by DIFFERENT pipeline stages:
  // the listing step emits recall_title, the detail step emits title_on_detail.
  // A preview covering only the listing step has no title_on_detail key at all,
  // and absence of the second value is not disagreement between the two. Reading
  // it as FAIL would reject a good heal for a reason that was never tested.
  const hasDetail = !!row && 'title_on_detail' in row;
  return [
    ['recall_title is non-null', t !== null && t !== undefined && String(t).trim() !== ''],
    ['matches /(recall|rappel|retirada|alert)/i', /(recall|rappel|retirada|alert)/i.test(String(t ?? ''))],
    ['at least 15 chars', String(t ?? '').trim().length >= 15],
    [
      'agrees with title_on_detail (case-insensitive)',
      hasDetail ? norm(t) === norm(row.title_on_detail) : N_A,
      hasDetail ? null : 'title_on_detail is absent from this preview (detail stage, not listing stage)',
    ],
  ];
}

/** preview_result's shape is undocumented, so scan the whole payload for objects
 *  carrying a recall_title key. Schema-definition objects carry that key too, and
 *  their values are field descriptors rather than strings -- stringifying one
 *  gives "[object Object]", which would sail past three of the four rules. So a
 *  candidate counts as data only when every value is a primitive. Returns the
 *  tally as well as the row: which rows were considered, and how many were thrown
 *  out as schema, is part of the answer. */
function findRow(node: any) {
  const considered: any[] = [];
  (function walk(n, depth) {
    if (!n || typeof n !== 'object' || depth > 8) return;
    if (!Array.isArray(n) && 'recall_title' in n) considered.push(n);
    for (const v of Array.isArray(n) ? n : Object.values(n)) walk(v, depth + 1);
  })(node, 0);
  const isData = (o: any) => Object.values(o).every((v) => v === null || typeof v !== 'object');
  const rows = considered.filter(isData);
  return { row: rows[0] ?? null, considered: considered.length, schema: considered.length - rows.length };
}

/** Prints the four rules and returns true unless a rule actually FAILED. */
function report(row: any, indent: any) {
  let failed = 0;
  let na = 0;
  for (const [rule, verdict, why] of acceptance(row)) {
    if (verdict === false) failed++;
    if (verdict === N_A) na++;
    console.log(`${indent}${mark(verdict)}  ${rule}${why ? `\n${indent}      N/A: ${why}` : ''}`);
  }
  return { failed, na };
}

/**
 * Print the code gate. Separate from `report()` because the two answer different
 * questions off different evidence: `report()` reads the row the proposal
 * produced, this reads the proposal itself. See src/bd/diffgate.ts.
 */
function reportDiff(g: DiffGateResult, indent: string) {
  console.log(`${indent}${g.decision === 'approve' ? 'PASS' : 'FAIL'}  code gate (${g.findings.length} finding(s))`);
  if (g.newlyPiped.length) {
    console.log(`${indent}      newly piped between stages: ${g.newlyPiped.join(', ')}`);
  }
  for (const f of g.findings) {
    console.log(`${indent}      ${f.rule}${f.field ? ` [${f.field}]` : ''}`);
    console.log(`${indent}        ${f.detail}`);
  }
  return g;
}

/**
 * Print the live re-fetch. Distinct from `reportDiff()` on purpose: that reads
 * the vendor's code, this reads the page as it exists right now, through the
 * same Bright Data Web Unlocker path ordinary monitoring uses. See
 * `src/bd/verify.ts`.
 */
function reportLive(live: LiveCheckResult | null, indent: string) {
  if (!live) {
    console.log(`${indent}N/A   not captured -- this transcript predates the live-fetch check`);
    return;
  }
  if (live.fetchError) {
    console.log(`${indent}FAIL  live re-fetch of ${live.url}: ${live.fetchError}`);
    return;
  }
  if (!live.url) {
    console.log(`${indent}N/A   template_a carries no url to re-fetch`);
    return;
  }
  if (!live.fields.length) {
    console.log(`${indent}N/A   no corroboration_collapse findings to re-check live`);
    return;
  }
  console.log(`${indent}live re-fetch of ${live.url} (via ${live.fetchedVia}):`);
  for (const f of live.fields) {
    const mark = !f.verifiable ? 'N/A ' : f.stillResolves ? 'PASS' : 'FAIL';
    console.log(`${indent}  ${mark}  ${f.field}`);
    console.log(`${indent}        ${f.detail}`);
  }
}

/** Print the independent model's read. Never printed as a decision -- see the type's own header. */
function reportAgent(v: AgentVerdict | null, indent: string) {
  if (!v) {
    console.log(`${indent}N/A   no model configured, or the call failed -- no second opinion`);
    return;
  }
  console.log(`${indent}${v.recommendation}  (agrees with code gate: ${v.agrees_with_diff_gate ?? 'unstated'})`);
  for (const c of v.concerns) console.log(`${indent}  - ${c}`);
}

/** The saved transcript, or null. Both `--verify` and `--approve` need it, and
 *  approving without one means approving something nobody captured. */
async function loadTranscript() {
  try {
    return JSON.parse(await readFile(OUT, 'utf8'));
  } catch {
    return null;
  }
}

// --- commands ---------------------------------------------------------------

async function cmdHeal() {
  requireToken();
  requireCollector();
  const prompt = arg('prompt');
  if (!prompt) {
    console.error('\nerror: --prompt "<text>" is required to start a heal\n');
    process.exit(2);
  }
  if (prompt.length > 1000) {
    console.error(`\nerror: prompt is ${prompt.length} chars; the API caps it at 1000\n`);
    process.exit(2);
  }

  const customInput = arg('custom-input');
  // TODO(types): the transcript is a growing record of an undocumented
  // vendor API's responses. Typing it would be asserting a shape the vendor
  // has not published, which is the opposite of what this file exists to do.
  const transcript: any = {
    collector: COLLECTOR,
    prompt,
    custom_input: customInput ? JSON.parse(customInput) : undefined,
    started_at: stamp(),
    finished_at: null,
    poll_interval_ms: INTERVAL,
    max_wait_ms: MAX_MS,
    // every distinct status string we observed, in the order we first saw it.
    // this list IS the discovered state machine -- do not pre-populate it.
    statuses_seen: [],
    trigger: null,
    polls: [],
    gate: { reached: false, at: null },
    preview: null,
    outcome: null,
    // Both captured ONCE, here, when the gate is first reached -- never
    // re-run by --approve or --verify. Each is a real fetch and a real model
    // call; replaying them on every later invocation would mean --verify is
    // no longer an offline replay of committed evidence, and would silently
    // judge a DIFFERENT, later state of the page than the one this run saw.
    live_check: null,
    agent_verdict: null,
  };

  console.log(`\nbd-heal  collector ${COLLECTOR}`);
  console.log(`  prompt "${prompt.slice(0, 70)}${prompt.length > 70 ? '...' : ''}"`);

  const trig = await call('POST', 'refactor_template', {
    prompt,
    ...(transcript.custom_input ? { custom_input: transcript.custom_input } : {}),
  });
  transcript.trigger = { at: stamp(), http: trig.http, body_raw: trig.raw, body: trig.json };
  console.log(`  trigger -> HTTP ${trig.http}`);
  if (!trig.ok) {
    transcript.outcome = 'trigger_failed';
    transcript.finished_at = stamp();
    await save(transcript);
    console.error(`\ntrigger failed. transcript -> ${OUT}\n${trig.raw.slice(0, 400)}\n`);
    process.exit(1);
  }

  const deadline = Date.now() + MAX_MS;
  let n = 0;
  while (Date.now() < deadline) {
    await sleep(INTERVAL);
    n++;
    const p = await call('GET', 'refactor_template/progress');
    const at = stamp();
    // FULL raw body of EVERY poll. Non-negotiable: the undocumented states are
    // only recoverable from the bodies we kept.
    transcript.polls.push({ n, at, http: p.http, body_raw: p.raw, body: p.json });

    const status = p.json?.status ?? `<http ${p.http}, unparsed>`;
    const step = p.json?.step ?? null;
    const key = `${status}${step ? `/${step}` : ''}`;
    if (!transcript.statuses_seen.some((s: any) => s.key === key)) {
      transcript.statuses_seen.push({ key, status, step, first_seen_at: at, poll: n });
      console.log(`  ${at}  poll ${n}  NEW STATUS  ${key}`);
    } else {
      process.stdout.write(`  poll ${n} ${key}\r`);
    }
    await save(transcript); // checkpoint every poll -- a 25 min run must survive a ^C

    // The ONLY condition we are documented to recognise. Everything else keeps
    // polling; we do not guess that some other string means "done" or "failed".
    if (status === 'pending_answer' && step === 'user_approval') {
      transcript.gate = { reached: true, at, poll: n, body: p.json };
      transcript.preview = p.json?.preview_result ?? p.json?.preview ?? p.json ?? null;
      transcript.outcome = 'gate_reached';
      break;
    }
  }

  if (!transcript.gate.reached) {
    transcript.outcome = 'timed_out_before_gate';
    console.log(`\n  timed out after ${Math.round(MAX_MS / 60000)} min without reaching the gate.`);
    console.log(`  statuses observed: ${transcript.statuses_seen.map((s: any) => s.key).join(', ') || 'none'}`);
  }

  transcript.finished_at = stamp();
  await save(transcript);

  console.log(`\n  transcript -> ${OUT}`);
  if (transcript.gate.reached) {
    console.log(`\n  APPROVAL GATE REACHED. preview:\n`);
    console.log(safeJson(transcript.preview).split('\n').slice(0, 60).join('\n'));
    const { row, considered, schema } = findRow(transcript.preview);
    console.log(`\n  acceptance check:`);
    console.log(`    ${considered} candidate row(s) considered, ${schema} rejected as schema rather than data`);
    if (!row) console.log('    no data row with a recall_title key found in the preview');
    else report(row, '    ');
    console.log(`\n  code gate:`);
    const g = diffGate(transcript.preview, { prompt });
    reportDiff(g, '    ');

    console.log(`\n  live re-fetch (independent of the vendor's code):`);
    const live = await liveCorroborationCheck(transcript.preview, g.findings);
    transcript.live_check = live;
    reportLive(live, '    ');

    console.log(`\n  independent model read:`);
    const verdict = await agentVerify({
      diffFindings: g.findings,
      live,
      templateBCode: safeJson(transcript.preview?.diff?.template_b ?? null),
      prompt,
    });
    transcript.agent_verdict = verdict;
    reportAgent(verdict, '    ');

    await save(transcript);

    console.log(
      `\n  NOT approved. Nothing was changed on the collector.\n` +
        `  To approve:  node tools/bd-heal.js --collector ${COLLECTOR} --approve\n` +
        `  To reject:   node tools/bd-heal.js --collector ${COLLECTOR} --reject\n`
    );
  }
}

/** The only place resume_automation_job is called. Reached only from --approve
 *  or --reject, which cmdHeal cannot invoke. */
async function resume(message: any) {
  requireToken();
  requireCollector();

  // Rejecting is always safe -- it leaves the collector as it is -- so only the
  // approval path is gated. The gate reads the transcript rather than re-polling:
  // the preview it judges must be the same bytes the operator read.
  if (message) {
    const t = await loadTranscript();
    if (!t?.preview) {
      console.error(
        `\nerror: no captured preview at ${OUT}.\n` +
          `  Approving means committing a code change nobody looked at. Run the heal first:\n` +
          `    node tools/bd-heal.js --collector ${COLLECTOR} --prompt "..."\n` +
          `  or pass --force to approve without a captured preview.\n`
      );
      if (!flag('force')) process.exit(2);
    } else {
      const g = diffGate(t.preview, { prompt: t.prompt || '' });
      console.log(`\ncode gate on ${OUT}:`);
      reportDiff(g, '  ');
      // Read from the transcript, never re-fetched: both were captured once,
      // at heal-capture time, against the page as it existed then. Advisory
      // only -- neither blocks approval, and only --force overrides the code
      // gate above, which is the one check this file has ever treated as a
      // refusal rather than evidence for the human reading this.
      console.log(`\nlive re-fetch captured at heal time:`);
      reportLive(t.live_check ?? null, '  ');
      console.log(`\nindependent model read captured at heal time:`);
      reportAgent(t.agent_verdict ?? null, '  ');
      if (g.decision === 'reject' && !flag('force')) {
        console.error(
          `\n  REFUSED. Not approving: the proposal fails the code gate above.\n` +
            `  This is a fact about the proposed code, not about the row it produced.\n` +
            `  To reject it on the collector:  node tools/bd-heal.js --collector ${COLLECTOR} --reject\n` +
            `  To override this gate:          add --force\n`
        );
        process.exit(1);
      }
      if (g.decision === 'reject') console.log('\n  --force given: approving over the code gate.');
    }
  }

  const body = message ? { message: true, auto_save: !flag('no-save') } : { message: false };
  console.log(`\n${message ? 'APPROVING' : 'REJECTING'} collector ${COLLECTOR}  ${JSON.stringify(body)}`);
  const r = await call('POST', 'resume_automation_job', body);
  console.log(`  HTTP ${r.http}\n${redact(r.raw).slice(0, 800)}\n`);
  if (!r.ok) process.exit(1);
}

async function cmdVerify() {
  const transcript = await loadTranscript();
  if (!transcript) {
    console.error(`\nerror: cannot read transcript ${OUT}\n`);
    process.exit(2);
  }
  const { row, considered, schema } = findRow(transcript.preview ?? transcript);
  console.log(`\nacceptance check on ${OUT}`);
  console.log(`  ${considered} candidate row(s) considered, ${schema} rejected as schema rather than data`);
  if (!row) {
    console.error('  no data row with a recall_title key found -- nothing to verify\n');
    process.exit(1);
  }
  console.log(`  recall_title      ${JSON.stringify(row.recall_title)}`);
  console.log(
    `  title_on_detail   ${'title_on_detail' in row ? JSON.stringify(row.title_on_detail) : '(absent from this preview)'}\n`
  );
  const { failed, na } = report(row, '  ');
  const tally = `${4 - failed - na} pass, ${failed} fail, ${na} not evaluable`;

  // The two verdicts are printed separately and ANDed. Collapsing them into one
  // number would hide which kind of evidence lost, and they are not commensurable:
  // one is about a value, the other about the code that produced it.
  console.log(`\n  code gate:`);
  const g = reportDiff(diffGate(transcript.preview ?? transcript, { prompt: transcript.prompt || '' }), '  ');

  // Both read from the transcript -- --verify replays committed evidence
  // offline, same as every other check in this command. Advisory only, same
  // as in --approve: only the code gate above and the output rules block ACCEPT.
  console.log(`\n  live re-fetch captured at heal time:`);
  reportLive(transcript.live_check ?? null, '    ');
  console.log(`\n  independent model read captured at heal time:`);
  reportAgent(transcript.agent_verdict ?? null, '    ');

  const blocked = failed > 0 || g.decision === 'reject';
  console.log(`\n  ${blocked ? 'DO NOT ACCEPT' : 'ACCEPT'}  (output: ${tally}; code: ${g.decision})`);
  if (na) console.log(`  ${na} rule(s) were not evaluable here, so this output verdict rests on ${4 - na}.`);
  console.log('');
  // N/A is not a failure. Only a rule that was evaluated and lost blocks acceptance.
  process.exit(blocked ? 1 : 0);
}

// --- dispatch ---------------------------------------------------------------
// One mode per invocation. --approve and --reject are separate entry points, not
// options on the heal path.

if (flag('verify')) await cmdVerify();
else if (flag('approve')) await resume(true);
else if (flag('reject')) await resume(false);
else await cmdHeal();
