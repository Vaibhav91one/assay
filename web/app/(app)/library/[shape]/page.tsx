import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CircleCheck, CircleSlash } from 'lucide-react';
import { TopBar } from '@/components/top-bar';
import {
  templateById, thresholdsOf, evidenceOf, NOT_MEASURED, type TemplateField,
} from 'assay/engine/library/index';
import { Apply } from '../apply';

// The template list is static, but `TopBar` reads the notification queue, so
// every screen under this layout is dynamic regardless. Prerendering the seven
// shapes would only move that read, not remove it.
export const dynamic = 'force-dynamic';

export async function generateMetadata(
  { params }: { params: Promise<{ shape: string }> },
): Promise<Metadata> {
  const t = templateById((await params).shape);
  return { title: t ? `${t.name} · Library · Assay` : 'Library · Assay' };
}

/**
 * One template, in the order an operator decides in.
 *
 *   1. what shape of page this is for -- so they can stop reading if it is not theirs
 *   2. the fields, each with its tier, its numbers and its evidence
 *   3. what happens when the page does not match
 *   4. the form that applies it
 *
 * THE EVIDENCE SITS ON THE FIELD ROW. The catalogue this took its structure
 * from keeps its reliability claims on a marketing page one level up from the
 * entry, so nothing on an endpoint page tells you what it is actually measured
 * to do. That split is the thing worth not copying: a claim and the field it is
 * about have to be readable in one glance, and a field with no claim has to say
 * so in the same place, in the same words, at the same size.
 *
 * The order of 3 before 4 is also deliberate. "What it does when your page is
 * not this shape" is the last thing read before the button, because it is the
 * sentence that decides whether pressing it is safe.
 */
export default async function ShapePage({ params }: { params: Promise<{ shape: string }> }) {
  const t = templateById((await params).shape);
  if (!t) notFound();

  const { measured, total } = evidenceOf(t);

  return (
    <>
      <TopBar
        title={t.name}
        status={measured > 0 ? `${measured} of ${total} fields measured` : 'no field measured'}
        scraper={null}
      />
      <div className="flex w-full max-w-[860px] flex-col gap-[28px] pl-[56px] pr-[32px] pb-[64px] pt-[18px]">
        <div className="flex flex-col gap-[8px]">
          <Link href="/library" className="meta-13 self-start text-[var(--semantic-link)]">
            ‹ Library
          </Link>
          <p className="body-14 text-[var(--text-primary)]">{t.summary}</p>
        </div>

        <Section title="THE SHAPE THIS EXPECTS">
          <p className="body-13_5 text-[var(--text-secondary)]">{t.shape}</p>
          <p className="caption-12 text-[var(--text-muted)]">Usually: {t.where}</p>
        </Section>

        <Section title={`FIELDS · ${t.fields.length}`}>
          <p className="caption-12 text-[var(--text-secondary)]">
            The tier is the whole configuration. It fixes τ, the score a candidate must reach
            before anything is published, and δ, how far clear of the runner-up it must be.
            You never write either number.
          </p>
          <ul className="flex flex-col gap-[12px]">
            {t.fields.map((f) => <Field key={f.name} field={f} />)}
          </ul>
        </Section>

        <Section title="WHEN YOUR PAGE IS NOT THIS SHAPE">
          <p className="body-13_5 text-[var(--text-secondary)]">{t.mismatch}</p>
          <p className="caption-12 text-[var(--text-muted)]">
            This is not a warning written for this page — it is what the create path already
            does. A field whose example is not in the returned HTML is refused by name, and
            a watch with one bad field writes nothing at all rather than writing the rest.
          </p>
        </Section>

        <Section title="APPLY IT TO A PAGE OF YOURS">
          <Apply template={t} />
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
function Field({ field: f }: { field: TemplateField }) {
  const { tau, delta } = thresholdsOf(f);

  return (
    <li className="flex flex-col gap-[8px] rounded-[var(--radius-card)] border border-[var(--border-default)] bg-[var(--surface-card)] px-[16px] py-[13px]">
      <div className="flex flex-wrap items-baseline gap-x-[12px] gap-y-[3px]">
        <code className="mono-value-13 text-[var(--text-primary)]">{f.name}</code>
        <span className="caption-11 text-[var(--text-muted)]">
          {f.policy} · τ {tau.toFixed(2)} · δ {delta.toFixed(2)}
        </span>
      </div>

      <p className="caption-13 text-[var(--text-secondary)]">{f.means}</p>
      <p className="caption-12 text-[var(--text-muted)]">Reads like: {f.looks}</p>
      <p className="caption-12 text-[var(--text-secondary)]">
        <span className="text-[var(--text-primary)]">Why {f.policy}.</span> {f.why}
      </p>

      {f.evidence ? (
        <div className="flex flex-col gap-[5px] rounded-[var(--radius-control)] bg-[var(--surface-subtle)] px-[12px] py-[10px]">
          <p className="caption-12 flex items-baseline gap-[7px] text-[var(--text-primary)]">
            <CircleCheck
              size={12}
              strokeWidth={1.5}
              aria-hidden
              className="translate-y-[2px] shrink-0 text-[var(--semantic-success)]"
            />
            {f.evidence.claim}
          </p>
          <p className="caption-12 text-[var(--text-secondary)]">Method: {f.evidence.method}</p>
          <p className="caption-12 text-[var(--text-muted)]">Read off {f.evidence.source}.</p>
        </div>
      ) : (
        // Same box, same size, same position as a measured claim. An absence
        // rendered smaller than a presence teaches a reader to skip it.
        <p className="caption-12 flex items-baseline gap-[7px] rounded-[var(--radius-control)] bg-[var(--surface-subtle)] px-[12px] py-[10px] text-[var(--text-secondary)]">
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
