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

const API = 'https://api.brightdata.com/dca/collectors';
const POLL_MS = 20_000;
const MAX_MS = 25 * 60_000;

const HELP = `
bright data self-healing driver -- capture mode, never auto-approves

  node tools/bd-heal.js --collector <id> --prompt "<text>" [--custom-input <json>] [--out <path>]
      start a heal, poll to the approval gate, write the transcript, print the
      preview, exit. Does not approve. Cannot approve.

  node tools/bd-heal.js --collector <id> --approve [--no-save]
      approve the pending heal.  {"message": true, "auto_save": true}

  node tools/bd-heal.js --collector <id> --reject
      reject the pending heal.   {"message": false}

  node tools/bd-heal.js --verify [--out <path>]
      apply the acceptance check to the preview captured in a transcript.

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
  const body = message ? { message: true, auto_save: !flag('no-save') } : { message: false };
  console.log(`\n${message ? 'APPROVING' : 'REJECTING'} collector ${COLLECTOR}  ${JSON.stringify(body)}`);
  const r = await call('POST', 'resume_automation_job', body);
  console.log(`  HTTP ${r.http}\n${redact(r.raw).slice(0, 800)}\n`);
  if (!r.ok) process.exit(1);
}

async function cmdVerify() {
  let transcript;
  try {
    transcript = JSON.parse(await readFile(OUT, 'utf8'));
  } catch (err) {
    console.error(`\nerror: cannot read transcript ${OUT}: ${(err as Error).message}\n`);
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
  console.log(`\n  ${failed ? 'DO NOT ACCEPT' : 'ACCEPT'}  (${tally})`);
  if (na) console.log(`  ${na} rule(s) were not evaluable here, so this verdict rests on ${4 - na}.`);
  console.log('');
  // N/A is not a failure. Only a rule that was evaluated and lost blocks acceptance.
  process.exit(failed ? 1 : 0);
}

// --- dispatch ---------------------------------------------------------------
// One mode per invocation. --approve and --reject are separate entry points, not
// options on the heal path.

if (flag('verify')) await cmdVerify();
else if (flag('approve')) await resume(true);
else if (flag('reject')) await resume(false);
else await cmdHeal();
