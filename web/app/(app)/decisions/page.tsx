import type { Metadata } from 'next';
import { TopBar } from '@/components/top-bar';
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
          <div className="flex w-full flex-col gap-[8px] rounded-[var(--radius-card)] border border-[var(--border-default)] bg-[var(--surface-card)] px-[24px] py-[20px]">
            <p className="heading-18 text-[var(--text-primary)]">Nothing is waiting on you.</p>
            <p className="body-13_5 text-[var(--text-secondary)]">
              Every cell in the last run was either published or is still being watched. Held cells
              arrive here the moment the gate refuses one.
            </p>
          </div>
        ) : (
          <DecisionsList decisions={decisions} />
        )}
      </div>
    </>
  );
}

const waiting = (n: number) =>
  n === 0 ? 'nothing waiting on you' : `${n} waiting on you`;
