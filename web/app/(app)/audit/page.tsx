import type { Metadata } from 'next';
import { TopBar } from '@/components/top-bar';
import { Empty } from '@/components/empty';
import { StatusLine } from '@/components/status-line';
import { auditSnapshot, SNAPSHOT, type Audit, type FieldAudit } from '@/lib/audit';
import { t } from '@/lib/copy';

export const metadata: Metadata = { title: t('title.audit') };
export const dynamic = 'force-dynamic';

/**
 * A green run, checked.
 *
 * The one screen in this product that is not about Assay. It renders somebody
 * else's output -- 60 IKEA recall records from Bright Data collector
 * `c_mt1nrjboski90goqc`, the API response verbatim, committed at
 * `results/j_mt1q17uoq8rkcxd8a.ndjson` -- and asks the question the platform
 * that produced it does not: not "did the job succeed" but "is the data right".
 *
 * IT IS NOT A CRITICISM OF THE CRAWL, and the page has to say so, because a
 * table of red rows reads as one. Sixty pages were fetched from a site that
 * fights scrapers and not one of them failed; the platform's verdict is
 * accurate about the thing it measured. The finding is narrower and more useful
 * than "it broke": *the job succeeded* and *the data is right* are different
 * claims, and only the first one has an answer anywhere in the stack. See
 * README.md and docs/HEADTOHEAD.md §5b, from which the framing here is drawn.
 *
 * Every number is derived from the file at request time. The headline is
 * counted, not typed: if the snapshot is replaced the sentence changes with it,
 * and if the snapshot is missing there is no sentence at all.
 *
 * `scraper={null}`: the run control asks a worker to re-read a page Assay
 * watches, and this screen is about a file on disk that no run produces.
 */
export default async function AuditPage() {
  const a = await auditSnapshot();

  return (
    <>
      <TopBar title={t('audit.heading')} status={a ? headline(a) : t('audit.noSnapshot.status')} scraper={null} />

      <div className="flex w-full max-w-[1100px] flex-col gap-[28px] px-[56px] pb-[64px] pt-[36px]">
        {a === null ? (
          <Empty title={t('audit.empty.title')}>
            {t('audit.empty.body.before')} <span className="mono-value-12_5">{SNAPSHOT}</span>{' '}
            {t('audit.empty.body.after')}
          </Empty>
        ) : (
          <>
            <section className="flex flex-col items-start gap-[12px] rounded-[var(--radius-card)] border border-[var(--border-default)] bg-[var(--surface-card)] p-[24px]">
              <p className="label-10 text-[var(--text-muted)]">{t('audit.platform.eyebrow')}</p>
              <StatusLine tone="success" type="body-14" size={16}>
                {t('audit.platform.said', { rows: a.rows })}
              </StatusLine>
              <p className="heading-18 max-w-[900px] text-[var(--text-primary)]">{headline(a)}</p>
              <p className="meta-13 max-w-[900px] text-[var(--text-secondary)]">
                {t('audit.finding')} <em>{t('audit.finding.jobSucceeded')}</em> and{' '}
                <em>{t('audit.finding.dataIsRight')}</em> {t('audit.finding.rest')}
              </p>
              <p className="meta-12_5 text-[var(--text-muted)]">
                Bright Data collector{' '}
                <span className="mono-value-12_5">c_mt1nrjboski90goqc</span> ·{' '}
                <span className="mono-value-12_5">{a.file}</span>, unmodified · reproduce with{' '}
                <span className="mono-value-12_5">npm run audit</span>
              </p>
            </section>

            <section className="flex flex-col gap-[12px]">
              <h2 className="title-20 text-[var(--text-primary)]">{t('audit.everyField')}</h2>
              <Table a={a} />
            </section>

            <section className="flex flex-col items-start gap-[8px]">
              <h2 className="title-20 text-[var(--text-primary)]">{t('audit.crossCheck')}</h2>
              {a.crossCheck === null ? (
                <p className="meta-13 max-w-[900px] text-[var(--text-secondary)]">
                  {t('audit.crossCheck.unavailable')}{' '}
                  <span className="mono-value-12_5">recall_title</span> and{' '}
                  <span className="mono-value-12_5">title_on_detail</span>{' '}
                  {t('audit.crossCheck.unavailable.rest')}
                </p>
              ) : (
                <p className="meta-13 max-w-[900px] text-[var(--text-secondary)]">
                  {t('audit.crossCheck.counts', {
                    comparable: a.crossCheck.comparable,
                    agreeing: a.crossCheck.agreeing,
                    disagreeing: a.crossCheck.comparable - a.crossCheck.agreeing,
                  })}
                </p>
              )}
            </section>
          </>
        )}
      </div>
    </>
  );
}

/* ----------------------------------------------------------------- pieces */

/**
 * The headline, counted rather than written.
 *
 * The sentence README.md quotes is "6 of 10 promised fields unhealthy behind a
 * 100%-success run", and the six is `a.unhealthy`. Typing the six here would
 * make this screen a picture of one snapshot instead of a reading of whichever
 * one is on disk.
 */
function headline(a: Audit): string {
  return t('audit.headline', { unhealthy: a.unhealthy, total: a.fields.length });
}

function Table({ a }: { a: Audit }) {
  return (
    <table className="w-full border-collapse">
      <thead>
        <tr className="border-b border-[var(--border-hairline)] text-left">
          {[
            t('audit.head.field'),
            t('audit.head.delivered'),
            t('audit.head.nullRate'),
            t('audit.head.verdict'),
          ].map((h) => (
            <th key={h} className="caption-12 pb-[8px] font-normal text-[var(--text-muted)]">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {a.fields.map((f) => (
          <Row key={f.field} f={f} rows={a.rows} />
        ))}
      </tbody>
    </table>
  );
}

function Row({ f, rows }: { f: FieldAudit; rows: number }) {
  return (
    <tr className="border-b border-[var(--border-hairline)] align-top">
      <td className="mono-value-13 w-[180px] py-[11px] text-[var(--text-primary)]">{f.field}</td>
      <td className="mono-value-12_5 w-[110px] py-[11px] text-[var(--text-secondary)]">
        {f.nonNull}/{rows}
      </td>
      {/* The number, not a bar. A proportional bar here would invite the reader
          to eyeball a threshold, which is the same refusal §4 makes of a
          confidence float -- and this table is somebody else's data, where we
          have even less standing to draw a line. */}
      <td
        className="mono-value-12_5 w-[100px] py-[11px]"
        style={{ color: f.healthy ? 'var(--text-secondary)' : 'var(--semantic-danger)' }}
      >
        {(f.nullRate * 100).toFixed(1)}%
      </td>
      <td className="py-[11px]">
        <StatusLine tone={f.healthy ? 'success' : f.present === 0 ? 'danger' : 'warning'} muted={f.healthy}>
          {f.verdict}
        </StatusLine>
      </td>
    </tr>
  );
}
