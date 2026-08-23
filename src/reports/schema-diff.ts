// The shape of the published record at one run against another.
//
// Bright Data's Scraper Studio makes this a button: after its LLM rewrites a
// scraper, an operator has to remember to click **Update Schema** before the
// change reaches production. A schema drift that nobody clicked is a schema
// drift that ships. This computes the same fact from what the run already
// wrote, so there is nothing to remember and nothing to forget.
//
// Read-only, and deliberately over `field_runs` rather than over the published
// envelope. `field_runs` is the row the run committed -- one cell per field,
// with the status that governs it -- and it is what `_assay.fields[]` on the
// warehouse row is built from. Reading the envelope back would be diffing a
// rendering of the record instead of the record.

import { getDb, eq, fieldRuns } from '../store/index.js';

export type ShapeType = 'string' | 'number' | 'null';

export interface FieldShape {
  field: string;
  type: ShapeType;
  /** field_runs.status: live | healed | quarantined | stale | degraded */
  status: string;
  value: string | null;
}

export type ShapeChange =
  | { kind: 'added';   field: string; after: FieldShape }
  | { kind: 'removed'; field: string; before: FieldShape }
  | { kind: 'type';    field: string; before: FieldShape; after: FieldShape }
  | { kind: 'status';  field: string; before: FieldShape; after: FieldShape }
  | { kind: 'same';    field: string; before: FieldShape; after: FieldShape };

/**
 * The type of a cell, read off the one thing that was stored: a string, or null.
 *
 * THREE TYPES AND NO MORE. `field_runs.value` is `text`, so everything arrives
 * as characters and any richer type is an inference about characters. A finite
 * number is the one inference worth making, because it is the one the warehouse
 * on the other end will make too -- a column of prices that starts arriving as
 * "out of stock" is a schema break whether or not Assay names it one.
 *
 * Dates are NOT inferred, and neither are booleans. `Date.parse` accepts "12",
 * "March" and every product code that happens to look like a year, so a date
 * type here would relabel half a catalogue the first time a SKU changed shape;
 * "true"/"false" as a boolean would do the same to any field whose values are
 * words. Both are the silent coercion CONTRIBUTING.md refuses, arriving as a
 * convenience. A reader who wants to know whether a string is a date can read
 * the string -- it is right there in the diff.
 *
 * `null` is its own type rather than an absent one, because a held cell IS
 * null: `field_runs.value` is null and stays null, never filled. Collapsing it
 * into `string` would erase the exact fact this file exists to show.
 */
function typeOf(value: string | null): ShapeType {
  if (value === null) return 'null';
  // `Number('')` is 0 and `Number(' ')` is 0. Neither is a number a page said.
  if (value.trim() === '') return 'string';
  return Number.isFinite(Number(value)) ? 'number' : 'string';
}

/** Every cell one run published, as its shape. Alphabetical, so a diff is stable. */
export async function shapeOf(runId: number): Promise<FieldShape[]> {
  if (!Number.isInteger(runId)) return [];
  const rows = await getDb()
    .select({
      field: fieldRuns.field,
      value: fieldRuns.value,
      status: fieldRuns.status,
    })
    .from(fieldRuns)
    .where(eq(fieldRuns.runId, runId));

  return rows
    .map((r) => ({ field: r.field, type: typeOf(r.value), status: r.status, value: r.value }))
    .sort((a, b) => a.field.localeCompare(b.field));
}

/**
 * Rank for the stable sort: everything that CHANGED, then everything that did
 * not. A reader scanning a diff is looking for the differences, and a list that
 * buries three changes among forty unchanged fields has made them do the
 * scanning the diff was supposed to do.
 *
 * Within each half the order is alphabetical and nothing else -- not by
 * severity, which would mean this file deciding that a type change matters more
 * than a quarantine, and it does not know that. Two calls with the same data
 * return the same order, which is what makes a rendered diff diffable.
 */
const RANK: Record<ShapeChange['kind'], number> = {
  added: 0, removed: 0, type: 0, status: 0, same: 1,
};

/**
 * What changed in the record's shape between two runs.
 *
 * The `status` arm is the one that carries the product's argument. A field
 * whose value and type are identical but whose status went to `quarantined` has
 * NOT stayed the same: Assay published nothing into that cell rather than a
 * value it could not justify, and a diff that reported "same" would be
 * describing the hole as though it were the old value still standing. So status
 * is compared before values are called equal, and a run that held a cell shows
 * up as a change even when the previous run published the same text.
 *
 * Order of arms otherwise: a type change subsumes a status change on the same
 * field -- one line per field, and the type is the more structural of the two,
 * because it is the one that breaks the consumer's parser rather than the one
 * that empties a cell it can already handle.
 */
export async function schemaDiff(fromRun: number, toRun: number): Promise<ShapeChange[]> {
  const [before, after] = await Promise.all([shapeOf(fromRun), shapeOf(toRun)]);
  const b = new Map(before.map((s) => [s.field, s]));
  const a = new Map(after.map((s) => [s.field, s]));

  const changes: ShapeChange[] = [];
  for (const field of new Set([...b.keys(), ...a.keys()])) {
    const was = b.get(field);
    const now = a.get(field);
    if (!was && now) changes.push({ kind: 'added', field, after: now });
    else if (was && !now) changes.push({ kind: 'removed', field, before: was });
    else if (was && now) {
      if (was.type !== now.type) changes.push({ kind: 'type', field, before: was, after: now });
      else if (was.status !== now.status) {
        changes.push({ kind: 'status', field, before: was, after: now });
      } else changes.push({ kind: 'same', field, before: was, after: now });
    }
  }

  return changes.sort(
    (x, y) => RANK[x.kind] - RANK[y.kind] || x.field.localeCompare(y.field),
  );
}
