// Server-only. Opens a Postgres pool; see web/lib/queue.ts on why
// `server-only` is deliberately not a dependency.
import { openQueue } from 'assay/store';
import { fieldHistory, fieldsWithRuns } from 'assay/engine/reports/diff';
import type { Term } from 'assay/engine/reports/vocabulary';

/**
 * What changed on the pages you watch, and what could not be read well enough
 * to say.
 *
 * The rule this screen exists to hold: **a held field never appears as a
 * change, and never appears as "no change" either.** A hole is not a diff, and
 * reporting one as unchanged would be the same silent error the product exists
 * to prevent. So the withheld set is its own section with its own sentence,
 * not a row in the table with a dash in it.
 */

export interface Changed {
  scraper: string;
  field: string;
  from: string | null;
  to: string;
  at: Date | null;
  proof: string;
}

export interface Withheld {
  scraper: string;
  field: string;
  why: Term | null;
  heldSinceRun: number | null;
  at: Date | null;
  proof: string;
  /** True while the queue item is still open. Only then is Decide honest. */
  waiting: boolean;
}

export interface CompareView {
  since: Date;
  until: Date;
  /** A value that replaced a different one. This is what "changed" means. */
  changed: Changed[];
  /**
   * A first value, with nothing before it in the window to compare against.
   * The diff module calls this `changed` too, because relative to nothing
   * everything is new -- but reporting it as a change would tell an operator
   * a competitor moved when all that happened is that watching started.
   */
  firstSeen: Changed[];
  withheld: Withheld[];
  /** Fields that ran in the window and reported no change at all. */
  unchangedFields: number;
  scrapers: number;
}

export async function compareView(now = new Date(), days = 7): Promise<CompareView> {
  const until = now;
  const since = new Date(now.getTime() - days * 86_400_000);

  const [fields, open] = await Promise.all([
    fieldsWithRuns({ since, until }),
    openQueue(500),
  ]);
  const waiting = new Set(open.map((q) => q.proofId));

  const histories = await Promise.all(
    fields.map((f) => fieldHistory({ targetId: f.targetId, field: f.field, since, until })),
  );

  const changed: Changed[] = [];
  const firstSeen: Changed[] = [];
  const withheld: Withheld[] = [];
  let unchangedFields = 0;

  fields.forEach((f, i) => {
    const scraper = f.targetId.split('__')[0];
    const entries = histories[i].entries;

    let sawChange = false;
    for (const e of entries) {
      if (e.state === 'changed') {
        sawChange = true;
        const row = { scraper, field: f.field, from: e.from, to: e.value, at: e.at, proof: e.proof };
        (e.from === null ? firstSeen : changed).push(row);
      }
    }

    // Only the newest hold on a field is reported. A field held on four runs
    // in a row is one thing you cannot read, not four.
    const held = entries.filter((e) => e.state === 'withheld');
    const newest = held.length ? held[held.length - 1] : null;
    if (newest && newest.state === 'withheld') {
      withheld.push({
        scraper,
        field: f.field,
        why: newest.why,
        heldSinceRun: newest.heldSinceRun,
        at: newest.at,
        proof: newest.proof,
        waiting: waiting.has(newest.proof),
      });
    } else if (!sawChange) {
      unchangedFields += 1;
    }
  });

  const scrapers = new Set(fields.map((f) => f.targetId.split('__')[0])).size;
  return { since, until, changed, firstSeen, withheld, unchangedFields, scrapers };
}

/**
 * The week in one sentence, built from the counts rather than written about
 * them. The withheld half is never dropped: it is the half that makes the
 * changed half worth trusting.
 */
export function summary(v: CompareView): string {
  const names = (xs: { scraper: string }[]) => [...new Set(xs.map((x) => x.scraper))];

  const parts: string[] = [];
  if (v.changed.length > 0) {
    const who = names(v.changed);
    parts.push(
      `${list(who)} ${who.length === 2 ? 'both moved' : 'moved'} — ${plural(
        v.changed.length,
        'change',
      )} across ${plural(new Set(v.changed.map((c) => `${c.scraper}/${c.field}`)).size, 'field')}.`,
    );
  }
  if (v.firstSeen.length > 0) {
    parts.push(
      `${plural(v.firstSeen.length, 'field')} published a first value this week, so there is nothing yet to compare ${
        v.firstSeen.length === 1 ? 'it' : 'them'
      } against.`,
    );
  }
  if (v.withheld.length > 0) {
    const who = names(v.withheld);
    parts.push(
      `${list(who)} moved underneath me, so ${
        v.withheld.length === 1 ? 'that column is' : 'those columns are'
      } held — I am not going to tell you ${
        v.withheld.length === 1 ? 'it' : 'they'
      } stayed the same when I cannot read ${v.withheld.length === 1 ? 'it' : 'them'}.`,
    );
  }
  if (parts.length === 0) {
    parts.push(
      `Nothing changed and nothing was held. ${plural(
        v.unchangedFields,
        'field',
      )} across ${plural(v.scrapers, 'scraper')} read exactly as before.`,
    );
  }
  return parts.join(' ');
}

/** Both tables' rows, first values last: a change is the news. */
export function rows(v: CompareView): Changed[] {
  return [...v.changed, ...v.firstSeen];
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

const list = (xs: string[]) =>
  xs.length <= 1
    ? (xs[0] ?? 'nothing')
    : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;
