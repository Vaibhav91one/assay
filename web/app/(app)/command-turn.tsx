'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { CircleAlert, RotateCw } from 'lucide-react';
import type { CommandName, Turn } from 'assay/engine/store/conversation-log';
import { t } from '@/lib/copy';
import { ago, stamp } from '@/lib/when';
import { RunNow } from './schedule/run-now';
import { readCommand, type CommandResult, type CommandView } from './command-actions';

/**
 * A `/` command, rendered inside the transcript.
 *
 * THE TURN HOLDS THE QUESTION AND THIS HOLDS THE ANSWER, for exactly as long as
 * it is on screen. Every mount re-reads the store, so scrolling back to a
 * `/runs` from an hour ago shows the run list as it is now, not as it was when
 * the command was typed.
 *
 * WHY EVERY MOUNTED COMMAND REFETCHES TOGETHER. `changed()` is a module-level
 * notification -- no context, no store, nothing to keep in sync -- and
 * `router.refresh()` alongside it re-renders the server components that count
 * the same thing elsewhere on screen. One answer, every surface.
 *
 * NOTHING HERE WRITES. The one action is `askForRun` through `RunNow`,
 * imported WHOLE rather than re-implemented, so a chat run request carries the
 * worker-liveness refusal and the record-watching that `RunNow`'s header
 * explains. A second writer here would be the drift `tools/sweep.ts` was
 * cleaned of. `/decisions` and `/held` used to live here too -- both rendered
 * the decide-queue's own resolve/undo panel, `DecisionsList`, whole; both are
 * gone along with the screen that panel belonged to.
 *
 * `/fields` LISTS. There is no `actions.ts` under `web/app/(app)/fields` and
 * this does not invent one: nothing in the listing itself is approvable. It
 * used to also carry `FieldControls` -- the brake and the standing heal,
 * decisions about the FIELD rather than about anything in this table. Both
 * are gone: `healGated`, the only thing that ever wrote a heal in the live
 * pipeline, no longer runs (`src/runner.ts`'s header), so there is nothing
 * left to brake against or revert.
 */

export function CommandTurn({ turn }: { turn: Extract<Turn, { kind: 'command' }> }) {
  const [state, setState] = useState<CommandResult | null>(null);

  const read = useCallback(() => {
    readCommand(turn.command)
      .then(setState)
      // A read that failed is said, not swallowed into an empty list -- an empty
      // queue and an unreachable store must not draw the same panel.
      .catch((e: Error) => setState({ ok: false, detail: `Assay could not read that: ${e.message}` }));
  }, [turn.command]);

  useEffect(() => { read(); }, [read]);

  return (
    <section className="flex w-full flex-col gap-[12px] rounded-[var(--radius-card)] border border-[var(--border-default)] bg-[var(--surface-card)] px-[20px] pb-[18px] pt-[16px]">
      <div className="flex flex-wrap items-baseline gap-x-[12px] gap-y-[4px]">
        <span className="mono-value-13 text-[var(--text-primary)]">/{turn.command}</span>
        <span className="caption-11 flex-1 text-[var(--text-muted)]">
          {state ? t('command.ranAt') : 'reading the store'} · asked {ago(new Date(turn.at))}
        </span>
        <button
          type="button"
          onClick={read}
          className="press-icon flex items-center gap-[6px] rounded-[var(--radius-control)] px-[6px] py-[3px] text-[var(--text-secondary)] transition-colors duration-[var(--duration-tint)] hover:bg-[var(--surface-subtle)] hover:text-[var(--text-primary)]"
        >
          <RotateCw size={12} strokeWidth={1.5} aria-hidden />
          <span className="caption-11">Read again</span>
        </button>
      </div>

      {/* Words typed after the command are kept in the transcript and used by
          nothing. Saying so is cheaper than letting an operator believe they
          asked a question and got an answer to it. */}
      {turn.args && (
        <p className="caption-12 text-[var(--text-secondary)]">{t('command.argsIgnored')}</p>
      )}

      {state === null ? (
        <p className="caption-12 text-[var(--text-muted)]">Reading the store…</p>
      ) : !state.ok ? (
        <p role="alert" className="flex items-start gap-[8px]">
          <CircleAlert size={14} strokeWidth={1.5} className="mt-[1px] shrink-0 text-[var(--semantic-warning)]" aria-hidden />
          <span className="caption-12 text-[var(--text-secondary)]">{state.detail}</span>
        </p>
      ) : (
        <Body view={state.view} />
      )}

      <p className="pt-[2px]">
        <Link href={screenFor(turn.command)} className="meta-12_5 text-[var(--semantic-link)] hover:underline">
          {t('command.open')}
        </Link>
      </p>
    </section>
  );
}

