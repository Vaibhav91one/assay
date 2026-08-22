// The response contract, as schemas rather than prose.
//
// FEATURES F13 calls the trust envelope "a contract your code reads". These are
// that contract, executable: a consumer can generate types from them, and the
// tests assert responses against them rather than against a hand-written shape.

import { z } from 'zod';
import { createSelectSchema } from 'drizzle-zod';
import { runs, queueItems } from '../store/schema.js';

/** The five states a cell can be in. A closed set, deliberately not a score. */
export const Status = z.enum(['live', 'healed', 'stale', 'degraded', 'quarantined']);

/**
 * The per-field block inside `_assay`.
 *
 * A quarantined field is null AND labelled -- never omitted (an absent key is
 * indistinguishable from a schema change) and never filled.
 */
export const FieldStatus = z.object({
  status: Status,
  reason: z.string().optional(),
  held_since_run: z.number().int().optional(),
});

export const Envelope = z.object({
  run: z.number().int(),
  proof: z.string(),
  fields: z.record(z.string(), FieldStatus),
});

/** A published row: the values, plus the envelope that qualifies them. */
export const Row = z.looseObject({ _assay: Envelope });

export const HeldCell = z.object({
  runId: z.number().int(),
  field: z.string(),
  value: z.null(),                       // a held cell is null. Always.
  status: z.literal('quarantined'),
  reason: z.string().nullable(),
  proofId: z.string(),
  heldSinceRun: z.number().int().nullable(),
  groupKey: z.string().nullable(),
}).loose();

export const Explanation = z.object({
  proof: z.string(),
  run: z.number().int(),
  field: z.string(),
  value: z.string().nullable(),
  status: Status,
  reason: z.string().nullable(),
  held_since_run: z.number().int().nullable(),
  golden_sha256: z.string().nullable(),
  capture_sha256: z.string().nullable(),
  ranked: z.array(z.object({
    selector: z.string().nullable(),
    score: z.number(),
    value: z.string(),
  })).nullable(),
  group_key: z.string().nullable(),
  target: z.string().nullable(),
  started_at: z.union([z.date(), z.string()]).nullable(),
  skeleton_hash: z.string().nullable(),
});

// Table-derived, so a column change breaks the contract test rather than
// silently changing the API.
export const Run = createSelectSchema(runs);
export const QueueItem = createSelectSchema(queueItems);

export const Err = z.object({ error: z.string(), detail: z.string().optional() });
