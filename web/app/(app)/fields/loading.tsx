import { TopBar } from '@/components/top-bar';
import { RouteLoader } from '@/components/motion/route-loader';
import { t } from '@/lib/copy';

/**
 * Grading a field re-reads every page kept for it, so this wait is real and
 * measured in seconds. It still gets no bar: the count of pages is not known
 * until the query that is running has come back.
 */
export default function FieldsLoading() {
  return (
    <>
      <TopBar title={t('nav.fields')} status={t('topbar.loading')} />
      <RouteLoader>Reading every page kept for these fields.</RouteLoader>
    </>
  );
}
