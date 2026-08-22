// Field contracts (F2).
//
// The pure half needs no Postgres and always runs. The store half early-returns
// when the database is absent, which vitest reports as PASSED, not skipped --
// so `ASSAY_REQUIRE_DB=1` turns that vacuous green into a failure, and the last
// test in this file is the one that fails.

import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  DEFAULT_THRESHOLDS, TIER_THRESHOLDS, formatIssues, parseContract, thresholdsFor,
  type Contract,
} from '../src/contracts/index.js';
import {
  contractHistory, contractVersion, latestContract, saveContract,
} from '../src/contracts/store.js';
import { closeDb, getDb, sql } from '../src/store/index.js';

const parsed = (source: string): Contract => {
  const r = parseContract(source);
  if (!r.ok) throw new Error(formatIssues(r.issues));
  return r.contract;
};

const issues = (source: string, opts?: { knownFields?: readonly string[] }) => {
  const r = parseContract(source, opts);
  if (r.ok) throw new Error('expected the contract to be rejected');
  return r.issues;
};

const CONTRACT = `target: ikea
fields:
  price:
    policy: strict
    on_abstain: quarantine
    auto_approve: never
    alert: pagerduty
  description:
    policy: loose
    on_abstain: publish_last_good
    auto_approve: 0.85
    alert: none
`;

