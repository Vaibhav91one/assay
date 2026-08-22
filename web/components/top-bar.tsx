import Link from 'next/link';
import { actionVariants } from './button';
import { notices, outstandingCount } from '@/lib/notifications';
import { Notifications } from './notifications';
import { Settings } from 'lucide-react';
import { SidebarTrigger } from '@/components/ui/sidebar';

/**
 * Screen chrome: what this screen is, and one plain fact about its state.
 *
 * The status slot takes a sentence, never a count on its own -- "2 waiting on
 * you" is actionable where "2" is a number someone has to interpret.
 *
 * `action` replaces the Settings link on screens that have a better right-hand
 * verb of their own (Explain copies a proof id). There is only ever one,
 * because the one-primary law does not stop at the page body. Pass `null` for
 * none -- Settings itself must not offer a button to Settings.
 */
export async function TopBar({
  title,
  status,
  action,
  notifications,
}: {
  title: string;
  status?: string;
  action?: React.ReactNode;
  notifications?: React.ReactNode;
}) {
  // Fetched here rather than passed by each screen: the bell belongs to the
  // chrome, and eight screens each remembering to thread it through is eight
  // chances for one to forget and quietly show no badge.
  const list = notifications === undefined ? await notices() : [];

  return (
    <header className="flex h-[64px] w-full items-center justify-between pl-[24px] pr-[32px]">
      <div className="flex min-w-0 items-center gap-[22px]">
        {/* The collapse control the rail's header draws. It lives here because
            it has to stay reachable once the rail is collapsed to icons. */}
        <SidebarTrigger className="-ml-[4px] size-[28px] shrink-0 text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)] hover:text-[var(--text-primary)]" />
        <h1 className="nav-15 shrink-0 text-[var(--text-primary)]">{title}</h1>
        {status && <p className="meta-13 truncate text-[var(--text-secondary)]">{status}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-[12px]">
        {/* Activity sits beside the right-hand control on every screen, so
            "something is waiting on you" is reachable from wherever you are
            rather than only from the one screen that lists it. */}
        {notifications ?? <Notifications items={list} count={outstandingCount(list)} />}
        {action !== undefined ? (
          action
        ) : (
          <Link href="/settings" className={actionVariants({ variant: 'outline' })}>
            <Settings size={16} strokeWidth={1.5} aria-hidden />
            Settings
          </Link>
        )}
      </div>
    </header>
  );
}
