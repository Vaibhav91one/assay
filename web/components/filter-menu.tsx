'use client';

import Link from 'next/link';
import { Menu } from '@base-ui/react/menu';
import { ChevronDown, ListChecks } from 'lucide-react';
import { actionVariants } from './button';

/**
 * `Menu` on `06 · Components`, wired as a filter.
 *
 * Each item is a real link, so the filter is in the URL and the table is
 * filtered on the server. That keeps the count in the header and the rows in
 * the table reading off the same query -- the two cannot disagree, which is
 * how a filtered view starts lying about how much there is.
 *
 * Base UI, matching `sidebar.tsx` and `tooltip.tsx`, not the Radix half of
 * `components/ui`.
 *
 * `Menu.Popup` takes the same `motion-popup` class as every `Popover.Popup` in
 * the app. Base UI gives the two families byte-identical data attributes for
 * open and close, so one idiom covers both and a menu cannot end up leaving
 * the screen differently from a popover.
 *
 * The `ListChecks` glyph here means "a list of options", not "a decision" --
 * Decisions moved to `Split` (see sidebar-nav.tsx), which is part of what
 * freed this one up to mean only what it says.
 */
export interface FilterOption {
  value: string;
  href: string;
  label: string;
  /** A colour for the label, where the option's meaning has one. */
  tone?: string;
}

export function FilterMenu({
  options,
  current,
}: {
  options: FilterOption[];
  current: string;
}) {
  const active = options.find((o) => o.value === current) ?? options[0];

  return (
    <Menu.Root>
      <Menu.Trigger className={actionVariants({ variant: 'outline' })}>
        <ListChecks size={14} strokeWidth={1.5} aria-hidden />
        {active.label}
        <ChevronDown size={12} strokeWidth={1.5} aria-hidden />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner sideOffset={6} align="start" className="z-50">
          <Menu.Popup className="motion-popup w-[200px] rounded-[10px] border border-[var(--border-default)] bg-[var(--surface-card)] p-[3px] shadow-elevation-floating">
            {options.map((o) => (
              <Menu.LinkItem
                key={o.value}
                render={<Link href={o.href} />}
                // No `focus-ring` here on purpose. A menu row's keyboard
                // position is drawn by Base UI's own `data-highlighted`, which
                // the next line styles; a second indicator would say the same
                // thing twice, and a 4px ring inside a 3px-padded popup would
                // be clipped by the popup that contains it.
                className={`meta-12_5 block rounded-[6px] px-[12px] py-[8px] outline-none ${
                  o.value === current ? 'bg-[var(--surface-subtle)]' : ''
                } data-highlighted:bg-[var(--surface-subtle)]`}
                style={{ color: o.tone ?? 'var(--text-secondary)' }}
              >
                {o.label}
              </Menu.LinkItem>
            ))}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
