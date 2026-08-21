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
  resolution: text('resolution'),
  ts: timestamp('ts', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  open: index('queue_items_resolved_idx').on(t.resolvedBy),
}));
