import type { Metadata } from 'next';
import { TopBar } from '@/components/top-bar';
import { composeDigest } from 'assay/engine/reports/digest';
import { DigestView } from './digest-view';
import { t } from '@/lib/copy';

export const metadata: Metadata = { title: t('title.digest') };
export const dynamic = 'force-dynamic';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * A preview of the periodic report (F-something, `src/reports/digest.ts`),
 * over `?since=&until=` — defaulting to the last 7 days, which is a display
 * default for THIS page only. `composeDigest()` itself takes no default
 * window on purpose (its own comment says so); the actual send cadence comes
 * from `digests.cadence`, read by `dueDigests()` in the worker, not from
 * anything this screen decides.
 */
export default async function DigestPage({
  searchParams,
}: {
  searchParams: Promise<{ since?: string; until?: string }>;
}) {
  const { since: sinceParam, until: untilParam } = await searchParams;
  const until = untilParam ? new Date(untilParam) : new Date();
  const since = sinceParam ? new Date(sinceParam) : new Date(until.getTime() - WEEK_MS);

  const digest = await composeDigest({ since, until });

  return (
    <>
      <TopBar
        title={t('title.digest')}
        status={digest.subject}
      />
      <DigestView digest={digest} since={since.toISOString()} until={until.toISOString()} />
    </>
  );
}
