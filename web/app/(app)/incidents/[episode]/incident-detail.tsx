import Link from 'next/link';
import { StatusLine } from '@/components/status-line';
import { stamp } from '@/lib/when';
import type { IncidentRecord } from 'assay/engine/reports/incident';

/**
 * F14 on screen. One document an operator can send someone -- Figma
 * `incident-record` (435:2) -- rendered from `incidentRecord()`
 * (`src/reports/incident.ts`), which already composes everything here purely
 * from rows that exist. Nothing in this file computes a new fact; it lays out
 * what the record already says.
 */
export function IncidentDetail({ r }: { r: IncidentRecord }) {
  return (
    <div className="flex w-full max-w-[900px] flex-col gap-[28px]">
      <section className="flex flex-col gap-[8px] rounded-[var(--radius-card)] border border-[var(--border-default)] bg-[var(--surface-card)] p-[24px]">
        <div className="flex flex-wrap items-center gap-[10px]">
          <StatusLine tone={r.open ? 'warning' : 'success'} size={16} type="heading-18">
            episode {r.episode} · {r.open ? 'open' : 'closed'}
          </StatusLine>
        </div>
        <p className="meta-13 text-[var(--text-secondary)]">
          {r.target} — field <span className="mono-value-12_5">{r.field}</span>
        </p>
        <p className="meta-12_5 text-[var(--text-muted)]">
          opened run {r.openedRun}{r.openedAt ? `, ${stamp(r.openedAt)}` : ''}
          {r.closedRun != null && (
            <> · closed run {r.closedRun}{r.closedAt ? `, ${stamp(r.closedAt)}` : ''}</>
          )}
        </p>
        {r.cause?.plain && (
          <p className="meta-12_5 text-[var(--text-muted)]">cause: {r.cause.plain}</p>
        )}
        {r.notified && (
          <p className="meta-12_5 text-[var(--text-muted)]">
            delivery: {r.notified}{' '}
            <Link href={`/alerts/${r.episode}`} className="text-[var(--semantic-link)] hover:underline">
              See the alert ›
            </Link>
          </p>
        )}
      </section>

      {r.held.length > 0 && (
        <Section title={`HELD — ${r.held.length} cell${r.held.length === 1 ? '' : 's'}`}>
          <p className="meta-13 text-[var(--text-secondary)]">
            The refusals. Every one of these is a value the gate would not vouch for, published as
            a labelled hole instead of a guess.
          </p>
          <Table
            head={['run', 'why', 'decision']}
            rows={r.held.map((h) => [
              <Link key="run" href={`/explain/${h.proof}`} className="text-[var(--semantic-link)] hover:underline">
                {h.run}
              </Link>,
              h.why?.plain ?? h.why?.code ?? '—',
              h.decision
                ? h.decision.undoneAt
                  ? 'undone'
                  : h.decision.what?.plain ?? (h.decision.resolvedBy ? 'resolved' : 'still open')
                : 'no queue item',
            ])}
          />
        </Section>
      )}

      {r.heals.length > 0 && (
        <Section title={`HEALS — ${r.heals.length}`}>
          <Table
            head={['run', 'from', 'to', 'reverted']}
            rows={r.heals.map((h) => [
              <Link key="run" href={`/runs/${h.run}`} className="text-[var(--semantic-link)] hover:underline">
                {h.run}
              </Link>,
              h.from ?? '—',
              h.to,
              h.reverted ? 'yes' : 'no',
            ])}
          />
        </Section>
      )}

      {r.retractions.length > 0 && (
        <Section title={`RETRACTIONS — ${r.retractions.length}`}>
          <Table
            head={['runs', 'rows', 'exported']}
            rows={r.retractions.map((rt) => [
              `${rt.fromRun}–${rt.toRun}`,
              rt.rows ?? '—',
              rt.exportedAt ? stamp(rt.exportedAt) : 'not yet',
            ])}
          />
        </Section>
      )}

      <Section title={`WHAT IT COST YOU`}>
        <div className="flex flex-wrap gap-x-[40px] gap-y-[14px]">
          <Stat n={r.retractions.filter((rt) => rt.rows != null).reduce((s, rt) => s + (rt.rows ?? 0), 0)} label="rows retracted" />
          <Stat n={r.suspect.length} label="rows still suspect" />
        </div>
        {/* Figma's frame also shows "wrong values published: 0". Dropped
            deliberately -- this record can count what it RETRACTED, which is
            what it knows is wrong. It has no way to count a wrong value nobody
            has caught yet, and printing a 0 next to that label would read as a
            claim this document cannot back. */}
        <p className="meta-12_5 mt-[10px] text-[var(--text-muted)]">
          Rows still suspect are the ones this episode's window covers that have not been
          retracted or superseded — not a claim that they are wrong, only that this record
          cannot yet say they are right.
        </p>
      </Section>

      <p className="meta-12_5 text-[var(--text-muted)]">
        Generated from the run log, not written by hand.
      </p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-[10px]">
      <p className="label-10 text-[var(--text-muted)]">{title}</p>
      {children}
    </section>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <div className="flex flex-col gap-[2px]">
      <p className="title-20 text-[var(--text-primary)]">{n}</p>
      <p className="caption-12 text-[var(--text-muted)]">{label}</p>
    </div>
  );
}

function Table({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="overflow-x-auto rounded-[var(--radius-card)] border border-[var(--border-default)]">
      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-[var(--border-hairline)]">
            {head.map((h) => (
              <th key={h} className="label-10 px-[14px] py-[8px] text-[var(--text-muted)]">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-[var(--border-hairline)] last:border-0">
              {row.map((cell, j) => (
                <td key={j} className="meta-12_5 px-[14px] py-[8px] text-[var(--text-primary)]">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
