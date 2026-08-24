'use client';

import { useState, useTransition } from 'react';
import { Check } from 'lucide-react';
import { StatusLine } from '@/components/status-line';
import { resolveCell } from '@/app/(app)/decisions/actions';

/**
 * `page-map`'s "Looks right" (409:2736), reusing the same `resolveCell`
 * server action `decision-card.tsx` calls from the queue -- this is the same
 * decision, on the same open item, from a screen an operator can also land on
 * by proof id rather than by working the queue in order.
 */
export function ResolveCandidates({
  proof,
  candidates,
}: {
  proof: string;
  candidates: { selector: string; label: string }[];
}) {
  const [pending, start] = useTransition();
  const [done, setDone] = useState<string | null>(null);

  const act = (i: 0 | 1) => start(async () => {
    const r = await resolveCell(proof, i === 0 ? 'first' : 'second');
    setDone(r.ok ? `Recorded. ${r.applied > 1 ? `${r.applied} items settled.` : ''}` : r.detail);
  });

  if (done) {
    return <StatusLine tone="success" size={13} type="caption-12">{done}</StatusLine>;
  }

  return (
    <div className="mt-[10px] flex flex-wrap items-center gap-[10px]">
      {candidates.map((c, i) => (
        <button
          key={c.selector + i}
          type="button"
          disabled={pending}
          onClick={() => act(i === 0 ? 0 : 1)}
          className="flex h-[32px] items-center gap-[6px] rounded-[var(--radius-control)] bg-[var(--semantic-success)] px-[13px] disabled:opacity-60"
        >
          <Check size={14} strokeWidth={2} className="text-[var(--accent-on-primary)]" aria-hidden />
          <span className="meta-12_5 text-[var(--accent-on-primary)]">Looks right — {c.label}</span>
        </button>
      ))}
    </div>
  );
}
