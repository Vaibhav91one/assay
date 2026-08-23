import type { Metadata } from 'next';
import { TopBar } from '@/components/top-bar';
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
      <div className="flex w-full flex-col gap-[20px] px-[20px] md:pl-[56px] md:pr-[32px] pt-[18px]">
        {/* Always the list component, even with nothing to list: answering the
            LAST decision revalidates this page to empty, and if the empty
            state lived here the swap would unmount the list -- and the undo
            toast inside it -- at the exact moment the operator most needs the
            undo. The list owns its own empty state instead. */}
        <DecisionsList decisions={decisions} />
      </div>
    </>
  );
}

const waiting = (n: number) =>
  n === 0 ? 'nothing waiting on you' : `${n} waiting on you`;
