import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Download, Hand } from 'lucide-react';
import { TopBar } from '@/components/top-bar';
import { Empty } from '@/components/empty';
import { actionVariants } from '@/components/button';
import { targetHistory, type FieldValue } from '@/lib/fields';
import { HELD_BECAUSE } from 'assay/engine/reports/vocabulary';
import { stamp } from '@/lib/when';
import { t } from '@/lib/copy';

export const metadata: Metadata = { title: t('title.values') };
export const dynamic = 'force-dynamic';

const LIMIT = 30;

/**
 * What one field has actually said, run by run.
 *
 * THE FIELDS TABLE COULD NOT BE CLICKED. It had a fragility grade, a seen
 * ratio and a last-change stamp -- every one of them a summary of values the
 * screen never showed. The obvious question a reader has in front of "seen in
 * 22/30" is "what did it say the other eight times", and there was nowhere to
 * go and ask it.
 *
 * A HELD RUN IS A ROW, NOT A GAP. This is the whole argument of the product
 * rendered as a table: a healer's export of the same thirty runs has thirty
 * values in it, several of them wrong, and no way to tell which. This one has
 * the holes in it, labelled, in run order, with the gate's reason attached.
 * Dropping those rows -- or letting the last value carry forward into them --
 * would be this screen quietly doing the thing the gate refuses to do.
 */
export default async function TargetValuesPage({
  params,
}: {
  params: Promise<{ target: string }>;
}) {
  const { target } = await params;
  const id = decodeURIComponent(target);
  const history = await targetHistory(id, LIMIT);

  // No rows and no such target are the same query here, so a made-up id lands
  // on a 404 rather than on an empty table that implies the target exists.
  if (history.rows.length === 0) notFound();

  const held = history.rows.filter((r) => r.value === null).length;

  return (
    <>
      <TopBar title={history.scraper} status={headline(history.rows.length, held)} scraper={history.scraper} />
      <div className="flex w-full max-w-[1112px] flex-col items-start gap-[18px] px-[56px] pb-[64px] pt-[26px]">
        <div className="flex w-full flex-wrap items-center gap-[16px]">
          <span className="mono-value-13 text-[var(--text-secondary)]">{history.targetId}</span>
          <Link href="/fields" className="meta-13 text-[var(--semantic-link)] hover:underline">
            {t('values.allFields')}
          </Link>
          {/* A plain link, not a fetch-and-blob: the browser knows how to save
              a response, and a route with a filename header can be
              middle-clicked, bookmarked and curled. Same reasoning as the
              conversation export route. */}
          <a
            href={`/fields/${encodeURIComponent(history.targetId)}/export`}
            className={actionVariants({ variant: 'outline', className: 'ml-auto' })}
          >
            <Download size={13} strokeWidth={1.5} aria-hidden />
            {t('values.download')}
          </a>
        </div>

        {history.rows.length === 0 ? (
          <Empty title={t('values.empty.title')}>{t('values.empty.body')}</Empty>
        ) : (
          <table className="w-full table-fixed border-collapse">
            <colgroup>
              <col style={{ width: 90 }} />
              <col style={{ width: 170 }} />
              <col style={{ width: 150 }} />
              <col />
            </colgroup>
            <thead>
              <tr className="border-t border-[var(--border-hairline)] text-left">
                {[t('values.head.run'), t('values.head.when'), t('values.head.field'), t('values.head.value')].map((h) => (
                  <th key={h} className="caption-11 py-[7px] font-normal text-[var(--text-muted)]">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {history.rows.map((r) => (
                <tr key={`${r.runId}:${r.field}`} className="border-t border-[var(--border-hairline)] align-baseline">
                  <td className="py-[9px]">
                    <Link
                      href={`/runs/${r.runId}`}
                      className="mono-value-12_5 text-[var(--semantic-link)] hover:underline"
                    >
                      {r.runId}
                    </Link>
                  </td>
                  <td className="meta-12_5 py-[9px] text-[var(--text-secondary)]">{stamp(r.at)}</td>
                  <td className="mono-value-12_5 py-[9px] text-[var(--text-secondary)]">{r.field}</td>
                  <td className="py-[9px] pr-[8px]">
                    <Value row={r} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <p className="caption-11 text-[var(--text-muted)]">
          {t('values.footnote', { limit: LIMIT })}
        </p>
      </div>
    </>
  );
}

/**
 * A value, or the labelled absence of one.
 *
 * The reason goes through `HELD_BECAUSE` before it is shown, and a code with no
 * wording is printed AS a code rather than given an invented adjective --
 * docs/APP-DESIGN.md 5b rule 5, the same reading `HeldCell` takes.
 */
function Value({ row }: { row: FieldValue }) {
  if (row.value !== null) {
    return <span className="mono-value-12_5 break-words text-[var(--text-primary)]">{row.value}</span>;
  }
  const plain = row.reason ? HELD_BECAUSE[row.reason] ?? null : null;
  return (
    <span className="flex items-baseline gap-[6px]">
      <Hand size={12} strokeWidth={1.5} className="shrink-0 translate-y-[2px] text-[var(--semantic-warning)]" aria-hidden />
      <span className="caption-12 text-[var(--text-secondary)]">
        {plain
          ? t('values.nothingPublishedBecause', { plain })
          : row.reason
            ? (
              <>
                {t('values.nothingPublishedCode')}{' '}
                <span className="mono-value-12_5">{row.reason}</span>
              </>
            )
            : t('values.nothingPublished')}
      </span>
    </span>
  );
}

const headline = (n: number, held: number) =>
  held === 0
    ? `${n} value${n === 1 ? '' : 's'}`
    : `${n} value${n === 1 ? '' : 's'} · ${held} withheld`;
