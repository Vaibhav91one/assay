import Link from 'next/link';
import { Settings } from 'lucide-react';

/**
 * Screen chrome: what this screen is, and one plain fact about its state.
 *
 * The status slot takes a sentence, never a count on its own -- "2 waiting on
 * you" is actionable where "2" is a number someone has to interpret.
 */
export function TopBar({ title, status }: { title: string; status?: string }) {
  return (
    <header className="flex h-[64px] w-full items-center justify-between pl-[56px] pr-[32px]">
      <div className="flex items-center gap-[22px]">
        <h1 className="nav-15 text-[var(--text-primary)]">{title}</h1>
        {status && <p className="meta-13 text-[var(--text-secondary)]">{status}</p>}
      </div>
      <Link
        href="/settings"
        className="flex items-center gap-[8px] rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-card)] py-[8px] pl-[12px] pr-[14px] hover:bg-[var(--surface-subtle)]"
      >
        <Settings size={16} strokeWidth={1.5} className="text-[var(--text-primary)]" aria-hidden />
        <span className="meta-12_5 text-[var(--text-primary)]">Settings</span>
      </Link>
    </header>
  );
}
