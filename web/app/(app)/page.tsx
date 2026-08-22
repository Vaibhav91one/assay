import type { Metadata } from 'next';
import { TopBar } from '@/components/top-bar';
import { homeStats } from '@/lib/home';
import { openDecisions } from '@/lib/queue';
import { Watch } from './watch';

export const metadata: Metadata = { title: 'Assay' };
export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const [stats, queue] = await Promise.all([homeStats(), openDecisions()]);

  return (
    <>
      <TopBar title="Home" />
      <div className="flex flex-1 flex-col">
        <div className="flex flex-1 items-center justify-center px-[32px] py-[48px]">
          <Watch waiting={queue.length} />
        </div>
        <StatsBand stats={stats} />
      </div>
    </>
  );
}

/**
 * The band under the fold. Three numbers, and the third is the one the whole
 * product is judged on -- so it is counted from the retractions table rather
 * than assumed.
 */
function StatsBand({ stats }: { stats: Awaited<ReturnType<typeof homeStats>> }) {
  if (stats.runs === 0) return null;

  return (
    <div className="border-t border-[var(--border-hairline)] px-[56px] py-[28px]">
      <p className="label-10 pb-[10px] text-[var(--text-muted)]">ACROSS ALL SCRAPERS</p>
      <div className="flex flex-wrap items-start gap-x-[64px] gap-y-[20px]">
        <div className="flex flex-col gap-[12px]">
          <p className="title-20 text-[var(--text-primary)]">
            {stats.runs} run{stats.runs === 1 ? '' : 's'} {sinceLabel(stats.since)}
          </p>
          <RunStrip bars={stats.bars} />
        </div>

        <div className="flex flex-col gap-[10px] pt-[4px]">
          <Stat dot="var(--semantic-success)" n={stats.clean} label={`clean run${stats.clean === 1 ? '' : 's'}`} />
          <Stat dot="var(--semantic-warning)" n={stats.waiting} label="waiting on you" />
        </div>

        <div className="flex flex-col gap-[4px] pt-[4px]">
          <Stat dot="var(--semantic-danger)" n={stats.retracted} label="published in error" />
          <p className="caption-11 pl-[18px] text-[var(--text-muted)]">since you started</p>
        </div>
      </div>
    </div>
  );
}

function Stat({ dot, n, label }: { dot: string; n: number; label: string }) {
  return (
    <p className="flex items-baseline gap-[10px]">
      <span className="size-[7px] shrink-0 translate-y-[-2px] rounded-full" style={{ background: dot }} />
      <span className="title-20 text-[var(--text-primary)]">{n}</span>
      <span className="meta-13 text-[var(--text-secondary)]">{label}</span>
    </p>
  );
}

/** One bar per run, oldest left. Amber where a run held something. */
function RunStrip({ bars }: { bars: { runId: number; at: Date; held: boolean }[] }) {
  if (bars.length === 0) return null;
  const first = bars[0];
  const last = bars[bars.length - 1];

  return (
    <div className="flex flex-col gap-[6px]">
      <div className="flex items-end gap-[5px]">
        {bars.map((b) => (
          <span
            key={b.runId}
            title={`run ${b.runId}`}
            className="w-[3px] rounded-[1px]"
            style={{
              height: b.held ? 26 : 18,
              background: b.held ? 'var(--semantic-warning)' : 'var(--accent-brand)',
            }}
          />
        ))}
      </div>
      <div className="flex justify-between">
        <span className="caption-11 text-[var(--text-muted)]">{dayLabel(first.at)}</span>
        <span className="caption-11 text-[var(--text-muted)]">{dayLabel(last.at)}</span>
      </div>
    </div>
  );
}

const DAY = new Intl.DateTimeFormat('en-GB', { weekday: 'short' });

function dayLabel(d: Date): string {
  const at = new Date(d);
  return sameDay(at, new Date()) ? 'today' : DAY.format(at);
}

function sinceLabel(since: Date | null): string {
  if (!since) return 'so far';
  const at = new Date(since);
  return sameDay(at, new Date()) ? 'today' : `since ${DAY.format(at)}`;
}

const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
