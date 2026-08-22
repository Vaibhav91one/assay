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
      <Base.Positioner side={side} align={align} sideOffset={sideOffset}>
        {/* `motion-popup` is the same class every Popover.Popup and Menu.Popup
            in the app wears -- Base UI gives all three families the same
            open/close data attributes, so a tooltip now arrives and leaves the
            way a popover does instead of being the one overlay that blinks. */}
        <Base.Popup
          data-slot="tooltip-content"
          className={cn(
            'motion-popup z-50 w-fit rounded-[6px] bg-[var(--bg-sidebar)] px-[10px] py-[5px] text-[var(--text-inverse)] shadow-elevation-control',
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
