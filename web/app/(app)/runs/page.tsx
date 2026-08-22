import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, CircleAlert } from 'lucide-react';
import { TopBar } from '@/components/top-bar';
import { actionVariants } from '@/components/button';
import { RunStrip } from '@/components/run-strip';
import { StatusLine } from '@/components/status-line';
import { runsView, OUTCOMES, type Outcome, type RunRow } from '@/lib/runs';
import { t } from '@/lib/copy';
import { when } from '@/lib/when';

export const metadata: Metadata = { title: t('title.runs') };
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
      <TopBar title={t('nav.runs')} status={summary(v.total, v.healed, v.held)} />
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
            label={`LAST ${v.recent.length} RUN${v.recent.length === 1 ? '' : 'S'}`}
            bars={[...v.recent].reverse().map((r) => ({ runId: r.runId, held: r.outcome === 'held' }))}
          />
        )}

        {v.rows.length === 0 ? (
          <p className="body-13_5 text-[var(--text-secondary)]">
            {filter === 'all' ? t('runs.none') : `No ${filter} runs in the last ${v.total}.`}
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
      <Link href="/decisions" className={actionVariants({ variant: 'link' })}>
        <ArrowRight size={16} strokeWidth={1.5} aria-hidden />
        Open the decision{items.length === 1 ? '' : 's'}
      </Link>
    </div>
  );
}

function RunsTable({ rows }: { rows: RunRow[] }) {
  return (
    <table className="w-full border-collapse">
      <thead>
        <tr className="border-b border-[var(--border-hairline)] text-left">
          {[
            t('runs.table.head.run'),
            t('runs.table.head.when'),
            t('runs.table.head.scraper'),
            t('runs.table.head.what'),
            '',
          ].map((h, i) => (
            <th key={h + i} className="caption-12 pb-[8px] font-normal text-[var(--text-muted)]">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.runId} className="border-b border-[var(--border-hairline)]">
            <td className="w-[64px] py-[12px]">
              <Link href={`/runs/${r.runId}`} className="mono-value-13 text-[var(--semantic-link)]">
                {r.runId}
              </Link>
            </td>
            <td className="body-13_5 w-[180px] py-[12px] text-[var(--text-primary)]">{when(r.at)}</td>
            <td className="body-13_5 py-[12px] text-[var(--text-primary)]">{r.scraper}</td>
            <td className="py-[12px]"><Happened row={r} /></td>
            <td className="py-[12px] text-right">
              {/* Every run opens, not only the ones with a cell worth explaining.
                  A clean run and a skipped one are answers too, and until this
                  route existed the only thing to open was a proof -- which sent
                  a reader to the provenance of one value when what they clicked
                  was a run. */}
              <Link href={`/runs/${r.runId}`} className="meta-13 text-[var(--semantic-link)]">
                {t('runs.table.open')}
              </Link>
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
      <StatusLine tone="warning">
        <span className="text-[var(--text-primary)]">
          held <span className="mono-value-13">{row.heldField}</span> for review
        </span>
      </StatusLine>
    );
  }
  if (row.outcome === 'healed') {
    return (
      <StatusLine tone="success">
        <span className="text-[var(--text-primary)]">{t('runs.outcome.healed')}</span>
      </StatusLine>
    );
  }
  return (
    <StatusLine tone="success" muted>
      {t('runs.outcome.clean')}
    </StatusLine>
  );
}

// `${total} run${...}`, not `${total} runs`: a fresh instance with one run in it
// read "1 runs · 0 healed · 0 held" in the top bar. `healed` and `held` are
// participles and do not take one.
const summary = (total: number, healed: number, held: number) =>
  total === 0
    ? t('runs.summary.none')
    : `${total} run${total === 1 ? '' : 's'} · ${healed} healed · ${held} held`;
