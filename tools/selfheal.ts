// The claim, re-established on a real site, unattended.
//
//   npx tsx tools/selfheal.ts
//
// `npm run bench` and `npm run replay` measure the engine against a frozen
// corpus. They are reproducible to the byte, which is what makes them evidence
// -- and also what makes them a closed loop: nothing in them ever fetches
// anything. This runs the same claim against a page that is actually served,
// on a schedule, with nobody watching.
//
// It goes through `ingestPage`, so it is the path the worker takes and the path
// a Bright Data delivery takes -- not a re-implementation that could pass while
// the deployed one is broken (which is exactly the bug test/baseline.test.ts
// exists for). Every variant gets a run row, a proof record, a cell and a
// baseline, and then gives them back: see `cleanup`. Nothing here carries state
// from one run to the next, and that is deliberate -- a baseline left behind
// would mean tomorrow's run measured against the page today healed to, and the
// number would move for a reason that is not the site's.
//
// THE ASSERTION IS THE PRODUCT'S THESIS.
//
//   For every mutated variant, Assay either publishes the correct value or it
//   publishes nothing. It never publishes a wrong one.
//
// Not "it healed" -- abstaining is a correct answer, and on `remove_field` it
// is the ONLY correct answer. Not "it ran" -- a green check that says bytes
// were fetched proves nothing about the number this project claims. A run that
// abstained on everything would satisfy "0 wrong" vacuously, so the summary
// also carries the heal and hold counts and the workflow asserts both are
// non-zero.
//
// EXIT CODES. A scheduled job against somebody else's host will sometimes fail
// for reasons that are not Assay's, and a check that cannot tell the two apart
// is a check nobody trusts.
//
//   0   every variant healed correctly or abstained
//   1   Assay published a wrong value, or the run itself broke
//   75  the testbed was unreachable (EX_TEMPFAIL) -- nothing was measured
//
// Every fetch happens before the database is touched. After the network phase
// there is no network left, so a failure past that line is Assay's.

import { load, type CheerioAPI } from 'cheerio';
import { ingestPage, type TargetRow } from '../src/connectors/ingest.js';
import { getDb, closeDb, targets, sql } from '../src/store/index.js';

const BASE = (process.env.ASSAY_TESTBED || 'https://assay-testbed.vercel.app').replace(/\/$/, '');
const FIELD = 'recall_title';
const EX_TEMPFAIL = 75;

/**
 * The tracked field, pinned to one notice.
 *
 * `include: halden` resolves to exactly one element on the reference page: the
 * title of notice 2026-014. The product name also appears in that card's `<dd>`
 * value, which `tags` does not admit. This resolver is consulted ONCE, on the
 * first run, to choose the baseline -- every later run reads through
 * `baseline.selector` and, when that stops matching, through the heal gate.
 */
const CONTRACT = {
  field: FIELD,
  expected: { regex: '(recall|aterkallelse)', regexFlags: 'i', minLen: 20 },
  resolver: { tags: 'h2,h3,a,li', flags: 'i', minLen: 20, maxLen: 140, include: 'halden' },
  thresholds: { tau: 0.6, delta: 0.16 },
};

/** What the testbed says the correct answer is, from its own index table. */
type Expectation = 'target' | 'none' | 'ambiguous';
interface Variant { id: string; label: string; expect: Expectation }

const norm = (s: string): string => s.replace(/\s+/g, ' ').trim();

/** Parse and strip exactly as `ingestPage` does, so truth is read off the same DOM. */
function parse(html: string): CheerioAPI {
  const $ = load(html);
  $('script,style,noscript').remove();
  return $;
}

/**
 * Every element whose text names the tracked notice and whose children do not.
 *
 * The `<dl>` exclusion is the whole subtlety: the card repeats the product name
 * in its Product value, and that value is not the field. Everything else about
 * the rule survives the mutations by construction -- it reads no class, no id,
 * no tag and no position, which is precisely what `rename_class`, `strip_id`,
 * `swap_tag`, `wrapper_div` and `reorder_siblings` each break.
 */
function candidates($: CheerioAPI): string[] {
  const out: string[] = [];
  $('*').each((_, el) => {
    const t = norm($(el).text());
    if (!/halden/i.test(t)) return;
    if ($(el).parents('dl').length) return;
    if ($(el).find('*').toArray().some((c) => /halden/i.test($(c).text()))) return;
    out.push(t);
  });
  return out;
}

/**
 * The value a correct heal publishes on this variant, or null if there is none.
 *
 * Exact agreement with the reference value comes first, because
 * `duplicate_similar` plants a near-identical decoy and the decoy is the one
 * that differs. Where no candidate matches -- `translate_text` rewrites the
 * words -- a single remaining candidate is the answer. Zero candidates is
 * `remove_field`, where the honest answer is to publish nothing.
 */
