import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Copy as CopyIcon } from 'lucide-react';
import { TopBar } from '@/components/top-bar';
import { actionVariants } from '@/components/button';
import { Copy } from '@/components/copy';
import { ProofDetail } from '@/components/proof-detail';
import { provenance } from '@/lib/explain';

export const metadata: Metadata = { title: 'Where did this number come from? · Assay' };
export const dynamic = 'force-dynamic';

/**
 * A whole screen for one cell, reachable from nothing but a proof id.
 *
 * This route stays a route. It is the half of the feature that has to survive
 * being pasted into an address bar months later, off a warehouse row that
 * carries the proof id in a column -- there is no app session to open a sheet
 * over, and there may not have been one for a year. `ProofSheet` is the other
 * half, for an operator who is already inside the product and should not have
 * to leave the screen they are working on. Both render `ProofDetail`, which is
 * the only copy of the answer.
 */
export default async function ExplainPage({ params }: { params: Promise<{ proof: string }> }) {
  const { proof } = await params;
  const p = await provenance(proof);
  if (!p) notFound();

  return (
    <>
      <TopBar
        title="Where did this number come from?"
        status={`proof ${p.proof}`}
        // The target this value came off. Reading a proof and wanting the page
        // read again is one thought, not two screens.
        scraper={p.scraper}
        action={
          <Copy
            text={p.proof}
            receipt={<>Copied <code className="mono-value-12_5">{p.proof}</code></>}
            className={actionVariants({ variant: 'outline' })}
          >
            <CopyIcon size={16} strokeWidth={1.5} aria-hidden />
            Copy
          </Copy>
        }
      />

      {/* "Any published value, months later, traced back to the page it came
          off." came off. The top bar already asks "Where did this number come
          from?" and the two cards below answer it; the sentence between them
          restated the question as a feature description. */}
      <div className="flex w-full flex-col items-start px-[56px] pb-[48px] pt-[48px]">
        <ProofDetail p={p} />
      </div>
    </>
  );
}
