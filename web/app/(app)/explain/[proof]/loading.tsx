import { TopBar } from '@/components/top-bar';
import { RouteLoader } from '@/components/motion/route-loader';
import { t } from '@/lib/copy';

export default function ExplainLoading() {
  return (
    <>
      <TopBar title={t('explain.heading')} status={t('topbar.loading')} />
      <RouteLoader>Rebuilding the record for this cell.</RouteLoader>
    </>
  );
}
