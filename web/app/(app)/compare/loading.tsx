import { TopBar } from '@/components/top-bar';
import { Working, Line, SkeletonCard } from '@/components/loading';

export default function CompareLoading() {
  return (
    <>
      <TopBar title="Compare" status="loading…" />
      <div className="flex w-full max-w-[1168px] flex-col items-start gap-[24px] px-[56px] pt-[40px]">
        <Line w={560} h={14} />
        <Working>Reading the last seven days, field by field.</Working>
        <SkeletonCard className="w-full">
          <Line w={72} h={8} />
          <Line w={200} h={18} />
          <Line w="min(900px, 100%)" />
        </SkeletonCard>
        <div className="flex w-full flex-col">
          {Array.from({ length: 3 }, (_, i) => (
            <div
              key={i}
              className="flex items-center gap-[24px] border-t border-[var(--border-hairline)] py-[10px]"
            >
              <Line w={120} h={12} />
              <Line w={130} h={12} />
              <Line w={280} h={12} />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
