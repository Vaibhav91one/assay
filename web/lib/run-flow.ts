// One run, as the stages that left a record of themselves.
//
// Pure: no database, no React, no path aliases, no clock. It takes what was
// PERSISTED about a run and returns the nodes and edges to draw. Everything the
// diagram says has to arrive through `RunRecord`, and every fact carries the
// column it came from -- that is not decoration, it is the check. A stage with
// no column behind it does not get a node.
//
// The pipeline this describes is `src/connectors/ingest.ts` calling
// `src/runner.ts`: fetch, skip-if-unchanged, resolve the baseline, evaluate,
// search for a replacement, gate it, publish or hold. Three of those stages
// leave less behind than they do work, and the rule above cuts them:
//
//   * detect() -- `diagnosis`, `attributed_cause` and `signals` are on the
//     proof EVENT, and `recordRun` writes no event. The only bit that survives
//     is broken/not-broken, which is exactly `runs.status = 'ok'`, and that is
//     already the `evaluate` node's branch. No separate node.
//   * healBlockFor() -- a brake that did NOT engage writes nothing at all. It
//     is visible only through `field_runs.reason`, so it is a variant of the
//     gate node rather than a node that would be blank on most runs.
//   * the baseline advance -- `setBaseline` overwrites `field_state`, which is
//     standing state, not a fact about this run. `heal_history` IS per-run, so
//     the move it recorded is shown on the search node instead.
//
// Two more are cut per RUN rather than always, on the same rule:
//
//   * the search, on a run that healed but left no `heal_history` row --
//     `field_runs.ranked` is persisted only on an abstain, so such a run has
//     nothing recording what was considered. The edge goes straight from
//     `evaluate` to `gate`.
//   * everything past the skip check, on a run with no `field_runs` row. Every
//     later stage reads a cell, and building those nodes out of `runs.status`
//     alone would be the fiction this file exists to refuse.
//
// None of this is said on the screen. The reasoning lives here, where the next
// person changing the mapping will look; an operator opening a run twenty times
// a day does not need the diagram to explain its own construction, and a screen
// that does reads as talking down to them.
//
// NO FACT ON THIS DIAGRAM IS A SCORE, A MARGIN OR A THRESHOLD, and four of them
// were. The gate node carried `score`, `runner-up`, `margin` and `τ 0.6 · δ
// 0.16`, and the search node's `best` fact and its outgoing edge label both
// quoted `ranked[0].score` -- so the Sources table at the bottom of the run
// screen was a per-cell confidence float, printed to four places, which
// docs/FEATURES.md §4 refuses. They are gone. What the gate decided is now one
// word, drawn by `web/components/assay-score.tsx` from `field_runs.reason`, and
// the arithmetic behind it is written out at /docs/assay-score rather than
// scattered across a screen. See the amendment to §4 dated 2026-08-23.
//
// `gateNumbers` and `gateCheck` are still here and still exported. They are the
// derivation and the honesty check `web/lib/run-detail.ts` uses -- the numbers
// stay in the store and stay available to whatever needs them -- and nothing in
// this file renders their output any more.

export type StageKey =
  | 'fetch'
  | 'unchanged'
  | 'baseline'
  | 'evaluate'
  | 'search'
  | 'gate'
  | 'outcome';

/** The pill above each card. What kind of step this was, not what it decided. */
export type StageKind = 'io' | 'decision' | 'engine' | 'outcome';

/** Maps onto `StatusLine`'s tones, so the diagram and the rest of the app agree. */
export type StageTone = 'info' | 'success' | 'warning' | 'danger';

export interface Fact {
  label: string;
  value: string;
  /** The exact column or expression this was read from. Never a paraphrase. */
  source: string;
}

export interface FlowNode {
  id: StageKey;
  kind: StageKind;
  title: string;
  /** What this stage did, in the product's words. One line. */
  summary: string;
  tone: StageTone;
  /**
   * Where the pipeline forked. `taken` happened; `notTaken` is the other arm of
   * the same `if` in the engine -- a statement about the code, never a claim
   * about this run, which is why it is rendered struck through rather than
   * drawn as a node nothing evidences.
   */
  branch?: { taken: string; notTaken: string };
  facts: Fact[];
  x: number;
  y: number;
}

export interface FlowEdge {
  from: StageKey;
  to: StageKey;
  label: string;
}

export interface Flow {
  nodes: FlowNode[];
  edges: FlowEdge[];
}

/* ------------------------------------------------------------------ input */

