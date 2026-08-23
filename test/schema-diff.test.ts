// The shape of the published record at one run against another.
//
// Against a real Postgres, because the whole module is a query: a fake would be
// testing the fake's idea of `field_runs`, and the column that matters most
// here -- a null `value` on a quarantined cell -- is exactly the one a
// hand-built object is most likely to get wrong.
//
// The db half early-returns when Postgres is absent, which vitest reports as
// PASSED and not skipped -- so `ASSAY_REQUIRE_DB=1` turns that vacuous green
// into a failure, and the last test in this file is the one that fails.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { schemaDiff, shapeOf, type ShapeChange } from '../src/reports/schema-diff.js';
import { closeDb, getDb, sql, fieldRuns, runs, targets } from '../src/store/index.js';

// Its own target, created here and dropped in afterAll. Never a name from the
// corpus: `field_runs.run_id` has a foreign key to `runs` and `runs.target_id`
// to `targets`, so a suite that borrows a row it did not create fails on a
// database made by `createdb` + `db:migrate` and passes on the author's.
const TARGET = 'test_schema_diff';

let dbUp = false;
/** run 1 and run 2, whatever ids the sequence hands out. */
let r1 = 0;
let r2 = 0;

/** One cell, as the run committed it. `proofId` is unique, so it carries both ids. */
const cell = (runId: number, field: string, value: string | null, status: string) => ({
  runId, field, value, status, proofId: `${TARGET}:${runId}:${field}`,
});

beforeAll(async () => {
  try {
    await getDb().execute(sql`SELECT 1 FROM field_runs LIMIT 1`);
    dbUp = true;
  } catch {
    dbUp = false;
  }
  if (!dbUp) return;

  const d = getDb();
  await wipe();
  await d.insert(targets).values({
    targetId: TARGET, url: 'corpus://schema-diff', cadence: '6h', contract: {},
  }).onConflictDoNothing();

  const [a] = await d.insert(runs).values({ targetId: TARGET, status: 'ok' })
    .returning({ runId: runs.runId });
  const [b] = await d.insert(runs).values({ targetId: TARGET, status: 'abstain' })
    .returning({ runId: runs.runId });
  r1 = a!.runId;
  r2 = b!.runId;

  // Run 1: four fields, all published. Run 2: the same page a fortnight later,
  // with one of each kind of change on it -- a rename, a removal, a type flip,
  // a hold, and one field that did not move at all.
  await d.insert(fieldRuns).values([
    cell(r1, 'headline', 'Cot recall, batch 42', 'live'),
    cell(r1, 'price', '119.99', 'live'),
    cell(r1, 'sku', 'AB-1200', 'live'),
    cell(r1, 'stock', '14', 'live'),
    cell(r1, 'dropped', 'was here once', 'live'),

    // `headline` -> `title` is a RENAME, and there is no rename column to read
    // it from. It arrives as a removal and an addition, which is the honest
    // shape: nothing in the store says the two are the same field, and a
    // heuristic that guessed would be wrong the first time a page gains a
    // genuinely new field in the same run one is retired.
    cell(r2, 'title', 'Cot recall, batch 42', 'live'),
    // "out of stock" where a count used to be. The consumer's parser breaks on
    // this whether or not Assay names it a break.
    cell(r2, 'stock', 'out of stock', 'live'),
    // Same text, same type, and NOT the same cell: the gate refused it.
    cell(r2, 'sku', null, 'quarantined'),
    cell(r2, 'price', '119.99', 'live'),
  ]);
});

afterAll(async () => {
  if (dbUp) await wipe();
  await closeDb().catch(() => {});
});

async function wipe() {
  const d = getDb();
  await d.execute(sql`DELETE FROM field_runs WHERE run_id IN
    (SELECT run_id FROM runs WHERE target_id = ${TARGET})`);
  await d.execute(sql`DELETE FROM runs WHERE target_id = ${TARGET}`);
  await d.execute(sql`DELETE FROM targets WHERE target_id = ${TARGET}`);
}

const find = (d: ShapeChange[], field: string) => d.find((c) => c.field === field);

