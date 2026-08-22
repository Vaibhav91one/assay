import { cn } from '@/lib/utils';

/**
 * Open and close to the content's own height, with no measurement.
 *
 * A grid row of `0fr` and one of `1fr` are both animatable lengths, and the
 * child clipped to `overflow: hidden` fills whichever it gets. So the browser
 * animates to auto height, which `height: auto` itself will never do. The cost
 * is one wrapper element and the rule that the child must not have a margin --
 * margins escape the clip and the row jumps.
 *
 * No hooks and no handlers, so this stays usable from a server component. The
 * caller owns `open`.
 *
 * Closed content is inert, not merely invisible: a zero-height row still holds
 * focusable children, and tabbing into a collapsed section is how a keyboard
 * user ends up typing into a field nobody can see.
 */
export function Collapse({
  open,
  children,
  className,
  contentClassName,
}: {
  open: boolean;
  children: React.ReactNode;
  /** On the animating grid wrapper. */
  className?: string;
  /** On the clipped inner element -- put padding here, never a margin. */
  contentClassName?: string;
}) {
  return (
    <div
      className={cn(
        'grid transition-[grid-template-rows,opacity] duration-[var(--duration-expand)] ease-[var(--ease-glide)]',
        open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
        className,
      )}
    >
      <div className={cn('overflow-hidden', contentClassName)} inert={!open}>
        {children}
      </div>
    </div>
  );
}
