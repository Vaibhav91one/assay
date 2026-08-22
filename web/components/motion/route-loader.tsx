'use client';

import { useEffect, useRef, useState } from 'react';
import { Spinner } from '@/components/motion/shimmer';
import { DURATION } from '@/lib/motion';

/**
 * The body of a route's `loading.tsx`: a spinner and the sentence saying what
 * is being read, centred in the space the page is about to fill.
 *
 * Two thresholds, both declared in motion.css, because a loader with neither
 * is worse than no loader at all:
 *
 *   - Nothing is drawn for --duration-loader-delay (220ms). A navigation that
 *     resolves inside that renders no loader, so a warm route simply arrives
 *     rather than flashing a spinner on the way past.
 *   - Once drawn it stays for --duration-loader-min (500ms), so it cannot
 *     strobe.
 *
 * The second threshold is the awkward one and it is worth saying why the code
 * below looks like this. In the App Router, React swaps a `loading.tsx`
 * segment out the instant the page is ready: there is no unmount hook to hold
 * it open, and nothing to animate against on the way out. So the effect
 * cleanup clones the loader, pins the clone over the box the original
 * occupied, and lets that copy serve out the rest of the hold and then fade.
 * The copy is outside React by then, which is the whole point -- React has
 * already moved on to the page. It is aria-hidden and pointer-events:none, so
 * it covers the arriving content without intercepting a click on it, and it
 * takes itself out of the DOM when the fade finishes.
 *
 * The fade-out is therefore real rather than implied: the arriving page is
 * already mounted and painted underneath, and the loader dissolves off it.
 *
 * ponytail: the ghost is a detached node on a setTimeout, not a reconciled
 * tree. Upgrade path is the View Transitions API, once Next's support for it
 * is no longer experimental.
 */
export function RouteLoader({ children }: { children: React.ReactNode }) {
  const [shown, setShown] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Captured here, at mount, on purpose. React detaches the ref before the
    // passive cleanup runs, but the node object stays valid once held.
    const node = box.current;
    let shownAt = 0;
    let rect: DOMRect | null = null;

    const appear = setTimeout(() => {
      shownAt = Date.now();
      // Measured while the node is still in the document -- by cleanup time it
      // has been detached and would measure zero. The outer box is flex-1 and
      // fills its space whether or not the label is in it yet, so this is the
      // same rect the visible loader will occupy.
      rect = node?.getBoundingClientRect() ?? null;
      setShown(true);
    }, DURATION.loaderDelay);

    return () => {
      clearTimeout(appear);

      // The navigation beat the delay: nothing was ever painted. Do not invent
      // an exit for it -- that would manufacture the very flash the delay is
      // there to prevent.
      if (!shownAt || !node || !rect) return;

      // Prefer a live measurement if one is still available (the window may
      // have been resized during the wait); fall back to the recorded rect,
      // which is what a detached node leaves us with.
      const live = node.getBoundingClientRect();
      const r = live.width ? live : rect;

      const ghost = node.cloneNode(true) as HTMLElement;
      // A copy of a live region would announce the same sentence a second time,
      // after the page it described has already arrived.
      ghost.removeAttribute('role');
      ghost.setAttribute('aria-hidden', 'true');
      ghost.dataset.loaderGhost = '';
      // Otherwise the clone replays its entrance, and `both` fill mode would
      // hold opacity against the fade below.
      ghost.classList.remove('motion-fade-in');
      Object.assign(ghost.style, {
        position: 'fixed',
        top: `${r.top}px`,
        left: `${r.left}px`,
        width: `${r.width}px`,
        height: `${r.height}px`,
        zIndex: '40',
        pointerEvents: 'none',
        opacity: '1',
        transition: 'opacity var(--duration-reveal) var(--ease-glide)',
      });

      // Navigating twice in quick succession would otherwise stack ghosts.
      document.querySelectorAll('[data-loader-ghost]').forEach((n) => n.remove());
      document.body.appendChild(ghost);

      const hold = Math.max(0, DURATION.loaderMin - (Date.now() - shownAt));
      setTimeout(() => {
        ghost.style.opacity = '0';
        setTimeout(() => ghost.remove(), DURATION.reveal);
      }, hold);
    };
  }, []);

  return (
    <div
      ref={box}
      // The live region is in the DOM from the first render and the sentence
      // is put into it later. A region that arrives already populated is
      // announced unreliably; one that is already there when its content
      // changes is announced properly.
      role="status"
      className={`flex flex-1 flex-col items-center justify-center gap-[14px] bg-[var(--bg-page)] ${
        shown ? 'motion-fade-in' : ''
      }`}
    >
      {shown && (
        <>
          <Spinner size={22} className="text-[var(--semantic-link)]" />
          <span className="body-14 text-[var(--text-primary)]">{children}</span>
        </>
      )}
    </div>
  );
}
