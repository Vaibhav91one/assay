import { TopBar } from '@/components/top-bar';
import { RouteLoader } from '@/components/motion/route-loader';
import { t } from '@/lib/copy';

export default function AlertLoading() {
  return (
    <>
      <TopBar title={t('title.alert')} status={t('topbar.loading')} />
      <RouteLoader>Reading the episode.</RouteLoader>
    </>
  );
}
