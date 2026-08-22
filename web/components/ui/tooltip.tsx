'use client';

import * as React from 'react';
import { Tooltip as Base } from '@base-ui/react/tooltip';

import { cn } from '@/lib/utils';

/**
 * Base UI tooltip, shaped to the API the Base UI sidebar calls it with:
 * `<Tooltip>{trigger}<TooltipContent side align hidden /></Tooltip>`.
 *
 * Radix's version is not a drop-in here -- it wants a Provider and `asChild`
 * where this wants `render` -- so the whole family moved rather than leaving
 * two tooltip conventions in one codebase.
 */
function TooltipProvider({
  delay = 0,
  ...props
}: React.ComponentProps<typeof Base.Provider>) {
  return <Base.Provider data-slot="tooltip-provider" delay={delay} {...props} />;
}

function Tooltip({ ...props }: React.ComponentProps<typeof Base.Root>) {
  return <Base.Root data-slot="tooltip" {...props} />;
}

function TooltipTrigger({ ...props }: React.ComponentProps<typeof Base.Trigger>) {
  return <Base.Trigger data-slot="tooltip-trigger" {...props} />;
}

function TooltipContent({
  className,
  side = 'top',
  align = 'center',
  sideOffset = 6,
  hidden,
  children,
  ...props
}: React.ComponentProps<typeof Base.Popup> & {
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
  sideOffset?: number;
  /** The sidebar passes this to suppress the tooltip while expanded. */
  hidden?: boolean;
}) {
  if (hidden) return null;

  return (
    <Base.Portal>
      {/* `z-50` belongs on the POSITIONER, not on the popup, and the difference
          is the whole of the bug this fixed. Base UI gives the positioner
          `position: absolute` and leaves the popup `position: static` -- and
          `z-index` on a statically positioned element is ignored outright. So
          the tooltip contributed no stacking level at all and painted with the
          ordinary in-flow content, while the sidebar rail (`position: fixed;
          z-index: 10`) painted above it. On home the run strip sits far enough
          left that a centred panel reaches back under the rail, and the run id
          -- the first thing in the sentence -- was hidden behind it. It read as
          a panel clipped at the viewport edge. It was not clipped; it was
          underneath. Every other Base UI popup here already puts z-50 on its
          positioner, which is why this was the one that showed.

          Collision handling is deliberately left alone: Base UI's default is
          already flip on the side and shift on the alignment, and measurement
          says it works -- at 760px the first bar's panel comes to rest at
          x=5px, on the collision padding, rather than off-screen. */}
      <Base.Positioner side={side} align={align} sideOffset={sideOffset} className="z-50">
        {/* `motion-popup` is the same class every Popover.Popup and Menu.Popup
            in the app wears -- Base UI gives all three families the same
            open/close data attributes, so a tooltip now arrives and leaves the
            way a popover does instead of being the one overlay that blinks. */}
        <Base.Popup
          data-slot="tooltip-content"
          className={cn(
            'motion-popup w-fit rounded-[6px] bg-[var(--bg-sidebar)] px-[10px] py-[5px] text-[var(--text-inverse)] shadow-elevation-control',
            className,
          )}
          {...props}
        >
          <span className="caption-12">{children}</span>
        </Base.Popup>
      </Base.Positioner>
    </Base.Portal>
  );
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
