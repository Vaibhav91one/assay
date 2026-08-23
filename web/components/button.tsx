import { cva, type VariantProps } from 'class-variance-authority';
import type { LucideIcon } from 'lucide-react';
import { Spinner } from '@/components/motion/shimmer';
import { cn } from '@/lib/utils';

/**
 * Every button the app actually draws, in one recipe.
 *
 * It exists because the same control was being hand-written per screen and
 * each copy drifted by a pixel: the outlined action shipped as `py-[8px]
 * pl-[12px] pr-[14px]`, as `py-[7px] pl-[11px] pr-[13px]`, as `py-[7px]
 * pl-[12px] pr-[14px]` and as `px-[12px] py-[9px]`, all on the same screen
 * family. Nobody chose four values; four values is what you get when there is
 * no home for one. `py-[8px] pl-[12px] pr-[14px]` won because it is the one
 * that was already extracted into a name (`TOP_BAR_ACTION`, now this file's
 * `outline`) and the one on every screen in the app, so it is the value the
 * eye is already calibrated to. The asymmetric left/right is deliberate and
 * the two `px-` copies had lost it: a glyph on the left needs less room than
 * a word on the right.
 *
 * This is NOT `components/ui/button.tsx`. That one is shadcn's, it is alive --
 * `SidebarTrigger` renders it, and the top bar renders that on every screen --
 * and it speaks the shadcn palette (`bg-primary`, `h-9`, `text-sm`). Bending
 * it to serve the product's buttons too would leave one component answering to
 * two design languages, which is the thing `ui/tooltip.tsx` moved a whole
 * family to Base UI to avoid. Two files, two jobs.
 *
 * Variants are families that exist, not a grid of possibilities: each one has
 * exactly one size because in the product it has exactly one size. There is no
 * `size` axis until a second real size turns up. Where a family had drifted the
 * canonical value is the majority on each axis -- `primary` was `h-[40px]`
 * twice against `h-[38px]` once, `px-[16px]` twice against `px-[18px]` once,
 * `gap-[10px]` twice against `gap-[12px]` once, and `--radius-control` twice
 * against a hardcoded `9px` once.
 *
 * Press, hover tint and the focus ring are in the base rather than left to the
 * caller, because the audit that produced this file found them applied to some
 * buttons and not others -- "Use this" and "Decide", the two most consequential
 * controls in the product, had no press at all. A recipe you can forget half of
 * is not a recipe.
 *
 * Nothing here may ever import from a module that reaches the server. This
 * file replaced `components/chrome.ts`, which existed only because the outlined
 * recipe once lived in `top-bar.tsx` and a client component importing it
 * dragged the notifications query, and so `pg`, and so `net`/`tls`/`dns`, into
 * the browser bundle. The guard is now structural rather than documentary --
 * `cva`, `cn` and `Spinner` are all pure -- and it stays that way.
 */
