'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Copy as CopyIcon } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Copy } from '@/components/copy';
import { Spinner } from '@/components/motion/shimmer';
import { StatusLine } from '@/components/status-line';
import { ProofDetail } from '@/components/proof-detail';
import { proofAction } from '@/app/(app)/explain/actions';
import type { Provenance } from '@/lib/explain';
import { DURATION } from '@/lib/motion';

/**
 * Where a number came from, without leaving the screen that asked.
 *
 * `/explain/[proof]` was the only way to read a proof, and it is a whole screen
 * you navigate to and then have to navigate back from. An operator working the
 * decisions queue who wants to check one cell loses their place in the queue to
 * do it; on a run they lose their scroll position in a table of sixty rows.
 * The answer is short enough to read in a column, so it opens in one.
 *
 * The route is not replaced and could not be. It is the surface a proof id
 * printed on a warehouse row lands on months later, when there is no screen to
 * open a sheet over. Both render `ProofDetail` -- one component, one copy of
 * the answer.
 *
 * The data arrives on open, not with the page. Decisions renders up to fifty
 * cards and each proof is four store queries, so the alternative is two hundred
 * queries for a question nobody has asked.
 *
 * A button, not a link. It opens a dialog, and a link that does not navigate is
 * a lie to anyone driving by keyboard or reading the status bar. What is lost
 * -- middle-clicking the proof into a new tab -- is handed back inside the
 * sheet as `Open as a page ›`, which is a real link to the real route.
 */
export function ProofSheet({
  proof,
  className,
  children,
}: {
  proof: string;
  className?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger className={className}>{children}</SheetTrigger>
      {/* Full width below `sm`, a 560px column above it. A 560px panel pinned
          to the right edge of a 380px phone is not a sheet, it is the screen
          with a sliver of scrim down one side that nothing useful is behind --
          so at that width it takes the whole viewport and the scrim goes to
          work only as the thing a tap dismisses. The route is still there for
          anyone who would rather have the page. */}
      {/* No `aria-label` here: `SheetTitle` registers itself as the popup's
          `aria-labelledby`, and a label alongside it would win and hide the
          heading a screen reader should be reading. */}
      <SheetContent side="right" className="overflow-y-auto">
        <Body proof={proof} open={open} />
      </SheetContent>
    </Sheet>
  );
}

type State = { status: 'loading' } | { status: 'ready'; p: Provenance } | { status: 'missing' };

function Body({ proof, open }: { proof: string; open: boolean }) {
  const [state, setState] = useState<State>({ status: 'loading' });
  // Nothing is drawn for --duration-loader-delay, the same threshold every
  // route loader in the app uses: a proof that resolves inside it should arrive
  // rather than flash a spinner on the way past.
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (!open) return;
    let live = true;
    setState({ status: 'loading' });
    setSlow(false);
    const t = setTimeout(() => live && setSlow(true), DURATION.loaderDelay);
    proofAction(proof)
      .then((p) => live && setState(p ? { status: 'ready', p } : { status: 'missing' }))
      .catch(() => live && setState({ status: 'missing' }));
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [proof, open]);

  return (
    <>
      <SheetHeader className="border-b border-[var(--border-hairline)]">
        <SheetTitle>Where did this number come from?</SheetTitle>
        <SheetDescription>
          proof <span className="mono-value-12_5">{proof}</span>
        </SheetDescription>
        <span className="mt-[10px] flex items-center gap-[16px]">
          <Copy
            text={proof}
            receipt={<>Copied <code className="mono-value-12_5">{proof}</code></>}
            className="meta-12_5 flex items-center gap-[6px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:underline"
          >
            <CopyIcon size={13} strokeWidth={1.5} aria-hidden />
            Copy proof id
          </Copy>
          <Link href={`/explain/${proof}`} className="meta-12_5 text-[var(--semantic-link)] hover:underline">
            Open as a page ›
          </Link>
        </span>
      </SheetHeader>

      <div className="flex w-full flex-col items-start px-[24px] pb-[32px]" aria-busy={state.status === 'loading'}>
        {state.status === 'ready' ? (
          <ProofDetail p={state.p} />
        ) : state.status === 'missing' ? (
          <div className="mt-[28px] flex flex-col items-start gap-[10px]">
            <StatusLine tone="danger" type="body-14" size={16}>
              No cell carries that proof id.
            </StatusLine>
            <p className="meta-12_5 text-[var(--text-secondary)]">
              Proof ids are written once, on the run that published the cell, and never reused.
            </p>
          </div>
        ) : (
          <div role="status" className="mt-[28px] flex items-center gap-[10px]">
            {slow && (
              <>
                <Spinner size={16} className="text-[var(--semantic-link)]" />
                <span className="meta-12_5 text-[var(--text-secondary)]">
                  Rebuilding the record for this cell.
                </span>
              </>
            )}
          </div>
        )}
      </div>
    </>
  );
}
