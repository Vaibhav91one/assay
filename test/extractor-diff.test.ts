// What changed in how one field is read off the page, for one run.
//
// Against a real Postgres, and it has to be: the module is one five-table join,
// and the assertions that matter are about rows that are ABSENT -- no
// `heal_history` row on a clean run, no `ranked` on a run that published. A
// fake store would have to be told to omit them, which is the same as being
// told the answer.
//
// The db half early-returns when Postgres is absent, which vitest reports as
// PASSED and not skipped -- so `ASSAY_REQUIRE_DB=1` turns that vacuous green
// into a failure, and the last test in this file is the one that fails.

import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { extractorDiff } from '../src/reports/extractor-diff.js';
import {
  ASSAY_SCORE, ASSAY_SCORES, ASSAY_SCORE_MEANS, assayScore,
} from '../src/reports/assay-score.js';
import { DEFAULT_THRESHOLDS } from '../src/contracts/index.js';
import {
  closeDb, getDb, sql, fieldRuns, fieldState, healHistory, queueItems, runs, targets,
} from '../src/store/index.js';

const TARGET = 'test_extractor_diff';
const FIELD = 'recall_title';
const BASELINE = 'article.product_page h1';

let dbUp = false;
const run: Record<string, number> = {};

const proof = (runId: number) => `${TARGET}:${runId}:${FIELD}`;

beforeAll(async () => {
  try {
    await getDb().execute(sql`SELECT 1 FROM heal_history LIMIT 1`);
    dbUp = true;
  } catch {
    dbUp = false;
  }
  if (!dbUp) return;

  const d = getDb();
  await wipe();
  await d.insert(targets).values({
    targetId: TARGET, url: 'corpus://extractor-diff', cadence: '6h', contract: {},
  }).onConflictDoNothing();
  // The selector still in force. A held run moves nothing, so this is what its
  // `before` side has to be read from -- there is no heal row to read it off.
  await d.insert(fieldState).values({
    targetId: TARGET, field: FIELD, baselineSelector: BASELINE,
  }).onConflictDoNothing();

  const make = async (name: string, status: string) => {
    const [r] = await d.insert(runs).values({ targetId: TARGET, status })
      .returning({ runId: runs.runId });
    run[name] = r!.runId;
    return r!.runId;
  };

  /* ---- a clean run. The field read where it was expected; nothing moved. */
  const clean = await make('clean', 'ok');
  await d.insert(fieldRuns).values({
    runId: clean, field: FIELD, value: 'Cot recall, batch 42',
    status: 'live', proofId: proof(clean), ranked: null,
  });

  /* ---- a heal the gate allowed. `ranked` is deliberately null: `recordRun`
     keeps the list only on an abstain, so a run that published has none. */
  const healed = await make('healed', 'heal');
  await d.insert(fieldRuns).values({
    runId: healed, field: FIELD, value: 'Cot recall, batch 42',
    status: 'healed', proofId: proof(healed), ranked: null,
  });
  await d.insert(healHistory).values({
    targetId: TARGET, field: FIELD, runId: healed,
    fromSelector: BASELINE, toSelector: 'article.product_page p.price_color',
  });

  /* ---- the same heal, taken back. The row stays: a reverted heal is a
     different fact from a heal that never happened. */
  const reverted = await make('reverted', 'heal');
  await d.insert(fieldRuns).values({
    runId: reverted, field: FIELD, value: 'Cot recall, batch 42',
    status: 'healed', proofId: proof(reverted), ranked: null,
  });
  await d.insert(healHistory).values({
    targetId: TARGET, field: FIELD, runId: reverted,
    fromSelector: BASELINE, toSelector: 'div.sidebar h2', reverted: true,
  });

  /* ---- the refusal. Two candidates a hair apart: 0.7412 and 0.7003 is a
     margin of 0.0409, which is below delta 0.16, so the gate held the cell and
     kept the list it had scored. This is the diff Assay would not apply. */
  const held = await make('held', 'abstain');
  await d.insert(fieldRuns).values({
    runId: held, field: FIELD, value: null, status: 'quarantined',
    reason: 'thin_margin', proofId: proof(held), heldSinceRun: held,
    ranked: [
      { selector: 'section.recalls li:nth-child(1) a', score: 0.7412, value: 'Cot recall, batch 42' },
      { selector: 'section.recalls li:nth-child(2) a', score: 0.7003, value: 'Cot recall, batch 43' },
      { selector: 'nav.crumbs a:last-child', score: 0.4110, value: 'Recalls' },
    ],
  });
  await d.insert(queueItems).values({ proofId: proof(held), stakesRows: 340 });
});

