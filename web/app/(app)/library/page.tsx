import type { Metadata } from 'next';
import Link from 'next/link';
import { TopBar } from '@/components/top-bar';
import { BrandMark } from '@/components/brand-mark';
import { GROUPS } from 'assay/engine/library/index';
// A server component, which is why it may reach the module that carries zod and
// the Bright Data client. `apply.tsx` is the client half and takes a tracker as
// a prop instead -- see the import rule at the top of `src/library/index.ts`.
import { ALL_TRACKERS } from 'assay/engine/connectors/scrapers';

export const metadata: Metadata = { title: 'Library · Assay' };

// The trackers are static data, but the layout above reads the conversation
// rail and the notification queue, so prerendering would only move a database
// read into the build. Every screen under `(app)` says the same.
export const dynamic = 'force-dynamic';

/**
 * The catalogue: a mark, a name, a line.
 *
 * The brand mark fills the left of each card and the text sits to its right.
 * It is the only ornament on this screen and it earns its place by doing the
 * work a label would otherwise do -- you find GitHub by its shape before you
 * read the word. `aria-hidden`, because the name beside it is the real one.
 */
export default function LibraryPage() {
  return (
    <>
      <TopBar title="Library" scraper={null} />
      <div className="flex w-full max-w-[860px] flex-col gap-[22px] pl-[56px] pr-[32px] pb-[48px] pt-[18px]">
        {GROUPS.map((g) => {
          const rows = ALL_TRACKERS.filter((t) => t.group === g.id);
          if (!rows.length) return null;
          return (
            <section key={g.id} className="flex flex-col gap-[8px]">
              <h2 className="label-10 text-[var(--text-muted)]">{g.label.toUpperCase()}</h2>
              <ul className="grid grid-cols-1 gap-[10px] sm:grid-cols-2">
                {rows.map((t) => (
                  <li key={t.id} className="flex">
                    <Link
                      href={`/library/${t.id}`}
                      className="press-row flex w-full items-center gap-[18px] rounded-[var(--radius-card)] border border-[var(--border-default)] bg-[var(--surface-card)] px-[18px] py-[16px] transition-colors duration-[var(--duration-tint)] hover:bg-[var(--surface-subtle)]"
                    >
                      <BrandMark id={t.id} size={38} />
                      <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
                        <span className="body-14 text-[var(--text-primary)]">{t.name}</span>
                        <span className="caption-12 text-[var(--text-secondary)]">
                          {t.subheading}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </>
  );
}
