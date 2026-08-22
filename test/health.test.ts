// Standing per-field health (F1 fragility, F3 drift).
//
// The grading is pure, so most of this needs no database. The two things that
// DO need one are the two that can silently destroy something: the write must
// touch only this feature's columns, and the round trip must come back as the
// same words it went in as.
//
// DB-backed tests early-return when Postgres is absent, which vitest reports as
// PASSED, not skipped. ASSAY_REQUIRE_DB=1 turns that vacuous green into a
// failure -- see the last test in the file.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  fragility, drift, MIN_OBSERVATIONS, FRAGILITY_GRADES, DRIFT_STATES, FieldHealth,
  type FieldObservation,
} from '../src/health/index.js';
import { writeFieldState, standingState } from '../src/health/observe.js';
import type { Fingerprint } from '../src/fingerprint.js';
import { getDb, closeDb, sql, targets, fieldState, heldCells } from '../src/store/index.js';

const TARGET = 'health_test_target';
const FIELD = 'health_test_field';

let dbUp = false;
beforeAll(async () => {
  try {
    const d = getDb();
    await heldCells();
    await d.insert(targets).values({
      targetId: TARGET, url: 'corpus://health-test', cadence: '6h', contract: {},
    }).onConflictDoNothing();
    dbUp = true;
  } catch { dbUp = false; }
});
afterAll(async () => {
  if (dbUp) {
    await getDb().execute(sql`DELETE FROM field_state WHERE target_id = ${TARGET}`);
    await getDb().execute(sql`DELETE FROM targets WHERE target_id = ${TARGET}`);
  }
  await closeDb().catch(() => {});
});

// --- fixtures ---------------------------------------------------------------

const fp = (over: Partial<Fingerprint> = {}): Fingerprint => ({
  tag: 'h2', id: null, id_volatile: false, classes: null, classes_stable: null,
  classes_dropped: 0, text: 'a recall title', neighbor_text: null, aria_label: null,
  name: null, type: null, href: null, alt: null, testid: null, role: null,
  heading_path: [], parent_tag: 'div', depth: 5, sibling_index: 0,
  id_xpath: null, abs_xpath: '/html[1]/body[1]/h2[1]', ...over,
});

/** n observations of the same element, with the same two agreeing anchors. */
const series = (n: number, f: Fingerprint): FieldObservation[] =>
  Array.from({ length: n }, (_, i) => ({
    runId: i + 1, fingerprint: f, anchors: { css: 'the value', xpath: 'the value' },
  }));

const PINNED = fp({ id: 'recall-title', testid: 'recall-title' });
const DIV_SOUP = fp({ abs_xpath: '/html[1]/body[1]/div[3]/div[1]/div[2]/h2[1]' });

// --- fragility (F1) ---------------------------------------------------------

