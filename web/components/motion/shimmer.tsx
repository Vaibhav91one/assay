import { cn } from '@/lib/utils';

/**
 * The two "something is running" affordances, and the rule about which
 * announces.
 *
 * `Shimmer` is a label whose own words say what is happening -- "Reading the
 * page", "Healing 3 selectors". It is `role="status"`, so a screen reader
 * hears it when it appears and again when the words change. The sweep is
 * decoration on top of a sentence that stands without it.
 *
 * `Spinner` says only "something". Next to a Shimmer it is `aria-hidden` and
 * adds nothing an assistive reader needs; alone it is a glyph with no text,
 * which is a state nothing should ship in. Give it a label or give it a
 * sentence to stand beside.
 *
 * Neither takes focus. A progress indicator is not a control.
 */
export function Shimmer({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span role="status" className={cn('motion-shimmer', className)}>
      {children}
    </span>
  );
}

/**
 * A ring with one quarter drawn in the current colour. Decorative: pair it
 * with a Shimmer or any text that says what is running.
 */
export function Spinner({ size = 14, className }: { size?: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'motion-spin inline-block shrink-0 rounded-full border-2 border-current',
        'border-t-transparent',
        className,
      )}
      style={{ width: size, height: size, opacity: 0.5 }}
    />
  );
}

/**
 * Three bars moving like a level meter. For live audio -- dictation, a call --
 * where the point is that input is being heard right now. Not a substitute for
 * a Spinner on work that has no signal behind it.
 */
export function Equaliser({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cn('motion-eq inline-flex h-[12px] items-end gap-[2px]', className)}>
      <span className="h-full w-[2px] rounded-full bg-current" />
      <span className="h-full w-[2px] rounded-full bg-current" />
      <span className="h-full w-[2px] rounded-full bg-current" />
    </span>
  );
}
