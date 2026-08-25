// Server-only. Opens a Postgres pool; see web/lib/queue.ts on why
// `server-only` is deliberately not a dependency.
import { getDb } from 'assay/store';
import * as schema from 'assay/engine/store/schema';
import { and, desc, eq, gte, isNull } from 'drizzle-orm';
import { waitingCount } from './queue.js';

/**
 * What is waiting for a person's attention, newest first.
 *
 * Every item is a fact already in the store. Nothing here is generated, and
 * nothing is marked read: there is no read-state column, and inventing one in
 * the client would make the badge lie to the next browser that opened it. The
 * count is what is actually outstanding, so it goes down when the work is done
 * and not when someone looks at it.
 */
export type NoticeKind = 'held' | 'break' | 'undelivered' | 'healed';

export interface Notice {
  id: string;
  kind: NoticeKind;
  /** One line, in the product's voice. */
  text: string;
  /** Where answering it happens. */
  href: string;
  at: Date | null;
  /** Outstanding items are the badge count. History is shown, not counted. */
  outstanding: boolean;
}

const WINDOW_DAYS = 7;

async function allNotices(): Promise<Notice[]> {
  const db = getDb();
  const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000);

  const [queue, episodes, healed] = await Promise.all([
    // Joined, not `openQueue()`: a held cell's target and field live on the
    // field run, and without them every row in the list read "A cell is held"
    // and three of them were indistinguishable from each other.
    db
      .select({
        proofId: schema.queueItems.proofId,
        ts: schema.queueItems.ts,
        rows: schema.queueItems.stakesRows,
        field: schema.fieldRuns.field,
        target: schema.runs.targetId,
      })
      .from(schema.queueItems)
      .leftJoin(schema.fieldRuns, eq(schema.fieldRuns.proofId, schema.queueItems.proofId))
      .leftJoin(schema.runs, eq(schema.runs.runId, schema.fieldRuns.runId))
      .where(isNull(schema.queueItems.resolvedBy))
      .orderBy(desc(schema.queueItems.itemId))
      .limit(50),
    db
      .select()
      .from(schema.episodes)
      .orderBy(desc(schema.episodes.episodeId))
      .limit(30),
    db
      .select({
        runId: schema.runs.runId,
        run: schema.runs.runId,
        at: schema.runs.startedAt,
        target: schema.runs.targetId,
        field: schema.fieldRuns.field,
      })
      .from(schema.fieldRuns)
      .innerJoin(schema.runs, eq(schema.runs.runId, schema.fieldRuns.runId))
      .where(and(eq(schema.fieldRuns.status, 'healed'), gte(schema.runs.startedAt, since)))
      .orderBy(desc(schema.runs.runId))
      .limit(10),
  ]);

  const out: Notice[] = [];

  // A held cell is the only thing that literally cannot proceed without a
  // person, so it sorts first regardless of age.
  for (const q of queue) {
    out.push({
      id: `q:${q.proofId}`,
      kind: 'held',
      text: q.field
        ? `${short(q.target ?? '')} is holding ${q.field}${q.rows ? ` on ${q.rows} row${q.rows === 1 ? '' : 's'}` : ''}`
        : 'A cell is held and waiting on you',
      // /fields, not a resolve screen: there is no more action to take here
      // than to go look at what a Bright Data collector fix would need to
      // address -- the decide-queue this used to point at is retired.
      href: '/fields?show=held',
      at: q.ts ?? null,
      outstanding: true,
    });
  }

  for (const e of episodes) {
    const open = e.closedRun === null;
    // An alert that failed to send is an unread break, not a log line -- the
    // schema comment says so, so it is surfaced as its own kind.
    const undelivered = typeof e.notified === 'string' && e.notified.startsWith('undelivered');
    if (undelivered) {
      out.push({
        id: `e:${e.episodeId}:undelivered`,
        kind: 'undelivered',
        text: `The alert for ${e.field} on ${short(e.targetId)} did not go out`,
        // The tab, not the screen. Settings is four panels now, and landing on
        // the one showing which mail variable is unset is the difference
        // between a link that answers the notice and one that starts a search.
        href: '/settings?tab=notifications',
        at: null,
        outstanding: true,
      });
    }
    out.push({
      id: `e:${e.episodeId}`,
      kind: 'break',
      text: open
        ? `${short(e.targetId)} broke on ${e.field}, from run ${e.openedRun}`
        : `${short(e.targetId)} recovered on ${e.field} at run ${e.closedRun}`,
      // The run the sentence NAMES, not the list of every run there has ever
      // been. A notice that says "broke from run 412" and then lands on a
      // table of four hundred rows has made the reader do the lookup itself,
      // and on a busy instance run 412 is not on the first page of it.
      // `closedRun ?? openedRun` IS `open ? opened : closed` -- `open` is
      // defined as `closedRun === null` three lines up -- and it is the form
      // that cannot produce `/runs/null` if that ever stops being true.
      href: `/runs/${e.closedRun ?? e.openedRun}`,
      at: null,
      outstanding: open,
    });
  }

  for (const h of healed) {
    out.push({
      id: `h:${h.runId}:${h.field}`,
      kind: 'healed',
      // Named by run: the same target and field heal repeatedly, and without
      // the run number consecutive rows looked like the list repeating itself.
      text: `${short(h.target)} moved and was found again on ${h.field}, run ${h.run}`,
      href: `/runs/${h.runId}`,
      at: h.at as Date,
      outstanding: false,
    });
  }

  return out.sort(
    (a, b) => Number(b.outstanding) - Number(a.outstanding) || when(b.at) - when(a.at),
  );
}

/** The rows to draw, newest first, cut to what a popover can hold. */
export async function notices(limit = 12): Promise<Notice[]> {
  return (await allNotices()).slice(0, limit);
}

/**
 * The bell, in one read: the rows AND the number on the badge.
 *
 * The badge used to be `outstandingCount(notices(12))` -- outstanding items
 * counted off a list that had already been cut to twelve rows, so an instance
 * with forty held cells wore a badge saying twelve while the rail beside it
 * said forty. The held-cell portion now comes from `waitingCount()`, the same
 * uncapped count the rail, Home and /runs read, and only the other kinds are
 * counted off the list -- from the FULL list, not the twelve rows drawn, or
 * an open break would vanish from the number the moment thirteen decisions
 * pushed it off the panel.
 */
export async function activity(limit = 12): Promise<{ items: Notice[]; count: number }> {
  const [all, waiting] = await Promise.all([allNotices(), waitingCount()]);
  return {
    items: all.slice(0, limit),
    count: waiting + all.filter((n) => n.outstanding && n.kind !== 'held').length,
  };
}

/** The badge. Outstanding only -- history is not a number anyone must act on. */
export const outstandingCount = (list: readonly Notice[]): number =>
  list.filter((n) => n.outstanding).length;

const when = (d: Date | null) => (d ? new Date(d).getTime() : 0);
const short = (id: string) => (id ?? '').split('__')[0];