/** The screen that shows the same rows in full. A way out, never the command itself. */
function screenFor(c: CommandName): string {
  if (c === 'runs') return '/runs';
  return '/fields';
}

function Body({ view }: { view: CommandView }) {
  if (view.command === 'runs') {
    return (
      <div className="flex w-full flex-col gap-[12px]">
        {view.runs.length === 0 ? (
          <Empty>{t('command.runs.empty')}</Empty>
        ) : (
          <>
            <p className="caption-12 text-[var(--text-secondary)]">
              {view.total} run{view.total === 1 ? '' : 's'} · {view.healed} moved and were found
              again · {view.held} held something
            </p>
            <ul className="flex w-full flex-col">
              {view.runs.map((r) => (
                <li
                  key={r.runId}
                  className="flex items-baseline gap-[12px] border-t border-[var(--border-hairline)] py-[8px]"
                >
                  <span className="mono-value-12_5 shrink-0 text-[var(--text-primary)]">run {r.runId}</span>
                  <span className="caption-12 min-w-0 flex-1 truncate text-[var(--text-secondary)]">
                    {r.scraper}
                  </span>
                  <span
                    className="caption-11 shrink-0"
                    style={{ color: r.outcome === 'held' ? 'var(--semantic-warning)' : 'var(--text-muted)' }}
                  >
                    {r.outcome === 'held'
                      ? `held ${r.heldField ?? 'a cell'}`
                      : r.outcome === 'healed'
                        ? t('runs.outcome.healed')
                        : t('runs.outcome.clean')}
                  </span>
                  <span className="caption-11 shrink-0 text-[var(--text-muted)]">{stamp(r.at)}</span>
                </li>
              ))}
            </ul>
          </>
        )}
        {/* The one action a run list has, and it is not "run". `RunNow` says
            `Ask for a run` because Assay's web process never scrapes, and it
            reports what LANDED rather than claiming success on dispatch. */}
        {view.scrapers.length > 0 && (
          <RunNow scrapers={view.scrapers} workers={view.workers} />
        )}
      </div>
    );
  }

  if (view.command !== 'fields') return null;
  if (view.fields.length === 0) return <Empty>{t('command.fields.empty')}</Empty>;
  return (
    <div className="flex w-full flex-col gap-[8px]">
      <p className="caption-12 text-[var(--text-secondary)]">
        {view.tracked} field{view.tracked === 1 ? '' : 's'} under watch
        {view.fragile > 0 ? `, ${view.fragile} fragile` : ''}. Nothing here is decided by a person —
        this is what is watched and how it has been holding up.
      </p>
      <ul className="flex w-full flex-col">
        {view.fields.map((f) => (
          <li
            key={`${f.targetId}:${f.field}`}
            className="flex flex-wrap items-baseline gap-[12px] border-t border-[var(--border-hairline)] py-[8px]"
          >
            <span className="mono-value-12_5 shrink-0 text-[var(--text-primary)]">{f.field}</span>
            <span className="caption-12 min-w-0 flex-1 truncate text-[var(--text-secondary)]">
              {f.scraper}
            </span>
            {f.held > 0 && (
              // Held is amber everywhere in this product, never danger.
              <span className="caption-11 shrink-0 text-[var(--semantic-warning)]">{f.held} held</span>
            )}
            {/* The health module's own word, not a score. docs/FEATURES.md 4
                refuses a confidence number and this is the band it allows. */}
            {f.grade && <span className="caption-11 shrink-0 text-[var(--text-muted)]">{f.grade}</span>}
            <span className="caption-11 shrink-0 text-[var(--text-muted)]">
              seen in {f.seen} of {f.runs}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** An empty queue is the product working, so it does not read as a failure. */
function Empty({ children }: { children: React.ReactNode }) {
  return <p className="caption-12 text-[var(--text-secondary)]">{children}</p>;
}
