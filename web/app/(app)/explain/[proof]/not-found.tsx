import Link from 'next/link';
import { TopBar } from '@/components/top-bar';
import { StatusLine } from '@/components/status-line';
import { t } from '@/lib/copy';

/**
 * A proof id that resolves to nothing. Distinct from loading and from a cell
 * that exists but published nothing -- three different things, three different
 * screens.
 */
export default function ProofNotFound() {
  return (
    <>
      <TopBar title={t('explain.heading')} status={t('explain.notFound.status')} />
      <div className="flex w-full flex-col items-start gap-[10px] px-[20px] md:px-[56px] pt-[48px]">
        <StatusLine tone="danger" type="heading-18" size={18}>
          No cell carries that proof id.
        </StatusLine>
        <p className="body-13_5 max-w-[560px] text-[var(--text-secondary)]">
          Proof ids are written once, on the run that published the cell, and never reused. A
          missing one means the id was mistyped or the store it came from is not this one.
        </p>
        <Link href="/runs" className="meta-13 mt-[8px] text-[var(--semantic-link)]">
          Back to runs ›
        </Link>
      </div>
    </>
  );
}
