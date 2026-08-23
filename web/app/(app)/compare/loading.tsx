import { TopBar } from '@/components/top-bar';
import { RouteLoader } from '@/components/motion/route-loader';
import { t } from '@/lib/copy';

export default function CompareLoading() {
  return (
    <>
      <TopBar title={t('compare.heading')} status={t('topbar.loading')} />
      <RouteLoader>Reading the last seven days, field by field.</RouteLoader>
    </>
  );
}