afterAll(async () => {
  if (dbUp) await wipe();
  await closeDb().catch(() => {});
});

async function wipe() {
  const d = getDb();
  const mine = sql`(SELECT run_id FROM runs WHERE target_id = ${TARGET})`;
  await d.execute(sql`DELETE FROM queue_items WHERE proof_id IN
    (SELECT proof_id FROM field_runs WHERE run_id IN ${mine})`);
  await d.execute(sql`DELETE FROM heal_history WHERE target_id = ${TARGET}`);
  await d.execute(sql`DELETE FROM field_runs WHERE run_id IN ${mine}`);
  await d.execute(sql`DELETE FROM runs WHERE target_id = ${TARGET}`);
  await d.execute(sql`DELETE FROM field_state WHERE target_id = ${TARGET}`);
  await d.execute(sql`DELETE FROM contracts WHERE target_id = ${TARGET}`);
  await d.execute(sql`DELETE FROM targets WHERE target_id = ${TARGET}`);
}

describe('a run with nothing to show returns null', () => {
  it('fabricates no diff for a clean run', async () => {
    if (!dbUp) return;
    expect(await extractorDiff(run.clean!, FIELD)).toBeNull();
  });

  it('returns null for a field this run never evaluated', async () => {
    if (!dbUp) return;
    expect(await extractorDiff(run.held!, 'no_such_field')).toBeNull();
  });

  it('returns null for a run that does not exist', async () => {
    if (!dbUp) return;
    expect(await extractorDiff(-1, FIELD)).toBeNull();
  });
});

describe('a heal the gate allowed', () => {
  it('reads both ends of the move off heal_history', async () => {
    if (!dbUp) return;
    const d = (await extractorDiff(run.healed!, FIELD))!;
    expect(d.decision).toBe('healed');
    expect(d.before.selector).toBe(BASELINE);
    expect(d.after.selector).toBe('article.product_page p.price_color');
  });

  // Not an oversight and not a zero: `recordRun` keeps `ranked` only when the
  // run abstained, so a run that published genuinely has no score on record.
  // An absence is typed as an absence.
  it('carries no score and no margin, because none was kept', async () => {
    if (!dbUp) return;
    const d = (await extractorDiff(run.healed!, FIELD))!;
    expect(d.score).toBeNull();
    expect(d.margin).toBeNull();
    expect(d.rivals).toEqual([]);
  });

  it('marks a heal that was taken back as reverted rather than dropping it', async () => {
    if (!dbUp) return;
    const d = (await extractorDiff(run.reverted!, FIELD))!;
    expect(d.decision).toBe('reverted');
    expect(d.after.selector).toBe('div.sidebar h2');
  });
});

describe('the refusal, which is the whole point', () => {
  it('holds the cell and names the rivals it was choosing between', async () => {
    if (!dbUp) return;
    const d = (await extractorDiff(run.held!, FIELD))!;
    expect(d.decision).toBe('held');
    expect(d.rivals.map((r) => r.score)).toEqual([0.7412, 0.7003, 0.411]);
  });

  // The values are what a person decides on, so they have to survive the trip
  // out of jsonb. Two candidates that scored within a hair of each other and
  // said DIFFERENT THINGS is the whole content of a THIN band.
  it('carries what each rival said, not only how it scored', async () => {
    if (!dbUp) return;
    const d = (await extractorDiff(run.held!, FIELD))!;
    expect(d.rivals.slice(0, 2).map((r) => r.value)).toEqual([
      'Cot recall, batch 42',
      'Cot recall, batch 43',
    ]);
  });

  it('reports a margin that is below delta -- the reason nothing was published', async () => {
    if (!dbUp) return;
    const d = (await extractorDiff(run.held!, FIELD))!;
    expect(d.score).toBe(0.7412);
    expect(d.margin).toBeCloseTo(0.0409, 6);
    expect(d.margin!).toBeLessThan(d.delta);
    // The score cleared tau. It was the MARGIN that failed, which is the whole
    // distinction between "nothing on the page looks right" and "two things
    // look equally right", and the reason the gate has two numbers.
    expect(d.score!).toBeGreaterThan(d.tau);
  });

  it('shows the change it refused: baseline on one side, best candidate on the other', async () => {
    if (!dbUp) return;
    const d = (await extractorDiff(run.held!, FIELD))!;
    expect(d.before.selector).toBe(BASELINE);
    expect(d.after.selector).toBe('section.recalls li:nth-child(1) a');
  });

  it('reads text with the engine\'s one transform on both sides', async () => {
    if (!dbUp) return;
    const d = (await extractorDiff(run.held!, FIELD))!;
    expect(d.before).toMatchObject({ attr: 'text', transform: 'trim' });
    expect(d.after).toMatchObject({ attr: 'text', transform: 'trim' });
  });
});

