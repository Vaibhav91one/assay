// The setup write path.
//
// Most of this is database behaviour, so most of it early-returns without
// Postgres -- which vitest reports as PASSED, not skipped. Run it with
// ASSAY_REQUIRE_DB=1 or it is asserting nothing.
//
// The two things worth testing here are the two that carry a guarantee:
//
//   1. A resolver pattern cannot be a RegExp literal. `JSON.stringify(/x/i)` is
//      `{}`, and that has silently emptied a contract on the way to jsonb once
//      already. Tested against the SCHEMA, so it is unrepresentable rather than
//      merely discouraged.
//   2. Deleting a target with history is refused, because a published row's
//      proof id has to keep resolving (F12).

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  CreateInput, Resolver, Cadence, slugFor, targetIdFor,
  createTarget, listTargets, showTarget, pauseTarget, resumeTarget, deleteTarget,
} from '../src/setup/index.js';
import { getDb, closeDb, targets, sql } from '../src/store/index.js';

const SLUG = 'settest';
const ID = targetIdFor(SLUG, 'recall_title');

const RESOLVER = {
  tags: 'h2,h3,a,li',
  minLen: 20,
  maxLen: 140,
  include: 'recall|rappel|retirada|remedy kit',
  exclude: 'recalls\\.gov|learn more|click here',
  flags: 'i',
};

let dbUp = false;

async function wipe() {
  const d = getDb();
  await d.execute(sql`DELETE FROM queue_items WHERE proof_id IN (
    SELECT fr.proof_id FROM field_runs fr JOIN runs r ON r.run_id = fr.run_id
    WHERE r.target_id LIKE ${`${SLUG}%`})`);
  await d.execute(sql`DELETE FROM field_runs WHERE run_id IN (
    SELECT run_id FROM runs WHERE target_id LIKE ${`${SLUG}%`})`);
  await d.execute(sql`DELETE FROM episodes WHERE target_id LIKE ${`${SLUG}%`}`);
  await d.execute(sql`DELETE FROM heal_history WHERE target_id LIKE ${`${SLUG}%`}`);
  await d.execute(sql`DELETE FROM field_state WHERE target_id LIKE ${`${SLUG}%`}`);
  await d.execute(sql`DELETE FROM runs WHERE target_id LIKE ${`${SLUG}%`}`);
  await d.execute(sql`DELETE FROM targets WHERE target_id LIKE ${`${SLUG}%`}`);
}

beforeAll(async () => {
  try { getDb(); await getDb().select().from(targets).limit(1); dbUp = true; } catch { dbUp = false; }
  if (process.env.ASSAY_REQUIRE_DB && !dbUp) {
    throw new Error('ASSAY_REQUIRE_DB is set and Postgres is unreachable');
  }
  if (dbUp) await wipe();
});

afterAll(async () => {
  if (dbUp) await wipe().catch(() => {});
  await closeDb().catch(() => {});
});

// --- the boundary, no database needed ---------------------------------------

describe('a resolver pattern is a string, never a RegExp', () => {
  it('refuses a RegExp literal for include', () => {
    // This is the bug the rule exists for: a literal survives TypeScript, then
    // stringifies to {} on the way to jsonb and matches nothing on the way back.
    expect(Resolver.safeParse({ ...RESOLVER, include: /recall/i }).success).toBe(false);
  });

  it('refuses a RegExp literal for exclude', () => {
    expect(Resolver.safeParse({ ...RESOLVER, exclude: /nope/i }).success).toBe(false);
  });

  it('accepts the string form with separate flags', () => {
    const r = Resolver.safeParse(RESOLVER);
    expect(r.success).toBe(true);
    // And it survives the round trip a contract actually takes.
    expect(JSON.parse(JSON.stringify(r.success && r.data)).include).toBe(RESOLVER.include);
  });

  it('refuses a length band that cannot match anything', () => {
    expect(Resolver.safeParse({ tags: 'p', minLen: 100, maxLen: 10 }).success).toBe(false);
  });

  it('refuses an unrecognised key rather than dropping it', () => {
    // A caller describing a field Assay will not look for should not get a 200.
    expect(Resolver.safeParse({ ...RESOLVER, selector: 'p.hazard' }).success).toBe(false);
  });
});

describe('cadence is validated by the scheduler that has to run it', () => {
  it.each(['hourly', 'daily', 'weekly', '6h', '2d'])('accepts %s', (c) => {
    expect(Cadence.safeParse(c).success).toBe(true);
  });

  it('refuses "paused" -- pause is an operation, not a cadence', () => {
    expect(Cadence.safeParse('paused').success).toBe(false);
  });

  it.each(['', 'sometimes', '6', '6m', '0x'])('refuses %s', (c) => {
    expect(Cadence.safeParse(c).success).toBe(false);
  });
});

describe('a field name is an identifier', () => {
  it.each(['recall_title', 'price', 'a'])('accepts %s', (n) => {
    expect(CreateInput.safeParse({
      url: 'https://example.com', fields: [{ name: n, resolver: RESOLVER }],
    }).success).toBe(true);
  });

  it.each(['Recall Title', '1price', 'drop table', 'a'.repeat(32), ''])('refuses %s', (n) => {
    expect(CreateInput.safeParse({
      url: 'https://example.com', fields: [{ name: n, resolver: RESOLVER }],
    }).success).toBe(false);
  });
});

