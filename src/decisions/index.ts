// The human write path (F7/F8). The only place in this repo that settles a
// queue item, and the only one that ever may be.
//
// Three rules hold this file up:
//
//   1. `resolved_by` is what "settled" means. Never `resolution`.
//
//   2. Decide-once is one UPDATE inside one transaction (F8). A loop over 340
//      items can half-fail and leave a queue nobody can trust; a transaction
//      cannot. That is why `queue_items.group_key` exists.
//
//   3. Nothing here mutates `field_runs`. A resolved cell is not retroactively
//      un-held: FEATURES F8 requires the answer be appended as a new capture and
//      F9 requires corrections be published as a new version, never an in-place
//      rewrite. This module records the decision; republishing it is F9's job.
//
// TWO ANSWERS, NOT FOUR. `first`/`second` -- accepting a ranked candidate --
// are gone: `healGated`, the only thing that ever populated `field_runs.ranked`,
// no longer runs (`src/runner.ts`'s header), so there is never a candidate to
// accept. What was already true when there were candidates stays true now that
// there are none: a resolution settles the queue item and never moves a
// field's baseline -- that stays exclusively `ingestPage`'s to do, on a
// verified fetch, never on a human's say-so about a past run.
//
// The logic functions take plain arguments and return plain results, so a Next
// Server Action can call them directly. The Response-shaped handlers at the
// bottom are for the machine-to-machine REST surface and add only auth,
// parsing and status codes.

import { z } from 'zod';
import { isNotNull } from 'drizzle-orm';
import { getDb, queueItems, eq, and, isNull } from '../store/index.js';
import { requireKey } from '../api/keys.js';

/**
 * The two answers, and there is no third.
 *
 * `neither` is a resolution, not a skip (FEATURES F7): the cell stays withheld
 * and the target needs a human who is not under five-second pressure. Making
 * refusal unavailable to the operator would rebuild false healing inside a
 * person.
 */
export const Resolution = z.enum(['empty', 'neither']);
export type Resolution = z.infer<typeof Resolution>;

// strictObject, not object: an unrecognised key is a caller sending something
// we do not implement, and answering 200 to it is a silent fallback.
export const ResolveInput = z.strictObject({
  proof: z.string().min(1),
  resolution: Resolution,
});
export const UndoInput = z.strictObject({ proof: z.string().min(1) });

export type ResolveInput = z.infer<typeof ResolveInput>;
export type UndoInput = z.infer<typeof UndoInput>;

export type DecisionError = 'not_found' | 'already_resolved' | 'not_resolved';

export type Failure = { ok: false; error: DecisionError; detail: string };

export type Decided = {
  ok: true;
  proof: string;
  resolution: Resolution;
  group_key: string | null;
  /** How many queue items this one answer settled. F8's banner number. */
  applied: number;
  resolved_at: Date;
};

export type Undone = {
  ok: true;
  proof: string;
  group_key: string | null;
  applied: number;
  undone_at: Date;
};

const fail = (error: DecisionError, detail: string): Failure => ({ ok: false, error, detail });

/**
 * Settle a held cell, and every open item on the same template with it (F8).
 *
 * Grouping is not optional and not a flag: an item either has a `group_key` --
 * in which case the template is the unit of decision -- or it does not, in which
 * case it is answered alone. Items whose key differs stay queued individually,
 * so a decision never leaks across templates.
 */
export async function resolve({ proof, resolution }: ResolveInput): Promise<Decided | Failure> {
  return getDb().transaction(async (tx) => {
    // FOR UPDATE, because the check and the write are two statements. Without
    // it a double-click resolves the same card twice: both transactions read
    // resolved_by as null, and the second either overwrites the first's answer
    // or updates nothing and still reports success.
    const [item] = await tx.select().from(queueItems)
      .where(eq(queueItems.proofId, proof)).limit(1).for('update');
    if (!item) return fail('not_found', `No queue item for proof ${proof}.`);
    if (item.resolvedBy) {
      return fail(
        'already_resolved',
        `That item was settled by ${item.resolvedBy}. Undo it before deciding again.`,
      );
    }

    const resolvedAt = new Date();
    // One statement, not a loop. `undone_at` is deliberately left as it is: a
    // row that was decided, taken back, and decided again should still say it
    // was taken back once, and `resolved_by` is what tells a reader it is
    // settled now.
    const applied = await tx.update(queueItems)
      .set({ resolution, resolvedAt, resolvedBy: 'human' })
      .where(item.groupKey
        ? and(eq(queueItems.groupKey, item.groupKey), isNull(queueItems.resolvedBy))
        : eq(queueItems.itemId, item.itemId))
      .returning({ itemId: queueItems.itemId });

    // The row lock covers this item, not the rest of its group -- so a
    // simultaneous decision on a sibling can still settle the group between the
    // read above and this write, leaving nothing here to update. Reporting
    // success for a statement that changed no rows is the silent fallback this
    // repo refuses.
    if (!applied.length) {
      return fail('already_resolved', 'Another decision settled this group first.');
    }

    return {
      ok: true as const,
      proof,
      resolution,
      group_key: item.groupKey,
      applied: applied.length,
      resolved_at: resolvedAt,
    };
  });
}

