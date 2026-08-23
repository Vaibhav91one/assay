import { TopBar } from '@/components/top-bar';
import { RouteLoader } from '@/components/motion/route-loader';
import { t } from '@/lib/copy';

export default function AuditLoading() {
  return (
    <>
      <TopBar title={t('audit.heading')} status={t('topbar.loading')} scraper={null} />
      <RouteLoader>Counting nulls across the snapshot, field by field.</RouteLoader>
    </>
  );
}
