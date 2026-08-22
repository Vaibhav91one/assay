import type { Metadata } from 'next';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { TopBar } from '@/components/top-bar';
import { TRACKERS, GROUPS, RULED_OUT } from 'assay/engine/library/index';

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
 * A ROW IS A NAME AND A LINE. No field count, no cadence, no tier: those are
 * decisions made on the entry, and repeating them here gives five rows twenty
 * numbers nobody compares.
 */
export default function LibraryPage() {
  return (
    <>
      <TopBar title="Library" status={`${TRACKERS.length} trackers`} scraper={null} />
      <div className="flex w-full max-w-[820px] flex-col gap-[22px] pl-[56px] pr-[32px] pb-[48px] pt-[18px]">
        <p className="caption-13 text-[var(--text-secondary)]">
          Pick one, paste the address of a page you care about, and Assay reads it and proposes
          what to watch. Nothing is created until you approve it. None of these has been
          benchmarked — the{' '}
          <Link href="/docs/limitations" className="text-[var(--semantic-link)] hover:underline">
            measured numbers
          </Link>{' '}
          come from one field on three recall sites, and every field below says which it is.
        </p>

        {GROUPS.map((g) => {
          const rows = TRACKERS.filter((t) => t.group === g.id);
          if (!rows.length) return null;
          return (
            <section key={g.id} className="flex flex-col gap-[8px]">
              <h2 className="label-10 text-[var(--text-muted)]">{g.label.toUpperCase()}</h2>
              <ul className="flex flex-col gap-[10px]">
                {rows.map((t) => (
                  <li key={t.id}>
                    <Link
                      href={`/library/${t.id}`}
                      className="press-row flex items-center gap-[16px] rounded-[var(--radius-card)] border border-[var(--border-default)] bg-[var(--surface-card)] px-[18px] py-[14px] transition-colors duration-[var(--duration-tint)] hover:bg-[var(--surface-subtle)]"
                    >
                      <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
                        <span className="body-14 text-[var(--text-primary)]">{t.name}</span>
                        <span className="caption-12 text-[var(--text-secondary)]">{t.summary}</span>
                      </span>
                      <ChevronRight
                        size={16}
                        strokeWidth={1.5}
                        className="shrink-0 text-[var(--text-muted)]"
                        aria-hidden
                      />
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
