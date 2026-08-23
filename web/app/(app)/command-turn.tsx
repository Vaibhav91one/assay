'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CircleAlert, RotateCw } from 'lucide-react';
import type { CommandName, Turn } from 'assay/engine/store/conversation-log';
import { t } from '@/lib/copy';
import { ago, stamp } from '@/lib/when';
import { DecisionsList } from './decisions/decisions-list';
import { FieldControls } from './field-controls';
import { RunNow } from './schedule/run-now';
import { readCommand, type CommandResult, type CommandView } from './command-actions';

/**
 * A `/` command, rendered inside the transcript.
 *
 * THE TURN HOLDS THE QUESTION AND THIS HOLDS THE ANSWER, for exactly as long as
 * it is on screen. Every mount re-reads the store, so scrolling back to a
 * `/decisions` from an hour ago shows the queue as it is now -- the two cells
 * that were answered since are gone, and the buttons that would have answered
 * them are gone with them. A transcript that kept a copy would be offering to
 * resolve a decision that no longer exists, which is worse than not offering.
 *
 * WHY EVERY MOUNTED COMMAND REFETCHES TOGETHER. Answering a cell in one turn
 * changes what a `/decisions` further up the transcript should say, and two
 * panels on one screen disagreeing about how many cells are waiting is the exact
 * dishonesty this product exists to refuse. `changed()` is a module-level
 * notification -- no context, no store, nothing to keep in sync -- and
 * `router.refresh()` alongside it re-renders the server components that count
 * the same thing: the rail's badge, and the Decisions screen if it is behind
 * this tab. One answer, every surface.
 *
 * NOTHING HERE WRITES. The actions are the ones the screens already own:
 * `resolveCell` and `undoCell` through `DecisionsList`, `askForRun` through
 * `RunNow`. Both are imported WHOLE rather than re-implemented, so a chat
 * resolve is the same decide-once path as a resolve on `/decisions`, and a chat
 * run request carries the worker-liveness refusal and the record-watching that
 * `RunNow`'s header explains. A second writer here would be the drift
 * `tools/sweep.ts` was cleaned of.
 *
 * `/fields` LISTS, AND CARRIES THE TWO DECISIONS THAT BELONG TO A FIELD. There
 * is no `actions.ts` under `web/app/(app)/fields` and this does not invent one:
 * nothing in the listing itself is approvable, and a control there would be a
 * control with no decision behind it. What the row does carry is
 * `FieldControls`, which is the brake and the standing heal -- decisions about
 * the FIELD rather than about anything in this table, and until now reachable
 * only from the CLI. Both keep the friction they were built with: the brake
 * takes the field name typed out, the unheal takes two presses and says what
 * range it puts in doubt before the second one. See `./field-controls.tsx`.
 */

const listeners = new Set<() => void>();

/** Something was answered. Every command panel on screen re-reads. */
function changed(): void {
  for (const l of [...listeners]) l();
}

export function CommandTurn({ turn }: { turn: Extract<Turn, { kind: 'command' }> }) {
  const [state, setState] = useState<CommandResult | null>(null);
  const router = useRouter();

  const read = useCallback(() => {
    readCommand(turn.command)
      .then(setState)
      // A read that failed is said, not swallowed into an empty list -- an empty
      // queue and an unreachable store must not draw the same panel.
      .catch((e: Error) => setState({ ok: false, detail: `Assay could not read that: ${e.message}` }));
  }, [turn.command]);

  useEffect(() => {
    read();
    listeners.add(read);
    return () => { listeners.delete(read); };
  }, [read]);

  const settled = useCallback(() => { read(); changed(); router.refresh(); }, [read, router]);

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
        <Body view={state.view} onSettled={settled} />
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
  if (c === 'decisions') return '/decisions';
  if (c === 'held') return '/fields?show=held';
  if (c === 'runs') return '/runs';
  return '/fields';
}

function Body({ view, onSettled }: { view: CommandView; onSettled: () => void }) {
  if (view.command === 'decisions' || view.command === 'held') {
    if (view.decisions.length === 0) {
      return <Empty>{t(view.command === 'held' ? 'command.held.empty' : 'command.decisions.empty')}</Empty>;
    }
    return (
      <div className="flex w-full flex-col gap-[12px]">
        <p className="caption-12 text-[var(--text-secondary)]">{scope(view)}</p>
        {/* The Decisions screen's own list, whole: the two candidates and the
            values they carry, the reason nothing was published, all four
            answers, and the undo receipt that has to outlive the card it
            belongs to. Rebuilding any of that here would be a second place for
            the product's most distinctive screen to drift. */}
        <DecisionsList decisions={view.decisions} onSettled={onSettled} />
      </div>
    );
  }

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
            {/* The two decisions that belong to a FIELD rather than to a cell:
                clearing a brake, and reverting the heal in force. Neither is a
                listing action and neither is one click -- see
                `field-controls.tsx`. They live here because a brake is set on a
                field and this is the command that lists fields. */}
            <FieldControls targetId={f.targetId} field={f.field} />
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * What `/held` says that `/decisions` does not.
 *
 * The same read: both are the open queue, because a held cell and a decision
 * waiting on a person are the same row -- `web/lib/queue.ts` is the one reader
 * and there is not a second one. What differs is the question being asked.
 * `/decisions` asks "what is waiting on me", so it counts cells; `/held` asks
 * "what is holding", so it counts the fields they sit on.
 */
function scope(view: Extract<CommandView, { command: 'decisions' | 'held' }>): string {
  const cells = view.decisions.length;
  if (view.command === 'decisions') {
    return `${cells} cell${cells === 1 ? '' : 's'} waiting on you. Nothing was published for `
      + `${cells === 1 ? 'it' : 'them'}.`;
  }
  const fields = new Set(view.decisions.map((d) => `${d.target}:${d.field}`)).size;
  return `${fields} field${fields === 1 ? ' is' : 's are'} holding ${cells} `
    + `cell${cells === 1 ? '' : 's'}. Nothing was published for ${cells === 1 ? 'it' : 'them'}.`;
}

/** An empty queue is the product working, so it does not read as a failure. */
function Empty({ children }: { children: React.ReactNode }) {
  return <p className="caption-12 text-[var(--text-secondary)]">{children}</p>;
}
