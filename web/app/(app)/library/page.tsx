import type { Metadata } from 'next';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { TopBar } from '@/components/top-bar';
import { TEMPLATES, evidenceOf, type Template } from 'assay/engine/library/index';

export const metadata: Metadata = { title: 'Library · Assay' };

// The templates are static data, but the layout above this screen reads the
// conversation rail and the notification queue, so prerendering it would only
// move a database read into the build. Every other screen under `(app)` says
// the same thing for the same reason.
export const dynamic = 'force-dynamic';

/**
 * The starter library: field contracts for page SHAPES.
 *
 * WHY IT IS A ROUTE AND NOT A SECTION OF /skills. The two screens are the same
 * idiom -- a registry of real entries, each stating what it wants before you
 * say yes -- and that idiom is reused here down to the shape of a row. What is
 * not the same is the noun. `/skills` answers "what may Assay be given", and
 * every control on it is a switch over this instance's own configuration.
 * This answers "what should Assay watch", and its control CREATES something.
 * Putting a create action among credential switches would make the empty
 * Home state point a first-time operator at a page of toggles, and an entry
 * needs a URL of its own so a row on Home, a doc, or a colleague can link to
 * one shape rather than to a list.
 *
 * GROUPED BY WHAT YOU ARE WATCHING FOR, not by industry. Social Fetch groups a
 * catalogue by platform because its entries ARE platforms; ours are shapes, and
 * the question an operator actually arrives with is "am I waiting for a new row
 * to appear, or for a number to move, or for wording to change" -- which is
 * also the question that decides the cadence and half the tiers.
 *
 * WHAT A ROW SHOWS BEFORE YOU CLICK: the name, one line, how many fields, and
 * whether any of it has been measured. That last one is the honest analogue of
 * the credit badge on the catalogue this borrowed its structure from -- the
 * hard number you want before you spend attention. It is printed only where it
 * is true, and the standing note above says how rare it is rather than leaving
 * a reader to notice by counting.
 */

const GROUPS = [
  {
    id: 'appears',
    title: 'Something new appears',
    blurb:
      'The page grows at the top and you want to know when it does. The value you '
      + 'watch is whatever is currently first.',
    ids: ['recall-notice', 'changelog', 'job-board'],
  },
  {
    id: 'moves',
    title: 'A value moves',
    blurb:
      'The page is stable and one number or one word on it is the whole point. These '
      + 'lean strict: a wrong value here is worse than an interruption.',
    ids: ['pricing-table', 'status-page', 'product-detail'],
  },
  {
    id: 'reworded',
    title: 'The wording changes',
    blurb: 'The page is edited in place, and the edit is the event.',
    ids: ['docs-page'],
  },
] as const;

export default function LibraryPage() {
  const measured = TEMPLATES.filter((t) => evidenceOf(t).measured > 0).length;

  return (
    <>
      <TopBar
        title="Library"
        status={`${TEMPLATES.length} shapes · ${measured} with a measured field`}
        scraper={null}
      />
      <div className="flex w-full max-w-[860px] flex-col gap-[26px] pl-[56px] pr-[32px] pb-[48px] pt-[18px]">
        <div className="flex flex-col gap-[10px]">
          <p className="caption-13 text-[var(--text-secondary)]">
            A template is a set of field names and a tier for each one, for a shape of page
            rather than for a named site. You point it at a URL you chose, paste what each
            value reads as on your page, and approve — Assay derives where each value sits
            and starts watching it. Nothing is created until you press the button.
          </p>

          {/* The hostile question, answered first and in its own box rather than
              in a footnote. Six of seven templates have no measured record and a
              reader must not have to count rows to discover that. */}
          <p className="caption-12_5 rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-subtle)] px-[14px] py-[11px] text-[var(--text-secondary)]">
            <span className="text-[var(--text-primary)]">What is measured, and what is not.</span>{' '}
            Assay&rsquo;s published numbers — 153 benchmark cases, 0 wrong values — come from one
            field on one page shape, across the three sites in this repository&rsquo;s corpus. Exactly
            one field in this whole library carries that record, and it says so on its own row.
            Every other field is marked not measured. The tier a template picks is a judgement
            about the value, not a number read off an experiment, and{' '}
            <Link href="/docs/limitations" className="text-[var(--semantic-link)] hover:underline">
              docs/LIMITATIONS.md
            </Link>{' '}
            5 is explicit that these thresholds are fitted to that corpus and nowhere else.
          </p>
        </div>

        {GROUPS.map((g) => (
          <section key={g.id} className="flex flex-col gap-[10px]">
            <div className="flex flex-col gap-[3px]">
              <h2 className="label-10 text-[var(--text-muted)]">{g.title.toUpperCase()}</h2>
              <p className="caption-12 text-[var(--text-secondary)]">{g.blurb}</p>
            </div>
            <ul className="flex flex-col gap-[10px]">
              {g.ids
                .map((id) => TEMPLATES.find((t) => t.id === id))
                .filter((t): t is Template => Boolean(t))
                .map((t) => <Entry key={t.id} template={t} />)}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}

/** One row. Name, one line, the field count, and a measured badge only if earned. */
function Entry({ template: t }: { template: Template }) {
  const { measured, total } = evidenceOf(t);

  return (
    <li>
      <Link
        href={`/library/${t.id}`}
        className="press-row flex items-center gap-[16px] rounded-[var(--radius-card)] border border-[var(--border-default)] bg-[var(--surface-card)] px-[18px] py-[14px] transition-colors duration-[var(--duration-tint)] hover:bg-[var(--surface-subtle)]"
      >
        <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
          <span className="flex flex-wrap items-baseline gap-x-[10px] gap-y-[2px]">
            <span className="body-14 text-[var(--text-primary)]">{t.name}</span>
            <span className="caption-11 text-[var(--text-muted)]">
              {total} field{total === 1 ? '' : 's'} · every {t.cadence}
            </span>
            {measured > 0 && (
              <span className="caption-11 text-[var(--semantic-success)]">
                {measured} of {total} measured
              </span>
            )}
          </span>
          <span className="caption-12 text-[var(--text-secondary)]">{t.summary}</span>
        </span>
        <ChevronRight size={16} strokeWidth={1.5} className="shrink-0 text-[var(--text-muted)]" aria-hidden />
      </Link>
    </li>
  );
}
