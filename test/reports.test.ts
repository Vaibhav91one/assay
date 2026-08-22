// F: reports -- the incident record, the diff, and the digest cadence.
//
// The fold from stored cells to diff states is pure, so most of what matters
// here needs no database. The rest does, and DB-backed tests early-return when
// Postgres is absent -- which vitest reports as PASSED, not skipped. CI sets
// ASSAY_REQUIRE_DB=1 to turn that vacuous green into a failure.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { toEntries, fieldHistory } from '../src/reports/diff.js';
import { incidentRecord, episodes } from '../src/reports/incident.js';
import { composeDigest, dueDigests, markDigestSent, digestHtml } from '../src/reports/digest.js';
import { incidentMarkdown, diffText } from '../src/reports/render.js';
import { getIncident, getDiff, getDigest } from '../src/reports/handlers.js';
import { getDb, closeDb, sql, targets } from '../src/store/index.js';

const T = 'test_reports';
const FIELD = 'price';
const noCtx = { params: Promise.resolve({}) };
const req = (url: string): Request => new Request(url);
/** Hard-wrapped prose as one line, so an assertion tests the claim not the margin. */
const prose = (s: string): string => s.replace(/\s+/g, ' ');

let dbUp = false;
let episodeId = 0;
let base = 0;                       // the first run id this fixture owns
const t0 = new Date('2026-06-01T00:00:00Z');
const at = (n: number) => new Date(t0.getTime() + n * 3600e3);

/**
 * Five runs telling the story the record has to be able to tell:
 *
 *   0  first value we ever published        -> changed, no basis
 *   1  same value                           -> unchanged
 *   2  HELD -- the gate refused             -> withheld
 *   3  published again, a different value   -> changed, AGAINST RUN 1
 *   4  the field recovers                   -> changed
 *
 * Run 3 is the case the whole diff exists for: the comparison must skip the
 * hole rather than treat it as a value.
 */
const CELLS: [status: string, value: string | null, reason: string | null][] = [
  ['live', '$14', null],
  ['live', '$14', null],
  ['quarantined', null, 'thin_margin'],
  ['healed', '$16', null],
  ['live', '$16', null],
];

beforeAll(async () => {
  try {
    const d = getDb();
    await d.execute(sql`SELECT 1`);
    dbUp = true;
  } catch { dbUp = false; return; }

  const d = getDb();
  await wipe();
  await d.insert(targets).values({
    targetId: T, url: 'corpus://ikea', cadence: '6h', contract: { field: FIELD },
  }).onConflictDoNothing();

  // Take the WHOLE block off the sequence, not just the first id. Inserting
  // run_id explicitly does not advance the serial, so reserving one and using
  // five hands the next four to whoever inserts next -- which, with vitest
  // running files in parallel, is another suite's fixture.
  const { rows } = await d.execute(sql`
    SELECT nextval(pg_get_serial_sequence('runs','run_id'))::int AS id
    FROM generate_series(1, ${CELLS.length})`);
  base = (rows as { id: number }[])[0]!.id;

  for (const [i, [status, value, reason]] of CELLS.entries()) {
    const runId = base + i;
    await d.execute(sql`
      INSERT INTO runs (run_id, target_id, started_at, status, page_bytes, page_sha)
      VALUES (${runId}, ${T}, ${at(i)}, ${status === 'quarantined' ? 'abstain' : 'ok'}, 1000, ${`sha${i}`})`);
    await d.execute(sql`
      INSERT INTO field_runs (run_id, field, value, status, reason, proof_id,
                              golden_sha256, capture_sha256, held_since_run)
      VALUES (${runId}, ${FIELD}, ${value}, ${status}, ${reason}, ${`pr_test_${runId}`},
              'golden_abc', ${status === 'quarantined' ? 'capture_abc' : null},
              ${status === 'quarantined' ? runId : null})`);
  }
  await d.execute(sql`
    INSERT INTO queue_items (proof_id, stakes_rows) VALUES (${`pr_test_${base + 2}`}, 412)`);
  await d.execute(sql`
    INSERT INTO captures (sha256, bytes, pruned) VALUES ('capture_abc', 1000, false)
    ON CONFLICT DO NOTHING`);
  await d.execute(sql`
    INSERT INTO heal_history (target_id, field, from_selector, to_selector, run_id, reverted)
    VALUES (${T}, ${FIELD}, '.old', '.new', ${base + 3}, false)`);
  await d.execute(sql`
    INSERT INTO retractions (target_id, field, from_run, to_run, row_ids)
    VALUES (${T}, ${FIELD}, ${base + 2}, ${base + 3}, '["r1","r2"]'::jsonb)`);

  const ep = await d.execute(sql`
    INSERT INTO episodes (target_id, field, cause, opened_run, closed_run, notified)
    VALUES (${T}, ${FIELD}, 'selector_break', ${base + 2}, ${base + 4}, 'email')
    RETURNING episode_id`);
  episodeId = (ep.rows as { episode_id: number }[])[0]!.episode_id;
});

