import { TopBar } from '@/components/top-bar';
import { Working, Line } from '@/components/loading';

/**
 * The runs table, waiting.
 *
 * No bar and no percentage: this is one query with no denominator, and a fill
 * that creeps forward on nothing is a lie told to make a wait feel shorter.
 * The screen says what it is doing instead.
 */
export default function RunsLoading() {
  return (
    <>
      <TopBar title="Runs" status="loading…" />
      <div className="flex w-full flex-col gap-[20px] pl-[56px] pr-[32px] pt-[18px]">
        <div className="flex items-center gap-[28px]">
          {[34, 52, 36, 42].map((w) => (
            <Line key={w} w={w} h={12} />
          ))}
        </div>

        <Working>Reading the last runs.</Working>

        <div className="flex flex-col gap-[6px]">
          <Line w={92} h={8} />
          <div className="flex items-end gap-[5px]">
            {Array.from({ length: 24 }, (_, i) => (
              <Line key={i} w={3} h={18} />
            ))}
          </div>
        </div>

        <div className="flex w-full flex-col">
          {Array.from({ length: 8 }, (_, i) => (
            <div
              key={i}
              className="flex items-center gap-[24px] border-b border-[var(--border-hairline)] py-[12px]"
            >
              <Line w={40} h={12} />
              <Line w={120} h={12} />
              <Line w={90} h={12} />
              <Line w={200} h={12} />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
