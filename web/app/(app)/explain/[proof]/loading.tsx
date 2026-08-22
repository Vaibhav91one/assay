import { TopBar } from '@/components/top-bar';
import { RouteLoader } from '@/components/motion/route-loader';

export default function ExplainLoading() {
  return (
    <>
      <TopBar title="Where did this number come from?" status="loading…" />
      <RouteLoader>Rebuilding the record for this cell.</RouteLoader>
    </>
  );
}
