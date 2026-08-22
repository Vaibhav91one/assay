'use client';

import { Popover } from '@base-ui/react/popover';

/**
 * The `… ›` idiom: `the full record ›`, `what came back ›`, `details ›`.
 *
 * Every one of these is evidence that supports a decision without being the
 * decision, so it collapses rather than being deleted -- the honesty story
 * needs it reachable, not shouting. Capped at 360px because past that it stops
 * being a disclosure and becomes a screen someone should have designed.
 *
 * Base UI, not the Radix half of `components/ui` -- it is what `sidebar.tsx`
 * and `tooltip.tsx` already compose with, and it is already a dependency.
 *
 * The popup uses `motion-popup` from `app/motion.css` rather than its own
 * numbers -- see `docs/MOTION.md`. That one class carries both halves: it
 * grows out of Base UI's `--transform-origin`, which is the side the popup
 * actually opened on, so the panel arrives out of the `›` rather than out of
 * its own middle -- and it collapses back into the same point on the way out,
 * faster than it came. It used to be `motion-pop-in`, which had no exit at
 * all: the panel was cut rather than closed.
 */
export function Disclosure({
  label,
  children,
  align = 'start',
}: {
  label: string;
  children: React.ReactNode;
  align?: 'start' | 'center' | 'end';
}) {
  return (
    <Popover.Root>
      <Popover.Trigger className="focus-ring press-row meta-12_5 w-fit cursor-pointer rounded-[var(--radius-control)] text-left text-[var(--text-secondary)] transition-colors duration-[var(--duration-tint)] hover:text-[var(--text-primary)] hover:underline">
        {label} ›
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={8} align={align} className="z-50">
          <Popover.Popup className="motion-popup max-h-[60vh] w-[360px] overflow-auto rounded-[var(--radius-card)] bg-[var(--surface-card)] p-[20px] shadow-elevation-floating">
            {children}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
