/**
 * `Bar` on `06 · Components`: a proportion with a real denominator.
 *
 * Only ever drawn where the denominator is a count of things that happened --
 * runs, pages, records. It is never a progress indicator for work in flight,
 * because that would need a denominator nobody has.
 *
 * Zero draws no fill at all. The Figma master gives `Seen=0` the same 2px stub
 * as `Seen=1`, which makes "never once" and "once in sixty" the same picture;
 * a zero that looks like a one is the exact class of error this product exists
 * to refuse. One or more gets the stub so a tiny count stays visible.
 */
export function Bar({
  value,
  of,
  width = 90,
  tone = 'var(--semantic-link)',
}: {
  value: number;
  of: number;
  width?: number;
  tone?: string;
}) {
  const fill = value <= 0 || of <= 0 ? 0 : Math.max(2, Math.round((value / of) * width));

  return (
    <span
      role="img"
      aria-label={`${value} of ${of}`}
      className="block h-[6px] shrink-0 overflow-hidden rounded-[3px] bg-[var(--border-hairline)]"
      style={{ width }}
    >
      {fill > 0 && (
        <span className="block h-full rounded-[3px]" style={{ width: fill, background: tone }} />
      )}
    </span>
  );
}
