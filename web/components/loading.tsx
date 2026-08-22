import { Skeleton } from '@/components/ui/skeleton';

/**
 * The two pieces every loading screen is made of.
 *
 * `Working` says what is happening, in a sentence, next to a dot in the
 * in-motion colour. There is deliberately no bar: a bar is a promise of a
 * denominator, and a route that is waiting on one query does not have one.
 * Where a real denominator exists (`9 of 14 pages`) the screen prints the
 * count instead of implying one with a fill.
 *
 * `Line` is a grey block roughly the width of the row it stands in for, so the
 * layout does not jump when the data lands.
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

export function Line({ w, h = 10 }: { w: number | string; h?: number }) {
  return <Skeleton className="shrink-0 rounded-[4px]" style={{ width: w, height: h }} />;
}

/** A content card, hairline rather than default border: it holds nothing yet. */
export function SkeletonCard({
  className = '',
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`flex flex-col items-start gap-[14px] rounded-[var(--radius-card)] border border-[var(--border-hairline)] bg-[var(--surface-card)] p-[24px] ${className}`}
    >
      {children}
    </div>
  );
}
