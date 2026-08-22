import type { Metadata } from 'next';
import { TopBar } from '@/components/top-bar';
import { Empty } from '@/components/empty';
import { TimelineLanes, type Lane } from '@/components/timeline-lanes';
import { scheduleView, until } from '@/lib/schedule';
import { stamp } from '@/lib/when';

export const metadata: Metadata = { title: 'Schedule · Assay' };
export const dynamic = 'force-dynamic';

export default async function SchedulePage() {
  const v = await scheduleView();
  const running = v.scrapers.filter((s) => !s.paused).length;

  const lanes: Lane[] = v.scrapers.map((s) => ({
    key: s.scraper,
    label: s.scraper,
    dim: s.paused,
    ticks: [
      ...s.ran.map((r) => ({
        at: r.at,
        kind: 'ran' as const,
        title: r.runs === 1 ? `ran ${stamp(r.when)}` : `${r.runs} runs, ${stamp(r.when)}`,
      })),
      ...s.upcoming.map((u) => ({
        at: u.at,
        kind: 'upcoming' as const,
        title: `due ${stamp(u.when)}`,
      })),
    ],
    cadence: s.paused ? 'paused' : s.cadence,
    next: s.paused ? '' : until(s.nextRunAt, v.now),
  }));

  return (
    <>
      <TopBar title="Schedule" status={headline(running, v.scrapers.length, v.runsToday)} />
      {/* 1056 is the drawn content width: past it the cadence and next-run
          cells drift a screen's width away from the lane they belong to. */}
      <div className="flex w-full max-w-[1112px] flex-col items-start px-[56px] pt-[44px]">
        <p className="body-14 w-full text-[var(--text-secondary)]">
          How often Assay checks each page.
        </p>
        {v.scrapers.length === 0 ? (
          <div className="w-full pt-[22px]">
            <Empty title="Nothing is scheduled.">
              A scraper takes a cadence when it is created. Until one exists there is no clock to
              draw.
            </Empty>
          </div>
        ) : (
          <TimelineLanes
            lanes={lanes}
            axis={['midnight', 'now', 'midnight']}
            nowAt={(v.now.getTime() - v.dayStart.getTime()) / (v.dayEnd.getTime() - v.dayStart.getTime())}
            legend={`filled = ran · hollow = coming up · one mark per minute${
              v.runsToday > marks(v) ? `, so ${v.runsToday} runs sit on ${marks(v)} marks` : ''
            }`}
          />
        )}
      </div>
    </>
  );
}

const marks = (v: Awaited<ReturnType<typeof scheduleView>>) =>
  v.scrapers.reduce((n, s) => n + s.ran.length, 0);

/**
 * The one thing worth saying in the chrome: how much of this is actually
 * running. A count of scrapers alone hides a paused one.
 */
function headline(running: number, total: number, ranToday: number): string {
  if (total === 0) return 'nothing scheduled';
  const paused = total - running;
  return [
    `${running} running`,
    paused > 0 ? `${paused} paused` : null,
    `${ranToday} run${ranToday === 1 ? '' : 's'} today`,
  ]
    .filter(Boolean)
    .join(' · ');
}
