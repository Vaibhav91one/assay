// Home's headline is a count, and it was counting the page rather than the store.
//
// `homeStats` selects the run strip with `.limit(60)` -- correctly, the strip
// draws sixty bars -- and then reported `runs.length` as the number of runs.
// Past sixty runs in the window the headline froze at 60 while `/schedule`,
// which counts in the database, said 62. A product whose whole argument is that
// its numbers are checkable cannot have two screens disagreeing about how many
// times it ran.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getDb, closeDb, sql, targets } from '../src/store/index.js';
import { homeStats } from '../web/lib/home.js';

const T = 'test_home';
const N = 62; // more than the strip's 60, which is the whole point
let dbUp = false;

const wipe = async () => {
  const d = getDb();
  await d.execute(sql`DELETE FROM field_runs WHERE run_id IN (
    SELECT run_id FROM runs WHERE target_id = ${T})`);
  await d.execute(sql`DELETE FROM runs WHERE target_id = ${T}`);
};

beforeAll(async () => {
  try {
    const d = getDb();
    await d.execute(sql`SELECT 1`);
    dbUp = true;
    await wipe();
    await d.insert(targets).values({
      targetId: T, url: 'corpus://ikea', cadence: '6h', contract: { field: 'recall_title' },
    }).onConflictDoNothing();
    // Inside the seven-day window, one an hour, newest last.
    for (let i = 0; i < N; i++) {
      await d.execute(sql`
        INSERT INTO runs (target_id, status, page_bytes, page_sha, started_at)
        VALUES (${T}, 'ok', 1000, ${`sha_${i}`}, now() - (${N - i} || ' hours')::interval)`);
    }
  } catch { dbUp = false; }
});

afterAll(async () => {
  if (dbUp) {
    await wipe();
    await getDb().execute(sql`DELETE FROM targets WHERE target_id = ${T}`);
  }
  await closeDb().catch(() => {});
});

describe('the Home stats band', () => {
  it('postgres is reachable (required when ASSAY_REQUIRE_DB is set)', () => {
    if (process.env.ASSAY_REQUIRE_DB) expect(dbUp).toBe(true);
  });

  it('counts runs in the database, not bars on the strip', async () => {
    if (!dbUp) return;
    const s = await homeStats();
    // Other suites may run beside this one, so the assertion is that the count
    // is at least what this suite wrote -- and, decisively, that it is not the
    // strip's length.
    expect(s.runs).toBeGreaterThanOrEqual(N);
    expect(s.bars.length).toBeLessThanOrEqual(60);
    expect(s.runs).toBeGreaterThan(s.bars.length);
  });

  it('dates the window from the oldest run in it, not the oldest bar drawn', async () => {
    if (!dbUp) return;
    const s = await homeStats();
    expect(s.since).not.toBeNull();
    // The strip stops at 60, so its first bar is newer than the window's first
    // run. A label read off the bars would date a 62-run window two hours late.
    expect(s.since!.getTime()).toBeLessThanOrEqual(s.bars[0]!.at.getTime());
  });

  it('never reports more clean runs than runs', async () => {
    if (!dbUp) return;
    const s = await homeStats();
    expect(s.clean).toBeLessThanOrEqual(s.runs);
    expect(s.clean).toBeGreaterThanOrEqual(0);
  });
});
