import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { TopBar } from '@/components/top-bar';
import { IncidentDetail } from './incident-detail';
import { IncidentActions } from './incident-actions';
import { incidentRecord } from 'assay/engine/reports/incident';
import { t } from '@/lib/copy';

// No `requireOperator()` call here: pages under `(app)/` are gated by
// `web/proxy.ts`'s `clerkMiddleware(...).auth.protect()` on the hosted path
// and are self-host's single operator otherwise -- the same as every sibling
// page.tsx in this route group (`decisions/page.tsx`, `runs/page.tsx`, ...),
// none of which re-checks here. Only Server Actions (`assertOperator()`) and
// route handlers under `api/` (`requireOperator()`) re-check on the resource,
// because those two are reachable by a path the proxy's matcher can miss --
// see `lib/auth.ts`'s header. A page component is not.

export const metadata: Metadata = { title: t('title.incident') };
export const dynamic = 'force-dynamic';

/**
 * F14, as a route: one artefact an operator can send someone, reachable by
 * episode id from nothing but that id -- same shape as `/explain/[proof]`.
 *
 * Read-only and operator-session; there is no REST twin under `/api/v1`
 * needed here beyond the one that already exists
 * (`GET /api/v1/reports/incidents/[episode]`) for machine consumers.
 */
export default async function IncidentPage({ params }: { params: Promise<{ episode: string }> }) {
  const { episode } = await params;
  const id = Number(episode);
  if (!Number.isInteger(id)) notFound();

  const r = await incidentRecord(id);
  if (!r) notFound();

  return (
    <>
      <TopBar
        title={t('title.incident')}
        status={`episode ${r.episode} · ${r.target}`}
        scraper={r.target.split('__')[0] ?? null}
        action={<IncidentActions episode={r.episode} />}
      />
      <div className="flex w-full flex-col items-start px-[20px] md:px-[56px] pb-[48px] pt-[48px]">
        <IncidentDetail r={r} />
      </div>
    </>
  );
}