describe('the id derived from a url', () => {
  it('drops the scheme and www, and keeps the path', () => {
    expect(slugFor('https://www.ikea.com/us/en/recalls/')).toBe('ikea-com-us-en-recalls');
  });

  it('drops a query string, which is not part of what is being watched', () => {
    expect(slugFor('https://x.example/a?b=c#d')).toBe('x-example-a');
  });

  it('is one target row per field', () => {
    expect(targetIdFor('shop', 'price')).toBe('shop__price');
  });
});

// --- the database half -------------------------------------------------------

describe('creating a watch', () => {
  it('establishes a baseline through the pipeline and schedules the next run', async () => {
    if (!dbUp) return;
    const r = await createTarget({
      url: 'corpus://ikea', cadence: '6h', id: SLUG,
      fields: [{ name: 'recall_title', resolver: RESOLVER }],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const t = r.targets[0]!;
    expect(t.id).toBe(ID);
    // The baseline is a real run through ingestPage, not a row written by hand.
    expect(t.baseline_run).toBeGreaterThan(0);
    // The value was read from the DOM. Nothing here invents one.
    expect(t.baseline_value).toBeTruthy();
    expect(t.status).toBe('live');
    // Scheduled, and only after the baseline landed.
    expect(t.next_run_at).not.toBeNull();
  });

  it('refuses a second watch on the same id rather than overwriting one', async () => {
    if (!dbUp) return;
    const again = await createTarget({
      url: 'corpus://ikea', cadence: '6h', id: SLUG,
      fields: [{ name: 'recall_title', resolver: RESOLVER }],
    });
    expect(again.ok).toBe(false);
    expect(!again.ok && again.error).toBe('already_exists');
  });

  it('writes nothing at all when a resolver matches nothing on the page', async () => {
    if (!dbUp) return;
    const r = await createTarget({
      url: 'corpus://ikea', cadence: '6h', id: 'settest_ghost',
      fields: [{ name: 'nothing_here', resolver: { tags: 'blockquote.nope', minLen: 5, maxLen: 9 } }],
    });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toBe('no_element');
    // A refusal that left a half-built target would fail on its first
    // scheduled run instead of here, where somebody is watching.
    const left = await showTarget(targetIdFor('settest_ghost', 'nothing_here'));
    expect(left.ok).toBe(false);
  });
});

describe('pause keeps the cadence it is going to resume to', () => {
  it('pauses by removing the next run, not by overwriting the cadence', async () => {
    if (!dbUp) return;
    const p = await pauseTarget(ID);
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(p.paused).toBe(true);
    expect(p.next_run_at).toBeNull();
    // The whole point: `cadence = 'paused'` would also pause it, and would
    // destroy the setting resume has to restore.
    expect(p.cadence).toBe('6h');
  });

  it('is idempotent -- pausing a paused target is the state that was asked for', async () => {
    if (!dbUp) return;
    expect((await pauseTarget(ID)).ok).toBe(true);
  });

  it('resumes due immediately, not one cadence from now', async () => {
    if (!dbUp) return;
    const r = await resumeTarget(ID);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.paused).toBe(false);
    expect(r.cadence).toBe('6h');
    expect(new Date(r.next_run_at!).getTime()).toBeLessThanOrEqual(Date.now() + 1000);
  });

  it('reports a missing target rather than reporting success', async () => {
    if (!dbUp) return;
    expect((await pauseTarget('settest_absent')).ok).toBe(false);
    expect((await resumeTarget('settest_absent')).ok).toBe(false);
  });
});

describe('delete is honest about history', () => {
  it('refuses a target that has runs, and says to pause it instead', async () => {
    if (!dbUp) return;
    const d = await deleteTarget(ID);
    expect(d.ok).toBe(false);
    if (d.ok) return;
    expect(d.error).toBe('has_history');
    // The refusal has to say why and what to do, or it is a dead end.
    expect(d.detail).toMatch(/proof id/);
    expect(d.detail).toMatch(/[Pp]ause/);
  });

  it('leaves the target and its runs exactly where they were', async () => {
    if (!dbUp) return;
    const s = await showTarget(ID);
    expect(s.ok).toBe(true);
    expect(s.ok && s.target.runs).toBeGreaterThan(0);
  });

  it('deletes a target that never ran', async () => {
    if (!dbUp) return;
    // Written straight to the store so it has no runs -- which is exactly the
    // state createTarget refuses to leave behind, so it cannot be made any
    // other way.
    await getDb().insert(targets).values({
      targetId: 'settest_unrun', url: 'corpus://ikea', cadence: '6h',
      contract: { field: 'x', resolver: RESOLVER },
    });
    const d = await deleteTarget('settest_unrun');
    expect(d.ok).toBe(true);
    expect((await showTarget('settest_unrun')).ok).toBe(false);
  });

  it('reports a missing target rather than reporting a successful delete', async () => {
    if (!dbUp) return;
    const d = await deleteTarget('settest_absent');
    expect(d.ok).toBe(false);
    expect(!d.ok && d.error).toBe('not_found');
  });
});

describe('listing', () => {
  it('reports paused as the absence of a next run, and counts what is held', async () => {
    if (!dbUp) return;
    const { targets: rows } = await listTargets();
    const mine = rows.find((t) => t.id === ID);
    expect(mine).toBeTruthy();
    expect(mine!.field).toBe('recall_title');
    expect(mine!.paused).toBe(mine!.next_run_at === null);
    expect(typeof mine!.held).toBe('number');
    // Timestamps cross the boundary as ISO strings, not as Date or as whatever
    // the driver happened to hand back under this bundler.
    expect(typeof mine!.created_at).toBe('string');
  });
});
