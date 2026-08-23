import type { Metadata } from 'next';
import Link from 'next/link';
import { CircleAlert } from 'lucide-react';
import { TopBar } from '@/components/top-bar';
import { Bar } from '@/components/bar';
import { Empty } from '@/components/empty';
import { FilterMenu } from '@/components/filter-menu';
import { fieldsView, FIELD_FILTERS, type FieldFilter, type FieldRow, type FieldsView } from '@/lib/fields';
import { t } from '@/lib/copy';
import { ago } from '@/lib/when';

export const metadata: Metadata = { title: t('title.fields') };
export const dynamic = 'force-dynamic';

export default async function FieldsPage({
  searchParams,
}: {
  searchParams: Promise<{ show?: string }>;
}) {
  const { show } = await searchParams;
  const filter: FieldFilter = (FIELD_FILTERS as readonly string[]).includes(show ?? '')
    ? (show as FieldFilter)
    : 'all';
  const v = await fieldsView(filter);

  return (
    <>
      <TopBar title={t('nav.fields')} status={headline(v)} />
      {/* The subtitle came off: "What each field looks like when it is right,
          and how reliably it has been there." The columns are `field`,
          `seen in`, `how it is found` and `last change` -- the sentence was a
          reading of the table header, above the table header. */}
      <div className="flex w-full flex-col items-start px-[20px] md:px-[56px] pt-[44px]">
        <div className="pt-[22px]">
          <FilterMenu
            current={filter}
            options={[
              { value: 'all', href: '/fields', label: t('fields.filter.all') },
              { value: 'held', href: '/fields?show=held', label: `held (${v.heldTotal})` },
              {
                value: 'fragile',
                href: '/fields?show=fragile',
                label: `fragile (${v.fragile})`,
                tone: 'var(--semantic-warning)',
              },
            ]}
          />
        </div>

        <div className="w-full pt-[22px]">
          {v.rows.length === 0 ? (
            <Empty title={emptyTitle(filter)}>{emptyBody(filter, v)}</Empty>
          ) : (
            <>
              <FieldsCards rows={v.rows} />
              <FieldsTable rows={v.rows} />
            </>
          )}
        </div>

        <Callout v={v} />
      </div>
    </>
  );
}

const HEADINGS = [
  t('fields.table.head.field'),
  t('fields.table.head.seen'),
  t('fields.table.head.how'),
  t('fields.table.head.lastChange'),
] as const;

/**
 * Squeeze the middle out of a slug, never the end.
 *
 * `…` is one character, so the budget is `max` including it. Anything at or
 * under the budget is returned as it is -- an ellipsis in a string that fits is
 * a lie about there being more.
 */
function midTruncate(s: string, max = 20): string {
  if (s.length <= max) return s;
  const head = Math.ceil((max - 1) / 2);
  return `${s.slice(0, head)}…${s.slice(s.length - (max - 1 - head))}`;
}

/**
 * The same rows, stacked, below 768.
 *
 * A CARD, like /runs, and for the same reason: the primary line is
 * `scraper · field` and everything else on the row qualifies it. The four
 * fixed columns -- 260 + 190 + auto + 150 -- do not fit in 390px and never
 * will, and a scroller would put `last change` off the edge of every row.
 *
 * `how it is found` and its suggestion are the one part that is genuinely
 * prose, so they get their own line rather than a column's worth of width.
 * Both halves read the same `rows`.
 */
