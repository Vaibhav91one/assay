'use client';

import { useState, useTransition } from 'react';
import { Send } from 'lucide-react';
import { StatusLine } from '@/components/status-line';
import { actionVariants } from '@/components/button';
import { Empty } from '@/components/empty';
import type { Digest } from 'assay/engine/reports/digest';
import { sendDigestNow } from './actions';

/**
 * Figma `digest` (436:203): CHANGED / WITHHELD / UNCHANGED, and a real "Send a
 * test" -- delivering the window shown, through whatever chat connector is
 * configured, rather than a message that only pretends to.
 */
export function DigestView({ digest, since, until }: { digest: Digest; since: string; until: string }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const send = () => start(async () => {
    const r = await sendDigestNow(since, until);
    setResult(r.ok ? { ok: true, text: r.summary } : { ok: false, text: r.detail });
  });

  return (
    <div className="flex flex-col gap-[24px] p-[24px]">
      <p className="meta-12_5 text-[var(--text-muted)]">
        {new Date(since).toLocaleDateString()} – {new Date(until).toLocaleDateString()}
      </p>

      {digest.changes.length > 0 && (
        <Section title={`CHANGED — ${digest.changes.length}`}>
          {digest.changes.map((c) => (
            <Row key={`${c.target}/${c.field}`} target={c.target} field={c.field} what={c.what} />
          ))}
        </Section>
      )}

      {digest.withheld.length > 0 && (
        <Section title={`WITHHELD — ${digest.withheld.length}`}>
          {digest.withheld.map((c) => (
            <Row key={`${c.target}/${c.field}`} target={c.target} field={c.field} what={c.what} tone="warning" />
          ))}
        </Section>
      )}

      {digest.changes.length === 0 && digest.withheld.length === 0 && (
        <Empty title="Nothing to report">Nothing changed and nothing was withheld this window.</Empty>
      )}

      <p className="meta-12_5 text-[var(--text-muted)]">
        {digest.unchanged} field{digest.unchanged === 1 ? '' : 's'} unchanged this window.
      </p>

      <div className="flex items-center gap-[12px]">
        <button type="button" disabled={pending} onClick={send} className={actionVariants({ variant: 'primary' })}>
          <Send size={16} strokeWidth={1.5} aria-hidden />
          {pending ? 'Sending…' : 'Send a test'}
        </button>
        {result && (
          <StatusLine tone={result.ok ? 'success' : 'danger'} size={13} type="caption-12">
            {result.text}
          </StatusLine>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-[8px]">
      <p className="label-10 text-[var(--text-muted)]">{title}</p>
      <div className="flex flex-col gap-[6px] rounded-[var(--radius-card)] border border-[var(--border-default)] bg-[var(--surface-card)] p-[16px]">
        {children}
      </div>
    </section>
  );
}

function Row({ target, field, what, tone }: { target: string; field: string; what: string; tone?: 'warning' }) {
  return (
    <p className="meta-13 text-[var(--text-secondary)]">
      <span className="text-[var(--text-primary)]">{target}</span> / {field} — {what}
      {tone === 'warning' && <span className="ml-[6px] text-[var(--semantic-warning)]">held</span>}
    </p>
  );
}
