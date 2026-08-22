import { TopBar } from '@/components/top-bar';
import { Working, Line } from '@/components/loading';

export default function SettingsLoading() {
  return (
    <>
      <TopBar title="Settings" status="loading…" action={null} />
      <div className="flex w-full max-w-[1112px] flex-col items-start gap-[26px] px-[56px] pt-[26px]">
        <Line w={160} h={8} />
        <Working>Reading what is actually in force.</Working>
        {[3, 4].map((rows) => (
          <div key={rows} className="flex w-full flex-col">
            {Array.from({ length: rows }, (_, i) => (
              <div
                key={i}
                className="flex items-center gap-[24px] border-t border-[var(--border-hairline)] py-[13px]"
              >
                <Line w={220} h={12} />
                <Line w={140} h={12} />
                <Line w={180} h={12} />
              </div>
            ))}
          </div>
        ))}
      </div>
    </>
  );
}
