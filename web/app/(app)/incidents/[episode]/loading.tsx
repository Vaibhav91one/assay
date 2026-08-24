import { TopBar } from '@/components/top-bar';
import { RouteLoader } from '@/components/motion/route-loader';
import { t } from '@/lib/copy';

/**
 * Figma `incident-record · composing` (609:10154) staged its loading as a
 * checklist ("gathered the runs", "grouped into one break", "counting rows",
 * "rendering"). `incidentRecord()` is one composed read, not four sequential
 * steps this app can observe finishing -- same reasoning `blast/loading.tsx`
 * already gives for not faking a progress count.
 */
export default function IncidentLoading() {
  return (
    <>
      <TopBar title={t('title.incident')} status={t('topbar.loading')} />
      <RouteLoader>Composing the record from the run log.</RouteLoader>
    </>
  );
}
