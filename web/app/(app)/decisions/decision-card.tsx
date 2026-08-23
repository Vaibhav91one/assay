'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Check, CircleAlert, Eye } from 'lucide-react';
import type { Decision } from '@/lib/queue';
import { StatusLine } from '@/components/status-line';
import { ProofSheet } from '@/components/proof-sheet';
import { heldBecause } from 'assay/engine/reports/vocabulary';
import { stamp, ago } from '@/lib/when';
import { resolveCell, type Outcome } from './actions';
import { t } from '@/lib/copy';

const OPTION_LABELS = [t('decisions.card.best'), t('decisions.card.second')] as const;

function Evidence({ e }: { e: Decision['candidates'][number]['evidence'] }) {
  if (!e) {
    // An absence is an absence. "No earlier runs to compare" is a fact;
    // showing nothing would let the reader assume agreement.
    return (
      <p className="caption-12 text-[var(--text-muted)]">{t('decisions.card.noEarlierRuns')}</p>
    );
  }
  return (
    <StatusLine
      tone={e.kind === 'steady' ? 'success' : 'warning'}
      size={13}
      type="caption-12"
      className="gap-[6px]"
    >
      {e.text}
    </StatusLine>
  );
}

export function DecisionCard({
  d,
  onOutcome,
}: {
  d: Decision;
  onOutcome: (o: Outcome) => void;
}) {
  const [pending, start] = useTransition();
  const [why, setWhy] = useState(false);

  const act = (fn: () => Promise<Outcome>) => start(async () => onOutcome(await fn()));

  return (
    <article className="flex w-full flex-col gap-[18px] rounded-[var(--radius-card)] border border-[var(--border-default)] bg-[var(--surface-card)] px-[24px] pb-[18px] pt-[22px] shadow-elevation-control">
      <div className="flex items-center gap-[12px]">
        <span className="body-14 text-[var(--text-primary)]">{d.target}</span>
        <span className="meta-12_5 flex-1 text-[var(--text-muted)]">
          {/* The run id is on the Decision, so the reference is the link.
              It used to be inert text -- or, on the sibling screens, a link to
              /runs, which is the list this run is one row of. A reader who
              clicks "run 412" wants run 412. */}
          <Link
            href={`/runs/${d.run}`}
            className="text-[var(--semantic-link)] hover:underline"
          >
            run {d.run}
          </Link>{' '}
          · {stamp(d.startedAt)} · field {d.field}
        </span>
        <span className="meta-12_5 text-[var(--text-muted)]">
          {t('decisions.card.heldAgo', { ago: ago(d.heldAt) })}
        </span>
      </div>

      <div className="flex flex-col gap-[18px]">
        <div className="flex flex-col gap-[8px]">
          <h2 className="heading-18 text-[var(--text-primary)]">{question(d)}</h2>
          <button
            type="button"
            onClick={() => setWhy((v) => !v)}
            aria-expanded={why}
            className="flex w-fit items-center gap-[6px]"
          >
            <CircleAlert size={13} strokeWidth={1.5} className="text-[var(--semantic-link)]" aria-hidden />
            <span className="meta-12_5 text-[var(--semantic-link)]">{t('decisions.card.why')}</span>
          </button>
          {/* 0fr -> 1fr so the disclosure animates without a measured height */}
          <div className={`grid transition-[grid-template-rows] duration-200 ${why ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
            <div className="overflow-hidden">
              <p className="meta-12_5 pt-[6px] text-[var(--text-secondary)]">
                <Reason d={d} />
              </p>
            </div>
          </div>
        </div>

        {/*
          What every other product in this category would have done with this
          cell, said out loud.

          It is the only place the reader can see the thing they are being
          asked to spend thirty seconds on. A healer ranks, takes the top of
          the ranking and publishes it; the gate ranked the same list, found no
          clear winner and published a labelled hole instead. Without this line
          the card reads as Assay failing to do its job.

          `candidates[0]` IS that top -- `openDecisions` keeps the gate's own
          ordering, best first -- so this is a real counterfactual off the
          stored ranking, not a guess about what a competitor might do. With no
          candidates there was nothing to publish and the line would be a
          fabrication, so it is skipped.
        */}
        {d.candidates.length > 0 && (
          <p className="meta-12_5 rounded-[var(--radius-control)] bg-[var(--surface-subtle)] px-[14px] py-[10px] text-[var(--text-secondary)]">
            {t('counterfactual.before')}{' '}
            <span className="mono-value-12_5 break-words text-[var(--text-primary)]">
              “{d.candidates[0].value}”
            </span>
            {t('counterfactual.after')}
          </p>
        )}

        {d.candidates.length > 0 && (
          <div className="flex w-full items-stretch gap-[16px]">
            {d.candidates.map((c, i) => (
              <div
                key={c.selector + i}
                className="flex min-w-0 flex-1 flex-col gap-[10px] rounded-[var(--radius-card)] border border-[var(--border-default)] bg-[var(--surface-card)] px-[20px] py-[18px]"
              >
                <p className="label-10_5 text-[var(--text-muted)]">
                  {OPTION_LABELS[i] ?? t('decisions.card.optionN', { n: i + 1 })}
                  {d.nominated === i && t('decisions.card.nominated')}
                </p>
                <p className="nav-15 break-words text-[var(--text-primary)]">{c.value}</p>
                <Evidence e={c.evidence} />
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => act(() => resolveCell(d.proof, i === 0 ? 'first' : 'second'))}
                  className="mt-auto flex h-[36px] w-fit items-center gap-[8px] rounded-[var(--radius-control)] bg-[var(--semantic-success)] px-[15px] disabled:opacity-60"
                >
                  <Check size={16} strokeWidth={2} className="text-[var(--accent-on-primary)]" aria-hidden />
                  <span className="meta-12_5 text-[var(--accent-on-primary)]">{t('decisions.card.use')}</span>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="h-px w-full bg-[var(--border-hairline)]" />

      <div className="flex items-center gap-[24px] pt-[4px]">
        <button
          type="button"
          disabled={pending}
          onClick={() => act(() => resolveCell(d.proof, 'empty'))}
          className="meta-13 text-[var(--text-primary)] disabled:opacity-60"
        >
          {t('decisions.card.empty')}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => act(() => resolveCell(d.proof, 'neither'))}
          className="meta-13 flex-1 text-left text-[var(--text-primary)] disabled:opacity-60"
        >
          {t('decisions.card.neither')}
        </button>
        {/* A sheet, not the route. Answering a queue is the one place where
            leaving the screen costs the most: the card you were reading is
            item nine of fifty, and coming back puts you at the top. */}
        <ProofSheet
          proof={d.proof}
          className="focus-ring flex items-center gap-[8px] rounded-[var(--radius-control)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
        >
          <Eye size={14} strokeWidth={1.5} aria-hidden />
          <span className="meta-13">{t('decisions.card.seeOnPage')}</span>
        </ProofSheet>
      </div>

    </article>
  );
}

/** The question follows from why the gate refused, not from a template. */
function question(d: Decision): string {
  if (d.candidates.length >= 2) return t('decisions.question.two');
  if (d.candidates.length === 1) return t('decisions.question.one');
  return t('decisions.question.none');
}

/**
 * Why the gate refused, in the words the rest of the product uses.
 *
 * THIS USED TO KEEP ITS OWN TABLE, and the table was wrong. It switched on
 * `below_floor`, which is not a code the engine emits -- `src/heal.ts` records
 * `below_tau`, `thin_margin` or `no_candidates` -- so that branch was dead and
 * two of the three real codes fell through to a default that opened the
 * sentence with the raw code: "below_tau. Nothing was published for this cell."
 * A reason code as the subject of an English sentence is exactly what
 * docs/APP-DESIGN.md 5b rule 5 forbids.
 *
 * `src/reports/vocabulary.ts` is exported for the browser for this reason, and
 * says so in its own header: a client component reads the table rather than
 * keeping a second copy of it. `run-detail` and `schema-table` already did.
 * A code with no wording is printed AS a code, never given an invented one.
 */
function Reason({ d }: { d: Decision }) {
  const why = heldBecause(d.reason);

  return (
    <>
      {why?.plain ? (
        t('decisions.reason.plain', { plain: why.plain })
      ) : why ? (
        <>
          {t('decisions.reason.untranslated.before')}{' '}
          <code className="mono-value-12_5">{why.code}</code>
          {t('decisions.reason.untranslated.after')}
        </>
      ) : (
        t('decisions.reason.none')
      )}
      {d.heldSinceRun ? t('decisions.reason.heldSince', { run: d.heldSinceRun }) : ''}
      {/* The count and its verb are assembled here: this catalogue does not do
          plurals, and "1 published rows depend" is what happens when a map is
          asked to. */}
      {d.stakesRows > 0
        ? t('decisions.reason.stakes', {
          rows: `${d.stakesRows} published row${d.stakesRows === 1 ? '' : 's'}`,
          verb: d.stakesRows === 1 ? 'depends' : 'depend',
        })
        : ''}
    </>
  );
}
