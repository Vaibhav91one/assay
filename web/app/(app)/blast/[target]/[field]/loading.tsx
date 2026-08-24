import { TopBar } from '@/components/top-bar';
import { RouteLoader } from '@/components/motion/route-loader';
import { t } from '@/lib/copy';

/**
 * Figma `blast-radius · computing` (609:9656) drew a fake "N of 74 runs"
 * progress bar. `blastRadius()` (`src/blast/index.ts`) is one query, not a
 * chunked scan -- there is no real N to count up to, and inventing one would
 * be exactly the fabrication `decisions/loading.tsx` already refused ("the
 * skeleton promised a shape the queue may not have"). This says what is
 * actually happening instead.
 */
export default function BlastLoading() {
  return (
    <>
      <TopBar title={t('title.blast')} status={t('topbar.loading')} />
      <RouteLoader>Walking the run history back to the last clean value.</RouteLoader>
    </>
  );
}
