// F6/F9: the backward walk, the honesty about holed history, the CSV, and the
// rule that a correction is a new row rather than an edit.
//
// Run ids are fixed and far above the sequence rather than reserved, so the
// window under test cannot acquire a gap because some other suite took an id
// while this one was seeding -- the gap detector would then be right and the
// assertion wrong, which is the worst kind of flake to debug.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  blastRadius, reopenBlast, recordRetraction, markExported,
  retractionCsv, rescrapeList, publishCorrection, BlastError,
} from '../src/blast/index.js';
import { csvField, toCsv } from '../src/blast/csv.js';
import { getBlast } from '../src/blast/http.js';
import { loadTools } from '../src/mcp/server.js';
import {
  getDb, closeDb, rowByProof, explain, reserveRunId, sql,
  targets, runs, fieldRuns, retractions, eq,
} from '../src/store/index.js';

const CLEAN = 'test_blast';        // a clean series with a skipped run in it
const HOLED = 'test_blast_hole';   // a run that evaluated and recorded no cell
const GAPPED = 'test_blast_gap';   // a run id that belongs to no run at all
const CORR = 'test_blast_corr';    // ids from the real sequence, so a correction lands last
const ALL = [CLEAN, HOLED, GAPPED, CORR];

// A value of the kind that actually comes off a page: a comma, a quoted phrase,
// a line break the site put there, and a currency symbol outside ASCII.
const NASTY = 'Chest, "Malm" model\nrecalled — €1.099,00';

let dbUp = false;

type Cell = { run: number; status: string; value: string | null; runStatus?: string };

async function seed(targetId: string, cells: Cell[]) {
  const d = getDb();
  await d.insert(targets).values({
    targetId, url: `corpus://${targetId}`, cadence: '6h', contract: { field: 'price' },
  }).onConflictDoNothing();
  for (const c of cells) {
    await d.insert(runs).values({
      runId: c.run,
      targetId,
      status: c.runStatus ?? (c.status === 'healed' ? 'heal' : 'ok'),
      pageBytes: 1000,
      pageSha: `sha_${c.run}`,
    });
    if (c.status === 'skipped' || c.status === 'unrecorded') continue;
    await d.insert(fieldRuns).values({
      runId: c.run, field: 'price', value: c.value, status: c.status,
      proofId: `pr_test_${c.run}`, captureSha: `cap_${c.run}`,
      // A real held cell always carries the run it was held from, and other
      // suites read every held cell in the database -- a fixture that omits it
      // breaks an assertion in a file that has nothing to do with this one.
      heldSinceRun: c.status === 'quarantined' ? c.run : null,
    });
  }
}

beforeAll(async () => {
  try {
    await getDb().execute(sql`SELECT 1`);
    dbUp = true;
  } catch { dbUp = false; }
  if (!dbUp) return;
  await wipe();

  await seed(CLEAN, [
    { run: 900001, status: 'live', value: '10.00' },
    { run: 900002, status: 'live', value: '10.50' },
    { run: 900003, status: 'healed', value: NASTY },          // the boundary
    { run: 900004, status: 'healed', value: '12.50' },
    { run: 900005, status: 'skipped', value: null, runStatus: 'skipped' },
    { run: 900006, status: 'healed', value: '13.00' },
    { run: 900007, status: 'quarantined', value: null },      // detection
  ]);
  await seed(HOLED, [
    { run: 910001, status: 'live', value: '10.00' },
    { run: 910002, status: 'unrecorded', value: null, runStatus: 'heal' },
    { run: 910003, status: 'healed', value: '99.00' },
    { run: 910004, status: 'healed', value: '99.00' },
  ]);
  // 920003 is deliberately never inserted: the shape a deleted run leaves.
  await seed(GAPPED, [
    { run: 920001, status: 'live', value: '10.00' },
    { run: 920002, status: 'healed', value: '99.00' },
    { run: 920004, status: 'healed', value: '99.00' },
  ]);
});

async function wipe() {
  const d = getDb();
  for (const t of ALL) {
    await d.execute(sql`DELETE FROM retractions WHERE target_id = ${t}`);
    await d.execute(sql`DELETE FROM field_runs WHERE run_id IN (SELECT run_id FROM runs WHERE target_id = ${t})`);
    await d.execute(sql`DELETE FROM runs WHERE target_id = ${t}`);
    await d.execute(sql`DELETE FROM targets WHERE target_id = ${t}`);
  }
}

afterAll(async () => {
  if (dbUp) await wipe();
  await closeDb().catch(() => {});
});

describe('database', () => {
  // Without ASSAY_REQUIRE_DB an unreachable Postgres makes every test below
  // early-return, which vitest reports as passed rather than skipped.
  it('postgres is reachable (required when ASSAY_REQUIRE_DB is set)', () => {
    if (process.env.ASSAY_REQUIRE_DB) expect(dbUp).toBe(true);
  });
});

