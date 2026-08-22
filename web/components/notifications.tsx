'use client';

import Link from 'next/link';
import { Popover } from '@base-ui/react/popover';
import { Bell, Check, CircleAlert, MailWarning, Split } from 'lucide-react';
import type { Notice, NoticeKind } from '@/lib/notifications';
import { ago } from '@/lib/when';
import { actionVariants } from './button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

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
 *
 * The trigger is a glyph and a dot, with no word beside it. The dot inherits
 * the count's meaning exactly and adds nothing to it: it is drawn when
 * something is OUTSTANDING and it goes away when the work is done, never
 * because the panel was opened. It is emphatically not the unread dot ruled
 * out two paragraphs up -- same shape, opposite claim.
 *
 * Losing the word "Activity" costs a sighted user nothing they cannot get by
 * hovering, and would have cost a screen reader user the control's whole name,
 * so the `aria-label` still carries the count in full and the tooltip fires on
 * keyboard focus as well as on hover.
 */
const ICON: Record<NoticeKind, typeof Bell> = {
  decision: Split,
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
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger
            render={<Popover.Trigger />}
            className={actionVariants({ variant: 'icon', className: 'relative' })}
            aria-label={label(count)}
          >
            <Bell size={16} strokeWidth={1.5} aria-hidden />
            {/* aria-hidden, and the label above already said the number. A dot
                that announced itself would make the reader hear the same fact
                twice, once precisely and once as "something". */}
            {count > 0 && (
              <span
                aria-hidden
                className="absolute -bottom-[2px] -right-[2px] size-[9px] rounded-full border-2 border-[var(--surface-card)] bg-[var(--accent-brand)]"
              />
            )}
          </TooltipTrigger>
          <TooltipContent side="bottom">{label(count)}</TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <Popover.Portal>
        {/* z-50 on the positioner, which is the only one of the two that is
            positioned -- see the note in ui/tooltip.tsx. This panel opens from
            the top bar and never reached back under the rail, so it never
            showed the fault the tooltip did; it had it all the same. */}
        <Popover.Positioner side="bottom" align="end" sideOffset={8} className="z-50">
          {/* `motion-popup` rather than numbers of its own: it grows out of the
              origin Base UI computed for the side it actually opened on, so the
              panel arrives out of the bell instead of out of its own middle,
              and collapses back into it faster than it came. See docs/MOTION.md. */}
          <Popover.Popup className="motion-popup w-[380px] overflow-hidden rounded-[var(--radius-card)] border border-[var(--border-default)] bg-[var(--surface-card)] outline-none shadow-elevation-floating">
            <p className="label-10 border-b border-[var(--border-hairline)] px-[16px] py-[12px] text-[var(--text-muted)]">
              {count > 0 ? `${count} WAITING ON YOU` : 'NOTHING WAITING ON YOU'}
            </p>

            {items.length === 0 ? (
              <p className="body-13_5 px-[16px] py-[16px] text-[var(--text-secondary)]">
                {/* The four things that actually become a notice, in
                    `NoticeKind` order: a held cell, a break, an alert that did
                    not go out, a field that moved and was found again. It used
                    to say "Runs, breaks and held cells", and a run is not a
                    notice kind -- a clean run puts nothing here at all, which
                    is the behaviour this panel is for. */}
                Nothing has happened yet. Held cells, breaks, alerts that did not go out, and
                fields that moved and were found again all land here.
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
                className="focus-ring-inset flex items-start gap-[12px] px-[16px] py-[12px] hover:bg-[var(--surface-subtle)]"
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

// `ago` was a second copy of `web/lib/when.ts`'s, identical down to the missing
// singular on minutes. Two copies means a fix lands on one panel and not the
// other, which is how "1 minutes ago" survived being fixed. One function now.
