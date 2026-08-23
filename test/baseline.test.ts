// The deployed path compares a page against the page it last worked on.
//
// It did not. `ingestPage` called `establishBaseline` on the page it was about
// to evaluate, so `runTarget` compared each page to itself: the skeleton always
// matched, the selector always resolved, the value always equalled the baseline
// value. In 74 recorded runs the gate fired zero times, and a site that changed
// would have read `live` with a wrong value or a null in the cell.
//
// So the two facts asserted here are the two the bug made unreachable:
//
//   1. a page that MOVED does not read `live` -- it heals or it is held
//   2. a page whose field is GONE leaves a run row, a held cell and an open
//      episode, rather than a thrown error and no record at all
//
// Both go through `ingestPage`, not through the engine directly. The engine was
// never broken; the wiring around it was, and a test that calls `evaluate()`
// with two hand-built baselines would have passed on the broken code.

import { describe as suite, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { readFile, readdir } from 'node:fs/promises';
import { load } from 'cheerio';

import { ingestPage, type TargetRow } from '../src/connectors/ingest.js';
import { MUTATIONS, markTarget } from '../src/mutate.js';
import { pickTarget } from '../src/target.js';
import { getDb, closeDb, heldCells, targets, sql } from '../src/store/index.js';

// Its own target id, so this suite shares no state with the corpus ingest, the
// worker, or the `seam` test in connectors.test.ts.
const TARGET = 'baseline_spec';
const FIELD = 'recall_title';

// The same contract the corpus runs under, in the string form jsonb round-trips
// (see the note in src/target.ts about RegExp literals becoming `{}`).
const CONTRACT = {
  field: FIELD,
  expected: { regex: '(recall|rappel|retirada|remedy|alert)', regexFlags: 'i', minLen: 20 },
  resolver: {
    tags: 'h2,h3,a,li', flags: 'i', maxLen: 140, minLen: 20,
    include: 'recall|rappel|retirada|remedy kit',
    exclude: 'recalls\\.gov|learn more|click here|^product recalls$',
  },
  thresholds: { tau: 0.6, delta: 0.16 },
};

const target: TargetRow = { targetId: TARGET, url: 'corpus://ikea', contract: CONTRACT };

let dbUp = false;
let page = '';

/**
 * The same page with mutations applied, in order, to whatever the resolver
 * finds at that point. The target is re-picked between mutations, because a
 * mutation moves it.
 */
function mutated(html: string, ...ids: string[]): string {
  const $ = load(html);
  $('script,style,noscript').remove();
  for (const id of ids) {
    const el = pickTarget($, CONTRACT.resolver);
    if (!el) throw new Error('the corpus capture no longer resolves -- fix the fixture, not this');
    const m = MUTATIONS.find((x) => x.id === id);
    if (!m) throw new Error(`unknown mutation "${id}"`);
    markTarget($, el);
    if (!m.apply($, el)) throw new Error(`mutation "${id}" did not apply`);
  }
  return $.html();
}

/** Everything this suite writes, in FK order. Leaves the targets row. */
async function wipe(): Promise<void> {
  const d = getDb();
  await d.execute(sql`DELETE FROM queue_items WHERE proof_id IN (
    SELECT fr.proof_id FROM field_runs fr JOIN runs r ON r.run_id = fr.run_id
    WHERE r.target_id = ${TARGET})`);
  await d.execute(sql`DELETE FROM field_runs WHERE run_id IN (
    SELECT run_id FROM runs WHERE target_id = ${TARGET})`);
  await d.execute(sql`DELETE FROM heal_history WHERE target_id = ${TARGET}`);
  await d.execute(sql`DELETE FROM episodes WHERE target_id = ${TARGET}`);
  await d.execute(sql`DELETE FROM runs WHERE target_id = ${TARGET}`);
  await d.execute(sql`DELETE FROM field_state WHERE target_id = ${TARGET}`);
}

const storedBaseline = async () => {
  const { rows } = await getDb().execute(sql`
    SELECT baseline_golden_sha, baseline_selector FROM field_state
    WHERE target_id = ${TARGET} AND field = ${FIELD}`);
  return (rows[0] ?? null) as { baseline_golden_sha: string; baseline_selector: string } | null;
};

const runRows = async () => {
  const { rows } = await getDb().execute(sql`
    SELECT r.run_id, r.status AS event, fr.status, fr.reason, fr.value
    FROM runs r LEFT JOIN field_runs fr ON fr.run_id = r.run_id
    WHERE r.target_id = ${TARGET} ORDER BY r.run_id`);
  return rows as { run_id: number; event: string; status: string; reason: string; value: string }[];
};

beforeAll(async () => {
  try { getDb(); await heldCells(); dbUp = true; } catch { dbUp = false; }
  if (!dbUp) return;
  const files = (await readdir('corpus/ikea')).filter((f) => f.endsWith('.html')).sort();
  page = await readFile(`corpus/ikea/${files.at(-1)}`, 'utf8');
  await getDb().insert(targets)
    .values({ targetId: TARGET, url: 'corpus://ikea', cadence: '6h', contract: CONTRACT })
    .onConflictDoNothing();
});

beforeEach(async () => { if (dbUp) await wipe(); });

afterAll(async () => {
  if (dbUp) {
    await wipe();
    await getDb().execute(sql`DELETE FROM targets WHERE target_id = ${TARGET}`);
  }
  await closeDb().catch(() => {});
});

suite('the live path holds a page against the page it last worked on', () => {
  it('records the first run as the baseline, because there is nothing else to hold it against', async () => {
    if (!dbUp) return;
    const r = await ingestPage({ target, html: page, via: 'test' });

    expect(r.skipped).toBe(false);
    expect(r.result!.status.status).toBe('live');

    // The "then" is now on disk and in the store. Before this change nothing
    // persisted it, which is why every later run re-derived it from whatever
    // page had just arrived.
    const stored = await storedBaseline();
    expect(stored).not.toBeNull();
    expect(stored!.baseline_golden_sha).toBe(r.result!.event.golden_sha256);
    expect(stored!.baseline_selector).toMatch(/\S/);
  });

  it('does not report a moved field as live', async () => {
    if (!dbUp) return;
    await ingestPage({ target, html: page, via: 'test' });

    // rename_class rewrites the class the baseline selector was built from, so
    // the stored selector stops resolving. The engine has always handled this
    // -- `results/bench.json` heals every one of these -- but the live path
    // could not reach it, because the baseline was rebuilt from this very page
    // and its selector therefore always matched.
    const r = await ingestPage({ target, html: mutated(page, 'rename_class'), via: 'test' });

    expect(r.skipped).toBe(false);
    expect(r.result!.status.status).not.toBe('live');
    expect(['healed', 'quarantined']).toContain(r.result!.status.status);
    // On this mutation the gate is confident, so it is the heal branch.
    expect(r.result!.status.status).toBe('healed');
    expect(r.result!.event.healed_to.selector).toMatch(/redesign-/);
  });

  it('advances the baseline on a published heal, and not before', async () => {
    if (!dbUp) return;
    await ingestPage({ target, html: page, via: 'test' });
    const first = await storedBaseline();

    const r = await ingestPage({ target, html: mutated(page, 'rename_class'), via: 'test' });
    expect(r.result!.status.status).toBe('healed');

    // A verified heal is the one thing that may move it: the page it healed on
    // is what "working" looks like now.
    const after = await storedBaseline();
    expect(after!.baseline_golden_sha).not.toBe(first!.baseline_golden_sha);
    expect(after!.baseline_selector).toBe(r.result!.event.healed_to.selector);
  });

  it('leaves the baseline where it was when the gate refused', async () => {
    if (!dbUp) return;
    await ingestPage({ target, html: page, via: 'test' });
    const first = await storedBaseline();

    // The class rename breaks the stored selector; the near-identical twin then
    // gives the gate two candidates it cannot separate. An abstention is an
    // unverified candidate, and adopting one is how a healer poisons its own
    // baseline (src/runner.ts:72).
    const r = await ingestPage({
      target, html: mutated(page, 'rename_class', 'duplicate_similar'), via: 'test',
    });
    expect(r.result!.status.status).toBe('quarantined');

    expect(await storedBaseline()).toEqual(first);
  });

  it('records a blocked fetch without recording or advancing the field', async () => {
    if (!dbUp) return;
    await ingestPage({ target, html: page, via: 'test' });
    const first = await storedBaseline();
    const blocked = await readFile('test/fixtures/blocked/cloudflare.html', 'utf8');

    const r = await ingestPage({ target, html: blocked, via: 'test' });

    expect(r.result!.event.event).toBe('blocked');
    expect(r.result!.observed).toBe(false);
    expect(await storedBaseline()).toEqual(first);

    const { rows } = await getDb().execute(sql`
      SELECT r.status AS run_status, fr.run_id AS field_run
      FROM runs r LEFT JOIN field_runs fr ON fr.run_id = r.run_id
      WHERE r.run_id = ${r.runId}`);
    expect(rows).toEqual([{ run_status: 'blocked', field_run: null }]);

    // A provider outage neither opens a structural incident nor closes one
    // that was already open. Both would turn fetch uncertainty into a claim
    // about the field, just in opposite directions.
    const { rows: episodes } = await getDb().execute(sql`
      SELECT episode_id FROM episodes WHERE target_id = ${TARGET}`);
    expect(episodes).toEqual([]);
  });

  it('does not establish a baseline from a blocked first fetch', async () => {
    if (!dbUp) return;
    const blocked = await readFile('test/fixtures/blocked/cloudflare.html', 'utf8');

    const r = await ingestPage({ target, html: blocked, via: 'test' });

    expect(r.result!.event.event).toBe('blocked');
    expect(r.result!.observed).toBe(false);
    expect(await storedBaseline()).toBeNull();
  });
});

suite('the field is gone', () => {
  it('is a recorded run, a held cell and an open episode -- not a thrown error', async () => {
    if (!dbUp) return;
    await ingestPage({ target, html: page, via: 'test' });

    // `if (!el) throw` used to run BEFORE recordRun, so the one event this
    // product exists for left no run row, no cell, no episode and no alert.
    const r = await ingestPage({ target, html: mutated(page, 'remove_field'), via: 'test' });

    expect(r.result!.status.status).toBe('quarantined');
    expect(r.result!.publishedValue).toBeNull();

    const rows = await runRows();
    expect(rows).toHaveLength(2);
    expect(rows[1]!.run_id).toBe(r.runId);
    expect(rows[1]!.status).toBe('quarantined');
    expect(rows[1]!.value).toBeNull();

    // The episode is what turns a held cell into somebody's problem.
    const { rows: eps } = await getDb().execute(sql`
      SELECT episode_id, opened_run, closed_run FROM episodes
      WHERE target_id = ${TARGET} AND field = ${FIELD} AND closed_run IS NULL`);
    expect(eps).toHaveLength(1);
    expect((eps[0] as { opened_run: number }).opened_run).toBe(r.runId);
    expect(r.episodeId).toBe((eps[0] as { episode_id: number }).episode_id);
  });

  it('refuses only when it is the FIRST page, where there is nothing to hold against', async () => {
    if (!dbUp) return;
    // No baseline yet, and no element to make one from. There is no comparison
    // to record, so this is the one case that still refuses -- audibly.
    await expect(ingestPage({
      target,
      html: '<html><body><p>nothing here resolves</p></body></html>',
      via: 'test',
    })).rejects.toThrow(/no baseline to hold it against/);

    expect(await storedBaseline()).toBeNull();
  });
});