function truthFor($: CheerioAPI, reference: string): string | null {
  const c = candidates($);
  if (c.includes(reference)) return reference;
  return c.length === 1 ? c[0]! : null;
}

/** Fetch, with two retries. Returns null rather than throwing: the caller
 *  turns an absent page into EX_TEMPFAIL, never into a failed assertion. */
async function fetchPage(url: string): Promise<string | null> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(30_000),
        headers: { 'user-agent': 'assay-selfheal (+https://github.com/Vaibhav91one/assay)' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (e) {
      const why = (e as Error).message.split('\n')[0];
      console.log(`  fetch ${url} attempt ${attempt}/3 failed: ${why}`);
      if (attempt < 3) await new Promise((r) => setTimeout(r, attempt * 2000));
    }
  }
  return null;
}

/** The variants the testbed actually publishes, read off its index rather than
 *  hardcoded here -- a variant added there is exercised without a code change,
 *  and one removed stops being silently skipped. */
function readIndex(html: string): Variant[] {
  const rows = html.match(/<tr>[\s\S]*?<\/tr>/g) || [];
  const out: Variant[] = [];
  for (const row of rows) {
    const m = row.match(/href="\/v\/([a-z0-9_]+)\/"[^>]*>([^<]*)</);
    const e = row.match(/<code>(target|none|ambiguous)<\/code>/);
    const label = row.match(/<td>([^<]*)<\/td>\s*<td><code>/);
    if (m && e) out.push({ id: m[1]!, label: norm(label?.[1] || ''), expect: e[1] as Expectation });
  }
  return out;
}

const PREFIX = 'testbed_';

/** Everything this tool writes, in FK order. Re-running is not append-only:
 *  a stale baseline from a previous run would make the next one measure a
 *  different thing -- run two would be held against the page run one healed to,
 *  and the number would drift for a reason that is not the site's. */
async function wipe(targetId: string): Promise<void> {
  const d = getDb();
  await d.execute(sql`DELETE FROM queue_items WHERE proof_id IN (
    SELECT fr.proof_id FROM field_runs fr JOIN runs r ON r.run_id = fr.run_id
    WHERE r.target_id = ${targetId})`);
  await d.execute(sql`DELETE FROM field_runs WHERE run_id IN (
    SELECT run_id FROM runs WHERE target_id = ${targetId})`);
  await d.execute(sql`DELETE FROM heal_history WHERE target_id = ${targetId}`);
  await d.execute(sql`DELETE FROM episodes WHERE target_id = ${targetId}`);
  await d.execute(sql`DELETE FROM runs WHERE target_id = ${targetId}`);
  await d.execute(sql`DELETE FROM field_state WHERE target_id = ${targetId}`);
}

/**
 * Leave the database as it was found.
 *
 * These targets are a measurement, not an operator's scrape list, and a row in
 * `targets` is not inert: the worker's scheduler is one SELECT against that
 * table, so nine rows left behind become nine live scrapes of somebody else's
 * site. They also change what every "list the targets" reader sees. Run against
 * a development database without this and three unrelated suites start failing.
 */
async function cleanup(ids: string[]): Promise<void> {
  for (const id of ids) {
    await wipe(id);
    await getDb().execute(sql`DELETE FROM targets WHERE target_id = ${id}`);
  }
}

const pad = (s: string, n: number) => (s.length >= n ? s : s + ' '.repeat(n - s.length));
const num = (v: number | null | undefined) => (v == null ? '     -' : v.toFixed(4));
const quote = (s: string | null) => (s === null ? '(nothing)' : JSON.stringify(s));

