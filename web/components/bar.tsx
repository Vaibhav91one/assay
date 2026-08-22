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
 *
 * The fill grows from nothing when the bar arrives, and only then. That is not
 * a choice this component has to police: `motion-bar-fill` is a CSS animation,
 * and a CSS animation runs once per element mount, so re-rendering a bar that
 * is already on screen does not replay it. docs/MOTION.md §5 asks for exactly
 * that -- a bar that fills on every render teaches the reader to ignore it --
 * and it costs no state, no ref and no "have I run yet" flag.
 *
 * What does NOT animate is the number. The value is a measurement, and §5 is
 * explicit that a number someone needs to read must not be animated into
 * place. `aria-label` carries the real figure from the first frame, and the
 * callers that print a count beside the bar (fields, the gallery) print it as
 * an ordinary sibling that is readable before the fill has moved. Under
 * reduced motion the bar is simply drawn at its final width: the information
 * is the width, so it has to be there instantly rather than quickly.
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
        <span
          className="motion-bar-fill block h-full rounded-[3px]"
          style={{ width: fill, background: tone }}
        />
      )}
    </span>
  );
}
