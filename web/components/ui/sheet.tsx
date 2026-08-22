'use client';

import * as React from 'react';
import { XIcon } from 'lucide-react';
import { Dialog as Base } from '@base-ui/react/dialog';

import { cn } from '@/lib/utils';

/**
 * A panel that comes in from an edge, on Base UI.
 *
 * It arrived here as shadcn's Radix sheet and was the app's second overlay
 * library: every popover, menu, tooltip, tab and switch on screen is Base UI,
 * and `ui/tooltip.tsx` was moved for exactly this reason -- its header says so.
 * Radix stayed for `Slot` (which `button` and `badge` use for `asChild`) and
 * `Separator`, neither of which is an overlay. This one is, so it moved too.
 *
 * The move is not cosmetic. Three things fall out of it:
 *
 *   - `data-starting-style` / `data-ending-style` instead of shadcn's
 *     `data-[state]` plus tw-animate keyframes, so the sheet is animated by
 *     `.motion-sheet` in `motion.css` on the same tokens as every other
 *     overlay, and leaves faster than it arrives like the rest of them.
 *   - One focus-trap implementation in the bundle rather than two.
 *   - `finalFocus` defaults to the trigger, which is the behaviour the proof
 *     sheet needs and would otherwise have had to hand-roll.
 *
 * The exported API is unchanged on purpose: `ui/sidebar.tsx` draws the mobile
 * rail with `<Sheet open onOpenChange>` + `<SheetContent side>` and did not
 * have to be touched.
 */

function Sheet({ ...props }: React.ComponentProps<typeof Base.Root>) {
  return <Base.Root {...props} />;
}

function SheetTrigger({ ...props }: React.ComponentProps<typeof Base.Trigger>) {
  return <Base.Trigger data-slot="sheet-trigger" {...props} />;
}

function SheetClose({ ...props }: React.ComponentProps<typeof Base.Close>) {
  return <Base.Close data-slot="sheet-close" {...props} />;
}

function SheetPortal({ ...props }: React.ComponentProps<typeof Base.Portal>) {
  return <Base.Portal {...props} />;
}

function SheetOverlay({ className, ...props }: React.ComponentProps<typeof Base.Backdrop>) {
  return (
    <Base.Backdrop
      data-slot="sheet-overlay"
      className={cn('motion-scrim fixed inset-0 z-50 bg-black/40', className)}
      {...props}
    />
  );
}

/**
 * `side` decides which edge it is pinned to and, through the data attribute,
 * which way `.motion-sheet` slides it. The width is a caller's business; the
 * default is the right-hand reading panel the proof sheet wants.
 */
function SheetContent({
  className,
  children,
  side = 'right',
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof Base.Popup> & {
  side?: 'top' | 'right' | 'bottom' | 'left';
  showCloseButton?: boolean;
}) {
  return (
    <SheetPortal>
      <SheetOverlay />
      <Base.Popup
        data-slot="sheet-content"
        data-side={side}
        // Base UI marks the rest of the tree inert while a modal dialog is
        // open, which is the stronger guarantee; `aria-modal` is stated as
        // well because a screen reader that misses `inert` still needs to be
        // told this is a modal.
        aria-modal="true"
        className={cn(
          'motion-sheet fixed z-50 flex flex-col bg-[var(--bg-page)] outline-none',
          side === 'right' && 'inset-y-0 right-0 h-full border-l',
          side === 'left' && 'inset-y-0 left-0 h-full border-r',
          side === 'top' && 'inset-x-0 top-0 h-auto border-b',
          side === 'bottom' && 'inset-x-0 bottom-0 h-auto border-t',
          (side === 'right' || side === 'left') && 'w-full sm:w-[min(560px,100vw)]',
          'border-[var(--border-default)] shadow-elevation-floating',
          className,
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <Base.Close
            aria-label="Close"
            className="focus-ring absolute right-[16px] top-[16px] rounded-[var(--radius-control)] p-[6px] text-[var(--text-muted)] transition-colors duration-[var(--duration-tint)] hover:text-[var(--text-primary)]"
          >
            <XIcon size={16} strokeWidth={1.5} aria-hidden />
          </Base.Close>
        )}
      </Base.Popup>
    </SheetPortal>
  );
}

function SheetHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="sheet-header"
      className={cn('flex flex-col gap-[4px] p-[24px] pr-[56px]', className)}
      {...props}
    />
  );
}

function SheetFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn('mt-auto flex flex-col gap-2 p-[24px]', className)}
      {...props}
    />
  );
}

function SheetTitle({ className, ...props }: React.ComponentProps<typeof Base.Title>) {
  return (
    <Base.Title
      data-slot="sheet-title"
      className={cn('heading-18 text-[var(--text-primary)]', className)}
      {...props}
    />
  );
}

function SheetDescription({ className, ...props }: React.ComponentProps<typeof Base.Description>) {
  return (
    <Base.Description
      data-slot="sheet-description"
      className={cn('meta-12_5 text-[var(--text-muted)]', className)}
      {...props}
    />
  );
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
};
