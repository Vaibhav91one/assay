import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { TopBar } from '@/components/top-bar';
import { trackerById } from 'assay/engine/library/index';
import { Apply } from '../apply';

// Static data, but `TopBar` reads the notification queue, so every screen under
// this layout is dynamic regardless.
export const dynamic = 'force-dynamic';

export async function generateMetadata(
  { params }: { params: Promise<{ entry: string }> },
): Promise<Metadata> {
  const t = trackerById((await params).entry);
  return { title: t ? `${t.name} · Assay` : 'Library · Assay' };
}

/** Title, one line, a link box, a button, and the table of what it found. */
export default async function TrackerPage({ params }: { params: Promise<{ entry: string }> }) {
  const t = trackerById((await params).entry);
  if (!t) notFound();

  return (
    <>
      <TopBar title={t.name} scraper={null} />
      <div className="flex w-full max-w-[620px] flex-col gap-[16px] pl-[56px] pr-[32px] pb-[64px] pt-[18px]">
        <p className="body-14 text-[var(--text-secondary)]">{t.subheading}</p>
        <Apply tracker={t} />
      </div>
    </>
  );
}
