'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Home, Split, Activity, Columns3, Clock, Shapes, GitCompare, FileSearch, BookOpen,
} from 'lucide-react';
import {
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { t } from '@/lib/copy';

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
  { href: '/', label: t('nav.home'), icon: Home },
  { href: '/decisions', label: t('nav.decisions'), icon: Split },
  // Routes with no rail entry of their own still belong under one. A proof
  // opened from the runs table must not leave the rail pointing at nothing.
  { href: '/runs', label: t('nav.runs'), icon: Activity, also: ['/explain'] },
  // `/compare` USED TO HANG OFF HERE, and it is a screen in its own right --
  // it has a route, a top bar, a heading and its own `lib/compare.ts`. The
  // `also` was doing the opposite of what `also` is for: it did not give an
  // orphan route a home, it gave a real screen someone else's highlight, so
  // standing on /compare the rail said Fields and offered no way back.
  { href: '/fields', label: t('nav.fields'), icon: Columns3 },
  // Two versions of the same page, side by side -- which is what this screen
  // shows and what the glyph draws.
  { href: '/compare', label: t('compare.heading'), icon: GitCompare },
  { href: '/schedule', label: t('nav.schedule'), icon: Clock },
  // `Shapes` because that is literally what the entries are: a catalogue of
  // page shapes, not of sites and not of features. A book or a stack would
  // read as "documentation to go and study", which is the thing this screen
  // is trying not to be -- every entry on it ends in a button that creates a
  // watch.
  { href: '/library', label: t('nav.library'), icon: Shapes },
  // `FileSearch`, not a shield or a tick: an audit here is reading back the
  // record, not certifying it. Nothing on this rail should imply Assay has
  // signed anything off.
  { href: '/audit', label: t('nav.audit'), icon: FileSearch },
  // The book that `Library` above is deliberately NOT. This one really is
  // documentation to go and read, and it was reachable only from a link in the
  // footer of the sign-in page and from whatever the proof strip on Home says.
  { href: '/docs', label: t('nav.docs'), icon: BookOpen },
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
    // A REAL LANDMARK. This was a bare `ul` of links: nine anchors with no
    // grouping, so "skip to navigation" had nothing to skip to and a screen
    // reader's landmark list did not mention the rail at all. The label is
    // what distinguishes it from the filter `nav` on /runs -- two navigations
    // both announced as "navigation" is the same problem one level up.
    <nav aria-label={t('nav.label')}>
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
              {/* Keyed off the ROUTE, not the label. It was `label ===
                  'Decisions'`, which made the waiting badge a function of the
                  English word: the day that label is translated -- or merely
                  reworded -- the badge silently stops rendering, with nothing to
                  fail. The href is the identity; the label is presentation. */}
              {href === '/decisions' && waiting > 0 && (
                <SidebarMenuBadge className="top-[-1px] size-[18px] justify-center rounded-full bg-[var(--accent-brand)] p-0 group-data-[collapsible=icon]:hidden">
                  <span className="caption-12 text-[var(--accent-on-primary)]">{waiting}</span>
                </SidebarMenuBadge>
              )}
            </SidebarMenuItem>
          );
        })}
      </SidebarMenu>
    </nav>
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
      {/* A COUNT, NOT A CONTROL. This read "Show all {scrapers.length}" in a
          bare span -- no href, no handler, nothing bound to it -- so it offered
          an action that did not exist, and there is no route that lists every
          scraper for it to have gone to. `docs/STATES.md` 1 #11 is the rule it
          broke: everything clickable has a defined consequence, or it does not
          exist. The number was wrong as well: `scrapers.length` is the total,
          so nine scrapers with seven drawn read "Show all 9" beside seven rows.
          What is true and useful is how many are not shown. */}
      {scrapers.length > shown.length && (
        <div className="pl-[48px] pt-[22px]">
          <span className="meta-13 text-[#65676d]">
            {scrapers.length - shown.length} more
          </span>
        </div>
      )}
    </>
  );
}
