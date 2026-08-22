'use client';

import { notFound } from 'next/navigation';
import { useState } from 'react';
import { Collapse } from '@/components/motion/collapse';
import { useGlide } from '@/components/motion/glide';
import { Equaliser, Shimmer, Spinner } from '@/components/motion/shimmer';
import { Stagger } from '@/components/motion/stagger';
import { usePrefersReducedMotion } from '@/lib/motion';

/**
 * Every primitive on one page, so a change to a duration can be looked at
 * rather than reasoned about. Dev only -- there is no link to it and it is
 * not a product surface. Turn the OS reduced-motion setting on and reload:
 * the banner at the top flips, the shimmer becomes plain text, the bars stop
 * at a legible height, and nothing else moves.
 */
export default function MotionPage() {
  const reduced = usePrefersReducedMotion();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<number | null>(null);
  const rows = ['price', 'title', 'availability', 'sku'];
  const glide = useGlide<HTMLButtonElement>(active, rows.length);

  // 404 in production -- a playground is not a product surface. Below the
  // hooks, not above them: NODE_ENV is fixed for any given build, but a
  // conditional return before a hook is a shape nobody should have to
  // think twice about.
  if (process.env.NODE_ENV === 'production') notFound();

  return (
    <main className="mx-auto flex max-w-[720px] flex-col gap-[40px] p-[48px]">
      <header className="flex flex-col gap-[6px]">
        <h1 className="title-22">Motion</h1>
        <p className="meta-13 text-[var(--text-secondary)]">
          prefers-reduced-motion is currently{' '}
          <strong className="text-[var(--text-primary)]">{reduced ? 'on' : 'off'}</strong>.
        </p>
      </header>

      <Section title="Shimmer, spinner, equaliser" note="The three ways to say work is happening.">
        <div className="flex flex-col gap-[12px]">
          <Shimmer className="body-14">Healing 3 selectors</Shimmer>
          <p className="body-14 flex items-center gap-[8px]">
            <Spinner />
            Reading the page
          </p>
          <p className="body-14 flex items-center gap-[8px]">
            <Equaliser />
            Listening
          </p>
        </div>
      </Section>

      <Section title="Collapse" note="0fr to 1fr. No measurement, no fixed height.">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="press-row meta-13 w-fit cursor-pointer text-[var(--semantic-link)]"
        >
          the full record ›
        </button>
        <Collapse open={open} contentClassName="pt-[10px]">
          <p className="body-13_5 text-[var(--text-secondary)]">
            Two paragraphs, so the height it opens to is not the height of one line. The wrapper
            never learns this number; the grid row does.
          </p>
          <p className="body-13_5 pt-[10px] text-[var(--text-secondary)]">
            Padding sits on the clipped child. A margin here would escape the clip and the row
            would jump on open.
          </p>
        </Collapse>
      </Section>

      <Section title="Glide" note="Hover the rows. One band travels; it does not flash in at mount.">
        <div className="relative" onMouseLeave={() => setActive(null)}>
          <span
            aria-hidden
            className="absolute inset-x-0 rounded-[var(--radius-control)] bg-[var(--surface-subtle)]"
            style={glide.style}
          />
          {rows.map((row, i) => (
            <button
              key={row}
              type="button"
              ref={glide.setRef(i)}
              onMouseEnter={() => setActive(i)}
              className="press-row body-14 relative block w-full cursor-pointer px-[12px] py-[9px] text-left"
            >
              {row}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Stagger" note="90ms apart. Reload to replay.">
        <Stagger className="flex flex-col gap-[8px]">
          {['first', 'second', 'third', 'fourth'].map((n) => (
            <span key={n} className="body-14 text-[var(--text-secondary)]">
              {n}
            </span>
          ))}
        </Stagger>
      </Section>

      <Section title="Press" note="Hold each one down.">
        <div className="flex items-center gap-[12px]">
          <button
            type="button"
            className="press-icon grid size-[32px] cursor-pointer place-items-center rounded-[var(--radius-control)] border border-[var(--border-default)]"
          >
            ↻
          </button>
          <button
            type="button"
            className="press-wide meta-13 cursor-pointer rounded-[var(--radius-control)] bg-[var(--accent-brand)] px-[20px] py-[9px] text-[var(--accent-on-primary)]"
          >
            New scrape
          </button>
        </div>
      </Section>
    </main>
  );
}

function Section({
  title,
  note,
  children,
}: {
  title: string;
  note: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-[10px] border-t border-[var(--border-hairline)] pt-[20px]">
      <h2 className="label-10_5 uppercase text-[var(--text-muted)]">{title}</h2>
      <p className="meta-12_5 text-[var(--text-secondary)]">{note}</p>
      <div className="pt-[6px]">{children}</div>
    </section>
  );
}
