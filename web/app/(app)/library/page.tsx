import type { Metadata } from 'next';
import Link from 'next/link';
import { TopBar } from '@/components/top-bar';
import { BrandMark } from '@/components/brand-mark';
import { GROUPS } from 'assay/engine/library/index';
// A server component, which is why it may reach the module that carries zod and
// the Bright Data client. `apply.tsx` is the client half and takes a tracker as
// a prop instead -- see the import rule at the top of `src/library/index.ts`.
import { ALL_TRACKERS } from 'assay/engine/connectors/scrapers';
import { CatalogueSearch } from './search';
import { t } from '@/lib/copy';

export const metadata: Metadata = { title: t('title.library') };

// The trackers are static data, but the layout above reads the conversation
// rail and the notification queue, so prerendering would only move a database
// read into the build. Every screen under `(app)` says the same.
export const dynamic = 'force-dynamic';

/**
 * The catalogue: a mark, a name, a line.
 *
 * The mark fills the left of each card and the text sits to its right. It is
 * the only ornament on this screen and it earns its place by doing the work a
 * label would otherwise do -- you find the shop by the cart and the job board by
 * the briefcase before you read the word, and the shelf you are on is the
 * colour. `aria-hidden`, because the name beside it is the real one. The shelf
 * is passed in because the colour is the CATEGORY'S and never the brand's; see
 * `web/components/brand-mark.tsx`.
 *
 * SEARCH IS ABOVE THE SHELVES, and that order is the honest one. The shelves
 * are twenty-eight brands somebody chose out of 1,744; putting them first and
 * the search underneath would say the choice is the catalogue. It is not, and
 * the box says so in its own heading.
 *
 * THE LAST SHELF IS THE ONE THAT WORKS WITH NO ACCOUNT. Every card above it
 * asks Bright Data for a record and needs a token to do it. The seven page
 * trackers read the page themselves, and the shelf's label says that where
 * somebody with no token will read it before they have wasted a click. See
 * `GROUPS`.
 */
export default function LibraryPage() {
  return (
    <>
      <TopBar title={t('nav.library')} scraper={null} />
      <div className="flex w-full max-w-[860px] flex-col gap-[22px] px-[20px] md:pl-[56px] md:pr-[32px] pb-[48px] pt-[18px]">
        <CatalogueSearch />
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
                      <BrandMark id={t.id} group={t.group} size={38} />
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
