import { TopBar } from '@/components/top-bar';
import { RouteLoader } from '@/components/motion/route-loader';
import { t } from '@/lib/copy';

/**
 * Figma `digest · rendering` (609:10469) staged this too, same reasoning as
 * `blast/loading.tsx` and `incidents/[episode]/loading.tsx`: `composeDigest`
 * is one composed read per field, not three visible stages.
 */
export default function DigestLoading() {
  return (
    <>
      <TopBar title={t('title.digest')} status={t('topbar.loading')} />
      <RouteLoader>Diffing every field in the window.</RouteLoader>
    </>
  );
}
