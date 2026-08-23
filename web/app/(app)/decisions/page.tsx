import type { Metadata } from 'next';
import Link from 'next/link';
import { TopBar } from '@/components/top-bar';
import { Empty } from '@/components/empty';
import { heldQueue } from '@/lib/queue';
import { t } from '@/lib/copy';
import { DecisionsList } from './decisions-list';

export const metadata: Metadata = { title: t('title.decisions') };
export const dynamic = 'force-dynamic';

export default async function DecisionsPage() {
  // `items` is a page of cards (capped at 50); `count` is every open item --
  // the same number the rail, the bell and Home state. The header states the
  // count, not the page length, so a 51st decision cannot make them disagree.
  const { items: decisions, count } = await heldQueue();

  return (
    <>
      <TopBar title={t('nav.decisions')} status={waiting(count)} />
      <div className="flex w-full flex-col gap-[20px] pl-[56px] pr-[32px] pt-[18px]">
        {decisions.length === 0 ? (
          // Empty is not the same as loading, and it is not a failure either.
          // Nothing waiting means the gate published everything it could
          // justify -- which is the product working, so it says so.
          <Empty title={t('decisions.empty.title')}>
            {t('decisions.empty.body')}{' '}
            {/* The one screen with no way out. Answering the last decision
                emptied the list and left the reader on a card with nothing to
                click; the question they have next is whether the answer landed,
                and that is a run. */}
            <Link href="/runs" className="text-[var(--semantic-link)] hover:underline">
              {t('decisions.empty.link')}
            </Link>
          </Empty>
        ) : (
          <DecisionsList decisions={decisions} />
        )}
      </div>
    </>
  );
}

const waiting = (n: number) =>
  n === 0 ? 'nothing waiting on you' : `${n} waiting on you`;
