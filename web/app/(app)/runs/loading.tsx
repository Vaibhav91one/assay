import { TopBar } from '@/components/top-bar';
import { RouteLoader } from '@/components/motion/route-loader';
import { t } from '@/lib/copy';

/**
 * The runs table, waiting.
 *
 * No bar and no percentage: this is one query with no denominator, and a fill
 * that creeps forward on nothing is a lie told to make a wait feel shorter.
 * The screen says what it is doing instead.
 */
export default function RunsLoading() {
  return (
    <>
      <TopBar title={t('nav.runs')} status={t('topbar.loading')} />
      <RouteLoader>Reading the last runs.</RouteLoader>
    </>
  );
}