describe('the Assay score', () => {
  it('reads the band off the recorded reason', async () => {
    if (!dbUp) return;
    expect((await extractorDiff(run.held!, FIELD))!.band).toBe('THIN');
  });

  it('is a bijection over healGated\'s five outcomes', () => {
    // Both directions, because "no information is invented and nothing is
    // collapsed" is the claim the band makes and this is what it means.
    expect(Object.keys(ASSAY_SCORE).sort()).toEqual(
      ['below_tau', 'benign_tie', 'clear_margin', 'no_candidates', 'thin_margin'].sort(),
    );
    expect(new Set(Object.values(ASSAY_SCORE)).size).toBe(ASSAY_SCORES.length);
    expect(ASSAY_SCORES.every((b) => b in ASSAY_SCORE_MEANS)).toBe(true);
  });

  it('agrees with the reasons healGated actually returns', () => {
    // Reads src/heal.ts and fails if the gate grows a sixth outcome or renames
    // one. A vocabulary claiming to be a bijection over that function has to be
    // checked against that function, or it is a bijection over a memory of it.
    const src = readFileSync(new URL('../src/heal.ts', import.meta.url), 'utf8');
    const declared = new Set(
      [...src.matchAll(/reason:\s*'([a-z_]+)'(?:\s*\|\s*'([a-z_]+)')*/g)]
        .flatMap((m) => m[0].match(/'([a-z_]+)'/g) ?? [])
        .map((q) => q.slice(1, -1)),
    );
    expect(declared.size).toBeGreaterThan(0);
    for (const r of declared) expect(ASSAY_SCORE[r], `heal.ts returns ${r}`).toBeDefined();
  });

  // The finding, pinned as a test so it cannot be quietly "fixed" by guessing.
  it('has no band for a healed cell, because the store keeps no reason for one', async () => {
    if (!dbUp) return;
    // src/runner.ts:263 returns `{ status: 'healed' }` with no reason, so
    // `recordRun` writes null. `clear_margin` and `benign_tie` are on the proof
    // EVENT, which is not persisted. Null rather than an invented CLEAR.
    expect((await extractorDiff(run.healed!, FIELD))!.band).toBeNull();
    expect(assayScore(null)).toBeNull();
  });

  it('has no band for a policy that withheld a heal the gate allowed', () => {
    // `brake:` and `auto_approve_floor:` share the column and are not gate
    // outcomes. Mapping one to WEAK would send an operator to tune a threshold
    // that had nothing to do with it.
    expect(assayScore('auto_approve_floor:0.6')).toBeNull();
    expect(assayScore('brake:oscillating')).toBeNull();
    expect(assayScore('')).toBeNull();
  });
});

describe('the thresholds it was judged under', () => {
  it('uses the engine defaults when no contract governs the field', async () => {
    if (!dbUp) return;
    const d = (await extractorDiff(run.held!, FIELD))!;
    expect(d.tau).toBe(DEFAULT_THRESHOLDS.tau);
    expect(d.delta).toBe(DEFAULT_THRESHOLDS.delta);
  });

  it('uses the contract in force when one names the field', async () => {
    if (!dbUp) return;
    // Written through the store rather than as a hand-made jsonb blob, so this
    // fails if the contract format changes under it -- which is the only way
    // reading `contracts.parsed` here can be checked at all.
    const { saveContract } = await import('../src/contracts/store.js');
    const r = await saveContract(
      `target: ${TARGET}\nfields:\n  ${FIELD}:\n    policy: strict\n`,
    );
    expect(r.ok).toBe(true);

    const d = (await extractorDiff(run.held!, FIELD))!;
    expect(d.tau).toBe(0.70);
    expect(d.delta).toBe(0.20);
    // The numbers on the cell did not move and the bar it is measured against
    // did: 0.7412 still clears strict's tau, and the same 0.0409 margin now
    // falls further short of a delta that went from 0.16 to 0.20. Which is the
    // point of reading the contract at all -- the same evidence, judged by
    // whatever this target actually declared.
    expect(d.score!).toBeGreaterThan(d.tau);
    expect(d.margin!).toBeLessThan(d.delta);
  });

  it('postgres is reachable (required when ASSAY_REQUIRE_DB is set)', () => {
    if (process.env.ASSAY_REQUIRE_DB) expect(dbUp).toBe(true);
  });
});
