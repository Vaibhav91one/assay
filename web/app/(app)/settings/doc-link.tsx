import { ArrowUpRight } from 'lucide-react';
import { actionVariants } from '@/components/button';

/**
 * The way out of this screen and into the page that explains one connection.
 *
 * The sign-in panel already does this -- a per-credential "See documentation"
 * landing on the section for that credential rather than four buttons on one
 * page the operator then has to search -- and the Connections tab reports the
 * same three things, so it says it the same way. Same words, same glyph,
 * `test/signin-keys.test.ts` asserts the shape of the hrefs over there.
 *
 * `quiet` rather than the boxed `outline` the sign-in card uses, and that is
 * the one deliberate difference. Sign-in is a card with one action per row and
 * a box is the row's point. This tab is a report: a boxed control beside a line
 * that reads "Connected" is the exact thing the Check again button was moved
 * for -- a conspicuous action next to a settled state implies the state is
 * uncertain. `quiet` is the recipe's own answer to that ("a real choice that
 * must not compete"), so the volume changes and the recipe does not.
 *
 * `actionVariants` rather than `Button` because this is a link. `Button`
 * renders a `<button>`, and a destination reached by pressing a button is not
 * middle-clickable, not copyable, not a link in a screen reader's link list.
 * `copy.tsx` and `model-access.tsx` already take the recipe this way.
 */
export function DocLink({
  href,
  name,
  className,
}: {
  href: string;
  /**
   * Which connection this explains. It never shows -- the visible words are
   * the same on every one of these by design -- but three links all reading
   * "See documentation" are three identical entries in a screen reader's link
   * list, so the accessible name says which.
   */
  name: string;
  className?: string;
}) {
  return (
    <a
      href={href}
      // A NEW TAB, because of when this is pressed. Someone reads it while
      // half-way through configuring a connector -- a key pasted into the
      // environment, the restart not done -- and following it in place throws
      // away where they were and makes them find their way back. The glyph
      // already promised a departure; this makes the promise the harmless one.
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`See documentation for ${name} (opens in a new tab)`}
      className={actionVariants({ variant: 'quiet', className })}
    >
      See documentation
      <ArrowUpRight size={14} strokeWidth={1.5} className="text-[var(--text-muted)]" aria-hidden />
    </a>
  );
}
