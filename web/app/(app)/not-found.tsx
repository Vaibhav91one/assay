import Link from 'next/link';
import { TopBar } from '@/components/top-bar';
import { StatusLine } from '@/components/status-line';

/**
 * An id in the URL that resolves to nothing, anywhere under the app shell.
 *
 * `explain/[proof]/not-found.tsx` stays where it is and this does not replace
 * it: a proof id can be mistyped OR can belong to another store, which is a
 * specific thing worth saying and only true of proofs. This is the answer for
 * everything else -- `runs/[run]/page.tsx` and `library/[entry]/page.tsx` both
 * call `notFound()` and until now got the framework's unstyled default, which
 * is a screen with no rail, no palette and no way back.
 *
 * Two links rather than one, and they are not decoration. A missing run and a
 * missing catalogue entry are the two ways to arrive here, so the two lists
 * that would have contained the thing are both offered instead of guessing
 * which one the reader wanted.
 */
export default function AppNotFound() {
  return (
    <>
      <TopBar title="Not found" status="nothing at this address" scraper={null} />
      <div className="flex w-full flex-col items-start gap-[10px] px-[56px] pt-[48px]">
        {/* copy(G) */}
        <StatusLine tone="warning" type="heading-18" size={18}>
          There is nothing at this address.
        </StatusLine>
        <p className="body-13_5 max-w-[560px] text-[var(--text-secondary)]">
          Ids in Assay are handed out by the store and never reused, so a URL
          that resolves to nothing was either mistyped or points at a record
          this instance does not hold. Nothing has been deleted to make this
          happen — a run or a catalogue entry that once existed here still
          would.
        </p>
        <div className="flex items-center gap-[20px] pt-[8px]">
          <Link href="/runs" className="meta-13 text-[var(--semantic-link)]">
            Back to runs ›
          </Link>
          <Link href="/library" className="meta-13 text-[var(--semantic-link)]">
            Back to the library ›
          </Link>
        </div>
      </div>
    </>
  );
}
