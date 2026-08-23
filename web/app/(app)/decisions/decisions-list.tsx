'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { MessageSquare, Undo2 } from 'lucide-react';
import type { Decision } from '@/lib/queue';
import { StatusLine } from '@/components/status-line';
import { Toast, TOAST_BUTTON } from '@/components/toast';
import { DecisionCard } from './decision-card';
import { undoCell, type Outcome } from './actions';
import { t } from '@/lib/copy';

/** The receipt for one answer, and the follow-up that answer earns. */
interface Receipt {
  proof: string;
  text: string;
  /** The scraper to re-teach, on `neither` only. Null on the other three. */
  reteach: string | null;
}

/**
 * Owns the undo affordance, and it has to live here rather than on the card.
 *
 * Answering a decision revalidates the queue, so the card that was answered
 * unmounts -- along with any "you just did this" state it was holding. The
 * receipt has to outlive the thing it is a receipt for, so it sits above the
 * list, which re-renders without ever unmounting.
 *
 * `onSettled` exists for the chat surface and is optional because this screen
 * does not need it: a Server Component page re-renders from `revalidatePath`,
 * while a command turn in the transcript holds its rows in client state and has
 * to be told to read again. It fires on a real change only -- a resolve or an
 * undo that the store accepted -- so a caller cannot mistake a refusal for one.
 */
export function DecisionsList({
  decisions,
  onSettled,
}: {
  decisions: Decision[];
  onSettled?: () => void;
}) {
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function onOutcome(d: Decision, o: Outcome) {
    if (!o.ok) { setError(o.detail); return; }
    setError(null);
    onSettled?.();
    // Undo has its own handler on the toast button, so this only narrows the
    // union -- there is no path that reaches here with an undo any more.
    if (o.kind === 'undone') { setReceipt(null); return; }
    setReceipt({
      proof: d.proof,
      text:
        answerSentence(o.resolution) +
        (o.applied > 1 ? ` It settled ${o.applied} cells held for the same reason.` : ''),
      // "Neither is right" is the one answer that leaves the field WRONG rather
      // than settled: the operator has just said this field is pointed at
      // something that is not the value. Undo is the only thing on offer after
      // it, and undoing puts the cell back on the queue -- so the card
      // disappears and the reader is left with the same broken field and no
      // move that improves it. The re-teach link is that move. Only on
      // `neither`, because the other three answers ARE the fix.
      reteach: o.resolution === 'neither' ? d.target.split('__')[0] : null,
    });
  }

  return (
    <>
      <div className="flex w-full flex-col gap-[20px]">
        {decisions.map((d) => (
          <DecisionCard key={d.proof} d={d} onOutcome={(o) => onOutcome(d, o)} />
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
            <span className="flex items-center gap-[4px]">
              {receipt.reteach && (
                // A plain link, deliberately. Re-teaching a field is a
                // conversation on Home -- it is not a fifth answer to this
                // decision, and giving it a button here would put a control
                // that leaves the screen next to one that undoes a write.
                <Link href={`/?target=${encodeURIComponent(receipt.reteach)}`} className={TOAST_BUTTON}>
                  <MessageSquare size={14} strokeWidth={1.5} className="text-[var(--text-inverse)]" aria-hidden />
                  <span className="meta-13 text-[var(--text-inverse)]">{t('decisions.reteach')}</span>
                </Link>
              )}
              <button
                type="button"
                disabled={pending}
                onClick={() => start(async () => {
                  const o = await undoCell(receipt.proof);
                  if (!o.ok) { setError(o.detail); return; }
                  setError(null);
                  onSettled?.();
                  setReceipt(null);
                })}
                className={TOAST_BUTTON}
              >
                <Undo2 size={14} strokeWidth={1.5} className="text-[var(--text-inverse)]" aria-hidden />
                <span className="meta-13 text-[var(--text-inverse)]">{pending ? 'Undoing' : 'Undo'}</span>
              </button>
            </span>
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
