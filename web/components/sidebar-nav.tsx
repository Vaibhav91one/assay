'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Split, Activity, Columns3, Clock } from 'lucide-react';
import {
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';

/**
 * `Split` is the Decisions glyph, everywhere the concept is drawn: here, the
 * notification row, the button that opens the queue, the empty state.
 *
 * A Decision on this product is one held value with two candidates and a
 * person who has to pick one. `Split` is a single path forking into two
 * arrowheads -- one thing, two ways, choose -- which is that sentence as a
 * picture. It replaced two glyphs that were each saying something else: a
 * balance beam, which reads as justice and weighing evidence rather than as
 * something waiting, and a checklist, which reads as tasks to tick off.
 */
const NAV = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/decisions', label: 'Decisions', icon: Split },
  // Routes with no rail entry of their own still belong under one. A proof
  // opened from the runs table must not leave the rail pointing at nothing.
  { href: '/runs', label: 'Runs', icon: Activity, also: ['/explain'] },
  { href: '/fields', label: 'Fields', icon: Columns3, also: ['/compare'] },
  { href: '/schedule', label: 'Schedule', icon: Clock },
] as const satisfies readonly {
  href: string;
  label: string;
  icon: typeof Home;
  also?: readonly string[];
}[];

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
      {NAV.map((item) => {
        const { href, label, icon: Icon } = item;
        const also = 'also' in item ? item.also : [];
        const on =
          href === '/'
            ? path === '/'
            : path.startsWith(href) || also.some((p) => path.startsWith(p));
        return (
          <SidebarMenuItem key={href}>
            {/* `render`, not `asChild`: this is the Base UI build, which
                composes with useRender rather than a Radix Slot. */}
            <SidebarMenuButton
              isActive={on}
              tooltip={label}
              className="h-auto gap-[12px] p-0 hover:bg-transparent active:bg-transparent data-active:bg-transparent group-data-[collapsible=icon]:!p-0 group-data-[collapsible=icon]:justify-center"
              render={<Link href={href} aria-current={on ? 'page' : undefined} />}
            >
              <Icon
                size={16}
                strokeWidth={1.5}
                className={on ? 'text-[var(--accent-brand)]' : 'text-[#a3a5a9]'}
                aria-hidden
              />
              {/* sr-only when collapsed, not hidden. Overflow-clipping left
                  the first letter of each label bleeding past the icon rail
                  ("H", "F", "S"), but `hidden` took the label out of the
                  accessibility tree too -- every nav link became an anchor
                  with no name, and a tooltip is not an accessible name. */}
              <span
                className={`nav-15 group-data-[collapsible=icon]:sr-only ${
                  on ? 'text-[var(--accent-brand)]' : 'text-[#a3a5a9]'
                }`}
              >
                {label}
              </span>
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
export function ScraperList({ scrapers }: { scrapers: { id: string; url: string; fields: number }[] }) {
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
