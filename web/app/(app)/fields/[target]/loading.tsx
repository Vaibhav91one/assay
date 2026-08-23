import { TopBar } from '@/components/top-bar';
import { RouteLoader } from '@/components/motion/route-loader';

/**
 * One indexed read of thirty rows, so this is short -- but it still gets a
 * loader rather than nothing, because the sibling `fields/loading.tsx` sets
 * that expectation and a route that flashes blank reads as broken.
 */
export default function TargetValuesLoading() {
  return (
    <>
      <TopBar title="Values" status="loading…" scraper={null} />
      <RouteLoader>Reading what this field has published.</RouteLoader>
    </>
  );
}
