import { TopBar } from '@/components/top-bar';
import { RouteLoader } from '@/components/motion/route-loader';

export default function SettingsLoading() {
  return (
    <>
      <TopBar title="Settings" status="loading…" action={null} />
      <RouteLoader>Reading what is actually in force.</RouteLoader>
    </>
  );
}