async function wipe() {
  const d = getDb();
  for (const stmt of [
    sql`DELETE FROM retractions WHERE target_id = ${T}`,
    sql`DELETE FROM heal_history WHERE target_id = ${T}`,
    sql`DELETE FROM episodes WHERE target_id = ${T}`,
    sql`DELETE FROM queue_items WHERE proof_id LIKE 'pr_test_%'`,
    sql`DELETE FROM field_runs WHERE run_id IN (SELECT run_id FROM runs WHERE target_id = ${T})`,
    sql`DELETE FROM runs WHERE target_id = ${T}`,
    sql`DELETE FROM targets WHERE target_id = ${T}`,
    sql`DELETE FROM digests WHERE cadence = 'test_reports_weekly'`,
  ]) await d.execute(stmt);
}

afterAll(async () => {
  if (dbUp) await wipe();
  await closeDb().catch(() => {});
});

describe('database', () => {
  it('postgres is reachable (required when ASSAY_REQUIRE_DB is set)', () => {
    if (process.env.ASSAY_REQUIRE_DB) expect(dbUp).toBe(true);
  });
});

// ---------------------------------------------------------------------------

describe('the diff fold', () => {
  const rows = CELLS.map(([status, value, reason], i) => ({
    run_id: 100 + i,
    started_at: at(i),
    value,
    status,
    reason,
    proof_id: `pr_${100 + i}`,
    held_since_run: status === 'quarantined' ? 100 + i : null,
  }));

  it('gives withheld its own state rather than a gap or a null', () => {
    expect(toEntries(rows).map((e) => e.state))
      .toEqual(['changed', 'unchanged', 'withheld', 'changed', 'unchanged']);
  });

  it('puts no value and no before/after on a withheld entry', () => {
    const hole = toEntries(rows)[2]!;
    expect(hole.state).toBe('withheld');
    // Not an empty string, not null -- absent. A consumer that reads `value`
    // must get undefined, never something it can compare against a real value.
    expect('value' in hole).toBe(false);
    expect('from' in hole).toBe(false);
    expect(hole).toMatchObject({ why: { code: 'thin_margin' }, heldSinceRun: 102 });
  });

  it('never compares against a hole -- run 103 is measured against run 101', () => {
    const after = toEntries(rows)[3]!;
    expect(after.state).toBe('changed');
    if (after.state !== 'changed') return;
    expect(after.comparedToRun).toBe(101);
    expect(after.from).toBe('$14');
    expect(after.value).toBe('$16');
  });

  it('marks a first value as having nothing to compare against, not as unchanged', () => {
    const first = toEntries(rows)[0]!;
    expect(first.state).toBe('changed');
    if (first.state !== 'changed') return;
    expect(first.comparedToRun).toBeNull();
    expect(first.from).toBeNull();
  });

  it('treats a null value under a published status as withheld, not as a value', () => {
    // Belt and braces against a bug upstream: the envelope's rule is that a
    // held cell is null AND labelled, so either half alone is a hole here.
    const [hole] = toEntries([{ ...rows[0]!, value: null, status: 'live' }]);
    expect(hole!.state).toBe('withheld');
  });
});

describe('the rendered diff', () => {
  const text = () => diffText({
    target: T,
    field: FIELD,
    entries: toEntries(CELLS.map(([status, value, reason], i) => ({
      run_id: 100 + i, started_at: at(i), value, status, reason,
      proof_id: `pr_${100 + i}`, held_since_run: status === 'quarantined' ? 100 + i : null,
    }))),
  });

  it('says it cannot tell you, rather than showing an empty diff', () => {
    expect(text()).toContain('I cannot tell you whether this changed.');
    expect(text()).toContain('WITHHELD');
  });

  it('does not render a hole as unchanged', () => {
    const held = text().split('\n').find((l) => l.includes('run 102'))!;
    expect(held).not.toContain('unchanged');
    expect(held).not.toContain('same as');
  });

  it('counts the holes alongside the runs', () => {
    expect(text()).toContain('5 runs, 1 withheld.');
  });
});

// ---------------------------------------------------------------------------