export interface CellRecord {
  field: string;
  value: string | null;
  /** `field_runs.status`: live | healed | quarantined | stale | degraded. */
  status: string;
  reason: string | null;
  proofId: string;
  goldenSha: string | null;
  captureSha: string | null;
  /** `field_runs.ranked`. Written at abstain time only; null otherwise. */
  ranked: RankedCandidate[] | null;
  heldSinceRun: number | null;
  groupKey: string | null;
  /** `heal_history` for this run and field, when this run moved the selector. */
  heal: { from: string | null; to: string } | null;
  /** `queue_items.resolved_by IS NULL`. Null when there is no queue item. */
  queueOpen: boolean | null;
  /** `episodes.episode_id` where `opened_run` is this run. */
  episodeId: number | null;
}

export interface RankedCandidate {
  selector: string;
  score: number;
  value: string;
}

export interface RunRecord {
  runId: number;
  targetId: string;
  url: string | null;
  startedAt: Date | string | null;
  /** `runs.status`: ok | heal | abstain | skipped. */
  status: string;
  pageBytes: number | null;
  pageSha: string | null;
  /** `runs.via` -- which fetch path served this page. Null on rows recorded
   *  before the column existed; there is no way to reconstruct it after the fact. */
  via: string | null;
  skeletonHash: string | null;
  /** `runs.capture_sha IS NOT NULL` -- a clean run deliberately keeps no bytes. */
  captureKept: boolean;
  /** The run this one's page digest was compared against. */
  previous: { runId: number; pageSha: string | null } | null;
  /** `targets.contract.thresholds`, or the default `ingestPage` applies. */
  thresholds: { tau: number; delta: number };
  /** True when the target row carried its own thresholds rather than defaulting. */
  thresholdsDeclared: boolean;
  /**
   * Whether any earlier run recorded this field -- i.e. whether this is the run
   * that established the baseline.
   *
   * A COUNT of earlier `field_runs` rows, not an inference. The tempting
   * shortcut is `golden_sha256 === capture_sha256`, which is true on a first
   * run -- and also true on a seeded row where the two happen to match, which
   * is exactly what `assay_ui` has for chicco run 62: identical shas on a run
   * whose status is `healed`, which no first run can be. An inference that is
   * right most of the time is the failure this screen exists to refuse.
   */
  firstForField: boolean;
  cell: CellRecord | null;
}

/* -------------------------------------------------------------- utilities */

const sha = (s: string | null | undefined): string => (s ? s.slice(0, 12) : '—');

