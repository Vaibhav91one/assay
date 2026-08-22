import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Check, CircleAlert } from 'lucide-react';
import { TopBar } from '@/components/top-bar';
import { RunStrip } from '@/components/run-strip';
import { runsView, OUTCOMES, type Outcome, type RunRow } from '@/lib/runs';

export const metadata: Metadata = { title: 'Runs · Assay' };
export const dynamic = 'force-dynamic';

export default async function RunsPage({
  searchParams,
}: {
  searchParams: Promise<{ show?: string }>;
}) {
  const { show } = await searchParams;
  const filter: Outcome = (OUTCOMES as readonly string[]).includes(show ?? '')
    ? (show as Outcome)
    : 'all';
  const v = await runsView(filter);

  return (
    <>
      <TopBar title="Runs" status={summary(v.total, v.healed, v.held)} />
      <div className="flex w-full flex-col gap-[20px] pl-[56px] pr-[32px] pt-[18px]">
        <nav className="flex items-center gap-[28px]">
          {OUTCOMES.map((o) => (
            <Link
              key={o}
              href={o === 'all' ? '/runs' : `/runs?show=${o}`}
              aria-current={filter === o ? 'page' : undefined}
              className={`meta-13 capitalize ${
                filter === o ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'
              }`}
            >
              {o}
            </Link>
          ))}
        </nav>

        {v.needsYou.length > 0 && <NeedsYou items={v.needsYou} />}

        {v.recent.length > 0 && (
          <RunStrip
            label={`LAST ${v.recent.length} RUNS`}
            bars={[...v.recent].reverse().map((r) => ({ runId: r.runId, held: r.outcome === 'held' }))}
          />
        )}

        {v.rows.length === 0 ? (
          <p className="body-13_5 text-[var(--text-secondary)]">
            {filter === 'all'
              ? 'No runs yet. The first one happens when a scraper is due.'
              : `No ${filter} runs in the last ${v.total}.`}
          </p>
        ) : (
          <RunsTable rows={v.rows} />
        )}
      </div>
    </>
  );
}

function NeedsYou({ items }: { items: NonNullable<Awaited<ReturnType<typeof runsView>>['needsYou']> }) {
  return (
    <div className="flex items-center gap-[24px] rounded-[var(--radius-card)] border border-[var(--border-default)] bg-[var(--surface-card)] px-[24px] py-[18px]">
      <div className="flex min-w-0 flex-1 flex-col gap-[6px]">
        <p className="flex items-center gap-[8px]">
          <CircleAlert size={16} strokeWidth={1.5} className="text-[var(--semantic-warning)]" aria-hidden />
          <span className="body-14 text-[var(--text-primary)]">
            {items.length} need{items.length === 1 ? 's' : ''} you
          </span>
        </p>
        <p className="meta-12_5 flex flex-wrap gap-x-[24px] gap-y-[4px] text-[var(--text-secondary)]">
          {items.slice(0, 3).map((i) => (
            <span key={i.proof}>
              run {i.runId} · <span className="mono-value-12_5">{i.field}</span> held, {when(i.at)}
            </span>
          ))}
        </p>
      </div>
      <Link
        href="/decisions"
        className="flex h-[40px] shrink-0 items-center gap-[10px] rounded-[var(--radius-control)] bg-[var(--semantic-link)] px-[18px] hover:bg-[var(--semantic-link-hover)]"
      >
        <ArrowRight size={16} strokeWidth={1.5} className="text-[var(--accent-on-primary)]" aria-hidden />
        <span className="body-13_5 text-[var(--accent-on-primary)]">
          Open the decision{items.length === 1 ? '' : 's'}
        </span>
      </Link>
    </div>
  );
}

function RunsTable({ rows }: { rows: RunRow[] }) {
  return (
    <table className="w-full border-collapse">
      <thead>
        <tr className="border-b border-[var(--border-hairline)] text-left">
          {['run', 'when', 'scraper', 'what happened', ''].map((h, i) => (
            <th key={h + i} className="caption-12 pb-[8px] font-normal text-[var(--text-muted)]">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.runId} className="border-b border-[var(--border-hairline)]">
            <td className="mono-value-13 w-[64px] py-[12px] text-[var(--text-primary)]">{r.runId}</td>
            <td className="body-13_5 w-[180px] py-[12px] text-[var(--text-primary)]">{when(r.at)}</td>
            <td className="body-13_5 py-[12px] text-[var(--text-primary)]">{r.scraper}</td>
            <td className="py-[12px]"><Happened row={r} /></td>
            <td className="py-[12px] text-right">
              {r.proof && r.outcome !== 'clean' && (
                <Link href={`/explain/${r.proof}`} className="meta-13 text-[var(--semantic-link)]">
                  details ›
                </Link>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * What a run did, in the product's words rather than the engine's.
 *
 * "clean" is muted on purpose: most runs are clean, and a wall of green ticks
 * shouting at equal weight to a held cell is how a held cell gets missed.
 */
function Happened({ row }: { row: RunRow }) {
  if (row.outcome === 'held') {
    return (
      <span className="flex items-center gap-[8px]">
        <CircleAlert size={15} strokeWidth={1.5} className="text-[var(--semantic-warning)]" aria-hidden />
        <span className="body-13_5 text-[var(--text-primary)]">
          held <span className="mono-value-13">{row.heldField}</span> for review
        </span>
      </span>
    );
  }
  if (row.outcome === 'healed') {
    return (
      <span className="flex items-center gap-[8px]">
        <Check size={15} strokeWidth={1.5} className="text-[var(--semantic-success)]" aria-hidden />
        <span className="body-13_5 text-[var(--text-primary)]">moved, found it again</span>
      </span>
    );
  }
  return (
    <span className="flex items-center gap-[8px]">
      <Check size={15} strokeWidth={1.5} className="text-[var(--semantic-success)]" aria-hidden />
      <span className="body-13_5 text-[var(--text-muted)]">clean</span>
    </span>
  );
}

const summary = (total: number, healed: number, held: number) =>
  total === 0 ? 'no runs yet' : `${total} runs · ${healed} healed · ${held} held`;

const TIME = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' });
const DAY = new Intl.DateTimeFormat('en-GB', { weekday: 'short' });

function when(d: Date): string {
  const at = new Date(d);
  const now = new Date();
  const days = Math.floor((startOfDay(now) - startOfDay(at)) / 86_400_000);
  if (days === 0) return `today ${TIME.format(at)}`;
  if (days === 1) return `yesterday ${TIME.format(at)}`;
  if (days < 7) return `${DAY.format(at)} ${TIME.format(at)}`;
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(at);
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
