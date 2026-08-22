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
 * The popup uses `motion-pop-in` from `app/motion.css` rather than its own
 * numbers -- see `docs/MOTION.md`. Origin is Base UI's `--transform-origin`,
 * which it sets to the side the popup actually opened on, so the panel grows
 * out of the `›` rather than out of its own middle.
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
      <Popover.Trigger className="press-row meta-12_5 w-fit cursor-pointer text-left text-[var(--text-secondary)] transition-colors duration-[var(--duration-tint)] hover:text-[var(--text-primary)] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--semantic-link)]">
        {label} ›
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={8} align={align} className="z-50">
          <Popover.Popup className="motion-pop-in max-h-[60vh] w-[360px] origin-[var(--transform-origin)] overflow-auto rounded-[var(--radius-card)] bg-[var(--surface-card)] p-[20px] shadow-elevation-floating">
            {children}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