function FieldsCards({ rows }: { rows: FieldRow[] }) {
  return (
    <ul className="flex w-full flex-col md:hidden">
      {rows.map((r) => (
        <li
          key={r.targetId + r.field}
          className="flex flex-col gap-[8px] border-t border-[var(--border-hairline)] py-[12px]"
        >
          <Link
            href={`/fields/${encodeURIComponent(r.targetId)}`}
            title={`${r.scraper} · ${r.field}`}
            className="flex min-w-0 items-baseline gap-[6px]"
          >
            {r.grade === 'fragile' && (
              <CircleAlert
                size={14}
                strokeWidth={1.5}
                className="shrink-0 translate-y-[2px] text-[var(--semantic-warning)]"
                aria-label={t('fields.fragile')}
              />
            )}
            <span className="mono-value-12_5 min-w-0 truncate text-[var(--text-primary)]">
              {r.field}
            </span>
            <span className="meta-12_5 min-w-0 truncate text-[var(--text-muted)]">{r.scraper}</span>
          </Link>
          <span className="flex items-center gap-[12px]">
            <span className="meta-12_5 w-[46px] shrink-0 text-[var(--text-secondary)]">
              {r.seen}/{r.runs}
            </span>
            <Bar value={r.seen} of={r.runs} />
            <span className="shrink-0"><LastChange row={r} /></span>
          </span>
          <span className="body-13_5 text-[var(--text-secondary)]">
            {r.how ?? <span className="text-[var(--text-muted)]">{t('fields.notAssessed')}</span>}
            {r.suggestion && (
              <span className="caption-12 block pt-[3px] text-[var(--text-muted)]">
                {r.suggestion}
              </span>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}

function FieldsTable({ rows }: { rows: FieldRow[] }) {
  return (
    // AND A SCROLLER ABOVE 768, because the cards stop at exactly the width
    // where this table still does not fit: 260 + 190 + auto + 150 against a
    // 768px window minus a 272px rail is 384px of room for 600px of columns.
    // The cards handle below, this handles the band between.
    <div className="hidden w-full overflow-x-auto md:block">
      <table className="w-full min-w-[640px] table-fixed border-collapse">
        <colgroup>
          <col style={{ width: 260 }} />
          <col style={{ width: 190 }} />
          <col />
          <col style={{ width: 150 }} />
        </colgroup>
        <thead>
          <tr className="border-t border-[var(--border-hairline)] text-left">
            {HEADINGS.map((h) => (
              <th key={h} className="caption-11 pb-[7px] pt-[7px] font-normal text-[var(--text-muted)]">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.targetId + r.field} className="border-t border-[var(--border-hairline)]">
              <td className="py-[9px]">
                <span className="flex items-center gap-[8px]">
                  <span className="flex size-[14px] shrink-0 items-center justify-center">
                    {r.grade === 'fragile' && (
                      <CircleAlert
                        size={14}
                        strokeWidth={1.5}
                        className="text-[var(--semantic-warning)]"
                        aria-label={t('fields.fragile')}
                      />
                    )}
                  </span>
                  {/* The scraper qualifies the field: three targets watch a
                      field called `recall_title`, and a column of three
                      identical names is a table that tells you nothing.

                      THE FIELD NAME IS NEVER THE HALF THAT GETS CUT. This was one
                      `truncate` over the whole pair, and slugs derived from one
                      site share a long head -- `fda-recalls-device`,
                      `fda-recalls-drug`, `fda-recalls-food` -- so a right-hand
                      ellipsis ate the field name and left three rows reading
                      `fda-recalls-…`, which is the column saying nothing again by
                      a different route. The slug is squeezed from the middle,
                      where it carries the least, and the field gets whatever is
                      left. `title` carries the untruncated pair for anyone who
                      needs the exact id. */}
                  {/* The row is a link now. Every column on this table is a
                      SUMMARY of values the screen never showed -- "seen in 22/30"
                      invites exactly one question and there was nowhere to go and
                      ask it. */}
                  <Link
                    href={`/fields/${encodeURIComponent(r.targetId)}`}
                    title={`${r.scraper} · ${r.field}`}
                    className="flex min-w-0 items-baseline hover:underline"
                  >
                    <span className="meta-12_5 shrink-0 text-[var(--text-muted)]">
                      {midTruncate(r.scraper)} ·&nbsp;
                    </span>
                    <span className="mono-value-12_5 min-w-0 truncate text-[var(--text-primary)]">
                      {r.field}
                    </span>
                  </Link>
                </span>
              </td>
              <td className="py-[9px]">
                <span className="flex items-center gap-[12px]">
                  <span className="meta-12_5 w-[46px] shrink-0 text-[var(--text-secondary)]">
                    {r.seen}/{r.runs}
                  </span>
                  <Bar value={r.seen} of={r.runs} />
                </span>
              </td>
              <td className="body-13_5 py-[9px] pr-[16px] text-[var(--text-secondary)]">
                {r.how ?? <span className="text-[var(--text-muted)]">{t('fields.notAssessed')}</span>}
                {/* The grade said what is wrong; this says what would fix it, in
                    the same cell, because a warning with no next move is a
                    warning the reader can only file away. Derived from the
                    anchors the grade was computed from -- see `suggest` in
                    web/lib/fields.ts -- so it cannot recommend an id to a field
                    that already has one. */}
                {r.suggestion && (
                  <span className="caption-12 block pt-[3px] text-[var(--text-muted)]">
                    {r.suggestion}
                  </span>
                )}
              </td>
              <td className="py-[9px]">
                <LastChange row={r} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Three different absences, three different words.
 *
 * `never delivered` is a field that has run and published nothing, ever --
 * a promise the site has not once kept, and the loudest thing on this screen.
 * `never` is a value that has simply never changed, which is the best case.
 * They must not share a rendering.
 */
function LastChange({ row }: { row: FieldRow }) {
  if (row.runs > 0 && row.seen === 0) {
    return <span className="body-13_5 text-[var(--semantic-danger)]">{t('fields.neverDelivered')}</span>;
  }
  if (row.lastChange === null) {
    return <span className="body-13_5 text-[var(--text-muted)]">{t('fields.never')}</span>;
  }
  return <span className="body-13_5 text-[var(--text-secondary)]">{ago(row.lastChange)}</span>;
}

/**
 * One derived sentence, or none.
 *
 * There is no standing warning here when nothing is wrong -- a callout that is
 * always on screen is a callout nobody reads on the day it means something.
 */
function Callout({ v }: { v: FieldsView }) {
  const unobserved = v.rows.reduce((n, r) => n + r.unobserved, 0);

  const text =
    v.missing > 0
      ? `${v.missing} field${v.missing === 1 ? '' : 's'} ${v.missing === 1 ? 'has' : 'have'} run and never once published a value. Those runs still reported success.`
      : unobserved > 0
        ? `${unobserved} run${unobserved === 1 ? '' : 's'} could not be graded: the page captured on ${unobserved === 1 ? 'it' : 'them'} is no longer kept, so the grades above are over the runs that remain.`
        : null;

  if (!text) return null;

  return (
    <div className="mt-[26px] flex w-full items-center gap-[12px] rounded-[var(--radius-card)] bg-[var(--surface-subtle)] px-[22px] py-[18px]">
      <CircleAlert
        size={16}
        strokeWidth={1.5}
        className="shrink-0 text-[var(--semantic-warning)]"
        aria-hidden
      />
      <p className="meta-13 text-[var(--text-secondary)]">{text}</p>
    </div>
  );
}

function headline(v: FieldsView): string {
  if (v.tracked === 0) return t('fields.headline.none');
  const parts = [`${v.tracked} tracked`];
  if (v.missing > 0) parts.push(`${v.missing} never delivered`);
  if (v.fragile > 0) parts.push(`${v.fragile} fragile`);
  return parts.join(' · ');
}

const emptyTitle = (f: FieldFilter) =>
  f === 'held'
    // Was `t('fields.empty.held')` -- "No field is waiting on you.", which is
    // the Decisions screen's sentence about a queue. This is a table filtered
    // to a column, and the honest thing it can say is that the column is empty.
    ? t('fields.empty.heldFilter')
    : f === 'fragile'
      ? t('fields.empty.fragile')
      : t('fields.empty.all');

function emptyBody(f: FieldFilter, v: FieldsView) {
  if (f === 'held') {
    return t('fields.empty.held.body');
  }
  if (f === 'fragile') {
    // The second sentence -- "Fragility is about how a field is identified, not
    // whether it is working right now." -- is in the voice bank as copy already
    // removed from `assay-fragility` for being an essay on an operational
    // screen. It came off here too.
    return `All ${v.tracked} watched field${v.tracked === 1 ? ' is' : 's are'} held up by something that has not moved.`;
  }
  return t('fields.empty.all.body');
}