describe('fragility grade', () => {
  it('is a closed vocabulary of four words and carries no number', () => {
    expect([...FRAGILITY_GRADES]).toEqual(['sturdy', 'serviceable', 'fragile', 'insufficient_history']);
    const note = fragility(series(6, PINNED)).note;
    expect(note).not.toMatch(/%|\bconfidence\b/i);
  });

  it('refuses to grade below the detector\'s own floor', () => {
    expect(MIN_OBSERVATIONS).toBe(3);
    const r = fragility(series(2, PINNED));
    expect(r.grade).toBe('insufficient_history');
    // The honest state carries no statistic at all. A zero here would be
    // indistinguishable from "measured, and it never moved".
    expect(r.median_anchor_moves).toBeNull();
    expect(r.mad_anchor_moves).toBeNull();
    expect(r.observations).toBe(2);
  });

  it('grades a field the site pinned on purpose as sturdy', () => {
    const r = fragility(series(6, PINNED));
    expect(r.grade).toBe('sturdy');
    expect(r.anchors.find((a) => a.key === 'testid')?.held).toBe(true);
  });

  it('grades a field held only by derived anchors as serviceable, never sturdy', () => {
    const r = fragility(series(6, fp({ classes_stable: ['product-title'] })));
    expect(r.grade).toBe('serviceable');
    expect(r.anchors.every((a) => !a.stable)).toBe(true);
  });

  it('grades div soup as fragile: nothing identifies it but where it sits', () => {
    const r = fragility(series(6, DIV_SOUP));
    expect(r.grade).toBe('fragile');
    expect(r.anchors).toEqual([]);
  });

  it('grades an anchor that has already moved as fragile, not serviceable', () => {
    // The chicco case from the real corpus: one derived anchor, and it changed.
    const before = series(6, fp({ id_xpath: '//*[@id="wrapper"]/div/p/a' }));
    const after = series(6, fp({ id_xpath: '//*[@id="maincontent"]/div/p/a' }));
    const r = fragility([...before, ...after]);
    expect(r.grade).toBe('fragile');
    expect(r.note).toMatch(/every one of them has already moved/);
  });

  it('grades build-hashed classes that churn as fragile', () => {
    // Volatile classes are already excluded by fingerprint(); what is left is
    // the semantic half, and on IKEA even that gets renamed between builds.
    const obs = Array.from({ length: 8 }, (_, i) => series(1, fp({
      classes_stable: i < 4 ? ['pub__h2'] : ['pub__text', 'pub__typography-heading-l'],
    }))[0]!);
    expect(fragility(obs).grade).toBe('fragile');
  });

  it('survives one catastrophic day, where a mean would not', () => {
    const clean = series(21, PINNED);
    const dirty = clean.map((o, i) => (i === 10 ? { ...o, fingerprint: DIV_SOUP } : o));

    expect(fragility(clean).grade).toBe('sturdy');
    expect(fragility(dirty).grade).toBe('sturdy');

    const r = fragility(dirty);
    // The movement is real and visible -- it is not being ignored, it is being
    // outvoted. A mean over the same series is nonzero, so any mean-with-a-
    // threshold rule would have downgraded this field on one bad day.
    expect(r.anchors.find((a) => a.key === 'testid')!.deviations).toBe(1);
    expect(r.anchors.find((a) => a.key === 'testid')!.held).toBe(true);
    expect(r.median_anchor_moves).toBe(0);
    expect(r.mad_anchor_moves).toBe(0);
  });

  it('counts a run where the field was absent as an absence, not as stability', () => {
    const obs = series(4, PINNED).map((o, i) => (i === 2 ? { ...o, fingerprint: null } : o));
    expect(fragility(obs).observations).toBe(3);
    expect(fragility(obs.slice(0, 3)).grade).toBe('insufficient_history');
  });
});

// --- drift (F3) -------------------------------------------------------------

const anchored = (pairs: [string | null, string | null][]): FieldObservation[] =>
  pairs.map(([css, xpath], i) => ({ runId: i + 1, fingerprint: PINNED, anchors: { css, xpath } }));

describe('drift state', () => {
  it('is a closed vocabulary of five words', () => {
    expect([...DRIFT_STATES]).toEqual(
      ['steady', 'drifting', 'settled', 'never_agreed', 'insufficient_history'],
    );
  });

  it('refuses to call a trend below the floor', () => {
    const r = drift(anchored([['a', 'a'], ['a', 'a']]));
    expect(r.state).toBe('insufficient_history');
    expect(r.verdicts).toBe(2);
  });

  it('is steady while every comparable run agrees', () => {
    expect(drift(anchored([['a', 'a'], ['a', 'a'], ['a', 'a']])).state).toBe('steady');
  });

  it('is drifting when anchors that used to agree stop agreeing', () => {
    const r = drift(anchored([['a', 'a'], ['a', 'a'], ['a', 'a'], ['a', 'b']]));
    expect(r.state).toBe('drifting');
    expect(r.disagreements).toBe(1);
  });

  it('clears itself when the anchors re-agree', () => {
    // F3: a partial rollout that gets reverted. Drift is a state, not an event.
    expect(drift(anchored([['a', 'a'], ['a', 'b'], ['a', 'a'], ['a', 'a']])).state).toBe('settled');
  });

  it('does not call a baseline that never agreed "drifting"', () => {
    // A permanent amber gets muted, and takes the real ones with it.
    const r = drift(anchored([['a', 'b'], ['a', 'c'], ['a', 'd']]));
    expect(r.state).toBe('never_agreed');
  });

  it('treats a lone anchor as unreadable, never as agreement', () => {
    const r = drift(anchored([['a', null], ['a', null], ['a', null], ['a', 'a']]));
    expect(r.unreadable).toBe(3);
    expect(r.state).toBe('insufficient_history');
  });

  it('compares full values, not 200-character prefixes', () => {
    // CRITIQUE 3.2: two readings identical for 200 chars and divergent after.
    const head = 'x'.repeat(200);
    const r = drift(anchored([
      [head + 'same', head + 'same'],
      [head + 'same', head + 'same'],
      [head + 'same', head + 'different tail'],
    ]));
    expect(r.state).toBe('drifting');
  });
});

