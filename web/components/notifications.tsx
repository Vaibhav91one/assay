'use client';

import Link from 'next/link';
import { Popover } from '@base-ui/react/popover';
import { Bell, Check, CircleAlert, ListChecks, MailWarning } from 'lucide-react';
import type { Notice, NoticeKind } from '@/lib/notifications';
import { actionVariants } from './button';

/**
 * What is waiting on a person, next to the control they would reach for.
 *
 * The badge counts what is OUTSTANDING, not what is unread. There is no
 * read-state column in the store, and inventing one in the browser would make
 * the number a fact about this tab rather than about the instance -- it would
 * go to zero because someone looked, which is the opposite of what this
 * product is for. The count falls when the work is done.
 *
 * That is also why the list is cut in two. The badge names a number and the
 * list under it used to mix the items that number counts with the ones it does
 * not, separated only by text colour -- so the one fact the panel exists to
 * carry was the one thing it did not draw. `EARLIER` is where the count stops.
 *
 * Deliberately absent, and each for a reason: an unread dot, a "mark all as
 * read" and a mute, because all three need a read-state column that does not
 * exist and would make the badge a fact about one browser tab; and a "view
 * all", because there is no route that lists these -- a notice is answered on
 * /decisions, /runs or /settings, and a link to nowhere is worse than no link
 * because it looks like it worked. Grouping the flyout into tabs was
 * considered and dropped: four kinds across two groups do not need them.
 */
const ICON: Record<NoticeKind, typeof Bell> = {
  decision: ListChecks,
  break: CircleAlert,
  undelivered: MailWarning,
  healed: Check,
};

const TONE: Record<NoticeKind, string> = {
  decision: 'var(--semantic-warning)',
  break: 'var(--semantic-danger)',
  undelivered: 'var(--semantic-danger)',
  healed: 'var(--semantic-success)',
};

export function Notifications({ items, count }: { items: Notice[]; count: number }) {
  return (
    <Popover.Root>
      <Popover.Trigger
        className={actionVariants({ variant: 'outline', className: 'relative' })}
        aria-label={label(count)}
      >
        <Bell size={16} strokeWidth={1.5} aria-hidden />
        <span className="meta-12_5">Activity</span>
        {count > 0 && (
          <span className="absolute -right-[5px] -top-[5px] flex size-[17px] items-center justify-center rounded-full bg-[var(--accent-brand)]">
            <span className="caption-11 text-[var(--accent-on-primary)]">{count}</span>
          </span>
        )}
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Positioner side="bottom" align="end" sideOffset={8}>
          {/* `motion-pop-in` rather than numbers of its own, and the origin Base
              UI computed for the side it actually opened on, so the panel grows
              out of the bell instead of out of its own middle. See docs/MOTION.md. */}
          <Popover.Popup className="motion-pop-in z-50 w-[380px] origin-[var(--transform-origin)] overflow-hidden rounded-[var(--radius-card)] border border-[var(--border-default)] bg-[var(--surface-card)] outline-none shadow-elevation-floating">
            <p className="label-10 border-b border-[var(--border-hairline)] px-[16px] py-[12px] text-[var(--text-muted)]">
              {count > 0 ? `${count} WAITING ON YOU` : 'NOTHING WAITING ON YOU'}
            </p>

            {items.length === 0 ? (
              <p className="body-13_5 px-[16px] py-[16px] text-[var(--text-secondary)]">
                Nothing has happened yet. Runs, breaks and held cells land here.
              </p>
            ) : (
              <div className="max-h-[380px] overflow-y-auto">
                <Group items={items.filter((n) => n.outstanding)} />
                <Group items={items.filter((n) => !n.outstanding)} label="EARLIER" />
              </div>
            )}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

/**
 * One side of the cut, or nothing at all.
 *
 * The heading is on the second group only: the first needs no label because the
 * line above the panel already named it, and `WAITING ON YOU` twice in 40px is
 * the same fact rendered twice.
 */
function Group({ items, label }: { items: Notice[]; label?: string }) {
  if (items.length === 0) return null;
  return (
    <>
      {label && (
        <p className="label-10 border-y border-[var(--border-hairline)] bg-[var(--surface-subtle)] px-[16px] py-[7px] text-[var(--text-muted)]">
          {label}
        </p>
      )}
      <ul>
        {items.map((n) => {
          const Icon = ICON[n.kind];
          return (
            <li key={n.id} className="border-b border-[var(--border-hairline)] last:border-b-0">
              <Link
                href={n.href}
                className="flex items-start gap-[12px] px-[16px] py-[12px] hover:bg-[var(--surface-subtle)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--semantic-link)]"
              >
                <Icon
                  size={15}
                  strokeWidth={1.5}
                  style={{ color: TONE[n.kind] }}
                  className="mt-[2px] shrink-0"
                  aria-hidden
                />
                <span
                  className={`body-13_5 min-w-0 flex-1 ${
                    n.outstanding ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'
                  }`}
                >
                  {n.text}
                </span>
                {/* Right-hand column rather than a second line under the text.
                    The age is the one thing every row wants compared against
                    its neighbours, and stacked under sentences of different
                    lengths there is no column to compare down. */}
                {n.at && (
                  <span className="caption-11 mt-[2px] shrink-0 text-[var(--text-muted)]">
                    {ago(n.at)}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}

const label = (n: number) =>
  n === 0 ? 'Activity, nothing waiting on you' : `Activity, ${n} waiting on you`;

function ago(d: Date): string {
  const mins = Math.round((Date.now() - new Date(d).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} minutes ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}
