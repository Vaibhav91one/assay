// Server-only. Opens a Postgres pool; see web/lib/queue.ts on why
// `server-only` is deliberately not a dependency.
import { getDb } from 'assay/store';
import * as schema from 'assay/engine/store/schema';
import { and, asc, desc, eq, inArray, lt } from 'drizzle-orm';
import {
  flowFor,
  gateCheck,
  gateNumbers,
  runOutcome,
  type Flow,
  type RankedCandidate,
  type RunOutcome,
  type RunRecord,
} from './run-flow';

/**
 * One run, assembled from the store, for `/runs/[run]`.
 *
 * The split with `/explain/[proof]` is deliberate. Explain answers "where did
 * THIS VALUE come from" months later, from a proof id printed on a warehouse
 * row: its subject is one cell, and its job is provenance -- how long the value
 * has stood, the full record, the CLI equivalent. This answers "what did this
 * EXECUTION do": its subject is one run, and its job is the pipeline -- which
 * branch was taken at each fork and on what evidence. They overlap on one
 * cell's status and reason, and this screen links onward rather than restating
 * the provenance half.
 */
export interface RunDetail {
  runId: number;
  targetId: string;
  /** The scraper, which is the slug -- `chicco`, not `chicco__recall_title`. */
  scraper: string;
  url: string | null;
  startedAt: Date | string | null;
  status: string;
  pageBytes: number | null;
  outcome: RunOutcome;
  /** Every field this run evaluated. Empty on a skipped run. */
  cells: CellSummary[];
  /** The cell the diagram is drawn for: the held one, else the first. */
  flow: Flow;
  focus: string | null;
  /** This target's other runs, oldest first. Drives both charts. */
  history: HistoryPoint[];
  /**
   * The list the gate ranked, when one was kept. `field_runs.ranked` is written
   * at abstain time only, so this is null on every run that published.
   */
  gate: {
    field: string;
    candidates: RankedCandidate[];
    score: number;
    runnerUp: number | null;
    margin: number;
    tau: number;
    delta: number;
    /**
     * Whether re-running the gate on these numbers still produces the reason on
     * the row. False means the target's contract has been edited since, so the
     * thresholds are not drawn against the scores.
     */
    reproduces: boolean;
  } | null;
}

export interface CellSummary {
  field: string;
  value: string | null;
  status: string;
  reason: string | null;
  proofId: string;
}

export interface HistoryPoint {
  runId: number;
  at: Date | string | null;
  pageBytes: number | null;
  outcome: RunOutcome;
}

/** `ranked` is jsonb, so it is whatever was written. Narrow it, do not trust it. */
function ranked(v: unknown): RankedCandidate[] | null {
  if (!Array.isArray(v)) return null;
  const out = v.flatMap((r) => {
    if (!r || typeof r !== 'object') return [];
    const o = r as Record<string, unknown>;
    return typeof o.selector === 'string' && typeof o.score === 'number'
      ? [{ selector: o.selector, score: o.score, value: typeof o.value === 'string' ? o.value : '' }]
      : [];
  });
  return out.length ? out : null;
}

/**
 * The thresholds the target row carries, or the default `ingestPage` applies.
 *
 * `targets.contract` is jsonb owned by the contracts feature; only the one key
 * this screen reads is narrowed, and a target that declares none is reported as
 * defaulting rather than as having chosen 0.6/0.16.
 */
function thresholdsOf(contract: unknown): { tau: number; delta: number; declared: boolean } {
  const t = (contract as Record<string, unknown> | null)?.thresholds as
    | Record<string, unknown>
    | undefined;
  return typeof t?.tau === 'number' && typeof t?.delta === 'number'
    ? { tau: t.tau, delta: t.delta, declared: true }
    : { tau: 0.6, delta: 0.16, declared: false };
}

