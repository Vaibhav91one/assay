import type { Metadata } from 'next';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { TopBar } from '@/components/top-bar';
import { TRACKERS, GROUPS, RULED_OUT, CHANGE_NOT_CONDITION } from 'assay/engine/library/index';

export const metadata: Metadata = { title: 'Library · Assay' };

// The trackers are static data, but the layout above this screen reads the
// conversation rail and the notification queue, so prerendering would only move
// a database read into the build. Every other screen under `(app)` says the
// same thing for the same reason.
export const dynamic = 'force-dynamic';

/**
 * The trackers. Pick one, paste a URL, approve.
 *
 * WHY IT IS A ROUTE AND NOT A SECTION OF /skills. The two screens share an
 * idiom -- a registry of real entries, each stating what it wants before you say
 * yes -- and that idiom is reused here down to the shape of a row. The noun is
 * different. `/skills` answers "what may Assay be given", and every control on
 * it toggles this instance's own configuration. This answers "what should Assay
 * watch", and its control CREATES something. Putting a create action among
 * credential switches would point a first-time operator at a page of toggles,
 * and a tracker needs a URL of its own so Home can link straight to one.
 *
 * A CARD IS A NAME AND A LINE. No field count, no cadence, no tier: those are
 * decisions made on the entry, and repeating them here gives the grid twenty
 * numbers nobody compares. The one exception would be a measured badge, and
 * there is none to draw -- the single measured field is on a tracker whose
 * other field is not, so a card-level badge would round a per-field fact.
 *
 * TWO COLUMNS, NOT THREE. Six cards at this content width read as three tidy
 * rows; three columns would leave the last row half empty and make the grid
 * about the layout rather than about the six things in it. It collapses to one
 * column under `sm`.
 */
export default function LibraryPage() {
  return (
    <>
      <TopBar title="Library" status={`${TRACKERS.length} trackers`} scraper={null} />
      <div className="flex w-full max-w-[820px] flex-col gap-[22px] pl-[56px] pr-[32px] pb-[48px] pt-[18px]">
        <div className="flex flex-col gap-[6px]">
          <p className="caption-13 text-[var(--text-secondary)]">
            Pick one, paste the address of a page you care about, and Assay reads it and proposes
            what to watch. Nothing is created until you approve it. None of these has been
            benchmarked — the{' '}
            <Link href="/docs/limitations" className="text-[var(--semantic-link)] hover:underline">
              measured numbers
            </Link>{' '}
            come from one field on three recall sites, and every field says which it is.
          </p>
          {/* Said before anybody picks a card, because it is the thing people
              arrive expecting and it is the thing this build does not do. */}
          <p className="caption-12 text-[var(--text-muted)]">{CHANGE_NOT_CONDITION}</p>
        </div>

        {GROUPS.map((g) => {
          const rows = TRACKERS.filter((t) => t.group === g.id);
          if (!rows.length) return null;
          return (
            <section key={g.id} className="flex flex-col gap-[8px]">
              <h2 className="label-10 text-[var(--text-muted)]">{g.label.toUpperCase()}</h2>
              <ul className="grid grid-cols-1 gap-[10px] sm:grid-cols-2">
                {rows.map((t) => (
                  <li key={t.id} className="flex">
                    <Link
                      href={`/library/${t.id}`}
                      className="press-row flex w-full flex-col gap-[6px] rounded-[var(--radius-card)] border border-[var(--border-default)] bg-[var(--surface-card)] px-[18px] py-[15px] transition-colors duration-[var(--duration-tint)] hover:bg-[var(--surface-subtle)]"
                    >
                      <span className="flex items-center gap-[8px]">
                        <span className="body-14 flex-1 text-[var(--text-primary)]">{t.name}</span>
                        <ChevronRight
                          size={15}
                          strokeWidth={1.5}
                          className="shrink-0 text-[var(--text-muted)]"
                          aria-hidden
                        />
                      </span>
                      <span className="caption-12 text-[var(--text-secondary)]">{t.summary}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}

        {/* Every tracker offers an example page for someone with no URL in
            mind, and this is the other half of that: what was tried as an
            example and is not offered. "Why is X not here" is the first
            question a short list gets, and answering it in the product is
            cheaper than being asked. */}
        <section className="flex flex-col gap-[7px] pt-[4px]">
          <h2 className="label-10 text-[var(--text-muted)]">NOT OFFERED AS EXAMPLES</h2>
          <ul className="flex flex-col gap-[5px]">
            {RULED_OUT.map((r) => (
              <li key={r.site} className="caption-12 text-[var(--text-secondary)]">
                <span className="text-[var(--text-primary)]">{r.site}</span> — failed{' '}
                {r.failed}. {r.detail}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