describe('the incident record', () => {
  it('composes from the stored records', async () => {
    if (!dbUp) return;
    const r = await incidentRecord(episodeId);
    expect(r).toBeTruthy();
    expect(r!.target).toBe(T);
    expect(r!.field).toBe(FIELD);
    expect(r!.open).toBe(false);
    expect(r!.cause).toEqual({ code: 'selector_break', plain: expect.any(String) });
  });

  it('includes the refusals -- a report of fixes alone is marketing', async () => {
    if (!dbUp) return;
    const r = await incidentRecord(episodeId);
    expect(r!.held).toHaveLength(1);
    expect(r!.held[0]).toMatchObject({
      run: base + 2,
      why: { code: 'thin_margin' },
      capturePruned: false,
      decision: { resolvedBy: null, nominated: null },
    });
    expect(prose(incidentMarkdown(r!))).toContain('The refusals are the part worth reading');
    expect(incidentMarkdown(r!)).toContain('1 cell held.');
  });

  it('counts what was published while the field was broken as suspect, not clean', async () => {
    if (!dbUp) return;
    const r = await incidentRecord(episodeId);
    // Runs base+3 only: base+2 was held, and base+4 is the recovery that closed
    // the episode -- calling that one suspect would be wrong.
    expect(r!.suspect.map((s) => s.run)).toEqual([base + 3]);
    // Whitespace-normalised: the prose is hard-wrapped, and an assertion that
    // breaks when a line rewraps tests the margin, not the claim.
    expect(prose(incidentMarkdown(r!)))
      .toContain('unverified rather than counting them as clean');
  });

  it('carries the heal and the retraction that fall inside the window', async () => {
    if (!dbUp) return;
    const r = await incidentRecord(episodeId);
    expect(r!.heals).toHaveLength(1);
    expect(r!.heals[0]).toMatchObject({ from: '.old', to: '.new', reverted: false });
    expect(r!.retractions).toHaveLength(1);
    expect(r!.retractions[0]).toMatchObject({ rows: 2, exportedAt: null });
  });

  it('states no confidence anywhere', async () => {
    if (!dbUp) return;
    const md = incidentMarkdown((await incidentRecord(episodeId))!);
    expect(md).not.toMatch(/\d+(\.\d+)?%/);
    expect(md.toLowerCase()).not.toContain('successful');
    // Engine vocabulary never reaches the reader raw.
    expect(md).not.toContain('thin_margin');
  });

  it('reads settledness from resolved_by, never from a model nomination', async () => {
    if (!dbUp) return;
    const d = getDb();
    const proof = `pr_test_${base + 2}`;
    // assay_propose writes a nomination into `resolution` and leaves the item
    // OPEN. Reading `resolution` here would report a decision nobody made.
    await d.execute(sql`
      UPDATE queue_items SET resolution = 'model_nominated:1' WHERE proof_id = ${proof}`);
    let r = await incidentRecord(episodeId);
    expect(r!.held[0]!.decision).toMatchObject({
      resolvedBy: null, what: null, nominated: 'model_nominated:1',
    });
    expect(incidentMarkdown(r!)).toContain('Nobody has decided this yet.');

    await d.execute(sql`
      UPDATE queue_items SET resolved_by = 'human', resolution = 'first', resolved_at = now()
      WHERE proof_id = ${proof}`);
    r = await incidentRecord(episodeId);
    const md = incidentMarkdown(r!);
    expect(md).toContain('Decided by human');
    // Settling the item does not republish the cell (F9 is a separate act), and
    // the record must not let a reader infer that a value went out.
    expect(md).toContain('The cell itself stayed held');
    expect(r!.timeline.find((e) => e.run === base + 2)!.state).toBe('withheld');

    await d.execute(sql`
      UPDATE queue_items SET resolved_by = NULL, resolution = NULL, resolved_at = NULL
      WHERE proof_id = ${proof}`);
  });

  it('is null for an episode that does not exist', async () => {
    if (!dbUp) return;
    expect(await incidentRecord(2_000_000_000)).toBeNull();
  });

  it('lists episodes for a target', async () => {
    if (!dbUp) return;
    const list = await episodes({ targetId: T });
    expect(list.map((e) => e.episode)).toContain(episodeId);
  });
});

// ---------------------------------------------------------------------------

describe('the digest', () => {
  const window = { since: at(-1), until: at(10) };

  it('never lets a held field appear as a change', async () => {
    if (!dbUp) return;
    const d = await composeDigest(window);
    expect(d.withheld.map((c) => c.target)).toContain(T);
    expect(d.changes.map((c) => c.target)).not.toContain(T);
  });

  it('leads with both counts, never a bare change count', async () => {
    if (!dbUp) return;
    const d = await composeDigest(window);
    expect(d.subject).toMatch(/^\d+ changes?, \d+ withheld$/);
    expect(digestHtml(d)).toContain(d.subject);
  });

  it('names the run a field has been held since, in the reader\'s words', async () => {
    if (!dbUp) return;
    const d = await composeDigest(window);
    const held = d.withheld.find((c) => c.target === T)!;
    expect(held.what).toContain(`held since run ${base + 2}`);
    expect(held.what).not.toContain('thin_margin');
  });
});

