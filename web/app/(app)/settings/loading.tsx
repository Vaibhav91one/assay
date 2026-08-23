import { TopBar } from '@/components/top-bar';
import { RouteLoader } from '@/components/motion/route-loader';
import { t } from '@/lib/copy';

export default function SettingsLoading() {
  return (
    <>
      <TopBar title={t('settings.heading')} status={t('topbar.loading')} action={null} />
      <RouteLoader>Reading what is actually in force.</RouteLoader>
    </>
  );
}
