import type { Metadata } from 'next';
import { TopBar } from '@/components/top-bar';
import { Empty } from '@/components/empty';
import { blastRadius, rescrapeList, BlastError } from 'assay/engine/blast/index';
import { BlastView } from './blast-view';
import { t } from '@/lib/copy';

export const metadata: Metadata = { title: t('title.blast') };
export const dynamic = 'force-dynamic';

/**
 * F6, as a screen: what a field's current value is suspect across, walked
 * back to the last run that published clean.
 *
 * All the arithmetic already existed (`src/blast/index.ts`, wired to
 * `GET /api/v1/blast` for machine consumers) -- this route is the operator-
 * session read of the same function, the way `decisions/page.tsx` reads
 * `heldQueue()` directly rather than calling its own REST API over HTTP.
 */
export default async function BlastRadiusPage({
  params,
  searchParams,
}: {
  params: Promise<{ target: string; field: string }>;
  searchParams: Promise<{ at_run?: string }>;
}) {
  const { target: rawTarget, field: rawField } = await params;
  const target = decodeURIComponent(rawTarget);
  const field = decodeURIComponent(rawField);
  const { at_run } = await searchParams;

  let window;
  try {
    window = await blastRadius({ target, field, at_run: at_run ? Number(at_run) : undefined });
  } catch (e) {
    if (e instanceof BlastError) {
      return (
        <>
          <TopBar title={t('title.blast')} status={field} scraper={target} />
          <div className="p-[24px]">
            <Empty title="No blast radius to show">{e.message}</Empty>
          </div>
        </>
      );
    }
    throw e;
  }

  const rescrape = window.rows.length ? await rescrapeList(window) : [];

  return (
    <>
      <TopBar
        title={t('title.blast')}
        status={`${window.rows.length} row${window.rows.length === 1 ? '' : 's'} suspect · ${field}`}
        scraper={target}
      />
      <BlastView target={target} field={field} window={window} rescrape={rescrape} />
    </>
  );
}
