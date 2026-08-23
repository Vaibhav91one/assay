import Link from 'next/link';
import { actionVariants } from './button';
import { activity } from '@/lib/notifications';
import { Notifications } from './notifications';
import { RunAction } from './run-action';
import { runTarget, runTargets } from '@/lib/scrapers';
import { Settings } from 'lucide-react';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { t } from '@/lib/copy';

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
 * conversation that built one; `undefined` means the screen has no "current"
 * scraper -- a table spanning four of them does not -- and the control then
 * offers ALL of them and lets a person say which. It used to draw nothing in
 * that case, which put the product's commonest action on two screens out of
 * eight. `null` suppresses it, for the one screen that already offers the
 * control in its own body.
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
  //
  // `activity()` and not `notices()` + `outstandingCount()`: the badge's held-
  // cell portion is an uncapped count from the queue, so this number is the
  // one the rail and Home show rather than a third answer.
  const bell = notifications === undefined ? await activity() : { items: [], count: 0 };
  // A named slug means the screen knows which scraper it is about; `undefined`
  // means it does not, and every scraper is offered rather than none. `null` is
  // the only thing that suppresses the control -- see the note below.
  const runs =
    scraper === null
      ? []
      : scraper
        ? [await runTarget(scraper)].filter((r) => r !== null)
        : await runTargets();

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
            on most of them teaches the reader to stop looking at that corner.
            What is absent is now only the case where there is genuinely
            nothing to run: no scrapers at all, or a screen that says `null`
            because it offers the control in its own body. A table spanning
            four scrapers used to draw nothing here -- the question "run which
            one" was treated as having no answer when it in fact has four, and
            the dialog has listed them one per row all along. */}
        {runs.length > 0 && <RunAction targets={runs} workers={runs[0]!.workers} />}
        {/* Activity sits beside the right-hand control on every screen, so
            "something is waiting on you" is reachable from wherever you are
            rather than only from the one screen that lists it. */}
        {notifications ?? <Notifications items={bell.items} count={bell.count} />}
        {action !== undefined ? (
          action
        ) : (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger
                render={<Link href="/settings" />}
                className={actionVariants({ variant: 'icon' })}
                aria-label={t('nav.settings')}
              >
                <Settings size={16} strokeWidth={1.5} aria-hidden />
              </TooltipTrigger>
              <TooltipContent side="bottom">{t('nav.settings')}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
    </header>
  );
}
