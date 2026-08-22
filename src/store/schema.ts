// The store. Single-instance: no owner or org columns, no query scoping.
//
// Five drawn features stand on this existing -- backfill, blast radius, unheal,
// decide-once, and the frozen queue card -- plus assay_propose. Until now they
// all read persisted state that was never written.

import {
  pgTable, text, integer, boolean, jsonb, timestamp, serial,
  primaryKey, index,
} from 'drizzle-orm/pg-core';

/** A page under watch, and the contract describing what to read off it. */
export const targets = pgTable('targets', {
  targetId: text('target_id').primaryKey(),
  url: text('url').notNull(),
  cadence: text('cadence').notNull().default('6h'),
  contract: jsonb('contract').notNull(),
  nextRunAt: timestamp('next_run_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  // The scheduler is this index and one SELECT. No jobs table, no broker:
  // real load is ~100 runs/day, which is 0.07 jobs a minute.
  due: index('targets_next_run_at_idx').on(t.nextRunAt),
}));

/**
 * Pages, addressed by content. An unchanged page is the same row, so a
 * six-hourly scraper against a weekly-changing site stores one capture, not 28.
 * `pruned` marks a capture whose bytes were reclaimed: a normal state, not an
 * error, and the reason readers must handle a missing file.
 */
export const captures = pgTable('captures', {
  sha256: text('sha256').primaryKey(),
  url: text('url'),
  fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
  bytes: integer('bytes').notNull(),
  pruned: boolean('pruned').notNull().default(false),
});

/** One execution against one target. */
export const runs = pgTable('runs', {
  runId: serial('run_id').primaryKey(),
  targetId: text('target_id').notNull().references(() => targets.targetId),
  captureSha: text('capture_sha').references(() => captures.sha256),
  skeletonHash: text('skeleton_hash'),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  status: text('status').notNull(),
  // The detector's history reads from here, not from captures: a healthy run
  // keeps no capture, and robustZ needs an unbroken series. A gap disarms it.
  pageBytes: integer('page_bytes'),
  // The digest of the page as fetched, on EVERY run including skipped ones --
  // this is the "fingerprint check" a skipped run still records. Deliberately
  // no FK to captures: we record what we saw even when we keep no bytes.
  pageSha: text('page_sha'),
}, (t) => ({
  history: index('runs_target_started_idx').on(t.targetId, t.startedAt),
}));

/**
 * One field, one run -- the published cell and why it says what it says.
 *
 * `ranked` is persisted at abstain time and never recomputed. assay_propose has
 * to score a nomination against the list and the capture the queue item is
 * about; re-fetching scores a different page and is silently wrong.
 *
 * `groupKey` exists so decide-once is one UPDATE ... WHERE group_key = ? inside
 * a transaction. A loop over 340 items can half-fail; a transaction cannot.
 */
export const fieldRuns = pgTable('field_runs', {
  runId: integer('run_id').notNull().references(() => runs.runId),
  field: text('field').notNull(),
  value: text('value'),                       // null when quarantined. Never filled.
  status: text('status').notNull(),           // live | healed | quarantined | stale | degraded
  reason: text('reason'),
  // .unique() not uniqueIndex(): a foreign key needs a unique CONSTRAINT,
  // and queue_items.proof_id references this column.
  proofId: text('proof_id').notNull().unique(),
  goldenSha: text('golden_sha256'),
  captureSha: text('capture_sha256'),
  ranked: jsonb('ranked'),
  heldSinceRun: integer('held_since_run'),
  groupKey: text('group_key'),
}, (t) => ({
  pk: primaryKey({ columns: [t.runId, t.field] }),   // proof_id: unique constraint above is the warehouse join
  held: index('field_runs_status_idx').on(t.status),          // the held-cells query
  group: index('field_runs_group_idx').on(t.groupKey),
}));

/**
 * Consumer API keys for the read-only REST surface.
 *
 * Only the hash is stored: a leaked database does not become a set of working
 * credentials. The plaintext is shown once at creation and never again --
 * `keyPrefix` exists so a human can tell two keys apart without the secret.
 */
export const apiKeys = pgTable('api_keys', {
  keyId: serial('key_id').primaryKey(),
  name: text('name').notNull(),
  keyPrefix: text('key_prefix').notNull(),      // first 8 chars, for display only
  hash: text('hash').notNull().unique(),        // sha256 of the full key
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
}, (t) => ({
  lookup: index('api_keys_hash_idx').on(t.hash),
}));

