import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { TopBar } from '@/components/top-bar';
import { incidentRecord } from 'assay/engine/reports/incident';
import { breakMessage } from 'assay/engine/connectors/deliver';
import { breakSubject, breakBody } from 'assay/engine/notify';
import { AlertView } from './alert-view';
import { t } from '@/lib/copy';

export const metadata: Metadata = { title: t('title.alert') };
export const dynamic = 'force-dynamic';

/**
 * Figma `alert` (407:2195) + `alert · delivery degraded` (408:2303): what the
 * break notification for this episode actually said, and how it actually
 * went out. Built from the same content the real send used
 * (`breakMessage()`/`breakBody()`, `src/connectors/deliver.ts` and
 * `src/notify.ts`) — this is a preview of the real thing, not a second copy
 * of its wording.
 */
export default async function AlertPage({ params }: { params: Promise<{ episode: string }> }) {
  const { episode } = await params;
  const id = Number(episode);
  if (!Number.isInteger(id)) notFound();

  const r = await incidentRecord(id);
  if (!r) notFound();

  const heldNow = r.held[r.held.length - 1];
  const diagnosis = r.cause?.plain
    ? `${heldNow?.why?.plain ?? 'held'} — ${r.cause.plain}.`
    : (heldNow?.why?.plain ?? 'Held.');

  const discord = breakMessage({
    target: r.target, field: r.field, diagnosis, run: r.openedRun, rowsHeld: r.held.length,
  });
  const emailHtml = breakBody({
    target: r.target, field: r.field, diagnosis, rowsHeld: r.held.length, since: r.openedRun,
  });
  const emailSubject = breakSubject({ target: r.target, field: r.field });

  return (
    <>
      <TopBar title={t('title.alert')} status={`episode ${r.episode} · ${r.target}`} scraper={r.target.split('__')[0] ?? null} />
      <div className="flex w-full flex-col items-start px-[20px] md:px-[56px] pb-[48px] pt-[36px]">
        <AlertView
          episode={r.episode}
          field={r.field}
          discord={discord}
          emailSubject={emailSubject}
          emailHtml={emailHtml}
          notified={r.notified}
        />
      </div>
    </>
  );
}