export const actionVariants = cva(
  // Press, hover tint and focus ring come from the motion system rather than
  // from each variant, so a button cannot ship without them. See docs/MOTION.md.
  //
  // `focus-ring` replaced four focus-visible: utilities that drew a plain 2px
  // browser-style outline. Same promise -- the keyboard is always visible --
  // in the app's own palette. The class is in motion.css, with the contrast
  // measurements that chose its colour.
  'focus-ring inline-flex shrink-0 cursor-pointer items-center rounded-[var(--radius-control)] transition-colors duration-[var(--duration-tint)] disabled:pointer-events-none disabled:opacity-60',
  {
    variants: {
      // Each variant declares its gap ONCE, as --action-gap, and spends it on
      // the flex gap. The icon swap needs that same number to know how far to
      // slide, and reading it from the variable is what stops the two drifting
      // -- a gap changed here changes the slide with it.
      variant: {
        /** The outlined right-hand control. Settings, Activity, Check again, a filter. */
        outline:
          'press-row meta-12_5 [--action-gap:8px] gap-[var(--action-gap)] border border-[var(--border-default)] bg-[var(--surface-card)] py-[8px] pl-[12px] pr-[14px] text-[var(--text-primary)] hover:bg-[var(--surface-subtle)]',
        /**
         * The one orange verb. New scrape, Start watching. Never two at once on
         * a screen.
         *
         * KNOWN CONTRAST TRADE-OFF, RECORDED RATHER THAN FIXED. White on
         * `--accent-brand` (#ff4d00) measures 3.33:1. At `body-13_5` that is
         * under WCAG AA's 4.5:1 for normal text, and every honest fix is a
         * brand decision this file is not allowed to take:
         *
         *   - darkening the fill to ~#d63f00 reaches 4.59:1 and is a different
         *     orange, on the one control the product's identity lives on;
         *   - black on #ff4d00 is 6.31:1 and reads as a warning, not a verb;
         *   - a darker orange only where the text is small is two brand
         *     oranges in one product, which is worse than one that misses.
         *
         * What holds in the meantime: the control is a 40px filled target
         * carrying a glyph as well as a word, so the label is never the only
         * signal, and the focus ring is `--accent-brand` on the page ground
         * rather than on the fill. `--accent-brand` is defined once, in
         * `app/tokens.css`; changing it is the fix, and it is a design call.
         */
        primary:
          'press-wide body-13_5 h-[40px] [--action-gap:10px] gap-[var(--action-gap)] bg-[var(--accent-brand)] px-[16px] text-[var(--accent-on-primary)]',
        /** The same wide action where the verb is navigation rather than commitment. */
        link: 'press-wide body-13_5 h-[40px] [--action-gap:10px] gap-[var(--action-gap)] bg-[var(--semantic-link)] px-[16px] text-[var(--accent-on-primary)] hover:bg-[var(--semantic-link-hover)]',
        /**
         * Setting something going, from the bar at the top of every screen.
         * Ask for a run.
         *
         * `outline`'s geometry, including the border, because it stands in that
         * row beside Activity and Settings and a control 3px taller than its
         * neighbours is the drift this file exists to stop. The border is the
         * same green as the fill, so it reads as solid and still measures the
         * same box. Green rather than `primary`'s orange because orange is the
         * one verb per screen and Home already spends it on New scrape.
         *
         * White on `--semantic-success` is 5.02:1 -- measured, not assumed,
         * since the a11y override in globals.css moved the token to #15803d.
         * That clears 4.5:1 for body text outright; the Play glyph and the
         * words remain so the label is still never the only signal.
         */
        start:
          'press-row meta-12_5 [--action-gap:8px] gap-[var(--action-gap)] border border-[var(--semantic-success)] bg-[var(--semantic-success)] py-[8px] pl-[12px] pr-[14px] text-[var(--accent-on-primary)]',
        /** Committing to an answer. Use this. Green because it resolves, not because it is safe. */
        success:
          'press-row meta-12_5 h-[36px] [--action-gap:8px] gap-[var(--action-gap)] bg-[var(--semantic-success)] px-[15px] text-[var(--accent-on-primary)]',
        /** A command or value you are meant to copy. Mono, so it reads as the thing itself. */
        chip: 'press-row mono-value-12_5 [--action-gap:8px] gap-[var(--action-gap)] border border-[var(--border-default)] bg-[var(--surface-card)] px-[12px] py-[7px] text-left text-[var(--text-primary)] hover:bg-[var(--surface-subtle)]',
        /** A real choice that must not compete with the primary one. No box at all. */
        quiet:
          'press-row meta-13 [--action-gap:6px] gap-[var(--action-gap)] text-[var(--text-primary)] hover:underline',
        /** A verb with no room for its word. Always carries an aria-label. */
        icon: 'press-icon size-[32px] justify-center border border-[var(--border-default)] text-[var(--text-primary)] hover:bg-[var(--surface-subtle)]',
      },
    },
    defaultVariants: { variant: 'outline' },
  },
);

export type ActionVariant = NonNullable<VariantProps<typeof actionVariants>['variant']>;

export function Button({
  variant,
  icon: Icon,
  iconSize = 15,
  loading = false,
  disabled,
  className,
  children,
  style,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof actionVariants> & {
    /** The glyph, where the verb has one. Swapped for a Spinner while loading. */
    icon?: LucideIcon;
    iconSize?: number;
    /**
     * Work is in flight. Disables the button as well as marking it, because a
     * control that can be pressed twice is a control that will be.
     */
    loading?: boolean;
  }) {
  /**
   * The hover swap, and the three things that decide whether a button gets it.
   *
   * It is a condition on the render rather than a list of variants, because
   * "has a glyph on the left" is a fact about the call site and not about the
   * family: `outline` carries one on Check again and none on a bare label, and
   * a variant list would be wrong for one of those two. So:
   *
   * - there has to BE a left glyph to send away;
   * - there has to be a label for it to travel past -- `icon` is the whole
   *   button, and sliding it out leaves an empty box;
   * - and not while loading, when the glyph is a Spinner saying something.
   */
  const swap = !loading && Boolean(Icon) && children != null && variant !== 'icon';

  return (
    <button
      type="button"
      data-slot="action"
      data-variant={variant ?? 'outline'}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(actionVariants({ variant }), swap && 'icon-swap', className)}
      // The one number the swap cannot read off a class. The glyph's box is
      // whatever iconSize the caller asked for, and the slide is exactly that
      // plus the variant's own --action-gap.
      style={swap ? ({ '--swap-slot': `${iconSize}px`, ...style } as React.CSSProperties) : style}
      {...props}
    >
      {loading ? (
        <Spinner size={iconSize} />
      ) : Icon ? (
        <Icon
          size={iconSize}
          strokeWidth={1.5}
          aria-hidden
          className={swap ? 'swap-lead shrink-0' : undefined}
        />
      ) : null}
      {swap ? <span className="swap-label">{children}</span> : children}
      {/* The same glyph a second time, and aria-hidden like the first: the
          button's accessible name is its label, and a decorative copy of a
          decorative glyph must not turn into a second announcement. */}
      {swap && Icon && (
        <Icon size={iconSize} strokeWidth={1.5} aria-hidden className="swap-trail shrink-0" />
      )}
    </button>
  );
}
