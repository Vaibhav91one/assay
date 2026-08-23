import Link from 'next/link';
import { actionVariants } from './button';
import { notices, outstandingCount } from '@/lib/notifications';
import { Notifications } from './notifications';
import { RunAction } from './run-action';
import { runTarget } from '@/lib/scrapers';
import { Settings } from 'lucide-react';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

/**
 * Screen chrome: what this screen is, and one plain fact about its state.
 *
 * The status slot takes a sentence, never a count on its own -- "2 waiting on
 * you" is actionable where "2" is a number someone has to interpret.
 *
 * `action` replaces the Settings link on screens that have a better right-hand
 * verb of their own (Explain copies a proof id). There is only ever one,
 * because the one-primary law does not stop at the page body. Pass `null` for
 * none -- Settings itself must not offer a button to Settings. Both properties
 * survive the control becoming a glyph: it is the same slot, drawn smaller.
 *
 * Settings gets no dot. The bell's dot means work is outstanding and the
 * queue can say when that is true; nothing on Settings can, so a dot there
 * would either be permanent or invented, and both teach the reader to stop
 * seeing dots.
 *
 * `scraper` is the third control, and it is a STRING rather than a node on
 * purpose. Every other verb on this bar is the screen's own, so the screen
 * hands it over built; asking for a run is not -- it is the same control
 * everywhere and it has to keep the same refusals everywhere, so the chrome
 * builds it and the screen only says which page it would run. Naming one is
 * what a screen with a scraper in hand does -- a run detail, a proof, a
 * conversation that built one; `undefined` falls back to the only scraper and
 * draws nothing when there is more than one, because there is no honest
 * "current" scraper on a table that spans them all. `null` suppresses it, for
 * the one screen that already offers the control in its own body.
 *
 * That makes three controls where the comment above says one, and the law it
 * states is unchanged: `action` is still the single right-hand verb belonging
 * to THIS screen. Activity and the run control are the chrome's, present on
 * every screen for the same reason -- "something is waiting on you" and "run
 * it again" were both reachable from exactly one screen, and being reachable
 * from exactly one screen is what made them invisible.
 */
export async function TopBar({
  title,
  status,
  action,
  notifications,
  scraper,
}: {
  title: string;
  status?: string;
  action?: React.ReactNode;
  notifications?: React.ReactNode;
  /** The scraper a run would apply to. `null` to suppress the control. */
  scraper?: string | null;
}) {
  // Fetched here rather than passed by each screen: the bell belongs to the
  // chrome, and eight screens each remembering to thread it through is eight
  // chances for one to forget and quietly show no badge.
  const list = notifications === undefined ? await notices() : [];
  const run = scraper === null ? null : await runTarget(scraper);

  return (
    <header className="flex h-[64px] w-full items-center justify-between pl-[24px] pr-[32px]">
      <div className="flex min-w-0 items-center gap-[22px]">
        {/* The collapse control the rail's header draws. It lives here because
            it has to stay reachable once the rail is collapsed to icons. */}
        <SidebarTrigger className="-ml-[4px] size-[28px] shrink-0 text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)] hover:text-[var(--text-primary)]" />
        {/* Truncating, not `shrink-0`. Every title used to be a word Home,
            Runs, Schedule and could never outgrow the bar; a conversation's
            title is the operator's own first sentence, and an unshrinkable one
            pushed straight through Activity and Settings on a narrow window. */}
        <h1 className="nav-15 min-w-0 truncate text-[var(--text-primary)]">{title}</h1>
        {/* Shrinks ahead of the title, not alongside it. Flex divides an
            overflow between both, so the run detail -- short title, long status
            -- spent three of its pixels on "Run 41" and rendered "Run 4...".
            The status is the sentence that can afford to lose its tail. */}
        {status && <p className="meta-13 shrink-[6] truncate text-[var(--text-secondary)]">{status}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-[12px]">
        {/* Absent, never disabled. A control that is on every screen and dead
            on most of them teaches the reader to stop looking at that corner,
            and there is no honest disabled state to offer here anyway: on a
            table spanning four scrapers the answer to "run which one" is not
            "not yet", it is that the question has no subject. */}
        {run && (
          <RunAction
            slug={run.slug}
            fields={run.fields}
            paused={run.paused}
            workers={run.workers}
          />
        )}
        {/* Activity sits beside the right-hand control on every screen, so
            "something is waiting on you" is reachable from wherever you are
            rather than only from the one screen that lists it. */}
        {notifications ?? <Notifications items={list} count={outstandingCount(list)} />}
        {action !== undefined ? (
          action
        ) : (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger
                render={<Link href="/settings" />}
                className={actionVariants({ variant: 'icon' })}
                aria-label="Settings"
              >
                <Settings size={16} strokeWidth={1.5} aria-hidden />
              </TooltipTrigger>
              <TooltipContent side="bottom">Settings</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
    </header>
  );
}
