import { TopBar } from '@/components/top-bar';
import { Working, Line, SkeletonCard } from '@/components/loading';

export default function ExplainLoading() {
  return (
    <>
      <TopBar title="Where did this number come from?" status="loading…" />
      <div className="flex w-full flex-col items-start gap-[28px] px-[56px] pt-[48px]">
        <Working>Rebuilding the record for this cell.</Working>
        <div className="flex w-full max-w-[1056px] items-start gap-[24px]">
          <SkeletonCard className="w-[660px] shrink-0">
            <Line w={72} h={8} />
            <Line w={280} h={18} />
            <Line w={420} />
            <Line w={612} />
            <Line w={520} />
          </SkeletonCard>
          <SkeletonCard className="w-[372px] shrink-0">
            <Line w={140} h={8} />
            <Line w={90} h={18} />
            <Line w={324} />
            <Line w={260} />
          </SkeletonCard>
        </div>
      </div>
    </>
  );
}
