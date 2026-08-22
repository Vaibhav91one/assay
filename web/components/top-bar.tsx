import Link from 'next/link';
import { Settings } from 'lucide-react';
import { SidebarTrigger } from '@/components/ui/sidebar';

/**
 * Screen chrome: what this screen is, and one plain fact about its state.
 *
 * The status slot takes a sentence, never a count on its own -- "2 waiting on
 * you" is actionable where "2" is a number someone has to interpret.
 *
 * `action` replaces the Settings link on screens that have a better right-hand
 * verb of their own (Explain copies a proof id; Fields exports contracts).
 * There is only ever one, because the one-primary law does not stop at the
 * page body.
 */
export function TopBar({
  title,
  status,
  action,
}: {
  title: string;
  status?: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="flex h-[64px] w-full items-center justify-between pl-[24px] pr-[32px]">
      <div className="flex min-w-0 items-center gap-[22px]">
        {/* The collapse control the rail's header draws. It lives here because
            it has to stay reachable once the rail is collapsed to icons. */}
        <SidebarTrigger className="-ml-[4px] size-[28px] shrink-0 text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)] hover:text-[var(--text-primary)]" />
        <h1 className="nav-15 shrink-0 text-[var(--text-primary)]">{title}</h1>
        {status && <p className="meta-13 truncate text-[var(--text-secondary)]">{status}</p>}
      </div>
      {action ?? (
        <Link href="/settings" className={TOP_BAR_ACTION}>
          <Settings size={16} strokeWidth={1.5} className="text-[var(--text-primary)]" aria-hidden />
          <span className="meta-12_5 text-[var(--text-primary)]">Settings</span>
        </Link>
      )}
    </header>
  );
}

/** The outlined right-hand control, so an `action` matches the default. */
export const TOP_BAR_ACTION =
  'flex shrink-0 items-center gap-[8px] rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-card)] py-[8px] pl-[12px] pr-[14px] hover:bg-[var(--surface-subtle)]';
