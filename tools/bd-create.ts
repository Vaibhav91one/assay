// Provision a brand new Bright Data collector, from nothing.
//
// The gap this closes: `tools/bd-heal.ts` (and everything under `src/bd/`) operates
// on an EXISTING collector, given by id. Nothing in this codebase ever created one --
// a watch target with no manually-provisioned collector had no recovery path at all
// once healGated left the runtime pipeline (see docs/FEATURES.md, "F10/F11 retired").
// This script is that missing first step. It does not wire the result into Assay's
// own store or the live pipeline -- see "what this does NOT do" below.
//
//   node tools/bd-create.js --url <url> --description "<text>" [--name <name>]
//       [--deliver-webhook <url>] [--out <path>]
//
// Endpoints. Bright Data's public API reference documents /dca/trigger and
// /dca/dataset for RUNNING a collector, and refactor_template/resume_automation_job
// (docs/BRIGHTDATA-CAPABILITIES.md 2) for HEALING one -- but nowhere documents how
// to CREATE one. These three were confirmed by reading brightdata/cli's own source
// (github.com/brightdata/cli, src/commands/scraper.ts, `scraper create`), the same
// way this file's sibling verified refactor_template before it existed here:
//
//   POST /dca/collector                              body {name, deliver}
//        -> {id, name, zone?, active?, created?}       creates an empty template
//   POST /dca/collectors/{id}/automate_template       body {description, urls}
//        -> {id, queued}                                triggers AI-Flow generation
//   GET  /dca/collectors/{id}/automate_template/progress
//        -> {status, step?, completed_steps?, diff?, preview_result?}
//
// AI-Flow generation is billed at $0 API cost (docs/BRIGHTDATA-CAPABILITIES.md 49,
// row C1) -- only page loads during the run itself are metered, same as a heal.
//
// WHAT THIS DOES NOT DO. It does not write a collector_id anywhere in Assay's store:
// there is no `target -> collector_id` column, on purpose -- bd-heal.ts's own
// `--collector <id>` is the same out-of-band, human-supplied design, and this stays
// consistent with it. It does not wire `--deliver-webhook` into Assay's ingestion
// path automatically: doing that correctly means setting the Authorization header
// Bright Data echoes back at TRIGGER time (src/connectors/brightdata.ts's own header
// comment), which is a per-run trigger concern this script never reaches. The
// printed output states the real URL a human can point it at, and leaves wiring it
// to them -- the same "a human types the next command" discipline bd-heal.ts uses
// for approval.

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

const API = 'https://api.brightdata.com/dca';
const POLL_MS = 20_000;
const MAX_MS = 12 * 60_000; // the CLI's own docs: "AI generation takes 5 to 10 minutes"
const DONE_STATUS = 'done';
const TERMINAL_FAIL_STATUSES = ['failed', 'error', 'cancelled'];
const AWAITING_STATUS = 'pending_answer';
const PROMPT_MAX_LEN = 500; // the CLI's own <description> limit

