import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { TopBar } from '@/components/top-bar';
import { BrandMark } from '@/components/brand-mark';
import { libraryTrackerById } from 'assay/engine/connectors/scrapers';
import { Apply } from '../apply';

// Static data, but `TopBar` reads the notification queue, so every screen under
// this layout is dynamic regardless.
export const dynamic = 'force-dynamic';

export async function generateMetadata(
  { params }: { params: Promise<{ entry: string }> },
): Promise<Metadata> {
  const t = libraryTrackerById((await params).entry);
  return { title: t ? `${t.name} · Assay` : 'Library · Assay' };
}

/** Title, one line, a link box, a button, and the table of what it found. */
export default async function TrackerPage({ params, searchParams }: {
  params: Promise<{ entry: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const t = libraryTrackerById((await params).entry);
  if (!t) notFound();

  // Where a search result lands. `/library/dataset?dataset=gd_...` prefills the
  // box rather than making the operator copy an id across two screens.
  //
  // READ HERE RATHER THAN IN THE CLIENT COMPONENT so `Apply` takes it as a prop
  // and needs no `useSearchParams`, which would put the whole subtree behind a
  // Suspense boundary to say one string. It is not trusted: it is the same
  // channel the text box uses and `read` validates it identically.
  const q = (await searchParams).dataset;
  const dataset = typeof q === 'string' ? q : '';

  return (
    <>
      <TopBar title={t.name} scraper={null} />
      <div className="flex w-full max-w-[620px] flex-col gap-[16px] px-[20px] md:pl-[56px] md:pr-[32px] pb-[64px] pt-[18px]">
        {/* The mark, and the site it belongs to, as a link out. GitHub's and
            Wikimedia's permissions are both written around a logo that links
            to them, and this is where that link lives -- a card on the
            catalogue is already a link to this page, and anchors do not nest.

            A prebuilt scraper links to the DOC PAGE its dataset_id was read
            off, not to the site: the dataset_id is the claim this card makes
            about a third party's API, and the link is where that claim can be
            checked. */}
        <a
          href={t.kind === 'scraper' ? t.docUrl : new URL(t.placeholder).origin}
          target="_blank"
          rel="noreferrer noopener"
          className="flex w-fit items-center gap-[12px]"
        >
          <BrandMark id={t.id} group={t.group} size={28} />
          <span className="body-14 text-[var(--text-secondary)]">{t.subheading}</span>
        </a>
        <Apply tracker={t} dataset={dataset} />
      </div>
    </>
  );
}
