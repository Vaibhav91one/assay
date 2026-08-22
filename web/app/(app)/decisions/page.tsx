import type { Metadata } from 'next';
import { TopBar } from '@/components/top-bar';
import { Empty } from '@/components/empty';
import { openDecisions } from '@/lib/queue';
import { DecisionsList } from './decisions-list';

export const metadata: Metadata = { title: 'Decisions · Assay' };
export const dynamic = 'force-dynamic';

export default async function DecisionsPage() {
  const decisions = await openDecisions();

  return (
    <>
      <TopBar title="Decisions" status={waiting(decisions.length)} />
      <div className="flex w-full flex-col gap-[20px] pl-[56px] pr-[32px] pt-[18px]">
        {decisions.length === 0 ? (
          // Empty is not the same as loading, and it is not a failure either.
          // Nothing waiting means the gate published everything it could
          // justify -- which is the product working, so it says so.
          <Empty title="Nothing is waiting on you.">
            Every cell in the last run was either published or is still being watched. Held cells
            arrive here the moment the gate refuses one.
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
