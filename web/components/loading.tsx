/**
 * `Working` says what is happening, in a sentence, next to a dot in the
 * in-motion colour. There is deliberately no bar: a bar is a promise of a
 * denominator, and a place that is waiting on one query does not have one.
 * Where a real denominator exists (`9 of 14 pages`) the screen prints the
 * count instead of implying one with a fill.
 *
 * This is for a component waiting inside a page that has otherwise arrived.
 * A whole route waiting on its first query uses `RouteLoader` instead --
 * a centred spinner with the same kind of sentence, and the two timing
 * thresholds a route transition needs and an inline spinner does not.
 *
 * The skeleton primitives that used to live here (`Line`, `SkeletonCard`) are
 * gone with the layout-matching route skeletons they were built for. A block
 * standing in for a row has to guess the shape of data nobody has read yet,
 * and it guessed wrong often enough to be worth losing. `Skeleton` in
 * components/ui is still there for anything that genuinely knows its shape.
 */
export function Working({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-[10px]">
      <span
        className="size-[8px] shrink-0 animate-pulse rounded-full"
        style={{ background: 'var(--semantic-link)' }}
        aria-hidden
      />
      <span className="body-14 text-[var(--text-primary)]">{children}</span>
    </p>
  );
}
