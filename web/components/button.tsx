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
  'inline-flex shrink-0 cursor-pointer items-center rounded-[var(--radius-control)] outline-none transition-colors duration-[var(--duration-tint)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--semantic-link)] disabled:pointer-events-none disabled:opacity-60',
  {
    variants: {
      variant: {
        /** The outlined right-hand control. Settings, Activity, Check again, a filter. */
        outline:
          'press-row meta-12_5 gap-[8px] border border-[var(--border-default)] bg-[var(--surface-card)] py-[8px] pl-[12px] pr-[14px] text-[var(--text-primary)] hover:bg-[var(--surface-subtle)]',
        /** The one orange verb. New scrape, Start watching. Never two at once on a screen. */
        primary:
          'press-wide body-13_5 h-[40px] gap-[10px] bg-[var(--accent-brand)] px-[16px] text-[var(--accent-on-primary)]',
        /** The same wide action where the verb is navigation rather than commitment. */
        link: 'press-wide body-13_5 h-[40px] gap-[10px] bg-[var(--semantic-link)] px-[16px] text-[var(--accent-on-primary)] hover:bg-[var(--semantic-link-hover)]',
        /** Committing to an answer. Use this. Green because it resolves, not because it is safe. */
        success:
          'press-row meta-12_5 h-[36px] gap-[8px] bg-[var(--semantic-success)] px-[15px] text-[var(--accent-on-primary)]',
        /** A command or value you are meant to copy. Mono, so it reads as the thing itself. */
        chip: 'press-row mono-value-12_5 gap-[8px] border border-[var(--border-default)] bg-[var(--surface-card)] px-[12px] py-[7px] text-left text-[var(--text-primary)] hover:bg-[var(--surface-subtle)]',
        /** A real choice that must not compete with the primary one. No box at all. */
        quiet: 'press-row meta-13 gap-[6px] text-[var(--text-primary)] hover:underline',
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
  return (
    <button
      type="button"
      data-slot="action"
      data-variant={variant ?? 'outline'}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(actionVariants({ variant }), className)}
      {...props}
    >
      {loading ? (
        <Spinner size={iconSize} />
      ) : Icon ? (
        <Icon size={iconSize} strokeWidth={1.5} aria-hidden />
      ) : null}
      {children}
    </button>
  );
}
