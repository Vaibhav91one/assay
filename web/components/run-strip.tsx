'use client';

import Link from 'next/link';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { DURATION } from '@/lib/motion';
import { when } from '@/lib/when';

/**
 * One bar per run, oldest left.
 *
 * Shared by home and Runs because it is the same idiom in both: a run that
 * held something is taller and amber, so a held run is findable at a glance in
 * a row of sixty. Clean runs are deliberately the quiet ones.
 *
 * Every bar is a link to its own run and says what that run was. It used to be
 * a `<span>` with a `title`, which is three failures in one: a native tooltip
 * cannot be reached from the keyboard, cannot be styled, and took a second and
 * a half to appear. Now each bar is a real anchor -- tabbable, with the whole
 * sentence as its accessible name so a screen reader has it without hovering
 * anything -- and the visible panel is the app's own tooltip on
 * `--duration-pop`.
 *
 * Every word in that sentence comes off the row the strip was handed. Nothing
 * is inferred and nothing is filled in: see `outcomeOf` for the one place
 * where the temptation was real and was refused.
 *
 * The hit target is the part worth reading twice. A 3px bar is not a target,
 * so each anchor is 8px wide with the bar drawn inside it and the flex gap
 * taken down to zero -- 3px of bar plus 5px of gap was already an 8px pitch,
 * so the strip lands on exactly the same pixels it did before while every bar
 * becomes nearly three times easier to hit. Full strip height too, so a short
 * clean bar is no harder to point at than a tall held one.
 */
export interface Bar {
  runId: number;
  held: boolean;
  /**
   * The four fields below are optional because the two callers do not have the
   * same query behind them, and a bar says only what its caller actually
   * knows. `homeStats` supplies `at`; `runsView` has all four. Nothing here
   * has a default that would let an absent fact read as a present one.
   */
  at?: Date | string;
  outcome?: 'clean' | 'healed' | 'held';
  scraper?: string;
  heldField?: string | null;
}

export function RunStrip({
  bars,
  label,
  from,
  to,
}: {
  bars: Bar[];
  label?: string;
  from?: string;
  to?: string;
}) {
  if (bars.length === 0) return null;

  return (
    <div className="flex flex-col gap-[6px]">
      {label && <p className="label-10 text-[var(--text-muted)]">{label}</p>}
      {/*
        One provider for the whole strip rather than one per bar, so sweeping
        across sixty bars is a single tooltip that moves rather than sixty that
        each open and close. The delay is --duration-tint: the same 100ms the
        rest of the app spends below the threshold of being noticed, which is
        the right threshold for "has the pointer settled on this bar, or is it
        just passing over it".
      */}
      <TooltipProvider delay={DURATION.tint}>
        <div className="flex items-end gap-0">
          {bars.map((b) => {
            const said = describe(b);
            return (
              <Tooltip key={b.runId}>
                <TooltipTrigger
                  render={<Link href={`/runs/${b.runId}`} />}
                  aria-label={said}
                  className="focus-ring group flex h-[26px] shrink-0 items-end rounded-[2px] px-[2.5px]"
                >
                  {/* aria-hidden: the anchor's label already said all of this
                      in words, and a bar is a picture of it, not a second
                      copy of it. */}
                  <span
                    aria-hidden
                    className="w-[3px] rounded-[1px] transition-transform duration-[var(--duration-tint)] ease-pop group-hover:-translate-y-[3px]"
                    style={{
                      height: b.held ? 26 : 18,
                      background: b.held ? 'var(--semantic-warning)' : 'var(--accent-brand)',
                    }}
                  />
                </TooltipTrigger>
                <TooltipContent side="top">{said}</TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      </TooltipProvider>
      {(from || to) && (
        <div className="flex justify-between">
          <span className="caption-11 text-[var(--text-muted)]">{from}</span>
          <span className="caption-11 text-[var(--text-muted)]">{to}</span>
        </div>
      )}
    </div>
  );
}

/** The run, in the order someone reads a row: which, whose, when, what happened. */
function describe(b: Bar): string {
  const parts = [`run ${b.runId}`];
  if (b.scraper) parts.push(b.scraper);
  if (b.at) parts.push(when(b.at));
  parts.push(outcomeOf(b));
  return parts.join(' · ');
}

/**
 * What the run did, said only as far as the data goes.
 *
 * The temptation is to read `held: false` as "clean", and it is wrong. `held`
 * is one fact -- whether any cell was quarantined -- and a run with nothing
 * quarantined may still have healed a selector. `homeStats` knows only that
 * much, so on home a quiet bar says `nothing held`, which is exactly and only
 * what was measured. `runsView` computes a real three-way `outcome`, and where
 * that is supplied the strip can afford the more precise word.
 */
function outcomeOf(b: Bar): string {
  if (b.outcome === 'held' || (b.outcome === undefined && b.held)) {
    return b.heldField ? `held · ${b.heldField}` : 'held';
  }
  if (b.outcome) return b.outcome;
  return 'nothing held';
}
