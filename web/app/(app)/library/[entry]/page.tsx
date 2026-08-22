import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CircleSlash } from 'lucide-react';
import { TopBar } from '@/components/top-bar';
import {
  trackerById, thresholdsOf, NOT_MEASURED, CHANGE_NOT_CONDITION, type TrackerField,
} from 'assay/engine/library/index';
import { Apply } from '../apply';

// The tracker is static data, but `TopBar` reads the notification queue, so
// every screen under this layout is dynamic regardless.
export const dynamic = 'force-dynamic';

export async function generateMetadata(
  { params }: { params: Promise<{ entry: string }> },
): Promise<Metadata> {
  const t = trackerById((await params).entry);
  return { title: t ? `${t.name} tracker · Assay` : 'Library · Assay' };
}

/**
 * One tracker, in the order an operator decides in.
 *
 *   1. what kind of page it needs -- so they can stop reading if theirs is not one
 *   2. the fields, each with its tier and what is known about it
 *   3. what happens when the page is not that
 *   4. the box you paste a URL into
 *
 * EVIDENCE SITS ON THE FIELD ROW. The catalogue this borrowed its structure
 * from keeps reliability claims on a marketing page one level up from the
 * entry, so nothing on an endpoint page tells you what it is measured to do.
 * That split is the thing worth not copying: a claim and the field it is about
 * have to be readable in one glance, and a field with no claim has to say so in
 * the same place, in the same words, at the same size. One field in this whole
 * library carries a claim, and it is the one the benchmark actually ran.
 *
 * 3 BEFORE 4 is deliberate: what happens when the page is not what this expects
 * is the last thing read before the URL box.
 */
export default async function TrackerPage({ params }: { params: Promise<{ entry: string }> }) {
  const t = trackerById((await params).entry);
  if (!t) notFound();

  return (
    <>
      <TopBar title={`${t.name} tracker`} scraper={null} />
      <div className="flex w-full max-w-[820px] flex-col gap-[24px] pl-[56px] pr-[32px] pb-[64px] pt-[18px]">
        <div className="flex flex-col gap-[8px]">
          <Link href="/library" className="meta-13 self-start text-[var(--semantic-link)]">
            ‹ Library
          </Link>
          <p className="body-14 text-[var(--text-primary)]">{t.summary}</p>
        </div>

        <Section title="WHAT IT NEEDS">
          <p className="body-13_5 text-[var(--text-secondary)]">{t.needs}</p>
        </Section>

        <Section title={`WHAT IT WATCHES · ${t.fields.length}`}>
          <ul className="flex flex-col gap-[10px]">
            {t.fields.map((f) => <Field key={f.name} field={f} />)}
          </ul>
        </Section>

        <Section title="IF YOUR PAGE IS NOT LIKE THAT">
          <p className="body-13_5 text-[var(--text-secondary)]">{t.mismatch}</p>
        </Section>

        <Section title="POINT IT AT A PAGE">
          {/* The form is a URL and a cadence, and that is not an oversight: the
              premise is that anything discoverable from the page is not a form
              field. The one input people ask for that ISN'T discoverable is a
              threshold, and nothing in the engine reads a condition — so rather
              than a box that does nothing, the absence is stated. */}
          <p className="caption-12 text-[var(--text-muted)]">{CHANGE_NOT_CONDITION}</p>
          <Apply tracker={t} />
          {t.examples.length > 0 && (
            // Naming a URL in a public MIT repository is a claim that somebody
            // checked. This is what was checked, printed rather than filed.
            <ul className="flex flex-col gap-[6px] pt-[2px]">
              {t.examples.map((x) => (
                <li key={x.url} className="caption-12 text-[var(--text-muted)]">
                  <span className="text-[var(--text-secondary)]">{x.label}</span> — {x.permission}{' '}
                  Checked {x.checked}.
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-[10px]">
      <h2 className="label-10 text-[var(--text-muted)]">{title}</h2>
      {children}
    </section>
  );
}

/** One field: what it is, what tier, what numbers, and what is known about it. */
function Field({ field: f }: { field: TrackerField }) {
  const { tau, delta } = thresholdsOf(f);

  return (
    <li className="flex flex-col gap-[7px] rounded-[var(--radius-card)] border border-[var(--border-default)] bg-[var(--surface-card)] px-[16px] py-[13px]">
      <div className="flex flex-wrap items-baseline gap-x-[12px] gap-y-[3px]">
        <code className="mono-value-13 text-[var(--text-primary)]">{f.name}</code>
        <span className="caption-12 flex-1 text-[var(--text-secondary)]">{f.means}</span>
        <span className="caption-11 shrink-0 text-[var(--text-muted)]">
          {f.policy} · τ {tau.toFixed(2)} · δ {delta.toFixed(2)}
        </span>
      </div>

      <p className="caption-12 text-[var(--text-secondary)]">
        <span className="text-[var(--text-primary)]">Why {f.policy}.</span> {f.why}
      </p>

      {f.evidence ? (
        <div className="flex flex-col gap-[4px] rounded-[var(--radius-control)] bg-[var(--surface-subtle)] px-[12px] py-[9px]">
          <p className="caption-12 text-[var(--text-primary)]">{f.evidence.claim}</p>
          <p className="caption-12 text-[var(--text-secondary)]">{f.evidence.method}</p>
          <p className="caption-12 text-[var(--text-muted)]">Read off {f.evidence.source}.</p>
        </div>
      ) : (
        // Same box, same size, same position a measured claim takes. An absence
        // rendered smaller than a presence teaches a reader to skip it.
        <p className="caption-12 flex items-baseline gap-[7px] rounded-[var(--radius-control)] bg-[var(--surface-subtle)] px-[12px] py-[9px] text-[var(--text-secondary)]">
          <CircleSlash
            size={12}
            strokeWidth={1.5}
            aria-hidden
            className="translate-y-[2px] shrink-0 text-[var(--text-muted)]"
          />
          {NOT_MEASURED}
        </p>
      )}
    </li>
  );
}
