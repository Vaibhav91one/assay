import { TopBar } from '@/components/top-bar';
import { RouteLoader } from '@/components/motion/route-loader';

/**
 * One run, waiting.
 *
 * Same rule as the runs list: no bar and no percentage. This is a handful of
 * queries with no denominator, and a fill that creeps forward on nothing is a
 * lie told to make a wait feel shorter.
 */
export default function RunLoading() {
  return (
    <>
      <TopBar title="Run" status="loading…" />
      <RouteLoader>Reading what this run did.</RouteLoader>
    </>
  );
}
