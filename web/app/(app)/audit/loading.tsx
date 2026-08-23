import { TopBar } from '@/components/top-bar';
import { RouteLoader } from '@/components/motion/route-loader';

export default function AuditLoading() {
  return (
    <>
      <TopBar title="Field audit" status="loading…" scraper={null} />
      <RouteLoader>Counting nulls across the snapshot, field by field.</RouteLoader>
    </>
  );
}
