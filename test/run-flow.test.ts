// The mapping from a persisted run to the nodes of the run diagram.
//
// This is the file that would drift into fiction. `web/lib/run-flow.ts` is what
// decides which stages of `ingestPage` get drawn, and the whole claim of the
// screen is that a node exists only where a column does -- so what is asserted
// here is mostly ABSENCE: that a skipped run draws no evaluation, that a run
// with no cell draws no gate, that a healed run draws no score, and that no
// fact anywhere cites a column the store does not have.
//
// Imported by relative path with no `@/` alias, like `web/lib/composer-menu.js`
// in chat-surface.test.ts -- the module is deliberately dependency-free so this
// runner needs to know nothing about the Next config to check it.

import { describe, it, expect } from 'vitest';
import {
  flowFor,
  gateCheck,
  gateNumbers,
  runOutcome,
  type CellRecord,
  type RunRecord,
} from '../web/lib/run-flow.js';

const base: RunRecord = {
  runId: 61,
  targetId: 'mattel',
  url: 'corpus://mattel',
  startedAt: new Date('2026-08-22T12:00:00Z'),
  status: 'ok',
  pageBytes: 79_479,
  pageSha: 'aaaa111122223333',
  via: 'local-fetch',
  skeletonHash: 'aa1afd70',
  captureKept: false,
  previous: { runId: 60, pageSha: 'bbbb444455556666' },
  thresholds: { tau: 0.6, delta: 0.16 },
  thresholdsDeclared: true,
  firstForField: false,
  cell: null,
};

const cell = (over: Partial<CellRecord> = {}): CellRecord => ({
  field: 'recall_title',
  value: 'A reminder about our 2016 Chest of Drawers recall',
  status: 'live',
  reason: null,
  proofId: 'pr_951651de7ed06167',
  goldenSha: 'gggg0000',
  captureSha: 'cccc0000',
  ranked: null,
  heldSinceRun: null,
  groupKey: 'aa1afd70:recall_title',
  heal: null,
  queueOpen: null,
  episodeId: null,
  ...over,
});

const ids = (r: RunRecord) => flowFor(r).nodes.map((n) => n.id);
const facts = (r: RunRecord) => flowFor(r).nodes.flatMap((n) => n.facts);

/* ------------------------------------------------------------------------ */

describe('a skipped run stops where the engine stopped', () => {
  const skipped: RunRecord = {
    ...base,
    status: 'skipped',
    pageSha: 'bbbb444455556666',
    previous: { runId: 60, pageSha: 'bbbb444455556666' },
    cell: null,
  };

  it('draws the fetch and the comparison, and nothing after them', () => {
    // ingestPage returns before the contract is even parsed. Drawing a baseline
    // or a gate here would be drawing a pipeline that did not execute.
    expect(ids(skipped)).toEqual(['fetch', 'unchanged']);
  });

  it('says the skip was the branch taken', () => {
    const node = flowFor(skipped).nodes.find((n) => n.id === 'unchanged')!;
    expect(node.branch?.taken).toContain('skip');
    expect(node.branch?.notTaken).toContain('evaluate');
  });

  it('claims no cause when the digest matches but the run was evaluated anyway', () => {
    // `assay_ui` has these: run 34's page_sha equals run 33's, and run 34 is
    // recorded `ok`, not `skipped`. "The page differs, so it was evaluated"
    // would be a sentence the store does not support.
    const odd: RunRecord = {
      ...base,
      status: 'ok',
      pageSha: 'cccc9999',
      previous: { runId: 33, pageSha: 'cccc9999' },
      cell: cell(),
    };
    const n = flowFor(odd).nodes.find((x) => x.id === 'unchanged')!;
    expect(n.summary).toBe('The digest matches run 33, and this run was still recorded as ok.');
    expect(n.summary).not.toMatch(/differs/);
  });
});

describe('a clean run', () => {
  const clean: RunRecord = { ...base, status: 'ok', cell: cell() };

  it('draws no search and no gate', () => {
    // Neither ran: `evaluate` returns before `healGated` is called when the
    // field is not broken (src/runner.ts, the `!diag.broken` early return).
    expect(ids(clean)).toEqual(['fetch', 'unchanged', 'baseline', 'evaluate', 'outcome']);
  });

  it('joins evaluate straight to the outcome', () => {
    expect(flowFor(clean).edges).toContainEqual({ from: 'evaluate', to: 'outcome', label: 'intact' });
    expect(flowFor(clean).edges.map((e) => e.to)).not.toContain('gate');
  });

  it('quotes no score anywhere, because none was persisted', () => {
    const labels = facts(clean).map((f) => f.label);
    expect(labels).not.toContain('score');
    expect(labels).not.toContain('margin');
  });
});

