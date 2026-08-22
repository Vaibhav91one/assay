import { TopBar } from '@/components/top-bar';
import { Working, Line } from '@/components/loading';

/**
 * Grading a field re-reads every page kept for it, so this wait is real and
 * measured in seconds. It still gets no bar: the count of pages is not known
 * until the query that is running has come back.
 */
export default function FieldsLoading() {
  return (
    <>
      <TopBar title="Fields" status="loading…" />
      <div className="flex w-full flex-col items-start gap-[22px] px-[56px] pt-[44px]">
        <Line w={480} h={14} />
        <Working>Reading every page kept for these fields.</Working>
        <div className="flex w-full flex-col">
          {Array.from({ length: 6 }, (_, i) => (
            <div
              key={i}
              className="flex items-center gap-[24px] border-t border-[var(--border-hairline)] py-[12px]"
            >
              <Line w={150} h={12} />
              <Line w={46} h={12} />
              <Line w={90} h={6} />
              <Line w={300} h={12} />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
