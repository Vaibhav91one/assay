import type { Metadata } from 'next';
import Link from 'next/link';
import { CircleAlert, Split } from 'lucide-react';
import { TopBar } from '@/components/top-bar';
import { actionVariants } from '@/components/button';
import { Empty } from '@/components/empty';
import { compareView, summary, rows, type CompareView, type Withheld } from '@/lib/compare';
import { when } from '@/lib/when';

export const metadata: Metadata = { title: 'Compare · Assay' };
export const dynamic = 'force-dynamic';

export default async function ComparePage() {
  const v = await compareView();

  return (
    <>
      <TopBar title="Compare" status={headline(v)} />
      <div className="flex w-full max-w-[1168px] flex-col items-start px-[56px] pb-[64px] pt-[40px]">
        <p className="body-13_5 max-w-[900px] text-[var(--text-secondary)]">
          What changed on the pages you watch, and what I could not read well enough to tell you.
        </p>

        <section className="mt-[24px] flex w-full flex-col items-start rounded-[var(--radius-card)] border border-[var(--border-default)] bg-[var(--surface-card)] p-[24px]">
          <p className="label-10 text-[var(--text-muted)]">THIS WEEK</p>
          <p className="heading-18 mt-[8px] text-[var(--text-primary)]">{headline(v)}</p>
          <p className="body-13_5 mt-[12px] max-w-[990px] text-[var(--text-secondary)]">
            {summary(v)}
          </p>
        </section>

        <p className="label-10 mt-[28px] text-[var(--text-muted)]">CHANGED</p>
        <div className="mt-[12px] w-full">
          {rows(v).length === 0 ? (
            <p className="meta-13 text-[var(--text-muted)]">
              No field published a different value this week.
            </p>
          ) : (
            <ChangedTable v={v} />
          )}
        </div>

        <p className="label-10 mt-[28px] text-[var(--text-muted)]">WITHHELD</p>
        <div className="mt-[12px] flex w-full flex-col gap-[16px]">
          {v.withheld.length === 0 ? (
            <p className="meta-13 text-[var(--text-muted)]">
              Nothing was held. Every field the gate looked at cleared it.
            </p>
          ) : (
            v.withheld.map((w) => <WithheldCard key={w.proof} w={w} />)
          )}
        </div>

        <p className="label-10 mt-[28px] text-[var(--text-muted)]">UNCHANGED</p>
        <div className="mt-[10px] w-full">
          {v.scrapers === 0 ? (
            <Empty title="Nothing ran this week.">
              Compare reads the last seven days. A scraper that has not run in that window has
              nothing to compare against.
            </Empty>
          ) : (
            <p className="meta-13 text-[var(--text-secondary)]">
              {count(v.unchangedFields, 'field')} across {count(v.scrapers, 'page')} read exactly as
              before.
            </p>
          )}
        </div>
      </div>
    </>
  );
}

const HEAD = ['competitor', 'field', 'what changed', 'when'] as const;

function ChangedTable({ v }: { v: CompareView }) {
  return (
    <table className="w-full table-fixed border-collapse">
      <colgroup>
        <col style={{ width: 172 }} />
        <col style={{ width: 180 }} />
        <col />
        <col style={{ width: 94 }} />
      </colgroup>
      <thead>
        <tr>
          {HEAD.map((h) => (
            <th key={h} className="caption-11 pb-[9px] text-left font-normal text-[var(--text-muted)]">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows(v).map((c) => (
          <tr key={c.proof} className="border-t border-[var(--border-hairline)]">
            <td className="meta-13 py-[8px] text-[var(--text-primary)]">{c.scraper}</td>
            <td className="meta-13 py-[8px] text-[var(--text-secondary)]">{c.field}</td>
            <td className="meta-13 py-[8px] pr-[16px] text-[var(--text-primary)]">
              {c.from === null ? (
                <>first value: {c.to}</>
              ) : (
                <>
                  {c.from} <span className="text-[var(--text-muted)]">→</span> {c.to}
                </>
              )}
            </td>
            <td className="meta-13 py-[8px] text-[var(--text-muted)]">{when(c.at)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * The whole argument of this screen, in one card.
 *
 * It says what it cannot tell you, in the first person, and then gives the
 * reason it cannot. `Decide` only appears while the queue item is genuinely
 * open -- a resolved hold is still a hole in the data, but there is nothing
 * left to decide about it, and a button that does nothing is worse than none.
 */
function WithheldCard({ w }: { w: Withheld }) {
  return (
    <article className="flex w-full items-center gap-[24px] rounded-[var(--radius-card)] border border-[var(--border-default)] bg-[var(--surface-card)] p-[24px]">
      <div className="flex min-w-0 flex-1 flex-col items-start">
        <div className="flex items-center gap-[10px]">
          <CircleAlert
            size={16}
            strokeWidth={1.5}
            className="shrink-0 text-[var(--semantic-warning)]"
            aria-hidden
          />
          <span className="body-14 text-[var(--text-primary)]">{w.scraper}</span>
          <span className="meta-12_5 text-[var(--text-muted)]">
            {w.field}
            {w.heldSinceRun !== null && ` · held since run ${w.heldSinceRun}`}
          </span>
        </div>
        <p className="heading-16 mt-[10px] text-[var(--text-primary)]">
          I cannot tell you whether this changed.
        </p>
        <p className="meta-13 mt-[10px] max-w-[820px] text-[var(--text-secondary)]">
          {w.why?.plain
            ? `${capital(w.why.plain)}, so this column has been held since. No diff was reported for it either way.`
            : 'The gate refused this cell, so this column has been held since. No diff was reported for it either way.'}
        </p>
      </div>
      {w.waiting ? (
        <Link href="/decisions" className={actionVariants({ variant: 'success' })}>
          <Split size={16} strokeWidth={1.5} aria-hidden />
          Decide
        </Link>
      ) : (
        <Link
          href={`/explain/${w.proof}`}
          className="meta-12_5 shrink-0 text-[var(--semantic-link)] hover:underline"
        >
          already answered ›
        </Link>
      )}
    </article>
  );
}

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const count = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * The subject line, and the number that would be a lie in the body is a lie
 * here first: the withheld count travels with the change count, always.
 */
const headline = (v: CompareView) =>
  [
    count(v.changed.length, 'change'),
    v.firstSeen.length > 0 ? `${v.firstSeen.length} first seen` : null,
    `${v.withheld.length} withheld`,
  ]
    .filter(Boolean)
    .join(', ');
