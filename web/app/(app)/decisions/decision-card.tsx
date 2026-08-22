'use client';

import { useState, useTransition } from 'react';
import { Check, CircleAlert, Eye, Undo2 } from 'lucide-react';
import type { Decision } from '@/lib/queue';
import { resolveCell, type Outcome } from './actions';

const OPTION_LABELS = ['BEST MATCH', 'CLOSE SECOND'] as const;

function Evidence({ e }: { e: Decision['candidates'][number]['evidence'] }) {
  if (!e) {
    // An absence is an absence. "No earlier runs to compare" is a fact;
    // showing nothing would let the reader assume agreement.
    return (
      <p className="caption-12 text-[var(--text-muted)]">No earlier runs to compare against</p>
    );
  }
  const steady = e.kind === 'steady';
  const Icon = steady ? Check : CircleAlert;
  const tone = steady ? 'var(--semantic-success)' : 'var(--semantic-warning)';
  return (
    <p className="flex items-center gap-[6px]">
      <Icon size={13} strokeWidth={1.5} style={{ color: tone }} aria-hidden />
      <span className="caption-12" style={{ color: tone }}>{e.text}</span>
    </p>
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
          run {d.run} · {when(d.startedAt)} · field {d.field}
        </span>
        <span className="meta-12_5 text-[var(--text-muted)]">held {ago(d.heldAt)}</span>
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
            <span className="meta-12_5 text-[var(--semantic-link)]">Why this is held</span>
          </button>
          {/* 0fr -> 1fr so the disclosure animates without a measured height */}
          <div className={`grid transition-[grid-template-rows] duration-200 ${why ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
            <div className="overflow-hidden">
              <p className="meta-12_5 pt-[6px] text-[var(--text-secondary)]">
                {reasonSentence(d)}
              </p>
            </div>
          </div>
        </div>

        {d.candidates.length > 0 && (
          <div className="flex w-full items-stretch gap-[16px]">
            {d.candidates.map((c, i) => (
              <div
                key={c.selector + i}
                className="flex min-w-0 flex-1 flex-col gap-[10px] rounded-[var(--radius-card)] border border-[var(--border-default)] bg-[var(--surface-card)] px-[20px] py-[18px]"
              >
                <p className="label-10_5 text-[var(--text-muted)]">
                  {OPTION_LABELS[i] ?? `OPTION ${i + 1}`}
                  {d.nominated === i && ' · MODEL NOMINATED'}
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
                  <span className="meta-12_5 text-[var(--accent-on-primary)]">Use this</span>
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
          Leave this field empty
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => act(() => resolveCell(d.proof, 'neither'))}
          className="meta-13 flex-1 text-left text-[var(--text-primary)] disabled:opacity-60"
        >
          Neither is right
        </button>
        <a
          href={`/explain/${d.proof}`}
          className="flex items-center gap-[8px] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
        >
          <Eye size={14} strokeWidth={1.5} aria-hidden />
          <span className="meta-13">See it on the page</span>
        </a>
      </div>

    </article>
  );
}

/** The question follows from why the gate refused, not from a template. */
function question(d: Decision): string {
  if (d.candidates.length >= 2) return 'Two answers look about equally likely.';
  if (d.candidates.length === 1) return 'Only one candidate, and not a convincing one.';
  return 'Nothing on the page looks much like this field any more.';
}

function reasonSentence(d: Decision): string {
  const held = d.heldSinceRun ? ` Held since run ${d.heldSinceRun}.` : '';
  const stakes = d.stakesRows > 0 ? ` ${d.stakesRows} published rows depend on this field.` : '';
  switch (d.reason) {
    case 'thin_margin':
      return `The best candidate did not beat the runner-up by enough to be safe, so nothing was published.${held}${stakes}`;
    case 'below_floor':
      return `No candidate scored well enough to be the field at all, so nothing was published.${held}${stakes}`;
    default:
      return `${d.reason ?? 'The gate refused'}. Nothing was published for this cell.${held}${stakes}`;
  }
}


const when = (d: Date | null) =>
  d ? new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(d)) : 'unknown time';

function ago(d: Date | null): string {
  if (!d) return 'at an unknown time';
  const mins = Math.round((Date.now() - new Date(d).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} minutes ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}