export async function runDetail(runId: number): Promise<RunDetail | null> {
  if (!Number.isInteger(runId)) return null;
  const db = getDb();

  const [run] = await db.select().from(schema.runs).where(eq(schema.runs.runId, runId)).limit(1);
  if (!run) return null;

  const [[target], cells, [previous], heals, episodes, earlier] = await Promise.all([
    db.select({ url: schema.targets.url, contract: schema.targets.contract })
      .from(schema.targets).where(eq(schema.targets.targetId, run.targetId)).limit(1),
    db.select().from(schema.fieldRuns).where(eq(schema.fieldRuns.runId, runId)),
    db.select({ runId: schema.runs.runId, pageSha: schema.runs.pageSha })
      .from(schema.runs)
      .where(and(eq(schema.runs.targetId, run.targetId), lt(schema.runs.runId, runId)))
      .orderBy(desc(schema.runs.runId)).limit(1),
    db.select().from(schema.healHistory).where(eq(schema.healHistory.runId, runId)),
    db.select({ episodeId: schema.episodes.episodeId, field: schema.episodes.field })
      .from(schema.episodes).where(eq(schema.episodes.openedRun, runId)),
    // Did anything earlier record a cell for this target? One row is enough --
    // this only has to distinguish "the baseline was established here" from
    // "the baseline was rebuilt", and the shas cannot: see RunRecord.firstForField.
    db.select({ field: schema.fieldRuns.field })
      .from(schema.fieldRuns)
      .innerJoin(schema.runs, eq(schema.runs.runId, schema.fieldRuns.runId))
      .where(and(eq(schema.runs.targetId, run.targetId), lt(schema.fieldRuns.runId, runId))),
  ]);

  const proofs = cells.map((c) => c.proofId);
  const queue = proofs.length
    ? await db.select({ proof: schema.queueItems.proofId, by: schema.queueItems.resolvedBy })
        .from(schema.queueItems).where(inArray(schema.queueItems.proofId, proofs))
    : [];

  // A held cell is what the operator came here for, so it is what the diagram
  // is drawn for. Every run in this repo evaluates one field; the fallback
  // matters the day a contract names two.
  const cell = cells.find((c) => c.status === 'quarantined') ?? cells[0] ?? null;
  const t = thresholdsOf(target?.contract ?? null);

  const record: RunRecord = {
    runId: run.runId,
    targetId: run.targetId,
    url: target?.url ?? null,
    startedAt: run.startedAt,
    status: run.status,
    pageBytes: run.pageBytes,
    pageSha: run.pageSha,
    skeletonHash: run.skeletonHash,
    captureKept: run.captureSha != null,
    previous: previous ?? null,
    thresholds: { tau: t.tau, delta: t.delta },
    thresholdsDeclared: t.declared,
    firstForField: cell ? !earlier.some((e) => e.field === cell.field) : false,
    cell: cell
      ? {
          field: cell.field,
          value: cell.value,
          status: cell.status,
          // A healed row carries reason `''`; an empty code is an absence of a
          // reason, not a reason with no wording.
          reason: cell.reason || null,
          proofId: cell.proofId,
          goldenSha: cell.goldenSha,
          captureSha: cell.captureSha,
          ranked: ranked(cell.ranked),
          heldSinceRun: cell.heldSinceRun,
          groupKey: cell.groupKey,
          heal: (() => {
            const h = heals.find((x) => x.field === cell.field);
            return h ? { from: h.fromSelector, to: h.toSelector } : null;
          })(),
          queueOpen: (() => {
            const q = queue.find((x) => x.proof === cell.proofId);
            return q ? q.by === null : null;
          })(),
          episodeId: episodes.find((e) => e.field === cell.field)?.episodeId ?? null,
        }
      : null,
  };

  return {
    runId: run.runId,
    targetId: run.targetId,
    scraper: run.targetId.split('__')[0] || run.targetId,
    url: target?.url ?? null,
    startedAt: run.startedAt,
    status: run.status,
    pageBytes: run.pageBytes,
    outcome: runOutcome(run.status, cells.map((c) => c.status)),
    cells: cells.map((c) => ({
      field: c.field,
      value: c.value,
      status: c.status,
      reason: c.reason || null,
      proofId: c.proofId,
    })),
    flow: flowFor(record),
    focus: cell?.field ?? null,
    history: await historyFor(run.targetId),
    gate: (() => {
      const c = record.cell;
      const n = c && gateNumbers(c.ranked);
      return c && n && c.ranked
        ? {
            field: c.field,
            candidates: c.ranked,
            ...n,
            tau: t.tau,
            delta: t.delta,
            reproduces: gateCheck(c, { tau: t.tau, delta: t.delta }),
          }
        : null;
    })(),
  };
}

/**
 * Every run this target has recorded, oldest first.
 *
 * Both charts read this. `page_bytes` is on `runs` rather than `captures`
 * precisely because a clean run keeps no capture -- so this series has no holes
 * in it, which is what makes it worth charting at all.
 */
async function historyFor(targetId: string): Promise<HistoryPoint[]> {
  const db = getDb();
  const runs = await db
    .select({
      runId: schema.runs.runId,
      at: schema.runs.startedAt,
      pageBytes: schema.runs.pageBytes,
      status: schema.runs.status,
    })
    .from(schema.runs)
    .where(eq(schema.runs.targetId, targetId))
    .orderBy(asc(schema.runs.runId))
    .limit(240);
  if (runs.length === 0) return [];

  const cells = await db
    .select({ runId: schema.fieldRuns.runId, status: schema.fieldRuns.status })
    .from(schema.fieldRuns)
    .where(inArray(schema.fieldRuns.runId, runs.map((r) => r.runId)));

  const byRun = new Map<number, string[]>();
  for (const c of cells) byRun.set(c.runId, [...(byRun.get(c.runId) ?? []), c.status]);

  return runs.map((r) => ({
    runId: r.runId,
    at: r.at,
    pageBytes: r.pageBytes,
    outcome: runOutcome(r.status, byRun.get(r.runId) ?? []),
  }));
}
