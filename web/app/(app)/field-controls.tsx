'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import { CircleAlert, Hand, Undo2 } from 'lucide-react';
import {
  clearFieldBrake, fieldControls, unhealField,
  type ClearOutcome, type FieldControls as Controls, type UnhealOutcome,
} from './brake-actions';

/**
 * The two decisions a person can make about one field, in the chat.
 *
 * BOTH ARE HARD ON PURPOSE. Clearing a brake takes the field name, typed --
 * `src/brake/index.ts` refuses anything else and this does not soften it. An
 * unheal takes two presses, and the second one is only offered after the first
 * has said which run is being reverted and what range that puts back in doubt.
 * Neither is a control that can be operated by muscle memory, which is the
 * property that made them CLI-only until now.
 *
 * READ LIVE, LIKE EVERYTHING ELSE IN A COMMAND TURN. The brake may have been
 * cleared in another tab; the standing heal may have been reverted since this
 * panel was drawn. So the state is fetched when the row is opened and again
 * after every action, and nothing about it is kept in the transcript.
 *
 * NOTHING HERE IS REACHABLE BY A MODEL. Both actions are `'use server'`
 * functions called from an onClick, and no tool serves either -- see the header
 * of `./brake-actions.ts`.
 */
export function FieldControls({ targetId, field }: { targetId: string; field: string }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<Controls | null>(null);
  const [confirm, setConfirm] = useState('');
  const [armed, setArmed] = useState(false);
  const [said, setSaid] = useState<{ ok: boolean; detail: string } | null>(null);
  const [pending, start] = useTransition();

  const read = useCallback(() => {
    fieldControls(targetId, field)
      .then(setState)
      .catch((e: Error) => setSaid({ ok: false, detail: `Could not read this field: ${e.message}` }));
  }, [targetId, field]);

  useEffect(() => { if (open) read(); }, [open, read]);

  const after = (o: ClearOutcome | UnhealOutcome) => {
    setSaid({ ok: o.ok, detail: o.detail });
    setConfirm('');
    setArmed(false);
    read();
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="caption-11 shrink-0 text-[var(--semantic-link)] hover:underline"
      >
        brake &amp; heals
      </button>
    );
  }

  return (
    <div className="flex w-full basis-full flex-col gap-[10px] rounded-[var(--radius-control)] bg-[var(--surface-subtle)] px-[12px] py-[10px]">
      {state === null ? (
        <p className="caption-11 text-[var(--text-muted)]">Reading this field…</p>
      ) : (
        <>
          {/* --- the brake ------------------------------------------------- */}
          {state.brakeActive ? (
            <div className="flex flex-col gap-[8px]">
              <p className="flex items-start gap-[8px]">
                <Hand size={14} strokeWidth={1.5} className="mt-[1px] shrink-0 text-[var(--semantic-warning)]" aria-hidden />
                <span className="caption-12 text-[var(--text-secondary)]">
                  Healing is stopped on {field}. It was braked because:{' '}
                  {state.brakeReason ?? 'no reason was recorded'}. Clearing it lets the next run heal
                  again — if the site is running an experiment, the next heal publishes from whichever
                  variant it lands on and nothing will hold it.
                </span>
              </p>
              <div className="flex flex-wrap items-center gap-[8px]">
                {/* The typed field name, and it is the whole mechanism. A
                    button here would be a control people press to make a
                    warning go away, which is the thing the brake exists to
                    outlast. See `src/brake/index.ts`. */}
                <input
                  value={confirm}
                  onChange={(e) => setConfirm(e.currentTarget.value)}
                  placeholder={`type ${field} to clear`}
                  aria-label={`Type ${field} to clear this brake`}
                  className="meta-12_5 w-[220px] rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-card)] px-[10px] py-[6px] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--semantic-link)]"
                />
                <button
                  type="button"
                  disabled={pending || confirm.length === 0}
                  onClick={() => start(async () =>
                    after(await clearFieldBrake({ targetId, field, confirm })))}
                  className="meta-12_5 rounded-[var(--radius-control)] border border-[var(--border-default)] px-[10px] py-[6px] text-[var(--text-primary)] transition-colors duration-[var(--duration-tint)] hover:bg-[var(--surface-card)] disabled:text-[var(--text-muted)]"
                >
                  Clear the brake
                </button>
              </div>
            </div>
          ) : (
            <p className="caption-11 text-[var(--text-muted)]">
              No brake on {field}. Healing is allowed to run.
            </p>
          )}

          {/* --- the standing heal ----------------------------------------- */}
          {state.standing ? (
            <div className="flex flex-col gap-[8px] border-t border-[var(--border-hairline)] pt-[10px]">
              <p className="caption-12 text-[var(--text-secondary)]">
                {state.heals} heal{state.heals === 1 ? '' : 's'} on record. The one in force was made
                on run {state.standing.runId}
                {state.standing.at ? ` (${new Date(state.standing.at).toISOString().slice(0, 10)})` : ''}.
              </p>
              {armed ? (
                <>
                  {/* Said BEFORE the second press, because this is the half an
                      operator cannot take back: unhealing declares that
                      everything published since that run may be wrong. */}
                  <p className="caption-12 text-[var(--text-primary)]">
                    Reverting run {state.standing.runId} puts {field} back on{' '}
                    {state.standing.fromSelector
                      ? 'the selector it healed away from'
                      : 'the selector its contract was written with'}
                    , and re-opens everything it published from run {state.standing.runId}
                    {state.lastRun ? ` to run ${state.lastRun}` : ''} as suspect. That range is
                    recorded as a retraction; nothing is republished by this.
                  </p>
                  <div className="flex flex-wrap items-center gap-[12px]">
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => start(async () =>
                        after(await unhealField({ targetId, field, runId: state.standing!.runId })))}
                      className="meta-12_5 rounded-[var(--radius-control)] border border-[var(--semantic-warning)] px-[10px] py-[6px] text-[var(--text-primary)] disabled:text-[var(--text-muted)]"
                    >
                      {pending ? 'Reverting' : `Yes — revert run ${state.standing.runId}`}
                    </button>
                    <button
                      type="button"
                      onClick={() => setArmed(false)}
                      className="meta-12_5 text-[var(--text-secondary)]"
                    >
                      Leave it
                    </button>
                  </div>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setArmed(true)}
                  className="press-row flex w-fit items-center gap-[8px] rounded-[var(--radius-control)] border border-[var(--border-default)] px-[10px] py-[6px] transition-colors duration-[var(--duration-tint)] hover:bg-[var(--surface-card)]"
                >
                  <Undo2 size={14} strokeWidth={1.5} className="text-[var(--text-primary)]" aria-hidden />
                  <span className="meta-12_5 text-[var(--text-primary)]">Revert this heal</span>
                </button>
              )}
            </div>
          ) : (
            <p className="caption-11 border-t border-[var(--border-hairline)] pt-[10px] text-[var(--text-muted)]">
              Nothing to revert: {field} is on the selector its contract was written with.
            </p>
          )}
        </>
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

      <button
        type="button"
        onClick={() => { setOpen(false); setSaid(null); setArmed(false); setConfirm(''); }}
        className="caption-11 w-fit text-[var(--text-secondary)]"
      >
        Close
      </button>
    </div>
  );
}