const HELP = `
bright data collector provisioning -- creates one from nothing, never wires it in

  node tools/bd-create.js --url <url> --description "<text>" [--name <name>]
      [--deliver-webhook <url>] [--out <path>]
      create a collector template (POST /dca/collector), trigger AI-Flow
      generation from the url + description (POST .../automate_template), poll
      to a terminal state, and write a transcript. Prints the new collector_id
      and the exact next commands: \`bdata scraper run\`, or Assay's own
      tools/bd-heal.js once this collector needs a fix later.

  --out <path>            transcript file. default: results/bd-create-transcript.json
  --poll-ms N             override poll interval (default ${POLL_MS})
  --name <name>           collector name (default: assay-create-<timestamp>)
  --deliver-webhook <url> where scraped rows land on a future run
                          (default: https://example.com/webhook -- a stub, same
                          as \`bdata scraper create\`'s own default. See "what
                          this does NOT do" in the file header before pointing
                          this at Assay's real delivery URL.)
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

const URL_ARG = arg('url');
const DESCRIPTION = arg('description');
const NAME = arg('name', `assay-create-${Math.floor(Date.now() / 1000)}`);
const DELIVER_WEBHOOK = arg('deliver-webhook', 'https://example.com/webhook');
const OUT = arg('out', 'results/bd-create-transcript.json');
const INTERVAL = Number(arg('poll-ms', POLL_MS));

// --- token --------------------------------------------------------------------

const TOKEN = process.env.BRIGHTDATA_API_TOKEN;

/** Same belt-and-braces redaction as bd-heal.ts: raw bodies get written to disk
 *  verbatim, and "verbatim" plus "secret" is how credentials end up in a repo. */
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

function requireArgs() {
  if (!URL_ARG) {
    console.error('\nerror: --url <url> is required\n');
    process.exit(2);
  }
  try {
    new globalThis.URL(URL_ARG);
  } catch {
    console.error(`\nerror: --url "${URL_ARG}" is not a valid URL\n`);
    process.exit(2);
  }
  if (!DESCRIPTION) {
    console.error('\nerror: --description "<text>" is required\n');
    process.exit(2);
  }
  if (DESCRIPTION.length > PROMPT_MAX_LEN) {
    console.error(
      `\nerror: description is ${DESCRIPTION.length} chars; the API caps it at ${PROMPT_MAX_LEN}\n`
    );
    process.exit(2);
  }
}

// --- http ---------------------------------------------------------------------

/** Returns the RAW text alongside the parsed body, same convention as bd-heal.ts:
 *  the raw text is what goes in the transcript, parsing is a convenience only. */
async function call(method: any, path: any, body?: any) {
  const res = await fetch(`${API}${path}`, {
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

// --- the command ----------------------------------------------------------------

async function cmdCreate() {
  requireToken();
  requireArgs();

  const transcript: any = {
    url: URL_ARG,
    description: DESCRIPTION,
    name: NAME,
    deliver_webhook: DELIVER_WEBHOOK,
    started_at: stamp(),
    finished_at: null,
    poll_interval_ms: INTERVAL,
    max_wait_ms: MAX_MS,
    collector_id: null,
    template: null,
    trigger: null,
    // every distinct status string observed, in the order first seen -- this
    // list IS the discovered state machine, same discipline as bd-heal.ts.
    statuses_seen: [],
    polls: [],
    outcome: null,
    preview: null,
  };

  console.log(`\nbd-create  ${URL_ARG}`);
  console.log(`  description "${DESCRIPTION.slice(0, 70)}${DESCRIPTION.length > 70 ? '...' : ''}"`);

  const template = await call('POST', '/collector', {
    name: NAME,
    deliver: {
      type: 'webhook',
      endpoint: DELIVER_WEBHOOK,
      filename: { template: 'data', extension: 'json' },
    },
  });
  transcript.template = { at: stamp(), http: template.http, body_raw: template.raw, body: template.json };
  console.log(`  create template -> HTTP ${template.http}`);
  if (!template.ok || !template.json?.id) {
    transcript.outcome = 'template_failed';
    transcript.finished_at = stamp();
    await save(transcript);
    console.error(`\ntemplate creation failed. transcript -> ${OUT}\n${template.raw.slice(0, 400)}\n`);
    process.exit(1);
  }
  const collectorId = template.json.id as string;
  transcript.collector_id = collectorId;
  console.log(`  collector: ${collectorId}`);
  await save(transcript);

  const trig = await call('POST', `/collectors/${collectorId}/automate_template`, {
    description: DESCRIPTION,
    urls: [URL_ARG],
  });
  transcript.trigger = { at: stamp(), http: trig.http, body_raw: trig.raw, body: trig.json };
  console.log(`  trigger AI-Flow -> HTTP ${trig.http}`);
  if (!trig.ok) {
    transcript.outcome = 'trigger_failed';
    transcript.finished_at = stamp();
    await save(transcript);
    console.error(
      `\ntrigger failed. Half-built collector left at ${collectorId} -- ` +
        `Bright Data does not expose programmatic deletion; inspect or delete it ` +
        `at https://brightdata.com/cp/scrapers/${collectorId}.\n` +
        `transcript -> ${OUT}\n${trig.raw.slice(0, 400)}\n`
    );
    process.exit(1);
  }

  const deadline = Date.now() + MAX_MS;
  let n = 0;
  let finalStatus: string | null = null;
  while (Date.now() < deadline) {
    await sleep(INTERVAL);
    n++;
    const p = await call('GET', `/collectors/${collectorId}/automate_template/progress`);
    const at = stamp();
    // FULL raw body of every poll -- same reasoning as bd-heal.ts: the shape of
    // `preview_result` and every non-`done` status here is undocumented.
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
    await save(transcript); // checkpoint every poll -- a 10 min run must survive a ^C

    if (status === DONE_STATUS || TERMINAL_FAIL_STATUSES.includes(status)) {
      finalStatus = status;
      transcript.preview = p.json ?? null;
      break;
    }
    // Undocumented for the CREATE flow specifically -- the official CLI does not
    // special-case it here, but bd-heal.ts's gate uses exactly this status/step
    // pair for the SAME progress shape on a heal, so stopping rather than
    // guessing past it is the same discipline, not a new assumption.
    if (status === AWAITING_STATUS && step === 'user_approval') {
      finalStatus = status;
      transcript.preview = p.json ?? null;
      break;
    }
  }

  transcript.finished_at = stamp();
  if (!finalStatus) {
    transcript.outcome = 'timed_out';
    await save(transcript);
    console.log(`\n  timed out after ${Math.round(MAX_MS / 60000)} min without a terminal status.`);
    console.log(`  statuses observed: ${transcript.statuses_seen.map((s: any) => s.key).join(', ') || 'none'}`);
    console.log(`  collector ${collectorId} left half-built -- ${transcript.polls.length} poll(s) saved to ${OUT}`);
    process.exit(1);
  }

  transcript.outcome = finalStatus;
  await save(transcript);

  if (finalStatus !== DONE_STATUS) {
    console.error(
      `\n  AI generation did not complete (status: ${finalStatus}).\n` +
        `  Inspect or retry at https://brightdata.com/cp/scrapers/${collectorId}.\n` +
        `  transcript -> ${OUT}\n`
    );
    process.exit(1);
  }

  const steps = transcript.preview?.completed_steps?.length ?? 0;
  console.log(`\n  DONE. collector ${collectorId} -- ${steps} completed step(s).`);
  console.log(`  transcript -> ${OUT}`);
  console.log(`\n  next:`);
  console.log(`    review:   https://brightdata.com/cp/scrapers/${collectorId}`);
  console.log(`    run it:   bdata scraper run ${collectorId} ${URL_ARG}   (official CLI; not this repo's own bd-heal.js, which only drives an existing heal)`);
  console.log(`    heal it (once it later breaks): node tools/bd-heal.js --collector ${collectorId} --prompt "..."`);
  console.log(
    `\n  This collector delivers to ${DELIVER_WEBHOOK}, a stub. To feed it into ` +
      `Assay's own pipeline, point a real run's delivery at ` +
      `<assay-base-url>/api/v1/connectors/brightdata/delivery/<target-slug> and set ` +
      `the trigger-time auth header src/connectors/brightdata.ts documents -- that ` +
      `wiring is a human decision this script does not make for you.\n`
  );
}

await cmdCreate();