describe('the no-contract default is inert', () => {
  // If this moves, `npm run bench` leaves 0.0% and `npm run replay` leaves
  // 74/24/0 the moment wave 2 wires thresholdsFor into the runner.
  it('returns exactly the engine constants with no contract', () => {
    expect(thresholdsFor(null, 'price')).toEqual({
      policy: 'normal',
      tau: 0.60,
      delta: 0.16,
      autoApproveAbove: 0.60,
      onAbstain: 'quarantine',
      alert: null,
    });
    expect(thresholdsFor(undefined, 'anything')).toEqual(DEFAULT_THRESHOLDS);
  });

  it('returns the defaults for a field the contract does not mention', () => {
    expect(thresholdsFor(parsed(CONTRACT), 'recall_title')).toEqual(DEFAULT_THRESHOLDS);
  });

  // src/heal.ts is frozen and cannot export its defaults, so they are repeated
  // in DEFAULT_THRESHOLDS. This reads the source and fails if the two drift.
  it('agrees with healGated\'s own defaults in src/heal.ts', () => {
    const src = readFileSync(new URL('../src/heal.ts', import.meta.url), 'utf8');
    const m = src.match(/\{\s*tau\s*=\s*([\d.]+)\s*,\s*delta\s*=\s*([\d.]+)/);
    expect(m, 'healGated no longer declares tau/delta defaults inline').not.toBeNull();
    expect(Number(m![1])).toBe(DEFAULT_THRESHOLDS.tau);
    expect(Number(m![2])).toBe(DEFAULT_THRESHOLDS.delta);
  });

  it('is a pure function of its two arguments', () => {
    const c = parsed(CONTRACT);
    expect(thresholdsFor(c, 'price')).toEqual(thresholdsFor(c, 'price'));
    expect(thresholdsFor(structuredClone(c), 'price')).toEqual(thresholdsFor(c, 'price'));
  });
});

describe('tiers map to thresholds', () => {
  it('normal is the pair the engine already uses', () => {
    expect(TIER_THRESHOLDS.normal).toEqual({ tau: 0.60, delta: 0.16 });
  });

  it('strict withholds more readily than normal, loose less', () => {
    expect(TIER_THRESHOLDS.strict.tau).toBeGreaterThan(TIER_THRESHOLDS.normal.tau);
    expect(TIER_THRESHOLDS.strict.delta).toBeGreaterThan(TIER_THRESHOLDS.normal.delta);
    expect(TIER_THRESHOLDS.loose.delta).toBeLessThan(TIER_THRESHOLDS.normal.delta);
    // loose relaxes the margin and NOT the floor -- below tau 0.60 the sweep
    // doubles the wrong values for 4.5 points of abstention. See index.ts.
    expect(TIER_THRESHOLDS.loose.tau).toBe(TIER_THRESHOLDS.normal.tau);
  });

  it('reads the tier per field', () => {
    const c = parsed(CONTRACT);
    expect(thresholdsFor(c, 'price')).toMatchObject({ policy: 'strict', tau: 0.70, delta: 0.20 });
    expect(thresholdsFor(c, 'description')).toMatchObject({ policy: 'loose', tau: 0.60, delta: 0.12 });
  });

  it('lets a raw tau/delta override the tier', () => {
    const c = parsed('target: t\nfields:\n  price:\n    policy: loose\n    tau: 0.9\n');
    expect(thresholdsFor(c, 'price')).toMatchObject({ policy: 'loose', tau: 0.9, delta: 0.12 });
  });
});

describe('auto_approve bands', () => {
  it('defaults to the tier tau, which is today\'s behaviour', () => {
    const c = parsed('target: t\nfields:\n  price:\n    policy: normal\n');
    // The gate heals only when score > tau, so a floor of tau holds nothing back.
    expect(thresholdsFor(c, 'price').autoApproveAbove).toBe(TIER_THRESHOLDS.normal.tau);
  });

  it('never is a floor no score can clear', () => {
    expect(thresholdsFor(parsed(CONTRACT), 'price').autoApproveAbove).toBe(1);
  });

  it('takes an explicit floor above the tier tau', () => {
    const t = thresholdsFor(parsed(CONTRACT), 'description');
    expect(t.autoApproveAbove).toBe(0.85);
    expect(t.autoApproveAbove).toBeGreaterThan(t.tau);
  });

  it('refuses a floor outside the score range', () => {
    expect(issues('target: t\nfields:\n  p:\n    auto_approve: 1.5\n')[0].message)
      .toMatch(/auto_approve must be/);
    expect(issues('target: t\nfields:\n  p:\n    auto_approve: sometimes\n')[0].message)
      .toMatch(/auto_approve must be/);
  });
});

describe('alert', () => {
  it('reads the doc\'s "none" as nobody, not as a channel called none', () => {
    expect(thresholdsFor(parsed(CONTRACT), 'description').alert).toBeNull();
  });

  it('is null when unstated -- an absence, never a default channel', () => {
    const c = parsed('target: t\nfields:\n  p:\n    policy: normal\n');
    expect(thresholdsFor(c, 'p').alert).toBeNull();
  });
});

describe('validation names the line and what was allowed', () => {
  it('rejects an unknown key and lists the keys that exist', () => {
    const [i] = issues('target: t\nfields:\n  price:\n    polciy: strict\n');
    expect(i.line).toBe(4);
    expect(i.message).toContain('Unknown key "polciy"');
    for (const k of ['policy', 'tau', 'delta', 'on_abstain', 'auto_approve', 'alert']) {
      expect(i.message).toContain(k);
    }
  });

  it('rejects an unknown key at the top level too', () => {
    const found = issues('target: t\nfeilds:\n  price:\n    policy: strict\n')
      .find((i) => i.message.includes('feilds'));
    expect(found?.line).toBe(2);
    expect(found?.message).toContain('fields');
  });

  it('names an unknown field when the caller knows which fields exist', () => {
    const [i] = issues('target: t\nfields:\n  pirce:\n    policy: strict\n', {
      knownFields: ['price', 'recall_title'],
    });
    expect(i.line).toBe(3);
    expect(i.message).toContain('Unknown field "pirce"');
    expect(i.message).toContain('price, recall_title');
  });

  it('reports a YAML syntax error with its line', () => {
    const [i] = issues('target: t\nfields:\n  price:\n    policy: [strict,\n');
    expect(i.line).toBe(5);
    expect(i.message).toContain('BAD_INDENT');
  });

  it('rejects a duplicate key rather than taking the last one', () => {
    const [i] = issues('target: t\nfields:\n  p:\n    policy: strict\n    policy: loose\n');
    expect(i.message).toContain('DUPLICATE_KEY');
  });

  it('rejects a tier it does not have', () => {
    expect(issues('target: t\nfields:\n  p:\n    policy: paranoid\n')[0].message)
      .toContain('"strict"');
  });

  it('rejects an empty document rather than treating it as an empty contract', () => {
    expect(issues('')[0].message).toContain('empty');
  });

  it('requires a target, and points at the document', () => {
    const [i] = issues('fields:\n  p:\n    policy: strict\n');
    expect(i.path).toBe('target');
    expect(i.line).toBe(1);
  });

  it('accepts the contract docs/FEATURES.md publishes', () => {
    // Verbatim from F2, which is the shape an operator will copy.
    const c = parsed(`target: ikea
fields:
  price:
    policy: strict
    on_abstain: quarantine
    auto_approve: never
    alert: pagerduty
  recall_title:
    policy: strict
    on_abstain: quarantine
    auto_approve: clear_margin
    alert: slack#data-oncall
  description:
    policy: loose
    on_abstain: publish_last_good
    auto_approve: clear_margin
    alert: none
`);
    expect(Object.keys(c.fields)).toEqual(['price', 'recall_title', 'description']);
  });
});

describe('contracts are versioned and append-only', () => {
  let dbUp = false;
  const target = 'ikea';

  beforeAll(async () => {
    try {
      await getDb().execute(sql`SELECT 1 FROM contracts LIMIT 1`);
      dbUp = true;
    } catch {
      dbUp = false;
    }
    if (dbUp) await getDb().execute(sql`DELETE FROM contracts WHERE target_id = ${target}`);
  });

  afterAll(async () => {
    if (dbUp) await getDb().execute(sql`DELETE FROM contracts WHERE target_id = ${target}`);
    await closeDb().catch(() => {});
  });

  const v1 = `target: ${target}\nfields:\n  recall_title:\n    policy: strict\n    alert: pagerduty\n`;
  const v2 = `# quieter now\ntarget: ${target}\nfields:\n  recall_title:\n    policy: normal\n    alert: slack#data-oncall\n`;

  it('appends a version instead of overwriting one', async () => {
    if (!dbUp) return;
    const a = await saveContract(v1);
    const b = await saveContract(v2);
    expect(a.ok && a.version.version).toBe(1);
    expect(b.ok && b.version.version).toBe(2);
    expect((await contractHistory(target)).map((v) => v.version)).toEqual([2, 1]);
  });

  it('keeps the first version readable byte for byte', async () => {
    if (!dbUp) return;
    const stored = await contractVersion(target, 1);
    expect(stored?.yaml).toBe(v1);
    // Comments and ordering survive: they are what a reviewer diffs.
    expect((await contractVersion(target, 2))?.yaml).toBe(v2);
  });

  it('serves the newest version as the one in force', async () => {
    if (!dbUp) return;
    const current = await latestContract(target);
    expect(current?.version).toBe(2);
    expect(thresholdsFor(current!.parsed, 'recall_title')).toMatchObject({
      policy: 'normal', tau: 0.60, delta: 0.16, alert: 'slack#data-oncall',
    });
    const first = await contractVersion(target, 1);
    expect(thresholdsFor(first!.parsed, 'recall_title')).toMatchObject({
      policy: 'strict', tau: 0.70, delta: 0.20, alert: 'pagerduty',
    });
  });

  it('refuses a contract for a target that does not exist, with a line', async () => {
    if (!dbUp) return;
    const r = await saveContract('target: no/such/target\nfields:\n  p:\n    policy: strict\n');
    expect(r.ok).toBe(false);
    expect(!r.ok && r.issues[0]).toMatchObject({ line: 1, path: 'target' });
  });

  it('does not write anything when the YAML is invalid', async () => {
    if (!dbUp) return;
    const before = (await contractHistory(target)).length;
    const r = await saveContract(`target: ${target}\nfields:\n  p:\n    polciy: strict\n`);
    expect(r.ok).toBe(false);
    expect((await contractHistory(target)).length).toBe(before);
  });

  it('postgres is reachable (required when ASSAY_REQUIRE_DB is set)', () => {
    if (process.env.ASSAY_REQUIRE_DB) expect(dbUp).toBe(true);
  });
});
