'use client';

import { useState, useTransition } from 'react';
import { Undo2 } from 'lucide-react';
import type { Decision } from '@/lib/queue';
import { StatusLine } from '@/components/status-line';
import { Toast, TOAST_BUTTON } from '@/components/toast';
import { DecisionCard } from './decision-card';
import { undoCell, type Outcome } from './actions';

/**
 * Owns the undo affordance, and it has to live here rather than on the card.
 *
 * Answering a decision revalidates the queue, so the card that was answered
 * unmounts -- along with any "you just did this" state it was holding. The
 * receipt has to outlive the thing it is a receipt for, so it sits above the
 * list, which re-renders without ever unmounting.
 */
export function DecisionsList({ decisions }: { decisions: Decision[] }) {
  const [receipt, setReceipt] = useState<{ proof: string; text: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function onOutcome(proof: string, o: Outcome) {
    if (!o.ok) { setError(o.detail); return; }
    setError(null);
    if (o.kind === 'undone') { setReceipt(null); return; }
    setReceipt({
      proof,
      text:
        answerSentence(o.resolution) +
        (o.applied > 1 ? ` It settled ${o.applied} cells held for the same reason.` : ''),
    });
  }

  return (
    <>
      <div className="flex w-full flex-col gap-[20px]">
        {decisions.map((d) => (
          <DecisionCard key={d.proof} d={d} onOutcome={(o) => onOutcome(d.proof, o)} />
        ))}
      </div>

      {error && (
        // Inline, where the action started -- a failure that only ever appears
        // in a toast is a failure the operator can miss by looking away.
        <p role="alert">
          <StatusLine tone="danger" size={14} type="meta-12_5">
            {error}
          </StatusLine>
        </p>
      )}

      {receipt && (
        <Toast
          message={receipt.text}
          action={
            <button
              type="button"
              disabled={pending}
              onClick={() => start(async () => onOutcome(receipt.proof, await undoCell(receipt.proof)))}
              className={TOAST_BUTTON}
            >
              <Undo2 size={14} strokeWidth={1.5} className="text-[var(--text-inverse)]" aria-hidden />
              <span className="meta-13 text-[var(--text-inverse)]">{pending ? 'Undoing' : 'Undo'}</span>
            </button>
          }
        />
      )}
    </>
  );
}

function answerSentence(r: string): string {
  switch (r) {
    case 'first': return 'You chose the best match.';
    case 'second': return 'You chose the close second.';
    case 'empty': return 'You said this field is genuinely empty.';
    default: return 'You said neither candidate is right, so the cell stays held.';
  }
}
