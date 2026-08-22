'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, ListChecks, Activity, Columns3, Clock } from 'lucide-react';

const NAV = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/decisions', label: 'Decisions', icon: ListChecks },
  { href: '/runs', label: 'Runs', icon: Activity },
  { href: '/fields', label: 'Fields', icon: Columns3 },
  { href: '/schedule', label: 'Schedule', icon: Clock },
] as const;

/**
 * Client, because which item is active is a fact about the URL and the rest of
 * the sidebar is a fact about the database. Hardcoding `active` in the layout
 * would have to be re-passed correctly by every screen that ever gets added.
 */
export function SidebarNav({ waiting }: { waiting: number }) {
  const path = usePathname();

  return (
    <nav className="flex flex-col gap-[18px] px-[20px] pb-[32px]">
      {NAV.map(({ href, label, icon: Icon }) => {
        const on = href === '/' ? path === '/' : path.startsWith(href);
        const tone = on ? 'text-[var(--accent-brand)]' : 'text-[#a3a5a9]';
        return (
          <Link
            key={href}
            href={href}
            aria-current={on ? 'page' : undefined}
            className="relative flex w-full items-center gap-[12px]"
          >
            <Icon size={16} strokeWidth={1.5} className={tone} aria-hidden />
            <span className={`nav-15 ${tone}`}>{label}</span>
            {label === 'Decisions' && waiting > 0 && (
              <span className="ml-auto flex size-[18px] items-center justify-center rounded-full bg-[var(--accent-brand)]">
                <span className="caption-12 text-[var(--accent-on-primary)]">{waiting}</span>
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
