import type { Metadata } from 'next';
import Link from 'next/link';
import { CircleAlert, Split } from 'lucide-react';
import { TopBar } from '@/components/top-bar';
import { actionVariants } from '@/components/button';
import { Empty } from '@/components/empty';
import { ProofSheet } from '@/components/proof-sheet';
import { compareView, summary, rows, type CompareView, type Withheld } from '@/lib/compare';
import { t } from '@/lib/copy';
import { when } from '@/lib/when';

export const metadata: Metadata = { title: t('title.compare') };
export const dynamic = 'force-dynamic';

export default async function ComparePage() {
  const v = await compareView();

  return (
    <>
      <TopBar title={t('compare.heading')} status={headline(v)} />
      <div className="flex w-full max-w-[1168px] flex-col items-start px-[56px] pb-[64px] pt-[40px]">
        {/* TWO THINGS CAME OFF HERE.

            A subtitle -- "What changed on the pages you watch, and what I could
            not read well enough to tell you." -- which described the screen to
            someone already looking at its three headings.

            And `headline(v)` a second time. The top bar already carries it, and
            it was rendered again as this card's heading: the same counted fact
            twice on one screen, which is P2 in docs/APP-DESIGN.md 5b. The card
            keeps the summary sentence, which is the thing the headline does not
            say. */}
        <section className="flex w-full flex-col items-start rounded-[var(--radius-card)] border border-[var(--border-default)] bg-[var(--surface-card)] p-[24px]">
          <p className="label-10 text-[var(--text-muted)]">{t('compare.thisWeek')}</p>
          <p className="body-13_5 mt-[12px] max-w-[990px] text-[var(--text-secondary)]">
            {summary(v)}
          </p>
        </section>

        <p className="label-10 mt-[28px] text-[var(--text-muted)]">{t('compare.changed')}</p>
        <div className="mt-[12px] w-full">
          {rows(v).length === 0 ? (
            <p className="meta-13 text-[var(--text-muted)]">
              {t('compare.noChanges')}
            </p>
          ) : (
            <ChangedTable v={v} />
          )}
        </div>

        <p className="label-10 mt-[28px] text-[var(--text-muted)]">{t('compare.withheld')}</p>
        <div className="mt-[12px] flex w-full flex-col gap-[16px]">
          {v.withheld.length === 0 ? (
            <p className="meta-13 text-[var(--text-muted)]">
              {/* Under a heading that reads WITHHELD, this said "Nothing was
                  held" -- the cell word, in the one place the product means the
                  diff word. */}
              {t('compare.nothingWithheld')}
            </p>
          ) : (
            v.withheld.map((w) => <WithheldCard key={w.proof} w={w} />)
          )}
        </div>

        <p className="label-10 mt-[28px] text-[var(--text-muted)]">{t('compare.unchanged')}</p>
        <div className="mt-[10px] w-full">
          {v.scrapers === 0 ? (
            <Empty title={t('compare.empty.title')}>
              {t('compare.empty.body')}
            </Empty>
          ) : (
            <p className="meta-13 text-[var(--text-secondary)]">
              {count(v.unchangedFields, 'field')} across {count(v.scrapers, 'scraper')} read exactly as
              before.
            </p>
          )}
        </div>
      </div>
    </>
  );
}

// `scraper`, not `competitor`. The cell under it renders `c.scraper`, the rest
// of the app calls the thing a scraper, and /compare is not competitors-only --
// it diffs whatever is under watch.
const HEAD = [
  t('compare.table.head.scraper'),
  t('compare.table.head.field'),
  t('compare.table.head.what'),
  t('compare.table.head.when'),
] as const;

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
          {t('compare.cannotTell')}
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
          {t('compare.decide')}
        </Link>
      ) : (
        <ProofSheet
          proof={w.proof}
          className="focus-ring meta-12_5 shrink-0 rounded-[var(--radius-control)] text-[var(--semantic-link)] hover:underline"
        >
          {t('compare.alreadyAnswered')}
        </ProofSheet>
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
