// Connection + the handful of writes the runner needs. Nothing speculative:
// queries get added when a caller wants one, not in anticipation of one.

import pg from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq, and, isNull, sql, getTableName, isTable } from 'drizzle-orm';
import * as schema from './schema.js';
import { nextRunAt } from '../schedule.js';
import { selectorFor, type Evaluation } from '../runner.js';
import type { StoredCapture } from './captures.js';

// TODO(types): drizzle's `execute` hands back `Record<string, unknown>` rows,
// so every raw-SQL read below has to name the shape it expects. These aliases
// are that naming, kept next to the queries rather than inline.
type Row = Record<string, any>;
type Db = NodePgDatabase<typeof schema>;

export * from './schema.js';
export { eq, and, isNull, sql };

export const DATABASE_URL =
  process.env.DATABASE_URL || 'postgres://localhost:5432/assay';

let pool: pg.Pool | undefined;
let db: Db | undefined;

export function getDb(): Db {
  if (!db) {
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    db = drizzle(pool, { schema });
  }
  return db;
}

export async function closeDb() {
  if (pool) { await pool.end(); pool = undefined; db = undefined; }
}

/**
 * Refuse to run against a store that is missing tables this build needs.
 *
 * WHY THIS EXISTS, and it cost a real operator a real conversation. The default
 * above is a convenience for a fresh clone, and it is also a trap: a process
 * started with no `DATABASE_URL` connects to `assay` and reports nothing unusual
 * until some feature added after that database was last migrated touches a table
 * that is not there. On this machine `assay` has twelve tables and no
 * `conversations`, so an instance served the whole app, answered in chat, and
 * dropped every message on the floor -- the only symptom being a drizzle error
 * about a relation, three layers down, in a `catch`.
 *
 * The check is TABLES, not the migration journal. `assay`, `assay_live` and
 * `assay_ui` were all created with `db:push`, which writes the schema and no
 * journal rows at all, so "count applied == count shipped" would condemn three
 * working databases and clear the broken one. What actually matters is whether
 * the tables the code is about to query exist.
 *
 * It does NOT check columns. A missing column is the same class of fault and
 * this would catch only half of it -- but the table list comes free from the
 * schema object, and a column list would be a second copy of the schema that
 * drifts. `npm run db:migrate` is the fix for both, and the message says so.
 */
