'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import { CircleAlert, Pause, Play, Trash2 } from 'lucide-react';
import { CADENCES } from 'assay/engine/agent/models';
import { Button } from '@/components/button';
import {
  Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  deleteScraper, pauseScraper, resumeScraper, scraperState, setCadence,
  type Lifecycle, type ScraperState,
} from './lifecycle-actions';

/**
 * Stop it, start it, change how often, throw it away.
 *
 * Until this existed the browser could create a scraper and could ask for a
 * run, and every other verb in its life was a terminal command. An operator
 * watching a scraper hammer a site it should not be hammering had no control on
 * the screen that was showing them it was happening.
 *
 * READ LIVE, LIKE `FieldControls` NEXT TO IT. Pause is `next_run_at IS NULL`, a
 * column any tab or the CLI can move, so the state is fetched when this mounts
 * and again after every action. Nothing about it is passed in as a prop that
 * could be stale by the time it is drawn.
 *
 * DELETE IS THE ONLY ONE BEHIND A DIALOG, and not because it is the loudest --
 * it is the only one that is not reversible. Pause keeps the cadence and the
 * history; resume undoes pause; a cadence can be set back. The engine refuses
 * to delete a target with runs on record at all (`deleteTarget`), so the dialog
 * guards the one case it will accept: a scraper made by mistake, before its
 * first run.
 */
export function ScraperLifecycle({ slug, className }: { slug: string; className?: string }) {
  // `undefined` is "not read yet" and `null` is "there is no such scraper".
  // One state cannot say both, and drawing controls for a target that is gone
  // is how a button ends up posting a slug nothing answers to.
  const [state, setState] = useState<ScraperState | null | undefined>(undefined);
  const [said, setSaid] = useState<Lifecycle | null>(null);
  const [cadence, setChosen] = useState('');
  const [pending, start] = useTransition();

  const read = useCallback(() => {
    scraperState(slug)
      .then((s) => {
        setState(s);
        if (s?.cadence) setChosen(s.cadence);
      })
      .catch((e: Error) => setSaid({ ok: false, detail: `Could not read ${slug}: ${e.message}` }));
  }, [slug]);

  useEffect(() => { read(); }, [read]);

  const act = (fn: () => Promise<Lifecycle>) =>
    start(async () => {
      setSaid(await fn());
      read();
    });

  if (state === undefined) {
    return <p className={`caption-11 text-[var(--text-muted)] ${className ?? ''}`}>Reading {slug}…</p>;
  }
  if (state === null) {
    return (
      <p className={`caption-11 text-[var(--text-muted)] ${className ?? ''}`}>
        {/* copy(G) */}
        Nothing under watch called {slug} any more.
      </p>
    );
  }

  // A stored cadence the menu does not offer -- `2d`, say, which the API
  // accepts and `CADENCES` deliberately does not list -- is added rather than
  // silently rewritten to the first option the moment this renders.
  const options = CADENCES.includes(cadence as never) || cadence === ''
    ? [...CADENCES]
    : [cadence, ...CADENCES];

  return (
    <div className={`flex flex-col gap-[10px] ${className ?? ''}`}>
      <div className="flex flex-wrap items-center gap-[8px]">
        {state.paused ? (
          <Button variant="outline" icon={Play} loading={pending} onClick={() => act(() => resumeScraper(slug))}>
            Resume {slug}
          </Button>
        ) : (
          <Button variant="outline" icon={Pause} loading={pending} onClick={() => act(() => pauseScraper(slug))}>
            Pause {slug}
          </Button>
        )}

        <label className="flex items-center gap-[8px]">
          <span className="caption-11 text-[var(--text-muted)]">every</span>
          <select
            value={cadence}
            onChange={(e) => setChosen(e.currentTarget.value)}
            aria-label={`How often ${slug} runs`}
            className="meta-12_5 rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-card)] px-[8px] py-[6px] outline-none"
          >
            {state.cadence === null && <option value="">mixed</option>}
            {options.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <Button
          variant="quiet"
          loading={pending}
          disabled={cadence === '' || cadence === state.cadence}
          onClick={() => act(() => setCadence(slug, cadence))}
        >
          Save cadence
        </Button>

        <DeleteDialog state={state} pending={pending} onConfirm={() => act(() => deleteScraper(slug))} />
      </div>

      {state.cadence === null && (
        <p className="caption-11 text-[var(--text-muted)]">
          {/* copy(G) */}
          Its fields are on different cadences. Saving one here puts all {state.fields} on it.
        </p>
      )}

      {said && (
        <p role="alert" className="flex items-start gap-[8px]">
          <CircleAlert
            size={14}
            strokeWidth={1.5}
            className="mt-[1px] shrink-0"
            style={{ color: said.ok ? 'var(--semantic-success)' : 'var(--semantic-warning)' }}
            aria-hidden
          />
          <span className="caption-12 text-[var(--text-secondary)]">{said.detail}</span>
        </p>
      )}
    </div>
  );
}

/**
 * The one irreversible control, and what it says before it runs.
 *
 * The count of runs is read from the store rather than guessed, so the dialog
 * can tell the operator the answer BEFORE they press: a scraper with history
 * will be refused, and saying that here is better than saying it afterwards as
 * an error. The button is still offered -- the engine is the authority on that
 * refusal, not this component's copy of the rule.
 */
function DeleteDialog({
  state, pending, onConfirm,
}: {
  state: ScraperState;
  pending: boolean;
  onConfirm: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant="quiet" icon={Trash2} onClick={() => setOpen(true)}>
        Delete
      </Button>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="title-20 text-[var(--text-primary)]">
            {/* copy(G) */}
            Delete {state.slug}?
          </DialogTitle>
          <DialogDescription className="body-13_5 text-[var(--text-secondary)]">
            {/* copy(G) */}
            {state.runs === 0
              ? `This forgets ${state.fields} watched field${state.fields === 1 ? '' : 's'}. It has never run, so there is nothing published to leave behind, and nothing to undo this with.`
              : `${state.slug} has ${state.runs} run${state.runs === 1 ? '' : 's'} on record. Assay will refuse this: every row it published carries a proof id that has to keep answering for itself. Pause it instead — that stops the scraping and keeps the history.`}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="quiet">Leave it</Button>
          </DialogClose>
          <Button
            variant="outline"
            icon={Trash2}
            loading={pending}
            onClick={() => { setOpen(false); onConfirm(); }}
          >
            {/* copy(G) */}
            Delete it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