async function main(): Promise<number> {
  console.log(`selfheal — ${BASE}\n`);

  // ---- network phase. Nothing below this block touches the wire. ----
  const index = await fetchPage(`${BASE}/`);
  if (!index) {
    console.log(`\n::notice::testbed unreachable: ${BASE}/ did not answer`);
    console.log('selfheal: testbed unreachable, nothing measured');
    return EX_TEMPFAIL;
  }
  const all = readIndex(index);
  if (!all.length) {
    console.log(`\n::notice::testbed unreachable: ${BASE}/ answered but lists no variants`);
    console.log('selfheal: testbed unreachable, nothing measured');
    return EX_TEMPFAIL;
  }

  // `/recalls` is the address the target is configured for. The reference run
  // fetches THAT, not `/v/baseline/`: healing means the page changed at the
  // address the scraper was already pointed at.
  const referenceHtml = await fetchPage(`${BASE}/recalls`);
  const variants = all.filter((v) => v.id !== 'baseline');
  const pages = new Map<string, string>();
  for (const v of variants) {
    const html = await fetchPage(`${BASE}/v/${v.id}/`);
    if (html) pages.set(v.id, html);
  }
  if (!referenceHtml || pages.size !== variants.length) {
    const missing = variants.filter((v) => !pages.has(v.id)).map((v) => v.id);
    console.log(`\n::notice::testbed unreachable: ${!referenceHtml ? '/recalls' : ''} ${missing.join(' ')}`.trim());
    console.log('selfheal: testbed unreachable, nothing measured');
    return EX_TEMPFAIL;
  }
  console.log(`fetched /recalls and ${variants.length} variants\n`);

  // ---- everything from here is Assay. A failure below is a real one. ----
  const reference = candidates(parse(referenceHtml));
  if (reference.length !== 1) {
    console.log(`::error::the reference page names the tracked notice ${reference.length} times, `
      + 'so there is no unambiguous truth to measure against');
    reference.forEach((t) => console.log(`  candidate: ${quote(t)}`));
    return 1;
  }
  const referenceValue = reference[0]!;
  console.log(`tracked field  ${FIELD}`);
  console.log(`truth on /recalls  ${quote(referenceValue)}\n`);

  console.log(`  ${pad('variant', 20)}${pad('testbed', 11)}${pad('verdict', 13)}`
    + `${pad('score', 9)}${pad('margin', 9)}published`);

  const created: string[] = [];
  try {
    return await measure(variants, pages, referenceHtml, referenceValue, created);
  } finally {
    await cleanup(created);
  }
}

async function measure(
  variants: Variant[],
  pages: Map<string, string>,
  referenceHtml: string,
  referenceValue: string,
  created: string[],
): Promise<number> {
  // `correct` and `healed` are deliberately different counts. Several
  // mutations do not break the stored selector at all -- `strip_id` removes
  // attributes the selector never used -- so those runs read `live` and publish
  // the right value without healing anything. Counting them as heals would let
  // the heal count survive a heal gate that had stopped working.
  let correct = 0;
  let healed = 0;
  let held = 0;
  const wrong: string[] = [];

  for (const v of variants) {
    const targetId = `${PREFIX}${v.id}`;
    const target: TargetRow = { targetId, url: `${BASE}/recalls`, contract: CONTRACT };
    await getDb().insert(targets)
      .values({ targetId, url: target.url, cadence: '24h', contract: CONTRACT })
      .onConflictDoNothing();
    created.push(targetId);
    await wipe(targetId);

    // The "then": the page as it is served today, which is what the scraper was
    // last known to work against.
    const first = await ingestPage({ target, html: referenceHtml, via: 'selfheal' });
    if (first.result?.status.status !== 'live') {
      console.log(`::error::the reference page did not read live for ${targetId} `
        + `(${first.result?.status.status ?? 'skipped'}) — the baseline never got established`);
      return 1;
    }

    // The "now": the same address, serving a page somebody changed.
    const r = await ingestPage({ target, html: pages.get(v.id)!, via: 'selfheal' });
    const verdict = r.skipped ? 'skipped' : r.result!.status.status;
    const ev = r.result?.event ?? {};
    const published = r.result?.publishedValue ?? null;
    const truth = truthFor(parse(pages.get(v.id)!), referenceValue);

    const shown = published === null
      ? `(held: ${ev.reason ?? verdict})`
      : published === truth ? '= truth' : `WRONG ${quote(published)}`;
    console.log(`  ${pad(v.id, 20)}${pad(v.expect, 11)}${pad(verdict, 13)}`
      + `${pad(num(ev.score), 9)}${pad(num(ev.margin), 9)}${shown}`);

    if (published === null) held++;
    else if (published === truth) {
      correct++;
      if (verdict === 'healed') healed++;
    } else {
      wrong.push(v.id);
      console.log('');
      console.log('::error::assay published a wrong value');
      console.log(`  target      ${targetId}`);
      console.log(`  field       ${FIELD}`);
      console.log(`  variant     ${v.id} — ${v.label} (testbed says: ${v.expect})`);
      console.log(`  url         ${BASE}/v/${v.id}/`);
      console.log(`  verdict     ${verdict}`);
      console.log(`  score       ${num(ev.score)}   margin ${num(ev.margin)}   tau ${CONTRACT.thresholds.tau}`);
      console.log(`  healed_to   ${ev.healed_to?.selector ?? '(none)'}`);
      console.log(`  published   ${quote(published)}`);
      console.log(`  truth       ${quote(truth)}`);
      console.log(`  proof       ${r.proofId}`);
      console.log('');
    }
  }

  console.log(`\nselfheal: ${variants.length} variants, ${correct} correct, ${healed} healed, `
    + `${held} held, ${wrong.length} wrong`);
  return wrong.length ? 1 : 0;
}

main()
  .then(async (code) => { await closeDb().catch(() => {}); process.exit(code); })
  .catch(async (e) => {
    console.log(`::error::selfheal broke: ${(e as Error).stack}`);
    await closeDb().catch(() => {});
    process.exit(1);
  });