const bytes = (n: number | null): string =>
  n == null ? '—' : n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} kB`;

// A `score(n) => n.toFixed(4)` formatter used to live here. It was the only
// reason this file could render a float at all, and deleting it is what makes
// the rule at the top of the file mechanically true rather than a convention:
// there is now nothing here that turns a number into a string for a screen.

/** `score` and `margin` as `healGated` computed them, recovered from `ranked`. */
export function gateNumbers(
  ranked: RankedCandidate[] | null,
): { score: number; runnerUp: number | null; margin: number } | null {
  if (!ranked || ranked.length === 0) return null;
  const best = ranked[0]!.score;
  const runnerUp = ranked.length > 1 ? ranked[1]!.score : null;
  // src/heal.ts:237 -- a sole candidate is given margin 1, not 0.
  return { score: best, runnerUp, margin: runnerUp == null ? 1 : best - runnerUp };
}

/**
 * Does re-running the gate on the recovered numbers produce the recorded reason?
 *
 * The one place this file does arithmetic on stored values, so it is also the
 * one place that has to prove the arithmetic is the engine's. False means the
 * thresholds on hand are not the thresholds this run was judged under -- a
 * contract has been edited since -- and the screen then declines to draw them
 * rather than marking a line at a number that explains nothing.
 */
export function gateCheck(
  // Widened from `CellRecord` to the two columns it actually reads, so
  // `lib/explain.ts` can ask the same question of a proof row without
  // assembling a whole cell it does not have. Every existing caller passes a
  // `CellRecord` and still type-checks: this is strictly more permissive.
  cell: Pick<CellRecord, 'ranked' | 'reason'>,
  t: { tau: number; delta: number },
): boolean {
  const n = gateNumbers(cell.ranked);
  if (!n || !cell.reason) return false;
  if (n.score <= t.tau) return cell.reason === 'below_tau';
  if (n.margin <= t.delta) return cell.reason === 'thin_margin';
  // Cleared both and still held: a policy withheld it, not the gate. The reason
  // is then a brake or an auto-approve floor, and the thresholds are still the
  // ones the arithmetic was done with.
  return cell.reason !== 'below_tau' && cell.reason !== 'thin_margin';
}

/**
 * The list screen's vocabulary plus the one word it has no use for.
 *
 * `web/lib/runs.ts` maps a run to clean | healed | held; it never sees a
 * skipped run because those carry no cell and read as clean, which is right in
 * a table of what happened and wrong in a count of what the target has done.
 */
export type RunOutcome = 'clean' | 'healed' | 'held' | 'skipped';

export function runOutcome(runStatus: string, cellStatuses: string[]): RunOutcome {
  if (runStatus === 'skipped') return 'skipped';
  if (cellStatuses.includes('quarantined')) return 'held';
  if (runStatus === 'heal' || cellStatuses.includes('healed')) return 'healed';
  return 'clean';
}

/* ------------------------------------------------------------------- flow */

const COL_X = 24;
const ROW_Y = 152;

export function flowFor(run: RunRecord): Flow {
  const nodes: Omit<FlowNode, 'x' | 'y'>[] = [];
  const edges: FlowEdge[] = [];
  const cell = run.cell;
  const skipped = run.status === 'skipped';
  const broken = run.status === 'heal' || run.status === 'abstain';

  /* ---- fetch. Every run records its size and its digest, skipped included. */
  nodes.push({
    id: 'fetch',
    kind: 'io',
    title: 'Fetch',
    summary: `${bytes(run.pageBytes)} of ${run.url ?? 'page'} arrived and were digested.`,
    tone: 'info',
    facts: [
      ...(run.url ? [{ label: 'url', value: run.url, source: 'targets.url' }] : []),
      { label: 'page size', value: bytes(run.pageBytes), source: 'runs.page_bytes' },
      { label: 'page digest', value: sha(run.pageSha), source: 'runs.page_sha' },
      // Absent on runs recorded before this column existed -- not a fact worth
      // a row when there is nothing to show, since "unknown" would read as a
      // fifth fetch path rather than as a gap in old data.
      ...(run.via ? [{ label: 'fetched via', value: run.via, source: 'runs.via' }] : []),
    ],
  });

  /* ---- skip-if-unchanged. A decision every run passes through. */
  const same = !!(run.previous?.pageSha && run.pageSha && run.previous.pageSha === run.pageSha);
  nodes.push({
    id: 'unchanged',
    kind: 'decision',
    title: 'Unchanged since last run?',
    // The two facts on hand are the digests and `runs.status`. Where they agree
    // this reads as cause and effect; where they do not -- a stored run whose
    // digest matches its predecessor and which was still evaluated, which is
    // what `assay_ui`'s seeded rows look like -- it says both and asserts no
    // link between them, because there is no third column to settle it.
    summary: skipped
      ? `Byte-identical to run ${run.previous?.runId ?? '—'}, so nothing was evaluated.`
      : !run.previous
        ? 'No earlier run to compare against, so the page was evaluated.'
        : same
          ? `The digest matches run ${run.previous.runId}, and this run was still recorded as ${run.status}.`
          : `The page differs from run ${run.previous.runId}, so it was evaluated.`,
    tone: skipped ? 'info' : 'success',
    branch: skipped
      ? { taken: 'same digest — skip, and record the size', notTaken: 'changed — evaluate' }
      : { taken: 'changed — evaluate', notTaken: 'same digest — skip' },
    facts: [
      { label: 'this run', value: sha(run.pageSha), source: 'runs.page_sha' },
      {
        label: run.previous ? `run ${run.previous.runId}` : 'previous run',
        value: run.previous ? sha(run.previous.pageSha) : 'none',
        source: 'runs.page_sha (previous run for this target)',
      },
      { label: 'recorded as', value: run.status, source: 'runs.status' },
    ],
  });
  edges.push({ from: 'fetch', to: 'unchanged', label: 'bytes' });

  // A skipped run stops here, because that is where the engine stopped: it
  // returns before the contract is even parsed. Drawing the rest would be
  // drawing a pipeline that did not execute.
  // Every stage below reads a cell. Without one there is nothing recorded to
  // read, and inventing the remaining nodes from `runs.status` alone would be
  // the fiction this file exists to refuse.
  if (skipped || !cell) {
    return { nodes: place(nodes), edges };
  }

  /* ---- resolve the baseline. */
  nodes.push({
    id: 'baseline',
    kind: 'engine',
    title: 'Resolve the baseline',
    summary: run.firstForField
      ? 'The first recorded run for this field, so the baseline was established from this page.'
      : `Rebuilt from capture ${sha(cell.goldenSha)}, the page this field last worked on.`,
    tone: run.firstForField ? 'info' : 'success',
    facts: [
      { label: 'field', value: cell.field, source: 'field_runs.field' },
      { label: 'golden', value: sha(cell.goldenSha), source: 'field_runs.golden_sha256' },
      { label: 'this page', value: sha(cell.captureSha), source: 'field_runs.capture_sha256' },
      {
        label: 'earlier runs',
        value: run.firstForField ? 'none for this field' : 'yes',
        source: 'field_runs joined runs, earlier run_id for this target and field',
      },
    ],
  });
  edges.push({ from: 'unchanged', to: 'baseline', label: 'changed' });

  /* ---- evaluate. */
  nodes.push({
    id: 'evaluate',
    kind: 'decision',
    title: 'Evaluate',
    summary: broken
      ? `The field did not read cleanly off the baseline's element.`
      : `Read ${cell.field} where it was expected.`,
    tone: broken ? 'warning' : 'success',
    branch: broken
      ? { taken: 'broken — look for a replacement', notTaken: 'intact — publish' }
      : { taken: 'intact — publish', notTaken: 'broken — look for a replacement' },
    facts: [
      { label: 'recorded as', value: run.status, source: 'runs.status' },
      { label: 'cell status', value: cell.status, source: 'field_runs.status' },
      {
        label: 'skeleton',
        value: sha(run.skeletonHash),
        source: 'runs.skeleton_hash',
      },
    ],
  });
  edges.push({ from: 'baseline', to: 'evaluate', label: 'baseline' });

  // detect() ran between `evaluate` and the branch below, and left nothing to
  // read. See the file header: only broken/not-broken survives, as runs.status,
  // which is the evaluate node's branch. No node.
  if (!broken) {
    edges.push({ from: 'evaluate', to: 'outcome', label: 'intact' });
  } else {
    const searchFacts: Fact[] = [];
    if (cell.ranked) {
      searchFacts.push({
        label: 'candidates ranked',
        value: String(cell.ranked.length),
        source: 'field_runs.ranked',
      });
      // The selector alone. This used to read `h2 — 0.9990`, and a count of
      // candidates beside a score out of one is the confidence column §4
      // refuses. Which element came first is a fact about the ordering; the
      // number that put it there is the thing the band replaced.
      searchFacts.push({
        label: 'best',
        value: cell.ranked[0]!.selector,
        source: 'field_runs.ranked[0]',
      });
    }
    if (cell.heal) {
      searchFacts.push({
        label: 'moved from',
        value: cell.heal.from ?? 'unrecorded',
        source: 'heal_history.from_selector',
      });
      searchFacts.push({
        label: 'moved to',
        value: cell.heal.to,
        source: 'heal_history.to_selector',
      });
    }

    if (searchFacts.length > 0) {
      nodes.push({
        id: 'search',
        kind: 'engine',
        title: 'Search for a replacement',
        summary: cell.ranked
          ? `${cell.ranked.length} element${cell.ranked.length === 1 ? '' : 's'} on the page were scored against the fingerprint.`
          : `The field was relocated to ${cell.heal!.to}.`,
        tone: 'info',
        facts: searchFacts,
      });
      edges.push({ from: 'evaluate', to: 'search', label: 'broken' });
      // `best 0.9990` before. An edge label is the least defensible place on the
      // screen for a score: no threshold beside it, no room for the sentence
      // that would make it mean anything.
      edges.push({ from: 'search', to: 'gate', label: 'candidates' });
    } else {
      // Nothing records what was considered: `ranked` is kept only on an
      // abstain, and this run left no heal_history row either. Skip the node
      // and join evaluate straight to the gate.
      edges.push({ from: 'evaluate', to: 'gate', label: 'broken' });
    }

    /* ---- the gate. */
    const held = cell.status === 'quarantined';
    // ONE FACT. `score`, `runner-up`, `margin` and `thresholds` used to follow
    // it, and together they were a confidence float with its cut-off printed
    // beside it -- the anti-feature in docs/FEATURES.md §4, on the screen. The
    // reason code stays because it is the machine token, in the machine-token
    // column, sourced to the column it was read from; the word a reader gets
    // instead of it is drawn by `AssayScore` on the page, from this same
    // string. One fact, one rendering.
    const gateFacts: Fact[] = [
      { label: 'reason', value: cell.reason || '—', source: 'field_runs.reason' },
    ];

    // A brake or an auto-approve floor is a POLICY withholding a heal the gate
    // allowed. src/runner.ts distinguishes the two and so does this.
    const withheld = held && !!cell.reason && !GATE_REASONS.includes(cell.reason);

    nodes.push({
      id: 'gate',
      kind: 'decision',
      title: 'The gate',
      // THE REASON CODE IS NOT IN THIS SENTENCE, and used to be: "Refused:
      // below_tau. Score ..." put raw engine vocabulary in the user's face,
      // which docs/APP-DESIGN.md 5b rule 5 forbids and which the decisions card
      // and `HeldCell` both route through `HELD_BECAUSE` to avoid.
      //
      // It is not translated here either, because this file is pure by
      // contract -- the note at the top -- and `HELD_BECAUSE` lives on the
      // engine side of a specifier the root test runner cannot resolve. It does
      // not need to be: `gateFacts` already carries `reason` as a fact, in the
      // machine-token column, sourced to `field_runs.reason`. So the code was
      // being rendered twice, once as a fact and once as English. One fact, one
      // rendering: the prose keeps the decision, the fact keeps the code.
      // `Refused. Score 0.7354, margin 0.1258.` before, which put the two
      // numbers on the card as well as in the facts. The word for what the gate
      // decided is the band, and it is drawn once, beside the candidates.
      summary: !held
        ? 'The replacement cleared the gate, so it was published.'
        : withheld
          ? 'A policy withheld the heal.'
          // ONE TRUTH ABOUT THE HOLE, and this is half of it -- the other half
          // is the `outcome` node below. They used to contradict each other on
          // the same canvas: this said nothing was published and that one said
          // "The cell was published as null", which is the same word used for
          // both sides of the fork it is describing. Nothing is WRITTEN; the
          // output column holds `null` as the labelled hole. Both nodes now say
          // that, in those words.
          //
          // NOT IN `lib/copy.ts`, and deliberately: that file's header names
          // this function's node summaries in its exclusion list. A summary's
          // SHAPE changes with the run -- whether a policy withheld it, whether
          // a runner-up existed -- and a flat catalogue cannot express that.
          : 'Refused. Nothing was written into this cell.',
      tone: held ? 'warning' : 'success',
      branch: held
        ? { taken: 'refused — hold the cell', notTaken: 'cleared — publish the replacement' }
        : { taken: 'cleared — publish the replacement', notTaken: 'refused — hold the cell' },
      facts: gateFacts,
    });
    edges.push({
      from: 'gate',
      to: 'outcome',
      label: held ? 'refused' : 'cleared',
    });
  }

  /* ---- publish or hold. */
  const held = cell.status === 'quarantined';
  const outcomeFacts: Fact[] = [
    {
      label: 'value',
      value: cell.value === null ? 'null — nothing was written' : cell.value,
      source: 'field_runs.value',
    },
    { label: 'status', value: cell.status, source: 'field_runs.status' },
    { label: 'proof', value: cell.proofId, source: 'field_runs.proof_id' },
  ];
  if (held) {
    outcomeFacts.push({
      label: 'held since',
      value: `run ${cell.heldSinceRun ?? run.runId}`,
      source: 'field_runs.held_since_run',
    });
    if (cell.queueOpen !== null) {
      outcomeFacts.push({
        label: 'decision',
        value: cell.queueOpen ? 'still waiting on you' : 'already answered',
        source: 'queue_items.resolved_by',
      });
    }
    if (cell.episodeId != null) {
      outcomeFacts.push({
        label: 'episode',
        value: `#${cell.episodeId} opened`,
        source: 'episodes.opened_run',
      });
    }
  }
  outcomeFacts.push({
    label: 'page kept',
    value: run.captureKept ? 'yes' : 'no — a clean run keeps no bytes',
    source: 'runs.capture_sha',
  });

  nodes.push({
    id: 'outcome',
    kind: 'outcome',
    title: held ? 'Hold' : 'Publish',
    summary: held
      // Also a node summary, and out of the catalogue for the same reason as
      // the gate node above it.
      ? 'The cell was left empty (null) — nothing was written. The hole is labelled, not filled.'
      : `${cell.field} was published as ${cell.status}.`,
    tone: held ? 'warning' : 'success',
    facts: outcomeFacts,
  });

  return { nodes: place(nodes), edges };
}

/** The four decisions `healGated` itself can record. Anything else is a policy. */
const GATE_REASONS = ['below_tau', 'thin_margin', 'no_candidates', 'benign_tie', 'clear_margin'];


/** Starting positions: one column, dragged from there. Deterministic, so a test
 *  can assert the shape without a layout engine. */
function place(nodes: Omit<FlowNode, 'x' | 'y'>[]): FlowNode[] {
  return nodes.map((n, i) => ({ ...n, x: COL_X, y: i * ROW_Y }));
}
