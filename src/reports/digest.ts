// The periodic report, and the cadence that drives it.
//
// Two rules from APP-DESIGN 4.2, and both are the reason this file exists at
// all rather than a SELECT in the worker:
//
//   1. A withheld cell never produces a change entry. Diffing a hole is not a
//      change, and reporting one as "no change" is the silent error this
//      product exists to prevent, shipped by us, on a schedule.
//   2. The header never leads with a bare change count. "12 changes, 2
//      withheld" -- a bare "12 changes" quietly containing two breaks is a lie
//      of exactly the shape we name in everyone else's product.
//
// The scheduling is `targets.next_run_at` again, deliberately: one indexed
// SELECT, FOR UPDATE SKIP LOCKED, and the bump inside the same transaction IS
// the claim. There is no second scheduler in this product and there will not be.

import { z } from 'zod';
import { getDb, sql } from '../store/index.js';
import { cadenceMs, nextRunAt } from '../schedule.js';
import { digestSubject, digestBody, type Change } from '../notify.js';
import { fieldHistory, fieldsWithRuns, type DiffEntry } from './diff.js';
import { asDate } from './vocabulary.js';

export interface Digest {
  since: Date;
  until: Date;
  changes: Change[];
  withheld: Change[];
  /** A count, not a list -- nine quiet fields are one line, not nine. */
  unchanged: number;
  subject: string;
}

/** Long values are cut, and the cut is visible. Truncation is not summary. */
const clip = (s: string, n = 60): string => (s.length <= n ? s : `${s.slice(0, n - 1)}…`);

/**
 * Fold the window into the three buckets a reader gets.
 *
 * Per (target, field): any withheld run in the window wins outright -- the
 * field goes in `withheld` and contributes nothing to `changes`, whatever else
 * happened to it. Rule 1 above, enforced here rather than in the renderer,
 * because a renderer that has both is a renderer that can leak one.
 */
export async function composeDigest({ since, until }: { since: Date; until: Date }): Promise<Digest> {
  const changes: Change[] = [];
  const withheld: Change[] = [];
  let unchanged = 0;

  for (const { targetId, field } of await fieldsWithRuns({ since, until })) {
    const { entries } = await fieldHistory({ targetId, field, since, until, limit: 1000 });
    if (!entries.length) continue;

    const hole = entries.find((e) => e.state === 'withheld');
    if (hole?.state === 'withheld') {
      withheld.push({
        target: targetId,
        field,
        what: `held since run ${hole.heldSinceRun ?? hole.run} — ${
          // A code with no wording of ours is quoted as the token it is. Rule 5
          // says never raw; it does not say invent one, and in a document that
          // exists to not fabricate, a made-up adjective is the worse failure.
          hole.why == null ? 'no reason was recorded'
            : hole.why.plain ?? `the reason recorded for it is "${hole.why.code}"`
        }`,
      });
      continue;
    }

    // `comparedToRun` null means there was no earlier published value to move
    // away from -- a first reading, not a change. Saying "→" with nothing on
    // the left would invent one.
    const moves = entries.filter(
      (e): e is Extract<DiffEntry, { state: 'changed' }> =>
        e.state === 'changed' && e.comparedToRun != null,
    );

    if (moves.length) {
      // The window's endpoints, not the last hop. A field that went A -> B -> C
      // in a week moved from A to C, and reporting "B -> C" hides a change the
      // reader is being told the count of two lines above. The count comes with
      // it when there was more than one, because endpoints alone cannot show a
      // value that moved and came back.
      const from = moves[0]!.from;
      const to = moves.at(-1)!.value;
      changes.push({
        target: targetId,
        field,
        what: (from == null ? to : `${clip(from)} → ${clip(to)}`)
          + (moves.length > 1 ? ` (${moves.length} changes this window)` : ''),
      });
      continue;
    }

    // Everything left is either a first reading or a field that did not move.
    // Counting it as unchanged is only safe when every entry says so -- a field
    // that moved and got filed under "quiet" is the exact error a digest with a
    // withheld count in its header exists not to make.
    if (entries.every((e) => e.state === 'unchanged')) {
      unchanged++;
      continue;
    }
    const opening = entries[0]!;
    changes.push({ target: targetId, field, what: `first value recorded, run ${opening.run}` });
  }

  return {
    since, until, changes, withheld, unchanged,
    subject: digestSubject({ changes: changes.length, withheld: withheld.length }),
  };
}