describe('a healed run', () => {
  const healed: RunRecord = {
    ...base,
    runId: 62,
    status: 'heal',
    captureKept: true,
    cell: cell({ status: 'healed', reason: null, ranked: null, heal: { from: 'a', to: 'h2.title' } }),
  };

  it('draws the search from heal_history, since ranked is not kept on a heal', () => {
    expect(ids(healed)).toEqual([
      'fetch', 'unchanged', 'baseline', 'evaluate', 'search', 'gate', 'outcome',
    ]);
    const search = flowFor(healed).nodes.find((n) => n.id === 'search')!;
    expect(search.facts.map((f) => f.source)).toEqual([
      'heal_history.from_selector',
      'heal_history.to_selector',
    ]);
  });

  it('shows the gate with no score, because recordRun persisted none', () => {
    // `field_runs.ranked` is written only when the status is quarantined, so a
    // published heal genuinely has no number to report and must not borrow one.
    const gate = flowFor(healed).nodes.find((n) => n.id === 'gate')!;
    expect(gate.facts.map((f) => f.label)).toEqual(['reason']);
    expect(gate.summary).not.toMatch(/\d\.\d/);
  });

  it('cuts the search node entirely when neither ranked nor heal_history exists', () => {
    const bare = { ...healed, cell: cell({ status: 'healed', heal: null, ranked: null }) };
    expect(ids(bare)).not.toContain('search');
    expect(flowFor(bare).edges).toContainEqual({ from: 'evaluate', to: 'gate', label: 'broken' });
  });
});

describe('a held run', () => {
  // The real row from `assay_ui`: proof pr_951651de7ed06167, held on thin_margin.
  const ranked = [
    { selector: 'h2', score: 0.7354, value: 'Recall & Safety Alerts' },
    { selector: 'h2', score: 0.6096, value: 'Recall & Safety Alerts (archived)' },
    { selector: 'b', score: 0.5565, value: 'Global Recalls & Safety Alerts' },
  ];
  const held: RunRecord = {
    ...base,
    status: 'abstain',
    captureKept: true,
    cell: cell({
      status: 'quarantined',
      value: null,
      reason: 'thin_margin',
      ranked,
      heldSinceRun: 61,
      queueOpen: true,
    }),
  };

  it('recovers the gate numbers the engine computed', () => {
    // src/heal.ts:236 -- score is ranked[0], margin is ranked[0] - ranked[1].
    const n = gateNumbers(ranked)!;
    expect(n.score).toBe(0.7354);
    expect(n.runnerUp).toBe(0.6096);
    expect(n.margin).toBeCloseTo(0.1258, 4);
  });

  it('reproduces the recorded reason from those numbers', () => {
    // The honesty check the screen runs before it draws a threshold: score
    // cleared tau 0.6, margin did not clear delta 0.16, so `thin_margin` -- the
    // exact string on the row.
    expect(gateCheck(held.cell!, { tau: 0.6, delta: 0.16 })).toBe(true);
  });

  it('still knows when the thresholds no longer explain the row', () => {
    // A contract edited since the run. 0.9 would have produced `below_tau`, and
    // the row says `thin_margin`, so these are not the numbers it was judged by.
    //
    // `gateCheck` is no longer consulted by `flowFor` -- the diagram draws no
    // threshold, so it has none to withhold -- but `web/lib/run-detail.ts` still
    // calls it, and it is the check that has to come back the day a number
    // returns to a screen. Asserted here rather than deleted with its caller.
    expect(gateCheck(held.cell!, { tau: 0.9, delta: 0.16 })).toBe(false);
  });

  it('draws the gate with one fact and no arithmetic', () => {
    // The gate node used to carry `score`, `runner-up`, `margin` and
    // `thresholds` beside the reason -- a confidence float with its cut-off
    // printed next to it, which docs/FEATURES.md §4 refuses. What a reader gets
    // instead is the band, drawn on the page from this same reason string.
    const gate = flowFor(held).nodes.find((n) => n.id === 'gate')!;
    expect(gate.facts.map((f) => f.label)).toEqual(['reason']);
    expect(gate.facts[0]!.value).toBe('thin_margin');
    expect(gate.summary).not.toMatch(/\d\.\d/);
  });

  it('names the best candidate without quoting what scored it', () => {
    // `h2 — 0.7354` before, on the card and again on the outgoing edge.
    const search = flowFor(held).nodes.find((n) => n.id === 'search')!;
    expect(search.facts.find((f) => f.label === 'best')!.value).toBe('h2');
    expect(flowFor(held).edges).toContainEqual({ from: 'search', to: 'gate', label: 'candidates' });
  });

  it('ends at a hold, with the queue item and the null said out loud', () => {
    const out = flowFor(held).nodes.find((n) => n.id === 'outcome')!;
    expect(out.title).toBe('Hold');
    expect(out.facts.find((f) => f.label === 'value')!.value).toBe('null — nothing was written');
    expect(out.facts.find((f) => f.label === 'decision')!.source).toBe('queue_items.resolved_by');
  });

  it('marks the published branch as the one not taken', () => {
    const gate = flowFor(held).nodes.find((n) => n.id === 'gate')!;
    expect(gate.branch).toEqual({
      taken: 'refused — hold the cell',
      notTaken: 'cleared — publish the replacement',
    });
  });

  it('calls a brake a policy, not a threshold', () => {
    const braked = { ...held, cell: cell({ status: 'quarantined', value: null, reason: 'brake_engaged', ranked }) };
    const gate = flowFor(braked).nodes.find((n) => n.id === 'gate')!;
    expect(gate.summary).toMatch(/policy withheld/);
  });
});

