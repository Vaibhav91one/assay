'use client';

import Link from 'next/link';
import { Popover } from '@base-ui/react/popover';
import { Bell, Check, CircleAlert, ListChecks, MailWarning } from 'lucide-react';
import type { Notice, NoticeKind } from '@/lib/notifications';
import { TOP_BAR_ACTION } from './chrome';

/**
 * What is waiting on a person, next to the control they would reach for.
 *
 * The badge counts what is OUTSTANDING, not what is unread. There is no
 * read-state column in the store, and inventing one in the browser would make
 * the number a fact about this tab rather than about the instance -- it would
 * go to zero because someone looked, which is the opposite of what this
 * product is for. The count falls when the work is done.
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
      <Popover.Trigger className={`relative ${TOP_BAR_ACTION}`} aria-label={label(count)}>
        <Bell size={16} strokeWidth={1.5} className="text-[var(--text-primary)]" aria-hidden />
        <span className="meta-12_5 text-[var(--text-primary)]">Activity</span>
        {count > 0 && (
          <span className="absolute -right-[5px] -top-[5px] flex size-[17px] items-center justify-center rounded-full bg-[var(--accent-brand)]">
            <span className="caption-11 text-[var(--accent-on-primary)]">{count}</span>
          </span>
        )}
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Positioner side="bottom" align="end" sideOffset={8}>
          <Popover.Popup className="z-50 w-[380px] outline-none overflow-hidden rounded-[var(--radius-card)] border border-[var(--border-default)] bg-[var(--surface-card)] shadow-elevation-floating">
            <p className="label-10 border-b border-[var(--border-hairline)] px-[16px] py-[12px] text-[var(--text-muted)]">
              {count > 0 ? `${count} WAITING ON YOU` : 'NOTHING WAITING ON YOU'}
            </p>

            {items.length === 0 ? (
              <p className="body-13_5 px-[16px] py-[16px] text-[var(--text-secondary)]">
                Nothing has happened yet. Runs, breaks and held cells land here.
              </p>
            ) : (
              <ul className="max-h-[380px] overflow-y-auto">
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
                        <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
                          <span
                            className={`body-13_5 ${
                              n.outstanding ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'
                            }`}
                          >
                            {n.text}
                          </span>
                          {n.at && <span className="caption-11 text-[var(--text-muted)]">{ago(n.at)}</span>}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
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
