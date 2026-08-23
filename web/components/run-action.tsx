'use client';

import Link from 'next/link';
import { Play } from 'lucide-react';
import { Button } from './button';
import { RunNow } from '@/app/(app)/schedule/run-now';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { t } from '@/lib/copy';

/**
 * "Ask for a run", from wherever you are.
 *
 * Until this existed the control lived on one screen, behind one mark on a
 * calendar: you had to be on Schedule, find the scraper's next-run dot, open
 * its dialog, and the button was in there. From Runs, from a run detail, from
 * the conversation that built the scraper, there was no way to trigger one at
 * all -- and it is the thing an operator does more often than anything else on
 * this product.
 *
 * WHAT IT DOES NOT DO is start a scrape. `RunNow` is imported whole rather
 * than re-implemented, and that is the entire reason this file is a wrapper
 * and not a button: that component carries the refusal on a paused scraper,
 * the worker-liveness sentence read off a Postgres advisory lock, and the
 * watch that reads the run RECORD instead of spinning on a timer. A second
 * control that enqueued without any of it would be the spinner-over-a-promise
 * this product exists to condemn, and the first thing to drift would be the
 * wording of a refusal.
 *
 * The trigger says the same words as the section it opens. That repetition is
 * deliberate: a button labelled `Run` would promise something neither it nor
 * anything behind it can keep.
 *
 * The props are spelled out here rather than imported from `lib/scrapers.ts`
 * because that module opens a Postgres pool. A type-only import would erase,
 * but `web/components/chrome.ts` is the scar from the last time a client
 * component's import of a server module dragged `net`/`tls`/`dns` into the
 * browser bundle, and one line of duplicated shape is cheaper than the guard.
 *
 * A LIST, NOT ONE SCRAPER. It took a single slug, and the bar drew nothing at
 * all on an instance watching more than one page -- `runTarget()` answers null
 * when there is no "current" scraper to name, and the control simply vanished.
 * `RunNow` has always rendered one row per scraper, refusal and all, so
 * offering the choice costs nothing but the array: one scraper is the same
 * dialog it was, and four is four rows with four buttons rather than no button.
 */
export function RunAction({
  targets,
  workers,
}: {
  /** One scraper, or every scraper this instance watches. Never empty. */
  targets: { slug: string; fields: number; paused: boolean }[];
  workers: number;
}) {
  // Named when there is a name to use. With four rows in the dialog the title
  // cannot be one of the four, so it asks the question the rows answer.
  const one = targets.length === 1 ? targets[0]! : null;

  return (
    <Dialog>
      {/* `asChild` so the trigger IS the product's Button -- press, focus ring
          and the icon swap come from the one recipe rather than from a second
          control hand-rolled to look like it.
          `start`, not `outline`: this is the only control in the bar that sets
          something going, and an outlined box said nothing about that. See the
          variant in components/button.tsx for the green and its contrast. */}
      <DialogTrigger asChild>
        <Button variant="start" icon={Play} iconSize={16}>
          {/* The words go, the accessible name does not. Below 768 this control
              shares a 390px bar with the rail trigger, Activity, Settings and
              the screen's title; `sr-only` gives back ~90px of it and leaves a
              Play glyph, which is what this button is anyway. `hidden` would
              have taken the button's only accessible name with it. */}
          <span className="sr-only md:not-sr-only">{t('schedule.ask.button')}</span>
        </Button>
      </DialogTrigger>

      <DialogContent className="max-h-[85vh] gap-[18px] overflow-y-auto sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle className="title-20 text-[var(--text-primary)]">
            {one ? one.slug : t('run.action.title')}
          </DialogTitle>
          <DialogDescription className="body-13_5 text-[var(--text-secondary)]">
            {one ? t('run.action.moves.one') : t('run.action.moves.any')}{' '}
            {t('run.action.moves.rest')}
          </DialogDescription>
        </DialogHeader>

        {/* `RunNow` verbatim, list and all -- it owns the paused refusal, the
            worker-liveness sentence and the watch on the run record, and this
            file exists precisely so none of that is re-implemented per row. */}
        <RunNow workers={workers} scrapers={targets} />

        {/* Where to go next, and the honest reason this is a link and not a
            second button in the bar: Assay has no UI for changing a cadence, so
            "schedule this scraper" is a screen to read, not an action to take.
            The calendar is where the one stored next run lives. */}
        <p className="pt-[18px]">
          <DialogClose asChild>
            <Link href="/schedule" className="meta-12_5 text-[var(--semantic-link)] hover:underline">
              {one ? t('run.action.due.one') : t('run.action.due.many')}
            </Link>
          </DialogClose>
        </p>
      </DialogContent>
    </Dialog>
  );
}
