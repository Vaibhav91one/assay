import { TopBar } from '@/components/top-bar';
import { RouteLoader } from '@/components/motion/route-loader';
import { t } from '@/lib/copy';

/**
 * Figma `home · loading` (166:1026 in the "1.2 Watch a page" case). Only the
 * segments with no `loading.tsx` of their own fall through to this one --
 * every other route under `(app)/` already has its own -- so in practice this
 * is Home's first paint while `homeStats()`/`waitingCount()`/`getConversation()`
 * resolve.
 */
export default function HomeLoading() {
  return (
    <>
      <TopBar title={t('nav.home')} status={t('topbar.loading')} />
      <RouteLoader>Opening the conversation.</RouteLoader>
    </>
  );
}
