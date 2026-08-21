// D3: scheduling, the claim, skip-if-unchanged, episode dedupe and delivery.
//
// DB-backed tests skip when Postgres is absent so `vitest` still runs on a
// clean clone. Nothing here sends live mail: `send` takes its transport as a
// parameter precisely so the shape can be proven without a key or a domain.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { cadenceMs, nextRunAt } from '../src/schedule.js';
import { digestSubject, breakSubject, send } from '../src/notify.js';
import { openEpisode, closeEpisode } from '../src/api/webhooks.js';
import {
  getDb, closeDb, claimDueTarget, scheduleTarget, lastRunFor, historyFor, sql, targets,
} from '../src/store/index.js';

const T = 'test_d3';
let dbUp = false;

beforeAll(async () => {
  try {
    const d = getDb();
    await d.execute(sql`SELECT 1`);
    dbUp = true;
    await d.execute(sql`DELETE FROM episodes WHERE target_id = ${T}`);
    await d.execute(sql`DELETE FROM runs WHERE target_id = ${T}`);
    await d.insert(targets).values({
      targetId: T, url: 'corpus://ikea', cadence: '6h',
      contract: { field: 'recall_title' },
    }).onConflictDoNothing();
  } catch { dbUp = false; }
});

afterAll(async () => {
  if (dbUp) {
    const d = getDb();
    await d.execute(sql`DELETE FROM episodes WHERE target_id = ${T}`);
    await d.execute(sql`DELETE FROM runs WHERE target_id = ${T}`);
    await d.execute(sql`DELETE FROM targets WHERE target_id = ${T}`);
  }
  await closeDb().catch(() => {});
});

describe('cadence', () => {
  it('parses the forms the schedule screen shows', () => {
    expect(cadenceMs('6h')).toBe(6 * 3600e3);
    expect(cadenceMs('12h')).toBe(12 * 3600e3);
    expect(cadenceMs('daily')).toBe(86400e3);
    expect(cadenceMs('weekly')).toBe(7 * 86400e3);
  });

  it('gives a paused target no next run, so the due query never selects it', () => {
    expect(cadenceMs('paused')).toBeNull();
    expect(nextRunAt('paused')).toBeNull();
    expect(cadenceMs('every other tuesday')).toBeNull();
  });
});

describe('the claim', () => {
  it('claims a target that is due', async () => {
    if (!dbUp) return;
    await scheduleTarget(T, new Date());
    const got = await claimDueTarget();
    expect(got?.targetId).toBe(T);
  });

  it('does not claim one that is not yet due', async () => {
    if (!dbUp) return;
    await scheduleTarget(T, new Date(Date.now() + 3600e3));
    const got = await claimDueTarget();
    expect(got?.targetId).not.toBe(T);
  });

  it('cannot be claimed twice — the second worker gets nothing', async () => {
    if (!dbUp) return;
    await scheduleTarget(T, new Date());
    // Concurrent, as two workers would be. Exactly one may win.
    const [a, b] = await Promise.all([claimDueTarget(), claimDueTarget()]);
    const mine = [a, b].filter((x) => x?.targetId === T);
    expect(mine).toHaveLength(1);
  });

  it('bumps next_run_at by the cadence, so it is not immediately due again', async () => {
    if (!dbUp) return;
    await scheduleTarget(T, new Date());
    await claimDueTarget();
    const { rows } = await getDb().execute(
      sql`SELECT next_run_at FROM targets WHERE target_id = ${T}`,
    );
    expect(new Date(rows[0].next_run_at).getTime()).toBeGreaterThan(Date.now() + 5 * 3600e3);
  });
});

describe('skip-if-unchanged', () => {
  it('records the fingerprint check, so the detector history has no hole', async () => {
    if (!dbUp) return;
    const d = getDb();
    // An evaluated run, then two skips of the same page.
    await d.execute(sql`INSERT INTO runs (target_id, status, page_bytes, page_sha)
                        VALUES (${T}, 'ok', 1000, 'sha_a')`);
    await d.execute(sql`INSERT INTO runs (target_id, status, page_bytes, page_sha)
                        VALUES (${T}, 'skipped', 1000, 'sha_a')`);
    await d.execute(sql`INSERT INTO runs (target_id, status, page_bytes, page_sha)
                        VALUES (${T}, 'skipped', 1000, 'sha_a')`);

    const last = await lastRunFor(T);
    expect(last.status).toBe('skipped');
    expect(last.page_sha).toBe('sha_a');       // what skip compares against

    const h = await historyFor(T);
    expect(h.length).toBe(3);                   // skipped runs are IN the series
    expect(h.every((s) => s.pageBytes === 1000)).toBe(true);
  });
});

describe('episode grouping', () => {
  it('opens once and stays open — 400 broken pages are one incident', async () => {
    if (!dbUp) return;
    const first = await openEpisode({ targetId: T, field: 'hazard', cause: 'thin_margin', runId: 1 });
    expect(first).toBeTruthy();

    // Every subsequent break inside the open episode must dedupe to null,
    // which is what makes it one alert and not four hundred.
    const more = await Promise.all(
      [2, 3, 4, 5].map((r) => openEpisode({ targetId: T, field: 'hazard', cause: 'thin_margin', runId: r })),
    );
    expect(more.every((x) => x === null)).toBe(true);

    const closed = await closeEpisode({ targetId: T, field: 'hazard', runId: 6 });
    expect(closed).toBeTruthy();

    // Recovering and breaking again IS a new incident.
    const reopened = await openEpisode({ targetId: T, field: 'hazard', cause: 'below_tau', runId: 7 });
    expect(reopened).toBeTruthy();
    expect(reopened.episodeId).not.toBe(first.episodeId);
  });
});

describe('delivery', () => {
  it('puts the withheld count in the subject, never a bare change count', () => {
    expect(digestSubject({ changes: 12, withheld: 2 })).toBe('12 changes, 2 withheld');
    expect(digestSubject({ changes: 1, withheld: 0 })).toBe('1 change, 0 withheld');
    // The number that would be a lie in the body is a lie in the subject first.
    expect(digestSubject({ changes: 2, withheld: 1 })).toContain('withheld');
  });

  it('names the scraper and field, so triage happens in the inbox', () => {
    expect(breakSubject({ target: 'ikea', field: 'hazard' })).toBe('ikea: hazard is held');
  });

  it('sends through the injected transport without a live key', async () => {
    const seen = [];
    const out = await send({
      to: 'a@b.test', subject: 's', html: '<p>h</p>',
      apiKey: 'test', from: 'x@y.test',
      transport: async (a) => { seen.push(a); return { id: 'stub' }; },
    });
    expect(out.id).toBe('stub');
    expect(seen[0].subject).toBe('s');
  });

  it('refuses to send with no key rather than failing silently', async () => {
    await expect(send({ to: 'a@b.test', subject: 's', html: 'h', apiKey: '', from: 'x@y.test' }))
      .rejects.toThrow(/RESEND_KEY/);
  });

  it('surfaces a transport failure so the caller can fall back', async () => {
    await expect(send({
      to: 'a@b.test', subject: 's', html: 'h', apiKey: 'k', from: 'x@y.test',
      transport: async () => { throw new Error('resend 500'); },
    })).rejects.toThrow('resend 500');
  });
});
