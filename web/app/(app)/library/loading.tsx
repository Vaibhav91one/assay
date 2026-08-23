import { TopBar } from '@/components/top-bar';
import { RouteLoader } from '@/components/motion/route-loader';
import { t } from '@/lib/copy';

/**
 * The templates are static data and load instantly; what this waits on is the
 * layout's own queue read for the notification bell. The sentence says that
 * rather than implying the library itself is being fetched from somewhere.
 */
export default function LibraryLoading() {
  return (
    <>
      <TopBar title={t('nav.library')} status={t('topbar.loading')} scraper={null} />
      <RouteLoader>Opening the library.</RouteLoader>
    </>
  );
}
