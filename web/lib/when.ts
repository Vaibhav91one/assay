/**
 * The two time shapes the screens use, in one place.
 *
 * `when` answers "which run was that" -- a point on a calendar, coarse enough
 * to scan down a column. `ago` answers "how long has this been sitting there"
 * -- a duration, which is what makes a held cell feel overdue.
 *
 * Both take `Date | string` because `pg` hands back a `Date` under tsx and a
 * `string` inside Next's bundle, which registers no type parsers. Normalising
 * at the boundary was already costing one screen a 500.
 */

const TIME = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' });
const DAY = new Intl.DateTimeFormat('en-GB', { weekday: 'short' });
const DATE = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });
const DATE_TIME = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

export type Stamp = Date | string | null | undefined;

const asDate = (d: Stamp): Date | null => {
  if (d == null) return null;
  const at = d instanceof Date ? d : new Date(d);
  return Number.isNaN(at.getTime()) ? null : at;
};

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** `today 14:32` / `yesterday 09:01` / `Tue 09:01` / `4 Aug`. */
export function when(d: Stamp): string {
  const at = asDate(d);
  if (!at) return 'unknown time';
  const days = Math.floor((startOfDay(new Date()) - startOfDay(at)) / 86_400_000);
  if (days === 0) return `today ${TIME.format(at)}`;
  if (days === 1) return `yesterday ${TIME.format(at)}`;
  if (days < 7) return `${DAY.format(at)} ${TIME.format(at)}`;
  return DATE.format(at);
}

/**
 * `4 Aug 14:32` -- an absolute stamp, never abbreviated to a weekday.
 *
 * The comma Intl puts between the date and the time is dropped: this reads
 * inside sentences ("on run 62, 4 Aug 14:32.") where a second comma turns one
 * clause into three.
 */
export function stamp(d: Stamp): string {
  const at = asDate(d);
  return at ? DATE_TIME.format(at).replace(',', '') : 'unknown time';
}

/** `just now` / `12 minutes ago` / `3 hours ago` / `2 days ago`. */
export function ago(d: Stamp): string {
  const at = asDate(d);
  if (!at) return 'at an unknown time';
  const mins = Math.round((Date.now() - at.getTime()) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} minutes ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}