/** A break, from first detection to recovery. One episode, one alert. */
export const episodes = pgTable('episodes', {
  episodeId: serial('episode_id').primaryKey(),
  targetId: text('target_id').notNull().references(() => targets.targetId),
  field: text('field').notNull(),
  cause: text('cause'),
  openedRun: integer('opened_run').notNull(),
  closedRun: integer('closed_run'),
  // How the alert went out, or why it did not. A bounced break alert is an
  // unread break, so the failure is state, not just a log line.
  notified: text('notified'),
}, (t) => ({
  open: index('episodes_target_field_closed_idx').on(t.targetId, t.field, t.closedRun),
}));

/** The abstain queue: decisions the gate refused to make. */
export const queueItems = pgTable('queue_items', {
  itemId: serial('item_id').primaryKey(),
  proofId: text('proof_id').notNull().references(() => fieldRuns.proofId),
  stakesRows: integer('stakes_rows').notNull().default(0),
  groupKey: text('group_key'),
  resolvedBy: text('resolved_by'),     // null while open. 'human' | 'model' when settled.
  // The human's answer: 'first' | 'second' | 'empty' | 'neither'.
  //
  // Note for whoever owns the decide path: assay_propose ALSO writes here, as
  // `model_nominated:<index>`, while leaving resolved_by null. That is a
  // nomination, not a resolution -- an open item with a note attached. Read
  // resolved_by, never this column, to decide whether an item is settled.
  resolution: text('resolution'),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  // Undo is a column, not a delete. The receipt has to survive being taken
  // back -- "I resolved this and then unresolved it" is a different fact from
  // "this was never resolved", and an auditor needs to be able to tell them
  // apart months later.
  undoneAt: timestamp('undone_at', { withTimezone: true }),
  ts: timestamp('ts', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  open: index('queue_items_resolved_idx').on(t.resolvedBy),
  // Decide-once is `UPDATE ... WHERE group_key = ?` in one transaction; without
  // this index that statement scans the table on every resolve.
  group: index('queue_items_group_idx').on(t.groupKey),
}));

// ---------------------------------------------------------------------------
// Wave 1. Every table below is written by exactly one feature, and none of them
// existed when the engine was built -- the features that need them are listed
// per table so a reader can find the code that owns each one.
// ---------------------------------------------------------------------------

/**
 * Every heal that was applied, and whether it was later taken back (F10/F11).
 *
 * The brake needs memory: a selector that has been healed A -> B -> A -> B is
 * not healing, it is oscillating, and the honest response is to stop and hold
 * rather than keep flipping. That is not visible from the current state of any
 * other table -- field_runs records what a run decided, not what the sequence
 * of decisions looks like. Hence a log, kept in heal order.
 */
export const healHistory = pgTable('heal_history', {
  healId: serial('heal_id').primaryKey(),
  targetId: text('target_id').notNull().references(() => targets.targetId),
  field: text('field').notNull(),
  fromSelector: text('from_selector'),
  toSelector: text('to_selector').notNull(),
  runId: integer('run_id').notNull().references(() => runs.runId),
  // Unheal sets this. The row stays: a reverted heal is evidence, and deleting
  // it would erase exactly the pattern the brake is looking for.
  reverted: boolean('reverted').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  seq: index('heal_history_target_field_idx').on(t.targetId, t.field, t.createdAt),
}));

/**
 * Standing state per field: what we think of it, as opposed to what one run
 * found (F1 fragility, F3 drift, F11 brake).
 *
 * Deliberately one row per field rather than one per run. Fragility is a
 * property of a field's history, drift is a property of anchors disagreeing
 * OVER TIME, and a brake is a latch -- none of the three is a fact about a
 * single run, and storing them per run would mean recomputing a trend on every
 * read of every screen.
 */
export const fieldState = pgTable('field_state', {
  targetId: text('target_id').notNull().references(() => targets.targetId),
  field: text('field').notNull(),
  // How much this field's fingerprint moves between runs, as a grade rather
  // than a float: a number here would invite the same "confidence percentage"
  // the gate refuses (docs/FEATURES.md 4).
  fragilityGrade: text('fragility_grade'),
  drifting: text('drift_state'),
  // A latch, not a computed flag. Something tripped it, and it stays tripped
  // until a human types the confirmation -- which is the whole point of a brake.
  brakeActive: boolean('brake_active').notNull().default(false),
  brakeReason: text('brake_reason'),
  // The stored "then": which page the baseline was taken from, and which
  // element on it. Two columns rather than a serialised Baseline, because
  // establishBaseline() owns the fingerprint's shape and a jsonb copy of that
  // shape goes stale the first time the shape changes. The bytes behind the sha
  // are the record; these two say where to look.
  //
  // Standing state per field, which is what this table is for: a baseline is a
  // property of the field over time, not a fact about one run.
  baselineGoldenSha: text('baseline_golden_sha'),
  baselineSelector: text('baseline_selector'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  pk: primaryKey({ columns: [t.targetId, t.field] }),
  braked: index('field_state_brake_idx').on(t.brakeActive),
}));

