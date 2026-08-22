'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';

/**
 * One highlight that travels, instead of every row lighting its own lamp.
 *
 * The difference is visible: when each row owns its background, moving between
 * two rows is one thing switching off and another switching on, and the eye
 * reads two events. When a single absolutely-positioned band animates its
 * `top` and `height`, the eye reads one object moving, and the list feels like
 * a track rather than a set of buttons.
 *
 * Measurement is `offsetTop` / `offsetHeight` against the offset parent, so
 * the element you spread `style` onto must be a child of a `position:
 * relative` container -- the same one the rows live in.
 *
 * useLayoutEffect, not useEffect: the band has to be placed in the same frame
 * the active row changed, or it starts its 220ms journey from a stale spot.
 */

/** Browsers get layout timing; the server gets no warning. */
const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

export type Glide<T extends HTMLElement = HTMLElement> = {
  /** `ref={glide.setRef(i)}` on each row. */
  setRef: (index: number) => (el: T | null) => void;
  /** Spread onto one absolutely-positioned, `aria-hidden` span. */
  style: React.CSSProperties;
};

export function useGlide<T extends HTMLElement = HTMLElement>(
  activeIndex: number | null,
  /** Rows currently rendered. Changing it re-measures and drops stale refs. */
  length: number,
): Glide<T> {
  const rows = useRef<(T | null)[]>([]);
  const [box, setBox] = useState<{ top: number; height: number } | null>(null);
  // The source library only ever shows the band once a row has been engaged,
  // and that is worth keeping: a highlight that fades in at mount claims a
  // selection the user has not made. Once engaged it stays engaged, so leaving
  // the list does not make it flash out and back in.
  const engaged = useRef(false);

  useIsomorphicLayoutEffect(() => {
    rows.current.length = length;
    const el = activeIndex == null ? null : rows.current[activeIndex];
    if (!el) return; // keep the last box so the band fades out in place
    engaged.current = true;
    setBox({ top: el.offsetTop, height: el.offsetHeight });
  }, [activeIndex, length]);

  const visible = activeIndex != null && box != null;

  return {
    setRef: (index: number) => (el: T | null) => {
      rows.current[index] = el;
    },
    style: {
      top: box?.top ?? 0,
      height: box?.height ?? 0,
      opacity: visible ? 1 : 0,
      // Before the first engagement there is nothing to travel from, so the
      // band must appear where it is rather than slide in from row zero.
      transition: engaged.current
        ? 'top var(--duration-glide) var(--ease-glide), height var(--duration-glide) var(--ease-glide), opacity var(--duration-pop) var(--ease-glide)'
        : 'none',
    },
  };
}

// ponytail: measures on activeIndex/length change only. A row that resizes
// while it is the active one leaves the band behind. Add a ResizeObserver on
// the offset parent if that ever shows up in practice -- it has not yet.
