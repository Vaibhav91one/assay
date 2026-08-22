import { TopBar } from '@/components/top-bar';
import { Working, Line } from '@/components/loading';

/**
 * Figma `decisions · loading` (412:2922). Three different things, three
 * different screens: this is not the empty queue and it is not a store that
 * cannot be reached.
 */
export default function DecisionsLoading() {
  return (
    <>
      <TopBar title="Decisions" status="loading…" />
      <div className="flex w-full flex-col gap-[20px] pl-[56px] pr-[32px] pt-[18px]">
        <Working>Reading the queue.</Working>

        <div className="flex h-[327px] w-full max-w-[1080px] flex-col gap-[18px] rounded-[var(--radius-card)] border border-[var(--border-hairline)] bg-[var(--surface-card)] px-[20px] py-[18px]">
          <Line w={560} h={14} />
          <div className="flex h-[196px] items-start gap-[20px]">
            {[0, 1].map((i) => (
              <div
                key={i}
                className="flex h-full min-w-0 flex-1 flex-col gap-[14px] rounded-[var(--radius-control)] border border-[var(--border-hairline)] p-[18px]"
              >
                <Line w={300} />
                <Line w="min(420px, 100%)" />
                <Line w="min(360px, 100%)" />
              </div>
            ))}
          </div>
        </div>

        <div className="flex h-[77px] w-full max-w-[1080px] flex-col rounded-[var(--radius-card)] border border-[var(--border-hairline)] bg-[var(--surface-card)] px-[20px] py-[18px]">
          <Line w={420} h={12} />
        </div>
      </div>
    </>
  );
}