/**
 * A published range now believed wrong, and the rows it covers (F9).
 *
 * A retraction is a record, not a deletion. Downstream already has the rows;
 * the only honest thing left is to say which ones and from when, in a form a
 * warehouse can join on. `exportedAt` is when the operator actually took the
 * list -- null means the retraction has been computed but nobody has acted.
 */
export const retractions = pgTable('retractions', {
  retractionId: serial('retraction_id').primaryKey(),
  targetId: text('target_id').notNull().references(() => targets.targetId),
  field: text('field').notNull(),
  fromRun: integer('from_run').notNull(),
  toRun: integer('to_run').notNull(),
  rowIds: jsonb('row_ids'),
  exportedAt: timestamp('exported_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  byTarget: index('retractions_target_field_idx').on(t.targetId, t.field),
}));

/**
 * Field contracts, versioned per target (F2).
 *
 * Both forms are kept. `yaml` is what the operator wrote and what a diff should
 * show; `parsed` is what the runner reads. Storing only the parsed form loses
 * the comments and ordering a reviewer needs, and storing only the YAML means
 * reparsing on every run and discovering a syntax error at scrape time.
 *
 * Versions are appended, never updated: a run's thresholds have to be
 * recoverable months later, and "the contract said 0.6 at the time" is not
 * answerable from a mutable row.
 */
export const contracts = pgTable('contracts', {
  contractId: serial('contract_id').primaryKey(),
  targetId: text('target_id').notNull().references(() => targets.targetId),
  version: integer('version').notNull(),
  yaml: text('yaml').notNull(),
  parsed: jsonb('parsed').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  byTarget: index('contracts_target_version_idx').on(t.targetId, t.version),
}));

/**
 * One conversation on the home screen, and the scraper it produced.
 *
 * WHY THIS TABLE EXISTS. Until now a turn was stateless -- `src/agent/http.ts`
 * takes `history` in the request body, so the conversation lived in the tab and
 * a reload lost it. That was survivable while the transcript was scratch. It
 * stops being survivable the moment the rail LISTS conversations: a list that
 * empties on reload, or that disagrees between two tabs, is the same class of
 * dishonesty `web/lib/notifications.ts` refuses when it counts what is
 * outstanding rather than what is unread.
 *
 * `scraperSlug` is the ownership edge, and it is deliberately NOT a foreign key.
 * A scraper is not a row: `createTarget` writes one `targets` row per field,
 * keyed `slug__field` (see `targetIdFor`), and the slug is the only name the
 * group has. A FK would have to point at one arbitrary field's row and would
 * break when that field is deleted while the others live on.
 *
 * Null until the operator approves a schema -- a conversation exists from the
 * first message, and most of them never make a scraper. It stays null forever
 * for every target that predates this table. Those have NO conversation and the
 * rail must say so rather than invent one; there is no backfill here and there
 * must never be one, because a fabricated transcript is worse than no transcript.
 *
 * `turns` is jsonb rather than a second table. This is a log read whole, written
 * append-only, and never queried across conversations -- a turns table would buy
 * a join and nothing else. See `src/store/conversations.ts` for the shape.
 *
 * No owner column: this instance has no user identity (`queue_items.resolved_by`
 * stores the literal 'human'), and inventing one for a sidebar list would be a
 * large change disguised as a small one.
 */
export const conversations = pgTable('conversations', {
  conversationId: serial('conversation_id').primaryKey(),
  // Derived from the operator's first message, never from a model call. A
  // truncated sentence is honest and free; a generated title is a second thing
  // that can be wrong.
  title: text('title').notNull(),
  turns: jsonb('turns').notNull().default([]),
  scraperSlug: text('scraper_slug'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  // The rail's query is `ORDER BY updated_at DESC LIMIT n`, and nothing else
  // reads this table.
  recent: index('conversations_updated_at_idx').on(t.updatedAt),
}));

/**
 * Digest scheduling. Same shape as `targets.next_run_at`, for the same reason:
 * the due query is one indexed SELECT and there is no queue anywhere in this
 * product.
 */
export const digests = pgTable('digests', {
  digestId: serial('digest_id').primaryKey(),
  cadence: text('cadence').notNull(),
  nextRunAt: timestamp('next_run_at', { withTimezone: true }),
  lastSentAt: timestamp('last_sent_at', { withTimezone: true }),
  recipients: jsonb('recipients'),
}, (t) => ({
  due: index('digests_next_run_at_idx').on(t.nextRunAt),
}));