describe('the baseline node does not guess', () => {
  // The real chicco run 62 in `assay_ui`: golden_sha256 === capture_sha256 on a
  // row whose status is `healed`. Read as "first run", the two shas say the
  // baseline was established here, which a healed run cannot have done. The
  // node reads a count of earlier rows instead, so it says the opposite -- the
  // right way round -- on exactly this row.
  const same = cell({ status: 'healed', goldenSha: 'ssss1111', captureSha: 'ssss1111' });

  it('calls it a rebuild when an earlier run recorded the field', () => {
    const n = flowFor({ ...base, status: 'heal', firstForField: false, cell: same }).nodes.find(
      (x) => x.id === 'baseline',
    )!;
    expect(n.summary).toMatch(/Rebuilt from capture/);
    expect(n.facts.find((f) => f.label === 'earlier runs')!.value).toBe('yes');
  });

  it('calls it the first run only when nothing earlier recorded the field', () => {
    const n = flowFor({ ...base, status: 'ok', firstForField: true, cell: same }).nodes.find(
      (x) => x.id === 'baseline',
    )!;
    expect(n.summary).toMatch(/first recorded run/);
  });
});

describe('a run with no cell', () => {
  it('draws nothing past the comparison', () => {
    // Every stage after the skip check reads a cell. With no field_runs row
    // there is nothing recorded to read, so there is nothing to draw.
    const orphan: RunRecord = { ...base, status: 'ok', cell: null };
    expect(ids(orphan)).toEqual(['fetch', 'unchanged']);
    expect(flowFor(orphan).edges).toEqual([{ from: 'fetch', to: 'unchanged', label: 'bytes' }]);
  });
});

describe('every fact cites a real column', () => {
  // The guard against the whole failure mode: a node that cites a column that
  // does not exist is a node whose number was invented. Column names come from
  // src/store/schema.ts.
  const COLUMNS = new Set([
    'targets.url',
    'runs.page_bytes',
    'runs.page_sha',
    'runs.via',
    'runs.page_sha (previous run for this target)',
    'runs.status',
    'runs.skeleton_hash',
    'runs.capture_sha',
    'field_runs.field',
    'field_runs.golden_sha256',
    'field_runs joined runs, earlier run_id for this target and field',
    'field_runs.capture_sha256',
    'field_runs.status',
    'field_runs.value',
    'field_runs.reason',
    'field_runs.proof_id',
    'field_runs.held_since_run',
    'field_runs.ranked',
    'field_runs.ranked[0]',
    'heal_history.from_selector',
    'heal_history.to_selector',
    'queue_items.resolved_by',
    'episodes.opened_run',
    // `field_runs.ranked[0].score`, `field_runs.ranked[1].score`,
    // `ranked[0].score − ranked[1].score`, `targets.contract.thresholds` and
    // the two sentences about them were here. Every one of them sourced a
    // NUMBER onto the screen, and they are removed from the allowlist rather
    // than left in it -- an allowlist that still permits the thing the feature
    // removed would let it come back without failing anything.
  ]);

  const cases: RunRecord[] = [
    { ...base, status: 'skipped', cell: null },
    { ...base, status: 'ok', cell: cell() },
    { ...base, status: 'heal', cell: cell({ status: 'healed', heal: { from: 'a', to: 'b' } }) },
    {
      ...base,
      status: 'abstain',
      cell: cell({
        status: 'quarantined',
        value: null,
        reason: 'thin_margin',
        ranked: [
          { selector: 'h2', score: 0.7354, value: 'x' },
          { selector: 'h2', score: 0.6096, value: 'y' },
        ],
        heldSinceRun: 61,
        queueOpen: false,
        episodeId: 4,
      }),
    },
  ];

  for (const [i, r] of cases.entries()) {
    it(`case ${i} (${r.status}) cites only known columns`, () => {
      for (const f of facts(r)) expect(COLUMNS).toContain(f.source);
    });
  }

  it('gives every node at least one fact or a branch', () => {
    // A card with neither would be a stage asserted rather than evidenced.
    for (const r of cases) {
      for (const n of flowFor(r).nodes) {
        expect(n.facts.length > 0 || n.branch !== undefined).toBe(true);
      }
    }
  });

  it('keeps the edges connected to nodes that exist', () => {
    for (const r of cases) {
      const f = flowFor(r);
      const present = new Set(f.nodes.map((n) => n.id));
      for (const e of f.edges) {
        expect(present.has(e.from)).toBe(true);
        expect(present.has(e.to)).toBe(true);
      }
    }
  });
});

describe('runOutcome', () => {
  it('keeps the list screen’s three words and adds the one it has no use for', () => {
    expect(runOutcome('skipped', [])).toBe('skipped');
    expect(runOutcome('abstain', ['quarantined'])).toBe('held');
    expect(runOutcome('heal', ['healed'])).toBe('healed');
    expect(runOutcome('ok', ['live'])).toBe('clean');
  });
});
