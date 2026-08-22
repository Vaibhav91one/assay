import type { Metadata } from 'next';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { TopBar } from '@/components/top-bar';
import { TRACKERS } from 'assay/engine/library/index';

export const metadata: Metadata = { title: 'Library · Assay' };

// The trackers are static data, but the layout above reads the conversation
// rail and the notification queue, so prerendering would only move a database
// read into the build. Every screen under `(app)` says the same.
export const dynamic = 'force-dynamic';

/** Cards with a name and enough to tell them apart. */
export default function LibraryPage() {
  return (
    <>
      <TopBar title="Library" scraper={null} />
      <div className="flex w-full max-w-[820px] flex-col pl-[56px] pr-[32px] pb-[48px] pt-[18px]">
        <ul className="grid grid-cols-1 gap-[10px] sm:grid-cols-2">
          {TRACKERS.map((t) => (
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
                <span className="caption-12 text-[var(--text-secondary)]">{t.subheading}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