describe('shapeOf reads the record one run committed', () => {
  it('types a value that parses as a number as a number', async () => {
    if (!dbUp) return;
    const s = await shapeOf(r1);
    expect(s.find((f) => f.field === 'price')).toEqual({
      field: 'price', type: 'number', status: 'live', value: '119.99',
    });
  });

  it('types a product code as a string, not as a number', async () => {
    if (!dbUp) return;
    const s = await shapeOf(r1);
    expect(s.find((f) => f.field === 'sku')?.type).toBe('string');
  });

  it('gives a held cell its own type rather than calling it an empty string', async () => {
    if (!dbUp) return;
    const s = await shapeOf(r2);
    expect(s.find((f) => f.field === 'sku')).toEqual({
      field: 'sku', type: 'null', status: 'quarantined', value: null,
    });
  });

  it('is alphabetical, so two calls diff against each other', async () => {
    if (!dbUp) return;
    const fields = (await shapeOf(r1)).map((f) => f.field);
    expect(fields).toEqual([...fields].sort());
  });

  it('returns nothing for a run that does not exist', async () => {
    if (!dbUp) return;
    expect(await shapeOf(-1)).toEqual([]);
  });
});

describe('schemaDiff', () => {
  it('reports a rename as a removal and an addition', async () => {
    if (!dbUp) return;
    const d = await schemaDiff(r1, r2);
    expect(find(d, 'headline')).toMatchObject({ kind: 'removed' });
    expect(find(d, 'title')).toMatchObject({ kind: 'added' });
  });

  it('reports a field that stopped being published as removed', async () => {
    if (!dbUp) return;
    const c = find(await schemaDiff(r1, r2), 'dropped');
    expect(c).toMatchObject({ kind: 'removed' });
    expect(c && 'before' in c && c.before.value).toBe('was here once');
  });

  it('reports a count that became prose as a type change', async () => {
    if (!dbUp) return;
    const c = find(await schemaDiff(r1, r2), 'stock');
    expect(c?.kind).toBe('type');
    expect(c && 'before' in c && c.before.type).toBe('number');
    expect(c && 'after' in c && c.after.type).toBe('string');
  });

  // The one this file exists for. A held cell is the case where Assay published
  // NOTHING rather than a value it could not justify, and a diff that folded it
  // into `same` would be describing the hole as the old value still standing.
  it('never collapses a field that went to quarantined into `same`', async () => {
    if (!dbUp) return;
    const c = find(await schemaDiff(r1, r2), 'sku');
    expect(c?.kind).not.toBe('same');
    expect(c?.kind).toBe('type');
    expect(c && 'after' in c && c.after.status).toBe('quarantined');
    expect(c && 'after' in c && c.after.value).toBeNull();
  });

  it('reports a status move on a field whose value and type did not change', async () => {
    if (!dbUp) return;
    // Built inline rather than seeded, because the fixture above cannot hold
    // it: a cell that goes to `quarantined` also goes to null, so the status
    // arm is only reachable between two statuses that BOTH carry a value --
    // `live` to `stale`, say, where the number stands but is no longer fresh.
    const d = getDb();
    const [c] = await d.insert(runs).values({ targetId: TARGET, status: 'ok' })
      .returning({ runId: runs.runId });
    await d.insert(fieldRuns).values(cell(c!.runId, 'price', '119.99', 'stale'));

    const change = find(await schemaDiff(r1, c!.runId), 'price');
    expect(change?.kind).toBe('status');
    expect(change && 'before' in change && change.before.status).toBe('live');
    expect(change && 'after' in change && change.after.status).toBe('stale');
  });

  it('calls a field that did not move `same`', async () => {
    if (!dbUp) return;
    expect(find(await schemaDiff(r1, r2), 'price')?.kind).toBe('same');
  });

  it('puts every change before every `same`, each half alphabetical', async () => {
    if (!dbUp) return;
    const d = await schemaDiff(r1, r2);
    const firstSame = d.findIndex((c) => c.kind === 'same');
    expect(firstSame).toBeGreaterThan(0);
    expect(d.slice(firstSame).every((c) => c.kind === 'same')).toBe(true);

    const names = (from: number, to?: number) => d.slice(from, to).map((c) => c.field);
    expect(names(0, firstSame)).toEqual([...names(0, firstSame)].sort());
    expect(names(firstSame)).toEqual([...names(firstSame)].sort());
  });

  it('reports every field as added when the earlier run has none', async () => {
    if (!dbUp) return;
    const d = await schemaDiff(-1, r1);
    expect(d.length).toBe(5);
    expect(d.every((c) => c.kind === 'added')).toBe(true);
  });

  it('postgres is reachable (required when ASSAY_REQUIRE_DB is set)', () => {
    if (process.env.ASSAY_REQUIRE_DB) expect(dbUp).toBe(true);
  });
});