/** The HTML body, from the module that owns the send path. Not a second copy. */
export const digestHtml = (d: Digest): string =>
  digestBody({ changes: d.changes, withheld: d.withheld, unchanged: d.unchanged });

// jsonb is whatever was written into it. Parsed, not trusted: an unusable
// recipient list is an operator error that has to be loud, because the quiet
// version of it is a digest nobody receives and nobody misses.
const Recipients = z.array(z.string().min(1)).nullable();

export interface DueDigest {
  digestId: number;
  cadence: string;
  recipients: string[] | null;
  since: Date;
  until: Date;
  subject: string;
  html: string;
  digest: Digest;
}

/**
 * Claim every digest that has come due, and compose each one.
 *
 * Returns `[]` when nothing is due and when the table is empty, so wiring this
 * into the worker changes nothing until an operator configures a digest.
 *
 * The claim mirrors `claimDueTarget`: bumping `next_run_at` inside the same
 * transaction as the `FOR UPDATE SKIP LOCKED` select is what stops two workers
 * sending the same digest twice. Composition happens after the transaction
 * commits -- it is read-only, and holding row locks across it buys nothing.
 *
 * An unparseable cadence yields a null `next_run_at`, which the due query never
 * selects again. That is the same rule `src/schedule.ts` already states: pausing
 * is a property of the data, not a branch in the loop.
 */
export async function dueDigests(now: Date = new Date()): Promise<DueDigest[]> {
  const d = getDb();

  const claimed = await d.transaction(async (tx) => {
    const { rows } = await tx.execute(sql`
      SELECT digest_id, cadence, last_sent_at, recipients FROM digests
      WHERE next_run_at IS NOT NULL AND next_run_at <= ${now}
      ORDER BY next_run_at FOR UPDATE SKIP LOCKED`);
    const due = rows as {
      digest_id: number; cadence: string;
      last_sent_at: Date | string | null; recipients: unknown;
    }[];
    for (const r of due) {
      await tx.execute(
        sql`UPDATE digests SET next_run_at = ${nextRunAt(r.cadence, now)} WHERE digest_id = ${r.digest_id}`);
    }
    return due;
  });

  const out: DueDigest[] = [];
  for (const r of claimed) {
    const ms = cadenceMs(r.cadence);
    // Nothing to claim again and no window to compose over. The bump above has
    // already parked the row; skipping it here is the same decision, not a
    // second one.
    if (ms == null) continue;
    // The window is the cadence, or everything since we last sent. Never a
    // default period picked here -- that would be a made-up window.
    const since = asDate(r.last_sent_at) ?? new Date(now.getTime() - ms);
    // Parsed before the window is composed, so a misconfigured row fails on the
    // cheap read rather than after the expensive one.
    //
    // ponytail: this throws, which abandons any digest later in the same batch.
    // With one config row per install that is the right trade -- silence would
    // mean a digest nobody receives and nobody misses. Collect-and-continue when
    // more than a handful of digests exist.
    let recipients: string[] | null;
    try {
      recipients = Recipients.parse(r.recipients ?? null);
    } catch (e) {
      throw new Error(`digest ${r.digest_id}: recipients is not a list of addresses`, { cause: e });
    }
    const digest = await composeDigest({ since, until: now });
    out.push({
      digestId: r.digest_id,
      cadence: r.cadence,
      recipients,
      since,
      until: now,
      subject: digest.subject,
      html: digestHtml(digest),
      digest,
    });
  }
  return out;
}

/**
 * Record that a digest went out. Separate from the claim on purpose: the claim
 * stops a double send, this moves the window, and a send that failed must move
 * neither -- the next run should cover the period nobody received.
 */
export async function markDigestSent(digestId: number, at: Date = new Date()): Promise<void> {
  await getDb().execute(sql`UPDATE digests SET last_sent_at = ${at} WHERE digest_id = ${digestId}`);
}
