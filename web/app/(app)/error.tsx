'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { RotateCw } from 'lucide-react';
import { Button } from '@/components/button';
import { StatusLine } from '@/components/status-line';
import { t } from '@/lib/copy';

/**
 * A screen that threw, said as what it is.
 *
 * Structure and tone are `explain/[proof]/not-found.tsx`'s -- status line,
 * one paragraph of what actually happened, one way onward -- because a reader
 * should not have to learn a second layout to be told a second kind of bad
 * news.
 *
 * No `TopBar`. That component is async and reads the notification queue, so
 * drawing it here would mean an error boundary opening a Postgres pool to
 * render its own chrome; when the reason this boundary tripped IS the store,
 * that throws again inside the thing meant to survive. The rail either side of
 * this is the app shell and it is still there -- it comes from the layout,
 * which did not fail, or this file would not be what caught it.
 *
 * `reset()` re-renders the segment from scratch. It is offered rather than
 * assumed to work: a transient store, a slow connector and a race all clear on
 * a second attempt, and a genuine bug does not, so the copy says which reading
 * a second failure gives you rather than inviting a third press.
 *
 * `digest` is printed when Next supplies one. In production the message is
 * replaced by a hash before it reaches the browser, and that hash is the only
 * thing tying what the reader is looking at to the line in the server log --
 * withholding it leaves them with nothing to quote.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // The browser console is the only place this exists client-side; the
    // server has already logged its own copy under the same digest.
    console.error('[assay]', error);
  }, [error]);

  return (
    <div className="flex w-full flex-col items-start gap-[10px] px-[20px] md:px-[56px] pt-[48px]">
      <StatusLine tone="danger" type="heading-18" size={18}>
        {t('error.screen.title')}
      </StatusLine>
      <p className="body-13_5 max-w-[560px] text-[var(--text-secondary)]">
        Something on the way to it threw, so the part of the page you can see is
        nothing rather than half of it. Nothing was published, resolved or
        deleted by the attempt — reads are what fail here.
      </p>
      <p className="body-13_5 max-w-[560px] text-[var(--text-secondary)]">
        Trying again runs the same request again, which is worth one press: a
        store that was briefly unreachable usually is not. If it fails twice,
        the reason is in the server log and not on this screen.
      </p>
      {error.digest && (
        <p className="mono-label-12 pt-[2px] text-[var(--text-muted)]">
          digest {error.digest}
        </p>
      )}
      <div className="flex items-center gap-[16px] pt-[14px]">
        <Button variant="outline" icon={RotateCw} onClick={reset}>
          Try again
        </Button>
        <Link href="/" className="meta-13 text-[var(--semantic-link)]">
          Back to home ›
        </Link>
      </div>
    </div>
  );
}
