import { TopBar } from '@/components/top-bar';
import { RouteLoader } from '@/components/motion/route-loader';

export default function CompareLoading() {
  return (
    <>
      <TopBar title="Compare" status="loading…" />
      <RouteLoader>Reading the last seven days, field by field.</RouteLoader>
    </>
  );
}
