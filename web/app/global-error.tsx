'use client';

import { RotateCw } from 'lucide-react';
import { Button } from '@/components/button';
import './globals.css';

/**
 * The floor under everything, including the root layout.
 *
 * `(app)/error.tsx` catches a screen that threw. It cannot catch its own
 * parent: `(app)/layout.tsx` opens Postgres to count the decision queue and
 * list the conversations, so the single most likely real failure in this app
 * -- the store being unreachable -- happens ABOVE that boundary and lands
 * here. Which is why this file is written as though nothing else in the app
 * works, because in the case that reaches it, nothing else did.
 *
 * Next replaces the root layout with this component, so the `<html>` and
 * `<body>` are ours to draw and the fonts and the sidebar are not here. The
 * stylesheet is imported for the palette; the font is named inline because
 * `--font-sans` is written in terms of `--font-questrial`, and that variable
 * is put on `<html>` by the root layout that is currently not rendering.
 *
 * No link home: home is a route in the app that just failed to boot, and
 * offering it would be sending someone back into the thing they are standing
 * outside of. Reloading is the honest verb.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        className="bg-[var(--bg-page)] text-[var(--text-primary)]"
        style={{ fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}
      >
        <main className="flex min-h-screen w-full flex-col items-start gap-[10px] px-[56px] pt-[96px]">
          {/* The one mark that survives when the shell does not. Set in
              --text-primary rather than the brand orange: #ff4d00 measures
              3.33:1 on white, which is a fine reading for a 40px button fill
              and a failing one for an 11px word. */}
          <span className="label-10 text-[var(--text-primary)]">ASSAY</span>
          {/* copy(G) */}
          <h1 className="heading-18 pt-[10px] text-[var(--semantic-danger)]">
            Assay could not start this page.
          </h1>
          <p className="body-13_5 max-w-[560px] text-[var(--text-secondary)]">
            The failure is above every screen, which usually means the process
            cannot reach Postgres or came up without the configuration it needs.
            Nothing has been written; the app has not been able to read.
          </p>
          <p className="body-13_5 max-w-[560px] text-[var(--text-secondary)]">
            Reloading is worth one attempt. After that the answer is in the
            server log, and in whether <span className="mono-value-12_5">DATABASE_URL</span> points
            at a database that is running.
          </p>
          {error.digest && (
            <p className="mono-label-12 pt-[2px] text-[var(--text-muted)]">
              digest {error.digest}
            </p>
          )}
          <div className="pt-[14px]">
            <Button variant="outline" icon={RotateCw} onClick={reset}>
              Reload
            </Button>
          </div>
        </main>
      </body>
    </html>
  );
}
