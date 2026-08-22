import { TopBar } from '@/components/top-bar';
import { RouteLoader } from '@/components/motion/route-loader';

/**
 * The runs table, waiting.
 *
 * No bar and no percentage: this is one query with no denominator, and a fill
 * that creeps forward on nothing is a lie told to make a wait feel shorter.
 * The screen says what it is doing instead.
 */
export default function RunsLoading() {
  return (
    <>
      <TopBar title="Runs" status="loading…" />
      <RouteLoader>Reading the last runs.</RouteLoader>
    </>
  );
}
