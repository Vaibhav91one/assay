'use client';

import { Popover } from '@base-ui/react/popover';

/**
 * The `… ›` idiom: `the full record ›`, `what came back ›`, `details ›`.
 *
 * Every one of these is evidence that supports a decision without being the
 * decision, so it collapses rather than being deleted -- the honesty story
 * needs it reachable, not shouting. Capped at 360px because past that it stops
 * being a disclosure and becomes a screen someone should have designed.
 *
 * Base UI, not the Radix half of `components/ui` -- it is what `sidebar.tsx`
 * and `tooltip.tsx` already compose with, and it is already a dependency.
 *
 * The popup uses `motion-popup` from `app/motion.css` rather than its own
 * numbers -- see `docs/MOTION.md`. That one class carries both halves: it
 * grows out of Base UI's `--transform-origin`, which is the side the popup
 * actually opened on, so the panel arrives out of the `›` rather than out of
 * its own middle -- and it collapses back into the same point on the way out,
 * faster than it came. It used to be `motion-pop-in`, which had no exit at
 * all: the panel was cut rather than closed.
 */
export function Disclosure({
  label,
  children,
  align = 'start',
}: {
  label: string;
  children: React.ReactNode;
  align?: 'start' | 'center' | 'end';
}) {
  return (
    <Popover.Root>
      <Popover.Trigger className="focus-ring press-row meta-12_5 w-fit cursor-pointer rounded-[var(--radius-control)] text-left text-[var(--text-secondary)] transition-colors duration-[var(--duration-tint)] hover:text-[var(--text-primary)] hover:underline">
        {label} ›
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={8} align={align} className="z-50">
          <Popover.Popup className="motion-popup max-h-[60vh] w-[360px] overflow-auto rounded-[var(--radius-card)] bg-[var(--surface-card)] p-[20px] shadow-elevation-floating">
            {children}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

/**
 * The numbers one gate decision was made from.
 *
 * Taken as ONE OBJECT rather than as six props, and that is not a style
 * preference: it means a screen renders `<GateNumbers gate={gate} />` and never
 * writes `gate.score` in its own source. The figures live in exactly one file
 * -- this one -- which is what test/assay-score.test.ts checks by reading the
 * run screen's source text, and what keeps the amendment below from leaking
 * back out into a column.
 *
 * Structural, not the `RunDetail['gate']` type, so `lib/explain.ts` can satisfy
 * it too. Both are built from `gateNumbers()` and `thresholdsOf()`.
 */
export interface GateFigures {
  score: number;
  runnerUp: number | null;
  margin: number;
  tau: number;
  delta: number;
  /** True when the target row carried its own thresholds rather than defaulting. */
  declared?: boolean;
  reproduces: boolean;
}

/**
 * The gate's arithmetic, collapsed. The hybrid settled on 2026-08-23.
 *
 * THE BAND IS STILL THE INTERFACE. Nothing about this reverts the score column
 * docs/FEATURES.md §4 refuses: no float is drawn beside a cell, in a table
 * column, in the published envelope, or anywhere a reader scanning the screen
 * can arrive at one without asking. What changed is only that the numbers are
 * REACHABLE -- the proof story is "here is exactly what I weighed", and a proof
 * that cannot produce the two numbers the decision compared is asking to be
 * taken on trust, which is the one thing this product refuses to ask for.
 *
 * The three objections in §4 are answered by the collapse itself. A number
 * behind a click is not a column anyone can re-threshold at a glance; it is not
 * on every cell, because `ranked` is written at abstain time only; and it
 * arrives with the thresholds it was judged against rather than as a bare
 * float, so it reports a decision rather than handing back a dial.
 *
 * `reproduces` is why this is not just a number formatter. When the recovered
 * scores no longer produce the recorded reason the contract has been edited
 * since, and the thresholds on hand are not the ones this run was judged under
 * -- so they are withheld and said to be withheld. The scores stay: they are
 * what was recorded. It is the LINE through them that would be a fiction.
 */
export function GateNumbers({ gate }: { gate: GateFigures }) {
  const { score, runnerUp, margin, tau, delta, reproduces } = gate;
  const declared = gate.declared ?? false;
  const n = (v: number) => v.toFixed(4);
  return (
    /* copy(G) */
    <Disclosure label="show the numbers">
      <div className="flex flex-col gap-[10px]">
        <p className="label-10 text-[var(--text-muted)]">WHAT THE GATE COMPARED</p>
        <dl className="mono-value-12_5 grid grid-cols-[auto_1fr] gap-x-[16px] gap-y-[4px]">
          <dt className="text-[var(--text-muted)]">top score</dt>
          <dd className="text-[var(--text-primary)]">{n(score)}</dd>
          <dt className="text-[var(--text-muted)]">runner-up</dt>
          <dd className="text-[var(--text-primary)]">
            {runnerUp === null ? 'none — it stood alone' : n(runnerUp)}
          </dd>
          <dt className="text-[var(--text-muted)]">margin</dt>
          <dd className="text-[var(--text-primary)]">{n(margin)}</dd>
        </dl>
        <div className="h-px w-full bg-[var(--border-hairline)]" />
        {reproduces ? (
          /* copy(G) */
          <p className="meta-12_5 text-[var(--text-secondary)]">
            To publish, a candidate needs a score above {tau.toFixed(2)} — the floor (τ) — and to be
            ahead of the runner-up by {delta.toFixed(2)} — the lead (δ).{' '}
            {declared
              ? 'Both are declared on this target’s contract.'
              : 'This target declares neither, so both are the shipped defaults.'}
          </p>
        ) : (
          /* copy(G) */
          <p className="meta-12_5 text-[var(--text-secondary)]">
            The thresholds on hand no longer reproduce the reason recorded against this cell — the
            contract has been edited since — so they are not drawn against these scores. The scores
            are what was written at the time.
          </p>
        )}
        {/* copy(G) */}
        <p className="meta-12_5 text-[var(--text-muted)]">
          The band is still the answer. These are what it was read off, and the arithmetic is
          written out at /docs/assay-score.
        </p>
      </div>
    </Disclosure>
  );
}
