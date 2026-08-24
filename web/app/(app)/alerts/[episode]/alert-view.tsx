import Link from 'next/link';
import { StatusLine } from '@/components/status-line';

/** `Message` from `src/connectors/deliver.ts` — headline/body/footer, the shape the chat payload builder takes. */
interface Message { headline: string; body: string; footer: string }

/**
 * `alert` / `alert · delivery degraded` on screen. `notified` is parsed here
 * for exactly the two prefixes `markNotified()` writes for a bounce-degraded
 * send (`webhook (email bounced)`, `undelivered: email bounced, ...`) — see
 * `src/connectors/resend-bounce.ts`.
 */
export function AlertView({
  episode,
  field,
  discord,
  emailSubject,
  emailHtml,
  notified,
}: {
  episode: number;
  field: string;
  discord: Message;
  emailSubject: string;
  emailHtml: string;
  notified: string | null;
}) {
  const degraded = notified != null && /email bounced|email marked as spam/.test(notified);

  return (
    <div className="flex w-full max-w-[720px] flex-col gap-[20px]">
      {degraded && (
        <StatusLine tone="warning" size={14} type="body-14">
          {notified.startsWith('webhook')
            ? `Email bounced — this alert fell back to the webhook. Fix the domain in `
            : `Email bounced, and there was no webhook fallback configured. `}
          {notified.startsWith('webhook') && (
            <Link href="/connect?tab=email" className="underline">Connect ›</Link>
          )}
        </StatusLine>
      )}

      <section className="flex flex-col gap-[8px]">
        <p className="label-10 text-[var(--text-muted)]">DISCORD · #data-oncall</p>
        <div className="rounded-[var(--radius-card)] border border-[var(--border-default)] bg-[var(--surface-card)] p-[16px]">
          <p className="body-14 text-[var(--text-primary)]">{discord.headline}</p>
          <p className="meta-13 mt-[6px] text-[var(--text-secondary)]">{discord.body}</p>
          <p className="caption-12 mt-[10px] text-[var(--text-muted)]">{discord.footer}</p>
        </div>
      </section>

      <section className="flex flex-col gap-[8px]">
        <p className="label-10 text-[var(--text-muted)]">EMAIL · via Resend</p>
        <div className="rounded-[var(--radius-card)] border border-[var(--border-default)] bg-[var(--surface-card)] p-[16px]">
          <p className="body-14 text-[var(--text-primary)]">{emailSubject}</p>
          {/* The real HTML the send uses -- `breakBody()`, already escaped by
              that function's own `esc()`. Not a second copy of the wording. */}
          <div className="meta-13 mt-[6px] text-[var(--text-secondary)]" dangerouslySetInnerHTML={{ __html: emailHtml }} />
        </div>
      </section>

      <Link href={`/incidents/${episode}`} className="meta-12_5 w-fit text-[var(--semantic-link)] hover:underline">
        Open decision ›
      </Link>

      <p className="meta-11 text-[var(--text-muted)]">
        One message per break episode, per field · delivery in <Link href="/connect" className="hover:underline">Connect ›</Link>
      </p>
    </div>
  );
}