describe('csv', () => {
  it('quotes the three characters that change the shape of the file', () => {
    expect(csvField('plain')).toBe('plain');
    expect(csvField('a,b')).toBe('"a,b"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(csvField('line\nbreak')).toBe('"line\nbreak"');
    expect(csvField('carriage\rreturn')).toBe('"carriage\rreturn"');
  });

  it('writes a scraped value byte for byte', () => {
    // The whole document, asserted exactly: a quoting bug moves a delimiter,
    // and a test that only counted rows would not notice.
    expect(toCsv(['proof', 'value'], [['pr_1', NASTY], ['pr_2', null]])).toBe(
      'proof,value\r\n'
      + 'pr_1,"Chest, ""Malm"" model\nrecalled — €1.099,00"\r\n'
      + 'pr_2,\r\n',
    );
  });

  it('keeps the column count stable however nasty the values are', () => {
    // Parsed back by a reader that knows only the RFC: quotes toggle, doubled
    // quotes are literals, and delimiters inside quotes are data.
    const doc = toCsv(['a', 'b', 'c'], [[NASTY, 'x,y', 'say "hi"']]);
    expect(parseCsv(doc)).toEqual([['a', 'b', 'c'], [NASTY, 'x,y', 'say "hi"']]);
  });
});

/** A deliberately separate implementation: a writer cannot test itself. */
function parseCsv(doc: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < doc.length; i++) {
    const ch = doc[i]!;
    if (quoted) {
      if (ch === '"' && doc[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') quoted = false;
      else cell += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\r' && doc[i + 1] === '\n') { row.push(cell); cell = ''; rows.push(row); row = []; i++; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

describe('the backward walk', () => {
  it('stops at the heal that introduced the value, not the run that noticed', async () => {
    if (!dbUp) return;
    const w = await blastRadius({ target: CLEAN, field: 'price' });
    expect(w.first_suspect_run).toBe(900003);
    expect(w.last_clean_run).toBe(900002);
    expect(w.detected_run).toBe(900007);
    expect(w.bounded).toBe(true);
  });

  it('steps over a skipped run instead of ending the window at it', async () => {
    if (!dbUp) return;
    const w = await blastRadius({ target: CLEAN, field: 'price' });
    // 900005 published nothing, so it is neither a row nor a boundary.
    expect(w.suspect_runs).toEqual([900003, 900004, 900006, 900007]);
    expect(w.rows.map((r) => r.run)).toEqual([900003, 900004, 900006]);
  });

  it('counts a held cell as withheld, never as a row to take back', async () => {
    if (!dbUp) return;
    const w = await blastRadius({ target: CLEAN, field: 'price' });
    expect(w.withheld_runs).toEqual([900007]);
    expect(w.rows.some((r) => r.run === 900007)).toBe(false);
  });

  it('says "at least" when a run inside the window recorded no cell', async () => {
    if (!dbUp) return;
    const w = await blastRadius({ target: HOLED, field: 'price' });
    expect(w.bounded).toBe(false);
    expect(w.first_suspect_run).toBe(910003);
    expect(w.caveats.join(' ')).toContain('910002');
    expect(w.caveats.join(' ')).toContain('floor');
  });

  it('says "at least" when a run id in the window belongs to no run', async () => {
    if (!dbUp) return;
    const w = await blastRadius({ target: GAPPED, field: 'price' });
    expect(w.bounded).toBe(false);
    expect(w.first_suspect_run).toBe(920002);
    expect(w.caveats.join(' ')).toContain('920003');
  });

  it('refuses a target or field it has no history for', async () => {
    if (!dbUp) return;
    await expect(blastRadius({ target: 'nope', field: 'price' })).rejects.toThrow(BlastError);
    await expect(blastRadius({ target: CLEAN, field: 'nope' })).rejects.toThrow(/No runs have published/);
    await expect(blastRadius({ target: CLEAN, field: 'price', at_run: 1 })).rejects.toThrow(/not a run of/);
  });

  it('takes a declared boundary, which is how unheal re-opens a window', async () => {
    if (!dbUp) return;
    // Feature D's shape exactly: fromRun is the run that made the bad heal and
    // is inclusive, toRun is the newest run for the target.
    const { window: w, retraction_id } = await reopenBlast({
      targetId: CLEAN, field: 'price', fromRun: 900001, toRun: 900007,
    });
    expect(w.basis).toBe('declared');
    expect(w.first_suspect_run).toBe(900001);
    expect(w.rows.map((r) => r.run)).toEqual([900001, 900002, 900003, 900004, 900006]);
    expect(retraction_id).toBeTypeOf('number');

    // Called twice -- D commits its revert first, and may retry.
    const again = await reopenBlast({
      targetId: CLEAN, field: 'price', fromRun: 900001, toRun: 900007,
    });
    expect(again.retraction_id).toBe(retraction_id);
  });

  it('ends the window at the newest run that published, and says it did', async () => {
    if (!dbUp) return;
    // 900005 is a skipped run: D passes the newest run id for the target, which
    // is not always a run that published this field.
    const { window: w } = await reopenBlast({
      targetId: CLEAN, field: 'price', fromRun: 900003, toRun: 900005, record: false,
    });
    expect(w.detected_run).toBe(900004);
    expect(w.caveats[0]).toContain('900005');
  });
});

describe('retraction', () => {
  it('files the window with exported_at null, and does not file it twice', async () => {
    if (!dbUp) return;
    const w = await blastRadius({ target: CLEAN, field: 'price' });
    const first = await recordRetraction(w);
    expect(first.created).toBe(true);
    expect(first.exported_at).toBeNull();

    const again = await recordRetraction(w);
    expect(again.created).toBe(false);
    expect(again.retraction_id).toBe(first.retraction_id);

    const at = await markExported(first.retraction_id);
    expect(at).toBeInstanceOf(Date);
    const [row] = await getDb().select().from(retractions)
      .where(eq(retractions.retractionId, first.retraction_id));
    expect(row!.rowIds).toEqual(['pr_test_900003', 'pr_test_900004', 'pr_test_900006']);
  });

  it('exports the affected rows as CSV, quoting what the site wrote', async () => {
    if (!dbUp) return;
    const w = await blastRadius({ target: CLEAN, field: 'price' });
    const rows = parseCsv(await retractionCsv(w));
    expect(rows[0]!.slice(0, 5)).toEqual(['proof_id', 'run_id', 'target_id', 'field', 'value']);
    expect(rows).toHaveLength(4);
    expect(rows[1]![0]).toBe('pr_test_900003');
    expect(rows[1]![4]).toBe(NASTY);
  });

  it('says which pages have to be fetched again and which are still on disk', async () => {
    if (!dbUp) return;
    const w = await blastRadius({ target: CLEAN, field: 'price' });
    const list = await rescrapeList(w);
    expect(list).toHaveLength(3);
    // No captures row was seeded, so the bytes are genuinely not there. An
    // absent capture is reported as absent, not assumed present.
    expect(list.every((i) => i.capture_available === false)).toBe(true);
    expect(list[0]!.url).toBe(`corpus://${CLEAN}`);
  });
});

describe('corrections', () => {
  it('publishes a new row and leaves the wrong one readable, with its proof', async () => {
    if (!dbUp) return;
    const wrong = await rowByProof('pr_test_900003');
    expect(wrong!.price).toBe(NASTY);

    const c = await publishCorrection({ proof: 'pr_test_900003', value: '11.00' });
    expect(c.supersedes).toBe('pr_test_900003');

    // The whole claim of the product: what was published, and when, survives
    // being corrected.
    const still = await rowByProof('pr_test_900003');
    expect(still!.price).toBe(NASTY);
    expect((await explain('pr_test_900003'))!.run).toBe(900003);

    const fixed = await explain(c.proof);
    expect(fixed!.value).toBe('11.00');
    expect(fixed!.status).toBe('live');
    expect(fixed!.reason).toBe('correction_of:pr_test_900003');

    // And the retraction list now names where the right value lives.
    const w = await blastRadius({ target: CLEAN, field: 'price' });
    const row = parseCsv(await retractionCsv(w)).find((r) => r[0] === 'pr_test_900003');
    expect(row![9]).toBe(c.proof);

    await getDb().delete(fieldRuns).where(eq(fieldRuns.proofId, c.proof));
    await getDb().delete(runs).where(eq(runs.runId, c.run));
  });

  it('does not let the correction run become the anchor of the next walk', async () => {
    if (!dbUp) return;
    // Ids from the real sequence, so the correction genuinely lands after the
    // scrapes. With correction runs in the series, this window came back empty
    // and the screen read as an all-clear.
    const r1 = await reserveRunId();
    const r2 = await reserveRunId();
    await seed(CORR, [
      { run: r1, status: 'live', value: '10.00' },
      { run: r2, status: 'healed', value: '99.00' },
    ]);
    const c = await publishCorrection({ proof: `pr_test_${r2}`, value: '10.00' });
    expect(c.run).toBeGreaterThan(r2);

    const w = await blastRadius({ target: CORR, field: 'price' });
    expect(w.detected_run).toBe(r2);
    expect(w.first_suspect_run).toBe(r2);
    expect(w.suspect_runs).not.toContain(c.run);
    expect(w.rows).toHaveLength(1);
  });

  it('refuses to correct a proof that does not exist', async () => {
    if (!dbUp) return;
    await expect(publishCorrection({ proof: 'pr_nope', value: '1' })).rejects.toThrow(BlastError);
  });
});

describe('the REST surface', () => {
  it('refuses an unauthenticated read', async () => {
    if (!dbUp) return;
    const res = await getBlast(new Request(`http://x/api/v1/blast?target=${CLEAN}&field=price`));
    expect(res.status).toBe(401);
  });
});

describe('the MCP surface', () => {
  it('registers alongside core.ts rather than shadowing assay_blast', async () => {
    const tools = await loadTools();
    expect(tools.assay_blast).toBeTruthy();
    expect(tools.assay_blast_radius).toBeTruthy();
  });

  it('gives an agent the window with the "at least" already in the number', async () => {
    if (!dbUp) return;
    const tools = await loadTools();
    const out = await tools.assay_blast_radius!.run({ target: HOLED, field: 'price' }) as
      { suspect_rows: unknown; bounded: boolean };
    expect(out.bounded).toBe(false);
    expect(out.suspect_rows).toBe('at least 2');
  });
});