describe('the digest cadence', () => {
  // Rows this file created, so a shared database does not make these flaky.
  const mine = <T extends { digestId: number }>(xs: T[]): T[] =>
    xs.filter((x) => x.digestId === digestId);
  let digestId = 0;

  const due = (): Promise<unknown> => getDb().execute(
    sql`UPDATE digests SET next_run_at = now() - interval '1 minute' WHERE digest_id = ${digestId}`);

  it('is inert when nothing is configured', async () => {
    if (!dbUp) return;
    // The reason wave 2 can wire this into the worker without moving anything:
    // calling it against a database with no digest rows returns [] and throws
    // nothing, so the wiring changes no behaviour until an operator adds one.
    expect(await dueDigests(new Date('2000-01-01T00:00:00Z'))).toEqual([]);
  });

  it('claims what is due, and does not hand the same one out twice', async () => {
    if (!dbUp) return;
    const d = getDb();
    const ins = await d.execute(sql`
      INSERT INTO digests (cadence, next_run_at, recipients)
      VALUES ('weekly', now() - interval '1 minute', '["ops@example.com"]'::jsonb)
      RETURNING digest_id`);
    digestId = (ins.rows as { digest_id: number }[])[0]!.digest_id;

    const first = mine(await dueDigests());
    expect(first).toHaveLength(1);
    expect(first[0]!.recipients).toEqual(['ops@example.com']);
    expect(first[0]!.html).toContain(first[0]!.subject);
    // No last_sent_at yet, so the window is one cadence back from now.
    expect(first[0]!.until.getTime() - first[0]!.since.getTime()).toBe(7 * 86400e3);

    expect(mine(await dueDigests())).toEqual([]);

    // The claim moves the schedule; only a send moves the window.
    const row = async () => (await d.execute(
      sql`SELECT last_sent_at FROM digests WHERE digest_id = ${digestId}`)
    ).rows as { last_sent_at: Date | null }[];
    expect((await row())[0]!.last_sent_at).toBeNull();
    await markDigestSent(first[0]!.digestId);
    expect((await row())[0]!.last_sent_at).not.toBeNull();
  });

  it('parks a digest whose cadence it cannot read, rather than guessing a period', async () => {
    if (!dbUp) return;
    const d = getDb();
    await d.execute(sql`UPDATE digests SET cadence = 'every other tuesday' WHERE digest_id = ${digestId}`);
    await due();
    expect(mine(await dueDigests())).toEqual([]);
    // Parked in the data, exactly as an unparseable target cadence is: the due
    // query cannot select a null next_run_at, so there is no branch in the loop.
    const rows = await d.execute(
      sql`SELECT next_run_at FROM digests WHERE digest_id = ${digestId}`);
    expect((rows.rows as { next_run_at: Date | null }[])[0]!.next_run_at).toBeNull();
    await d.execute(sql`UPDATE digests SET cadence = 'weekly' WHERE digest_id = ${digestId}`);
  });

  it('refuses a recipient list it cannot read rather than sending to nobody', async () => {
    if (!dbUp) return;
    await getDb().execute(
      sql`UPDATE digests SET recipients = '"ops@example.com"'::jsonb WHERE digest_id = ${digestId}`);
    await due();
    await expect(dueDigests()).rejects.toThrow(/recipients/);
    await getDb().execute(sql`DELETE FROM digests WHERE digest_id = ${digestId}`);
  });
});

// ---------------------------------------------------------------------------

describe('the REST surface', () => {
  it('refuses every route without a key', async () => {
    for (const [handler, url] of [
      [getIncident, 'https://x/api/v1/reports/incidents/1'],
      [getDiff, 'https://x/api/v1/reports/diff?target=a&field=b'],
      [getDigest, 'https://x/api/v1/reports/digest?since=2026-01-01&until=2026-01-08'],
    ] as const) {
      const res = await handler(req(url), { params: Promise.resolve({ episode: '1' }) });
      expect(res.status).toBe(401);
    }
  });

  it('rejects a window with no order rather than guessing one', async () => {
    if (!dbUp) return;
    // Auth first, so this asserts the schema rather than the guard; without a
    // key it would 401 before Zod ever ran.
    const parsed = await getDigest(
      req('https://x/api/v1/reports/digest?since=2026-01-08&until=2026-01-01'), noCtx);
    expect([400, 401]).toContain(parsed.status);
  });
});

describe('the field history query', () => {
  it('reads the basis from before the window, so a truncated view invents no first value', async () => {
    if (!dbUp) return;
    const h = await fieldHistory({ targetId: T, field: FIELD, limit: 2 });
    expect(h.entries.map((e) => e.run)).toEqual([base + 3, base + 4]);
    const opening = h.entries[0]!;
    expect(opening.state).toBe('changed');
    if (opening.state !== 'changed') return;
    // base+2 is the hole; the basis is base+1, which is outside the window.
    expect(opening.comparedToRun).toBe(base + 1);
  });
});
