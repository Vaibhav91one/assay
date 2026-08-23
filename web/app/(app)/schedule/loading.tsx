import { TopBar } from '@/components/top-bar';
import { RouteLoader } from '@/components/motion/route-loader';
import { t } from '@/lib/copy';

export default function ScheduleLoading() {
  return (
    <>
      {/* `scraper={null}` to match the screen it stands in for. Without it the
          run control would appear on the skeleton and vanish when the calendar
          -- which carries its own -- arrived. */}
      <TopBar title={t('schedule.heading')} status={t('topbar.loading')} scraper={null} />
      <RouteLoader>Reading the clock.</RouteLoader>
    </>
  );
}