/**
 * Take a decision back, and the whole group with it.
 *
 * A group-scoped action with an item-scoped undo is a trap that gets a queue
 * abandoned (APP-DESIGN 4.1), so the scope of the undo is the scope of the
 * decision: the items that share this item's `group_key` AND the exact
 * `resolved_at` this decision stamped on them. An earlier, separate decision on
 * the same template carries a different timestamp and is not disturbed.
 *
 * Nothing is deleted. `resolution` and `resolved_at` stay as the receipt --
 * "I resolved this and then unresolved it" has to remain distinguishable from
 * "this was never resolved" months later. Only `resolved_by` is cleared, which
 * is what returns the item to the open queue.
 */
export async function undo({ proof }: UndoInput): Promise<Undone | Failure> {
  return getDb().transaction(async (tx) => {
    const [item] = await tx.select().from(queueItems)
      .where(eq(queueItems.proofId, proof)).limit(1).for('update');
    if (!item) return fail('not_found', `No queue item for proof ${proof}.`);
    if (!item.resolvedBy) {
      return fail('not_resolved', 'That item is open. There is nothing to undo.');
    }

    const undoneAt = new Date();
    const applied = await tx.update(queueItems)
      .set({ resolvedBy: null, undoneAt })
      .where(item.groupKey && item.resolvedAt
        ? and(
            eq(queueItems.groupKey, item.groupKey),
            eq(queueItems.resolvedAt, item.resolvedAt),
            isNotNull(queueItems.resolvedBy),
          )
        : eq(queueItems.itemId, item.itemId))
      .returning({ itemId: queueItems.itemId });

    if (!applied.length) {
      return fail('not_resolved', 'Another undo took this decision back first.');
    }

    return {
      ok: true as const,
      proof,
      group_key: item.groupKey,
      applied: applied.length,
      undone_at: undoneAt,
    };
  });
}

// ---------------------------------------------------------------------------
// REST. Thin: auth, parse, call, map. A Server Action skips all of it and calls
// resolve()/undo() above.
// ---------------------------------------------------------------------------

const STATUS: Record<DecisionError, number> = {
  not_found: 404,
  already_resolved: 409,
  not_resolved: 409,
};

const invalid = (detail: string): Response =>
  Response.json({ error: 'invalid', detail }, { status: 400 });

/**
 * Say what was wrong with the body, in words the caller can act on.
 *
 * Built from the issue rather than `issue.message`: Zod's messages come from a
 * locale table that the Next production bundle does not carry, so the same bad
 * request that reads `Invalid option: expected one of "first"|...` in process
 * reads `Invalid input` over HTTP. A 400 that will not say which value it
 * wanted is a boundary that has stopped explaining itself.
 */
const said = (e: z.ZodError): string =>
  e.issues.map((i) => {
    const at = i.path.join('.') || '(body)';
    if (i.code === 'unrecognized_keys') return `unrecognized key(s): ${i.keys.join(', ')}`;
    if (i.code === 'invalid_value') return `${at}: expected one of ${i.values.join(', ')}`;
    return `${at}: ${i.message}`;
  }).join('; ');

/** Guard, parse, run. Shared by both write routes so neither can forget one. */
function writeRoute<I, O extends { ok: true }>(
  schema: z.ZodType<I>,
  run: (input: I) => Promise<O | Failure>,
): (request: Request) => Promise<Response> {
  return async (request) => {
    const denied = await requireKey(request);
    if (denied) return denied;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return invalid('Body must be JSON.');
    }

    const parsed = schema.safeParse(body);
    if (!parsed.success) return invalid(said(parsed.error));

    try {
      const result = await run(parsed.data);
      return result.ok
        ? Response.json(result)
        : Response.json(result, { status: STATUS[result.error] });
    } catch (e) {
      // A driver error can name tables and columns; a consumer never sees one.
      console.error('[decisions]', (e as Error).message);
      return Response.json({ error: 'internal' }, { status: 500 });
    }
  };
}

/** POST /api/v1/decisions/resolve -- `{ proof, resolution }`. */
export const postResolve = writeRoute(ResolveInput, resolve);

/** POST /api/v1/decisions/undo -- `{ proof }`. */
export const postUndo = writeRoute(UndoInput, undo);
