// Value history for one field, with `withheld` as a state of its own.
//
// APP-DESIGN 4.2 gives three states and says the third one is the product:
//
//   changed    the value moved, and we published both ends of the move
//   unchanged  the value is the one we published last time
//   withheld   we published nothing here, deliberately
//
// The two rules that make `withheld` load-bearing rather than decorative:
//
//   1. A withheld run produces NO from/to. Not an empty string, not a null
//      value pair, not "no change" -- those are the renderings of "there was
//      nothing here", which is a different fact. The absence is typed.
//   2. A withheld run is never the basis of the next comparison. If we did not
//      publish at run 40, then run 41 is compared against run 39, and
//      `comparedToRun` says so. Comparing against a hole would manufacture a
//      change out of a refusal.

import { getDb, sql } from '../store/index.js';
import { asDate, heldBecause, type Term } from './vocabulary.js';

/** One run's worth of history for one field. */
export type DiffEntry =
  | {
      state: 'changed';
      run: number;
      at: Date | null;
      proof: string;
      status: string;
      value: string;
      /** The value we published last, or null when this is the first one. */
      from: string | null;
      /** Which run `from` came from. Null when there is no earlier published run. */
      comparedToRun: number | null;
    }
  | {
      state: 'unchanged';
      run: number;
      at: Date | null;
      proof: string;
      status: string;
      value: string;
      comparedToRun: number;
    }
  | {
      state: 'withheld';
      run: number;
      at: Date | null;
      proof: string;
      status: string;
      /** No `value`, no `from`, no `to`. That is the point of this branch. */
      why: Term | null;
      heldSinceRun: number | null;
    };

export interface FieldHistory {
  target: string;
  field: string;
  entries: DiffEntry[];
}

// TODO(types): drizzle hands raw rows back as Record<string, unknown>; this is
// the shape this query selects, named next to it rather than inline.
type HistoryRow = {
  run_id: number;
  started_at: Date | string;
  value: string | null;
  status: string;
  reason: string | null;
  proof_id: string;
  held_since_run: number | null;
};

const CELLS = sql`
  SELECT fr.run_id, r.started_at, fr.value, fr.status, fr.reason,
         fr.proof_id, fr.held_since_run
  FROM field_runs fr JOIN runs r ON r.run_id = fr.run_id`;

/**
 * The most recent `limit` cells for a field, oldest first, optionally bounded
 * in time.
 *
 * `since`/`until` bound on runs.started_at because a window is a period a human
 * names ("this week"), not a range of run ids.
 *
 * One published cell from BEFORE the window is read as well, used as the
 * comparison basis for the oldest entry shown, and then dropped. Without it the
 * top of every window reads as a first value -- which is a claim about the
 * field's whole history, not about where a `--limit` or a Monday happened to
 * land, and it would put a change in a digest where nothing moved.
 */
export async function fieldHistory({
  targetId,
  field,
  since,
  until,
  limit = 200,
}: {
  targetId: string;
  field: string;
  since?: Date;
  until?: Date;
  limit?: number;
}): Promise<FieldHistory> {
  const d = getDb();
  const { rows } = await d.execute(sql`${CELLS}
    WHERE r.target_id = ${targetId} AND fr.field = ${field}
      ${since ? sql`AND r.started_at >= ${since}` : sql.empty()}
      ${until ? sql`AND r.started_at < ${until}` : sql.empty()}
    ORDER BY fr.run_id DESC LIMIT ${limit}`);
  const window = (rows as HistoryRow[]).reverse();

  // A held cell is never the basis: comparing against a hole manufactures a
  // change out of a refusal, so the search skips back to the last one we
  // actually published.
  const oldest = window[0];
  const prior = oldest ? (await d.execute(sql`${CELLS}
    WHERE r.target_id = ${targetId} AND fr.field = ${field}
      AND fr.run_id < ${oldest.run_id} AND fr.value IS NOT NULL AND fr.status <> 'quarantined'
    ORDER BY fr.run_id DESC LIMIT 1`)).rows as HistoryRow[] : [];

  const entries = toEntries([...prior, ...window]);
  return { target: targetId, field, entries: entries.slice(entries.length - window.length) };
}

/** The fold from stored cells to diff states. Pure, so it is testable alone. */
export function toEntries(rows: HistoryRow[]): DiffEntry[] {
  const entries: DiffEntry[] = [];
  // The last cell we actually published. A withheld run never updates it.
  let basis: { run: number; value: string } | null = null;

  for (const r of rows) {
    const common = { run: r.run_id, at: asDate(r.started_at), proof: r.proof_id, status: r.status };

    // A held cell is null AND labelled (src/envelope.ts). Either half on its own
    // is the ambiguity the envelope exists to remove, so both are required here
    // rather than trusting one: a null value under a published status is a bug
    // upstream, and this report must not smooth it into a diff.
    if (r.status === 'quarantined' || r.value == null) {
      entries.push({
        ...common,
        state: 'withheld',
        why: heldBecause(r.reason),
        heldSinceRun: r.held_since_run,
      });
      continue;
    }

    if (basis && basis.value === r.value) {
      entries.push({ ...common, state: 'unchanged', value: r.value, comparedToRun: basis.run });
    } else {
      entries.push({
        ...common,
        state: 'changed',
        value: r.value,
        from: basis ? basis.value : null,
        comparedToRun: basis ? basis.run : null,
      });
    }
    basis = { run: r.run_id, value: r.value };
  }

  return entries;
}

/** Every (target, field) that recorded a cell in a window. The digest's index. */
export async function fieldsWithRuns({ since, until }: { since: Date; until: Date }) {
  const { rows } = await getDb().execute(sql`
    SELECT DISTINCT r.target_id, fr.field
    FROM field_runs fr JOIN runs r ON r.run_id = fr.run_id
    WHERE r.started_at >= ${since} AND r.started_at < ${until}
    ORDER BY r.target_id, fr.field`);
  return (rows as { target_id: string; field: string }[])
    .map((r) => ({ targetId: r.target_id, field: r.field }));
}
