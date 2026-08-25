'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { CircleAlert, Eye } from 'lucide-react';
import type { Decision } from '@/lib/queue';
import { ProofSheet } from '@/components/proof-sheet';
import { heldBecause } from 'assay/engine/reports/vocabulary';
import { stamp, ago } from '@/lib/when';
import { resolveCell, type Outcome } from './actions';
import { t } from '@/lib/copy';

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
      {/* Wraps below 768: three columns in 340px turned the middle one into a
          four-line paragraph and squeezed the target id into two. */}
      <div className="flex flex-wrap items-center gap-x-[12px] gap-y-[4px]">
        <span className="body-14 text-[var(--text-primary)]">{d.target}</span>
        <span className="meta-12_5 md:flex-1 text-[var(--text-muted)]">
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

      </div>

      <div className="h-px w-full bg-[var(--border-hairline)]" />

      {/* Same reason as the header. Three verbs of unequal length share this
          row; below 768 they wrap rather than each losing half their words. */}
      <div className="flex flex-wrap items-center gap-x-[24px] gap-y-[12px] pt-[4px]">
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
          className="meta-13 text-left text-[var(--text-primary)] disabled:opacity-60 md:flex-1"
        >
          {t('decisions.card.neither')}
        </button>
        {/* A sheet, not the route. Answering a queue is the one place where
            leaving the screen costs the most: the card you were reading is
            item nine of fifty, and coming back puts you at the top. */}
        <ProofSheet
          proof={d.proof}
          className="focus-ring flex shrink-0 items-center gap-[8px] rounded-[var(--radius-control)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
        >
          <Eye size={14} strokeWidth={1.5} aria-hidden />
          <span className="meta-13">{t('decisions.card.seeOnPage')}</span>
        </ProofSheet>
      </div>

    </article>
  );
}

/**
 * The question follows from why the gate refused, not from a template.
 *
 * Always the no-candidates question now: `healGated`, the only thing that
 * ever populated `field_runs.ranked`, no longer runs (`src/runner.ts`'s
 * header), so a held cell never carries a ranked candidate to ask about.
 */
function question(_d: Decision): string {
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
