'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, ListChecks, Activity, Columns3, Clock } from 'lucide-react';
import {
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';

const NAV = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/decisions', label: 'Decisions', icon: ListChecks },
  { href: '/runs', label: 'Runs', icon: Activity },
  { href: '/fields', label: 'Fields', icon: Columns3 },
  { href: '/schedule', label: 'Schedule', icon: Clock },
] as const;

/**
 * Client, because which item is active is a fact about the URL while the rest
 * of the rail is a fact about the database. Hardcoding it in the layout would
 * have to be re-passed correctly by every screen that ever gets added.
 *
 * On SidebarMenuButton rather than bare links so the collapsed rail gets
 * tooltips for free -- an icon with no label is otherwise a guess.
 */
export function SidebarNav({ waiting }: { waiting: number }) {
  const path = usePathname();

  return (
    <SidebarMenu className="gap-[18px] px-[20px] pb-[32px] group-data-[collapsible=icon]:px-[12px]">
      {NAV.map(({ href, label, icon: Icon }) => {
        const on = href === '/' ? path === '/' : path.startsWith(href);
        return (
          <SidebarMenuItem key={href}>
            <SidebarMenuButton
              asChild
              isActive={on}
              tooltip={label}
              className="h-auto gap-[12px] p-0 hover:bg-transparent active:bg-transparent data-[active=true]:bg-transparent group-data-[collapsible=icon]:!p-0 group-data-[collapsible=icon]:justify-center"
            >
              <Link href={href} aria-current={on ? 'page' : undefined}>
                <Icon
                  size={16}
                  strokeWidth={1.5}
                  className={on ? 'text-[var(--accent-brand)]' : 'text-[#a3a5a9]'}
                  aria-hidden
                />
                {/* Hidden, not truncated. shadcn's collapsed rail relies on
                    overflow to clip the label, which left the first letter of
                    each one bleeding past the icon rail -- "H", "F", "S". */}
                <span
                  className={`nav-15 group-data-[collapsible=icon]:hidden ${
                    on ? 'text-[var(--accent-brand)]' : 'text-[#a3a5a9]'
                  }`}
                >
                  {label}
                </span>
              </Link>
            </SidebarMenuButton>
            {label === 'Decisions' && waiting > 0 && (
              <SidebarMenuBadge className="top-[-1px] size-[18px] justify-center rounded-full bg-[var(--accent-brand)] p-0 group-data-[collapsible=icon]:hidden">
                <span className="caption-12 text-[var(--accent-on-primary)]">{waiting}</span>
              </SidebarMenuBadge>
            )}
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );
}

/** The scraper list. Client only so it can mark the one in context later. */
export function ScraperList({ scrapers }: { scrapers: { id: string; url: string }[] }) {
  const shown = scrapers.slice(0, 7);
  return (
    <>
      <ul className="flex flex-col gap-[16px]">
        {shown.map((s) => (
          <li key={s.id} className="relative flex items-center pl-[28px]">
            <span className="absolute left-[5px] size-[5px] rounded-full bg-[#65676d]" />
            <span className="body-14 truncate text-[#a3a5a9]">{s.id}</span>
          </li>
        ))}
      </ul>
      {scrapers.length > shown.length && (
        <div className="pl-[48px] pt-[22px]">
          <span className="meta-13 text-[#65676d]">Show all {scrapers.length}</span>
        </div>
      )}
    </>
  );
}
