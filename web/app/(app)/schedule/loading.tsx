import { TopBar } from '@/components/top-bar';
import { Working, Line } from '@/components/loading';

export default function ScheduleLoading() {
  return (
    <>
      <TopBar title="Schedule" status="loading…" />
      <div className="flex w-full max-w-[1112px] flex-col items-start gap-[22px] px-[56px] pt-[44px]">
        <Line w={260} h={14} />
        <Working>Reading the clock.</Working>
        <div className="flex w-full flex-col">
          {Array.from({ length: 4 }, (_, i) => (
            <div
              key={i}
              className="flex w-full items-center border-t border-[var(--border-hairline)] py-[13px]"
            >
              <div className="w-[212px] shrink-0">
                <Line w={130} h={12} />
              </div>
              <Line w={620} h={1} />
              <div className="min-w-px flex-1" />
              <div className="w-[70px] shrink-0">
                <Line w={28} h={10} />
              </div>
              <div className="flex w-[80px] shrink-0 justify-end">
                <Line w={40} h={10} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
