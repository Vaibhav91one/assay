import type { Metadata } from 'next';
import { CircleAlert } from 'lucide-react';
import { TopBar } from '@/components/top-bar';
import { Bar } from '@/components/bar';
import { Empty } from '@/components/empty';
import { FilterMenu } from '@/components/filter-menu';
import { fieldsView, FIELD_FILTERS, type FieldFilter, type FieldRow, type FieldsView } from '@/lib/fields';
import { ago } from '@/lib/when';

export const metadata: Metadata = { title: 'Fields · Assay' };
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
      <TopBar title="Fields" status={headline(v)} />
      <div className="flex w-full flex-col items-start px-[56px] pt-[44px]">
        <p className="body-14 w-full text-[var(--text-secondary)]">
          What each field looks like when it is right, and how reliably it has been there.
        </p>

        <div className="pt-[22px]">
          <FilterMenu
            current={filter}
            options={[
              { value: 'all', href: '/fields', label: 'all fields' },
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
            <FieldsTable rows={v.rows} />
          )}
        </div>

        <Callout v={v} />
      </div>
    </>
  );
}

const HEADINGS = ['field', 'seen in', 'how it is found', 'last change'] as const;

function FieldsTable({ rows }: { rows: FieldRow[] }) {
  return (
    <table className="w-full table-fixed border-collapse">
      <colgroup>
        <col style={{ width: 210 }} />
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
                      aria-label="fragile"
                    />
                  )}
                </span>
                {/* The scraper qualifies the field: three targets watch a
                    field called `recall_title`, and a column of three
                    identical names is a table that tells you nothing. */}
                <span className="min-w-0 truncate">
                  <span className="meta-12_5 text-[var(--text-muted)]">{r.scraper} · </span>
                  <span className="mono-value-12_5 text-[var(--text-primary)]">{r.field}</span>
                </span>
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
              {r.how ?? <span className="text-[var(--text-muted)]">not assessed on this store</span>}
            </td>
            <td className="py-[9px]">
              <LastChange row={r} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
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
    return <span className="body-13_5 text-[var(--semantic-danger)]">never delivered</span>;
  }
  if (row.lastChange === null) {
    return <span className="body-13_5 text-[var(--text-muted)]">never</span>;
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
  if (v.tracked === 0) return 'nothing tracked yet';
  const parts = [`${v.tracked} tracked`];
  if (v.missing > 0) parts.push(`${v.missing} never delivered`);
  if (v.fragile > 0) parts.push(`${v.fragile} fragile`);
  return parts.join(' · ');
}

const emptyTitle = (f: FieldFilter) =>
  f === 'held'
    ? 'No field is waiting on you.'
    : f === 'fragile'
      ? 'No field is graded fragile.'
      : 'No fields are being watched yet.';

function emptyBody(f: FieldFilter, v: FieldsView) {
  if (f === 'held') {
    return 'Every cell the gate looked at was either published or is still being watched.';
  }
  if (f === 'fragile') {
    return `All ${v.tracked} watched field${v.tracked === 1 ? ' is' : 's are'} held up by something that has not moved. Fragility is about how a field is identified, not whether it is working right now.`;
  }
  return 'A field appears here once a scraper has run against it at least once.';
}