export async function assertSchemaCurrent(): Promise<void> {
  const { rows } = await getDb().execute(
    sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`,
  );
  const complaint = schemaComplaint(
    (rows as Row[]).map((r) => String(r.table_name)),
    DATABASE_URL,
  );
  if (complaint) throw new Error(complaint);
}

/** Every table this build will query, straight off the schema object. */
export const wantedTables = (): string[] =>
  Object.values(schema).filter(isTable).map(getTableName);

/**
 * The sentence, or null when the store is fine.
 *
 * Split out from the query so the refusal can be tested without a second
 * database to be missing tables in. The lesson is one this repo learned twice
 * today: a check that can only be exercised by standing up broken infrastructure
 * is a check whose negative case never gets a test.
 */
export function schemaComplaint(present: readonly string[], url: string): string | null {
  const have = new Set(present);
  const missing = wantedTables().filter((name) => !have.has(name)).sort();
  if (missing.length === 0) return null;

  // The database is named because the whole failure is being pointed at the
  // wrong one, and an error that does not say which store it means sends the
  // operator to migrate the database they were already thinking of.
  return `The database at ${redact(url)} is missing ${missing.length} table(s) this build needs: `
    + `${missing.join(', ')}. Run \`npm run db:migrate\` against it, or set DATABASE_URL to the right store — `
    + `with none set, Assay uses postgres://localhost:5432/assay.`;
}

/** A connection string is a credential when it carries one. */
const redact = (url: string) => url.replace(/\/\/[^@/]*@/, '//<credentials>@');

/**
 * Every error in a `cause` chain, outermost first.
 *
 * Drizzle wraps the driver error, and the wrapper is the useless half: it says
 * "Failed query: CREATE TABLE ..." while the sentence an operator needs --
 * `column "scope" does not exist` -- and the SQLSTATE that names it are one
 * `cause` deeper. Two tools already needed to dig for that and one of them had
 * the loop written out inline; they want different halves of the same walk
 * (`tools/migrate.ts` prints the messages, `tools/apikey.ts` looks for a code),
 * so this returns the errors and lets each take what it came for.
 */
export function causeChain(e: unknown): Error[] {
  const chain: Error[] = [];
  for (let err: unknown = e; err instanceof Error; err = err.cause) chain.push(err);
  return chain;
}

/**
 * The SQLSTATE a failed query carries, from anywhere in the cause chain.
 *
 * `42703` is an unknown column and `42P01` an unknown table: between them they
 * are what "the schema is older than the code" looks like from the driver, and
 * a tool that recognises them can say so instead of printing the query.
 */
export const sqlState = (e: unknown): string | null =>
  causeChain(e).map((err) => (err as { code?: unknown }).code)
    .find((c): c is string => typeof c === 'string') ?? null;

/**
 * Reserve the run id BEFORE the run is evaluated.
 *
 * The store's id is the canonical one: it is what REST and MCP publish, so the
 * envelope, the proof record and the queue item all have to agree on it. The
 * runner needs that number while it evaluates (`held_since_run`), which is
 * earlier than the insert -- so take it from the sequence rather than inserting
 * a half-built row and updating it later. A gap in the sequence when a run
 * throws is normal; an orphan run row with no cell would not be.
 */
export async function reserveRunId(): Promise<number> {
  const d = getDb();
  const { rows } = await d.execute(
    "SELECT nextval(pg_get_serial_sequence('runs','run_id'))::int AS id",
  );
  return (rows as Row[])[0]!.id;
}

/**
 * Persist one evaluated run: the capture it read, the run, and the cell.
 *
 * Takes the runner's result as-is rather than a bespoke shape, so the worker
 * and the webhook path write identically. `runId` comes from reserveRunId().
 */
export async function recordRun({
  runId,
  targetId,
  capture,
  result,
  proofId,
  groupKey,
  stakesRows = 0,
}: {
  runId: number;
  targetId: string;
  capture?: (StoredCapture & { url?: string | null }) | null;
  result: Evaluation;
  proofId: string;
  groupKey?: string | null;
  stakesRows?: number;
}): Promise<number> {
  const d = getDb();
  return d.transaction(async (tx): Promise<number> => {
    if (capture) {
      await tx.insert(schema.captures)
        .values({ sha256: capture.sha, bytes: capture.bytes, url: capture.url })
        .onConflictDoNothing();
    }

    const [run] = await tx.insert(schema.runs).values({
      runId,
      targetId,
      captureSha: capture?.sha ?? null,
      skeletonHash: result.event.skeleton?.after ?? null,
      status: result.event.event,
      pageBytes: result.sample?.pageBytes ?? null,
      pageSha: result.event.capture_sha256 ?? null,
    }).returning({ runId: schema.runs.runId });

    // A blocked response is a run-level fact about the fetch, not an observed
    // field. Writing a degraded `field_runs` row would make reports, history,
    // and exports treat the provider's interstitial as a value-bearing page.
    // The capture and run above are retained for proof; the field is absent
    // because it was never seen, not quarantined because it broke.
    if (!result.observed) return run!.runId;

    const field = result.event.field;
    await tx.insert(schema.fieldRuns).values({
      runId: run.runId,
      field,
      value: result.publishedValue,
      status: result.status.status,
      reason: result.status.reason ?? null,
      proofId,
      goldenSha: result.event.golden_sha256 ?? null,
      captureSha: result.event.capture_sha256 ?? null,
      // Only an abstain needs the ranked list kept -- it is what a later
      // nomination must be scored against.
      //
      // `selectorFor(r.el)`, not `r.fp.tag`: the column is named `selector` and
      // a tag name is not one. Every reader treats it as an element reference --
      // the explain screen labels it "the element the value was read off", and
      // assay_propose scores a nomination against it -- so storing "h2" told
      // each of them the value came off some h2 somewhere on the page, which is
      // not an answer to the question any of them asked. This is the same call
      // the proof record's `candidates` list has always made.
      ranked: result.status.status === 'quarantined' ? (result.gate?.ranked ?? []).map((r) => ({
        selector: selectorFor(r.el),
        score: Number(r.score.toFixed(4)),
        value: (r.fp?.text || '').slice(0, 200),
      })) : null,
      heldSinceRun: (result.status.held_since_run as number | null) ?? null,
      groupKey: groupKey ?? null,
    });

    if (result.status.status === 'quarantined') {
      await tx.insert(schema.queueItems).values({ proofId, groupKey: groupKey ?? null, stakesRows });
    }

    return run!.runId;
  });
}

/**
 * Drop one target's prior runs so an ingest over a fixed corpus is re-runnable.
 *
 * proof_id is derived from (site, capture, field), so re-ingesting the same
 * corpus collides on the unique constraint. Re-ingesting IS a replacement, so
 * clear first. Scoped to one target: never touches anything else in the store.
 */
export async function resetTarget(targetId: string): Promise<number> {
  const d = getDb();
  return d.transaction(async (tx) => {
    // FK order: queue_items -> field_runs -> runs.
    await tx.execute(
      sql`DELETE FROM queue_items WHERE proof_id IN (
         SELECT fr.proof_id FROM field_runs fr
         JOIN runs r ON r.run_id = fr.run_id WHERE r.target_id = ${targetId})`,
    );
    await tx.execute(
      sql`DELETE FROM field_runs WHERE run_id IN (
         SELECT run_id FROM runs WHERE target_id = ${targetId})`,
    );
    const res = await tx.execute(sql`DELETE FROM runs WHERE target_id = ${targetId}`);
    return res.rowCount ?? 0;
  });
}

/** The published row for a cell, rebuilt from the store. The warehouse join. */
export async function rowByProof(proofId: string): Promise<Record<string, unknown> | null> {
  const d = getDb();
  const [fr] = await d.select().from(schema.fieldRuns)
    .where(eq(schema.fieldRuns.proofId, proofId)).limit(1);
  if (!fr) return null;
  return {
    [fr.field]: fr.value,
    _assay: {
      run: fr.runId,
      proof: fr.proofId,
      fields: {
        [fr.field]: {
          status: fr.status,
          ...(fr.reason ? { reason: fr.reason } : {}),
          ...(fr.heldSinceRun != null ? { held_since_run: fr.heldSinceRun } : {}),
        },
      },
    },
  };
}

/** Run history for a target, newest first. */
export async function runsFor(targetId?: string | null, limit = 50) {
  const d = getDb();
  const q = d.select().from(schema.runs);
  const rows = await (targetId ? q.where(eq(schema.runs.targetId, targetId)) : q);
  return rows.sort((a, b) => b.runId - a.runId).slice(0, limit);
}

/** Open queue items -- the decisions the gate refused to make. */
export async function openQueue(limit = 50, targetId?: string | null) {
  const d = getDb();
  const rows = await d.select().from(schema.queueItems)
    .where(isNull(schema.queueItems.resolvedBy));
  if (!targetId) return rows.sort((a, b) => b.itemId - a.itemId).slice(0, limit);
  const targetRuns = await d.select({ runId: schema.runs.runId }).from(schema.runs)
    .where(eq(schema.runs.targetId, targetId));
  const ids = new Set(targetRuns.map((run) => run.runId));
  const proofs = new Set((await d.select({ proof: schema.fieldRuns.proofId, runId: schema.fieldRuns.runId })
    .from(schema.fieldRuns)).filter((cell) => ids.has(cell.runId)).map((cell) => cell.proof));
  return rows.filter((row) => proofs.has(row.proofId))
    .sort((a, b) => b.itemId - a.itemId).slice(0, limit);
}

/**
 * Full provenance for one cell: where the value came from and what was
 * considered. This is F12 -- the answer to "where did this number come from?"
 * months later, from a proof id carried on the published row.
 */
export async function explain(proofId: string) {
  const d = getDb();
  const [fr] = await d.select().from(schema.fieldRuns)
    .where(eq(schema.fieldRuns.proofId, proofId)).limit(1);
  if (!fr) return null;
  const [run] = await d.select().from(schema.runs)
    .where(eq(schema.runs.runId, fr.runId)).limit(1);
  return {
    proof: fr.proofId,
    run: fr.runId,
    field: fr.field,
    value: fr.value,
    status: fr.status,
    reason: fr.reason ?? null,
    held_since_run: fr.heldSinceRun ?? null,
    golden_sha256: fr.goldenSha ?? null,
    capture_sha256: fr.captureSha ?? null,
    // The list the gate actually ranked. Kept, not recomputed: a nomination has
    // to be scored against this page, not whatever the site shows today.
    ranked: fr.ranked ?? null,
    group_key: fr.groupKey ?? null,
    target: run?.targetId ?? null,
    started_at: run?.startedAt ?? null,
    skeleton_hash: run?.skeletonHash ?? null,
  };
}

/** Every held cell. The one query F4 exists to answer. */
export async function heldCells(targetId?: string | null) {
  const d = getDb();
  const held = await d.select().from(schema.fieldRuns)
    .where(eq(schema.fieldRuns.status, 'quarantined'));
  if (!targetId) return held;
  const targetRuns = await d.select({ runId: schema.runs.runId }).from(schema.runs)
    .where(eq(schema.runs.targetId, targetId));
  const ids = new Set(targetRuns.map((run) => run.runId));
  return held.filter((cell) => ids.has(cell.runId));
}

/**
 * Claim one due target, or null.
 *
 * `FOR UPDATE SKIP LOCKED` plus bumping next_run_at inside the same transaction
 * IS the claim: once committed, another worker's `next_run_at <= now()` no
 * longer matches, so two workers cannot take the same target. No claim column,
 * no jobs table, no broker -- real load is ~0.07 jobs a minute.
 */
export async function claimDueTarget(now = new Date()) {
  const d = getDb();
  return d.transaction(async (tx) => {
    const { rows } = await tx.execute(sql`
      SELECT target_id, url, cadence, contract FROM targets
      WHERE next_run_at IS NOT NULL AND next_run_at <= ${now}
      ORDER BY next_run_at FOR UPDATE SKIP LOCKED LIMIT 1`);
    if (!rows.length) return null;
    const t = (rows as Row[])[0]!;
    await tx.execute(
      sql`UPDATE targets SET next_run_at = ${nextRunAt(t.cadence, now)} WHERE target_id = ${t.target_id}`,
    );
    return { targetId: t.target_id, url: t.url, cadence: t.cadence, contract: t.contract };
  });
}

/** Schedule a target to run at `at` (default: now). Used to seed and to resume. */
export async function scheduleTarget(targetId: string, at: Date = new Date()): Promise<void> {
  await getDb().execute(sql`UPDATE targets SET next_run_at = ${at} WHERE target_id = ${targetId}`);
}

/**
 * The key the worker holds while it is consuming the queue.
 *
 * Two int4s, fixed. Advisory locks are scoped to one database, so a worker
 * running against `assay` is correctly invisible to a web process pointed at
 * `assay_test` -- which is the failure a heartbeat table shared by both would
 * have had.
 */
export const WORKER_LOCK = { classId: 16723, objId: 1 } as const;

/**
 * Announce that this process is consuming the queue, until it stops being true.
 *
 * NOT a heartbeat row. A row records that a worker was alive at some timestamp,
 * which leaves every reader to pick a staleness window and guess -- and for the
 * width of that window a worker killed with SIGKILL still reads as present.
 * Postgres drops an advisory lock the instant the holding connection goes away,
 * so `workersUp()` is a fact about now rather than an inference from a clock.
 * It needs no table, no migration, and nothing to clean up after a crash.
 *
 * SHARED, not exclusive: two workers are a supported shape here (the claim is
 * `FOR UPDATE SKIP LOCKED`), so the second one must be able to say it is up
 * too rather than being told the signal is taken. Both show in `pg_locks`.
 *
 * The client is taken OUT of the pool and not returned for the duration. A
 * pooled connection is closed once it has been idle for `idleTimeoutMillis`,
 * and closing it would drop the lock while the worker was still running --
 * announcing a crash that had not happened. The release is returned rather
 * than left implicit because `pool.end()` waits for checked-out clients, so it
 * has to run before `closeDb()` or shutdown hangs.
 */
export async function holdWorkerLock(): Promise<() => void> {
  getDb();
  const client = await pool!.connect();
  try {
    await client.query('SELECT pg_advisory_lock_shared($1, $2)', [
      WORKER_LOCK.classId, WORKER_LOCK.objId,
    ]);
  } catch (e) {
    client.release(true);
    throw e;
  }
  // `true` destroys the connection rather than returning it to the pool, which
  // is what releases the lock. Returning it would leave the lock held by an
  // idle pooled client and the worker would look alive after it had exited.
  return () => client.release(true);
}

/**
 * How many workers are consuming the queue on THIS database, right now.
 *
 * Zero is the answer the schedule screen exists to be able to say out loud: an
 * enqueued run with nobody to claim it is a queued state that will never
 * advance, and showing a spinner over that is the exact failure this product
 * is an argument against.
 */
export async function workersUp(): Promise<number> {
  const { rows } = await getDb().execute(sql`
    SELECT count(*)::int AS n FROM pg_locks
    WHERE locktype = 'advisory' AND granted
      AND classid = ${WORKER_LOCK.classId} AND objid = ${WORKER_LOCK.objId}
      AND database = (SELECT oid FROM pg_database WHERE datname = current_database())`);
  return (rows as Row[])[0]?.n ?? 0;
}

/**
 * The most recent run for a target, or null.
 *
 * `page_sha` comes from field_runs.capture_sha256, not runs.capture_sha: a
 * healthy run deliberately keeps no capture bytes, so the FK column is null on
 * exactly the runs skip-if-unchanged needs to compare against. The digest is
 * recorded either way -- that IS the fingerprint check the schedule screen
 * promises still happens on a skipped run.
 */
export async function lastRunFor(targetId: string) {
  const { rows } = await getDb().execute(sql`
    SELECT run_id, status, page_bytes, page_sha
    FROM runs WHERE target_id = ${targetId} ORDER BY run_id DESC LIMIT 1`);
  return ((rows as Row[])[0] ?? null) as Row | null;
}

/**
 * The detector's history, oldest first.
 *
 * detect() guards on history.length >= 3 and robustZ needs an unbroken series,
 * so a skipped run must still contribute a sample. That is why page_bytes lives
 * on `runs` rather than being read off `captures`: a healthy run keeps no
 * capture, and a gap in this series silently disarms the detector.
 */
export async function historyFor(targetId: string, limit = 6) {
  const { rows } = await getDb().execute(sql`
    SELECT r.run_id, r.status, r.page_bytes, fr.value IS NULL AS is_null, fr.run_id IS NOT NULL AS evaluated
    FROM runs r LEFT JOIN field_runs fr ON fr.run_id = r.run_id
    WHERE r.target_id = ${targetId} AND r.page_bytes IS NOT NULL
      AND r.status <> 'blocked'
    ORDER BY r.run_id DESC LIMIT ${limit}`);
  // A LEFT JOIN, not an inner one: a skipped run has no field_runs row, and an
  // inner join would silently drop it -- leaving robustZ a series with holes in
  // it and no error to show for them. A skipped page is byte-identical to the
  // last evaluated one, so its null rate is that run's, carried forward.
  let carried = 0;
  return (rows as Row[]).reverse().map((r) => {
    if (r.evaluated) carried = r.is_null ? 1 : 0;
    return { nullRate: carried, pageBytes: r.page_bytes };
  });
}

/**
 * The stored "then" for one field, or null on a field that has never run.
 *
 * Without this, `establishBaseline` runs on the page being evaluated and the
 * runner compares a page to itself -- a gate that cannot fire and a break that
 * cannot be seen. Two columns, not a serialised Baseline: the page is the
 * record, and `establishBaseline` rebuilds everything else from it, so the
 * fingerprint's shape stays owned by one function.
 */
export async function baselineFor(
  targetId: string,
  field: string,
): Promise<{ goldenSha: string; selector: string } | null> {
  const { rows } = await getDb().execute(sql`
    SELECT baseline_golden_sha, baseline_selector FROM field_state
    WHERE target_id = ${targetId} AND field = ${field}
      AND baseline_golden_sha IS NOT NULL AND baseline_selector IS NOT NULL`);
  const r = (rows as Row[])[0];
  return r ? { goldenSha: r.baseline_golden_sha, selector: r.baseline_selector } : null;
}

/**
 * Move the baseline to a page and an element on it.
 *
 * The capture row is written in the same transaction as the pointer, and that
 * is the point of the transaction: a healthy run keeps no capture row, so the
 * one page the baseline depends on would otherwise be the one page nothing in
 * the store accounts for -- invisible to the kept/pruned counts and to anything
 * that later reclaims bytes.
 *
 * `set` names three columns and no others, the same rule the brake follows on
 * this table: `fragility_grade`, `drift_state` and `brake_active` on an
 * existing row survive untouched.
 */
export async function setBaseline({
  targetId,
  field,
  capture,
  url,
  selector,
}: {
  targetId: string;
  field: string;
  capture: StoredCapture;
  url?: string | null;
  selector: string;
}): Promise<void> {
  await getDb().transaction(async (tx) => {
    await tx.insert(schema.captures)
      .values({ sha256: capture.sha, bytes: capture.bytes, url: url ?? null })
      .onConflictDoNothing();
    await tx.insert(schema.fieldState)
      .values({ targetId, field, baselineGoldenSha: capture.sha, baselineSelector: selector })
      .onConflictDoUpdate({
        target: [schema.fieldState.targetId, schema.fieldState.field],
        set: { baselineGoldenSha: capture.sha, baselineSelector: selector, updatedAt: new Date() },
      });
  });
}

/** Record that an episode was (or was not) delivered. A bounced alert is unread. */
export async function markNotified(episodeId: number, notified: string | null): Promise<void> {
  await getDb().execute(sql`UPDATE episodes SET notified = ${notified} WHERE episode_id = ${episodeId}`);
}
