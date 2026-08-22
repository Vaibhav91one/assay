import type { Metadata } from 'next';
import { workersUp } from 'assay/store';
import { TopBar } from '@/components/top-bar';
import { CalendarView } from './calendar-view';
import { calendarData } from './data';
import { VIEWS, type ViewKind } from './calendar';

export const metadata: Metadata = { title: 'Schedule · Assay' };
export const dynamic = 'force-dynamic';

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  // Read together: a schedule drawn without saying whether anything is
  // consuming it is a picture of intentions.
  const now = new Date();
  const workers = await workersUp();
  const [data, { view }] = await Promise.all([calendarData(now, workers), searchParams]);

  // `?view=` seeds the calendar and nothing more -- switching views afterwards
  // is client state, because the whole window is already loaded and a round
  // trip per view would make paging feel like the page was reloading. Seeding
  // it from the URL is what makes a particular month linkable at all.
  const initialView = (VIEWS as readonly string[]).includes(view ?? '')
    ? (view as ViewKind)
    : 'list';

  const running = data.clocks.filter((c) => !c.paused).length;
  const ranToday = data.runs.filter((r) => sameLocalDay(new Date(r.at), now)).length;

  return (
    <>
      {/* `scraper={null}`: this is the one screen that already carries the run
          control, per scraper, in the dialog behind each next-run mark. A copy
          in the bar would be the redundancy every other screen's copy exists
          to remove. */}
      <TopBar
        title="Schedule"
        status={headline(running, data.clocks.length, ranToday)}
        scraper={null}
      />
      {/* 1056 is the drawn content width: past it a month grid stretches into
          seven columns nobody scans across. */}
      <div className="flex w-full max-w-[1112px] flex-col items-start gap-[18px] px-[56px] pb-[64px] pt-[26px]">
        <p className="body-14 w-full max-w-[820px] text-[var(--text-secondary)]">
          What has run, and when the next one is due.
        </p>
        <CalendarView data={data} initialView={initialView} />
      </div>
    </>
  );
}

const sameLocalDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

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
