import { useSyncExternalStore } from 'react';

// No 'use client' here on purpose: the constants below have to stay importable
// from a server component. Only `usePrefersReducedMotion` is client-only, and
// a hook is client-only by being called, not by being imported.

/**
 * The same numbers `app/motion.css` declares, in a form JS can do arithmetic
 * on. Two copies of one fact is a risk, so the rule is: CSS is the source, and
 * anything here that drifts from it is a bug in this file. Reach for these
 * only where a number has to be computed -- a stagger delay, a setTimeout that
 * must outlast a transition. For a plain style, use `var(--duration-pop)` and
 * let the cascade do it.
 *
 * Milliseconds throughout, so `${DURATION.pop}ms` is the only formatting.
 */
export const DURATION = {
  tint: 100,
  pop: 160,
  glide: 220,
  reveal: 300,
  expand: 360,
  settle: 500,
  stagger: 90,
  loaderDelay: 220,
  loaderMin: 500,
  shimmer: 1400,
  spin: 700,
  eq: 900,
} as const;

export const EASE = {
  glide: 'cubic-bezier(0.23, 1, 0.32, 1)',
  pop: 'cubic-bezier(0.16, 1, 0.3, 1)',
} as const;

const QUERY = '(prefers-reduced-motion: reduce)';

function subscribe(onChange: () => void) {
  const mq = window.matchMedia(QUERY);
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}

/**
 * True when the OS asks for less motion.
 *
 * Most components should not call this. `motion.css` already neutralises every
 * animation and transition under the same media query, globally, so CSS-driven
 * motion is handled without a line of JS. This is for the cases CSS cannot
 * reach: a sweep driven by requestAnimationFrame, a transition whose end you
 * are waiting on, a component that should render a different thing rather than
 * the same thing held still.
 *
 * Returns false during SSR and on the first client render, then corrects. That
 * is the honest answer -- the server does not know the user's setting -- and it
 * is safe here because being wrong for one frame costs at most one frame of
 * motion, which is what the flag was going to allow anyway.
 */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  );
}