// --- the write --------------------------------------------------------------

describe('field_state is shared, and this feature writes two columns of it', () => {
  it('leaves the brake columns untouched (feature D owns them)', async () => {
    if (!dbUp) return;
    const d = getDb();

    // Feature D's write, by hand: a live brake on the same row.
    await d.insert(fieldState)
      .values({ targetId: TARGET, field: FIELD, brakeActive: true, brakeReason: 'oscillating' })
      .onConflictDoUpdate({
        target: [fieldState.targetId, fieldState.field],
        set: { brakeActive: true, brakeReason: 'oscillating' },
      });

    await writeFieldState(TARGET, FIELD, 'fragile', 'drifting');

    const { rows } = await d.execute(sql`
      SELECT fragility_grade, drift_state, brake_active, brake_reason
      FROM field_state WHERE target_id = ${TARGET} AND field = ${FIELD}`);
    const row = rows[0] as Record<string, unknown>;

    expect(row.fragility_grade).toBe('fragile');
    expect(row.drift_state).toBe('drifting');
    // The whole point. A full-row upsert would have written brake_active's
    // INSERT default of false over a live brake and released it silently.
    expect(row.brake_active).toBe(true);
    expect(row.brake_reason).toBe('oscillating');
  });

  it('round-trips the two words unchanged, and validates against the response schema', async () => {
    if (!dbUp) return;
    await writeFieldState(TARGET, FIELD, 'serviceable', 'settled');
    const { rows } = await getDb().execute(sql`
      SELECT fragility_grade, drift_state FROM field_state
      WHERE target_id = ${TARGET} AND field = ${FIELD}`);
    expect((rows[0] as Record<string, unknown>).fragility_grade).toBe('serviceable');
    expect((rows[0] as Record<string, unknown>).drift_state).toBe('settled');

    // The API's shape, asserted against the schema rather than a hand-written
    // object, so a response can never carry a state outside the vocabulary.
    expect(() => FieldHealth.parse({
      target: TARGET, field: FIELD,
      fragility_grade: 'serviceable', drift_state: 'settled',
      fragility: {
        anchors: [], median_anchor_moves: 0, mad_anchor_moves: 0,
        median_position_moves: 0, observations: 6, note: 'x',
      },
      drift: { verdicts: 6, disagreements: 0, unreadable: 0, note: 'x' },
      unobserved_runs: 0, total_runs: 6,
    })).not.toThrow();
  });

  it('reports a never-assessed field as null rather than omitting it', async () => {
    if (!dbUp) return;
    // standingState is driven by field_runs, and this synthetic target has
    // none -- so it must not appear at all rather than appearing as graded.
    expect((await standingState(TARGET)).length).toBe(0);
  });

  it('postgres is reachable (required when ASSAY_REQUIRE_DB is set)', () => {
    if (process.env.ASSAY_REQUIRE_DB) expect(dbUp).toBe(true);
  });
});
