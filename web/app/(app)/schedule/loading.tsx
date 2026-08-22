import { TopBar } from '@/components/top-bar';
import { RouteLoader } from '@/components/motion/route-loader';

export default function ScheduleLoading() {
  return (
    <>
      <TopBar title="Schedule" status="loading…" />
      <RouteLoader>Reading the clock.</RouteLoader>
    </>
  );
}
