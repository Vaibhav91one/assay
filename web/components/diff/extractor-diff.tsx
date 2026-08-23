// The change to how a field is read, drawn as a diff -- including the one that
// was refused.
//
// Bright Data's Self-Healing tool ends at a code diff with Accept and Decline.
// The operator reads a rewritten scraper, in a hurry, with no evidence beside
// it, and clicks. This draws the same picture and puts the decision on the
// other side of it: the gate has already decided, and the diff is the receipt
// rather than the prompt.
//
// Which makes the `held` state the important one and not the edge case. It is
// the diff that was NOT applied -- the screen Bright Data has no reason to
// draw, because there the refusal never happens. Everything below leans that
// way on purpose.
//
// NOT ONE NUMBER REACHES THIS FILE'S OUTPUT. The score, the margin and the two
// thresholds are on the record and stay there; what is rendered is the band,
// which is a word. docs/FEATURES.md 4 is the argument and
// `src/reports/assay-score.ts` is the vocabulary. There is no float here, no
// percentage, no bar and no gauge, and the moment one appears the product is
// back to asking a reader to decide what 0.74 is worth.
//
// A server component. Nothing here has state, and the one client boundary is
// `CodeComparison`, which needs one because shiki is a WASM-backed grammar
// engine and cannot run on the server. Its unhighlighted branch renders here,
// so the code is in the HTML on first paint and gains colour afterwards.

import Link from 'next/link';
import type { ExtractorDiff as ExtractorDiffRecord } from 'assay/engine/reports/extractor-diff';
import {
  ASSAY_SCORE_DOC,
  ASSAY_SCORE_MEANS,
  type AssayScore,
} from 'assay/engine/reports/assay-score';
import { CodeComparison } from '@/components/ui/code-comparison';
import { t } from '@/lib/copy';

/**
 * The extraction spec as a small object literal.
 *
 * Code rather than a two-column table, and the reason is the argument rather
 * than the aesthetic: this is the shape Bright Data shows a rewritten scraper
 * in, and the claim being made is that Assay reaches a better decision in the
 * same picture. A table would win the layout and lose the comparison.
 *
 * `selector` is the only line that can differ -- see the note on `ENGINE_READ`
 * in `src/reports/extractor-diff.ts` -- so it is the only line ever marked.
 * `attr` and `transform` are on both sides, unmarked, because an extraction
 * spec with one key in it does not read as one.
 */
function spec(selector: string | null, attr: string, transform: string | null, mark: string) {
  // `null`, not `""`. An unrecorded origin -- a first heal on a field whose
  // baseline predates `heal_history` -- is an absence, and an empty string is a
  // selector that matches nothing. They are different facts.
  const s = selector === null ? 'null' : JSON.stringify(selector);
  return [
    '{',
    `  selector: ${s},${mark}`,
    `  attr: ${JSON.stringify(attr)},`,
    `  transform: ${transform === null ? 'null' : JSON.stringify(transform)},`,
    '}',
    '',
  ].join('\n');
}

/**
 * The four bands that mean "nothing was published" read as warnings; CLEAR and
 * AGREED are the gate allowing something and read as success.
 *
 * Mapped onto `StatusLine`'s own tones rather than to colours picked here, so a
 * band and every other status on this page agree about what warning looks like.
 */
const TONE: Record<AssayScore, string> = {
  CLEAR: 'var(--semantic-success)',
  AGREED: 'var(--semantic-success)',
  THIN: 'var(--semantic-warning)',
  WEAK: 'var(--semantic-warning)',
  GONE: 'var(--semantic-warning)',
};

const SUBTLE: Record<AssayScore, string> = {
  CLEAR: 'var(--semantic-success-subtle)',
  AGREED: 'var(--semantic-success-subtle)',
  THIN: 'var(--semantic-warning-subtle)',
  WEAK: 'var(--semantic-warning-subtle)',
  GONE: 'var(--semantic-warning-subtle)',
};

/**
 * The band, its one line of English, and the way to the page that defines it.
 *
 * The link is not decoration and is not optional. A closed vocabulary is only
 * honest if the definition is one click away -- five invented words with no
 * glossary would be worse than the number they replaced, because at least a
 * float admits it is a float. Every surface that shows a band carries this.
 */
function Band({ band }: { band: AssayScore }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-[10px] gap-y-[4px]">
      <span className="label-10 text-[var(--text-muted)]">{t('diff.band.label')}</span>
      <span
        className="mono-label-12 rounded-[6px] px-[7px] py-[2px]"
        style={{ color: TONE[band], background: SUBTLE[band] }}
      >
        {band}
      </span>
      <span className="meta-12_5 text-[var(--text-secondary)]">{ASSAY_SCORE_MEANS[band]}</span>
      <Link
        href={ASSAY_SCORE_DOC}
        className="focus-ring meta-12_5 rounded-[var(--radius-control)] text-[var(--semantic-link)] hover:underline"
      >
        {t('diff.band.link')}
      </Link>
    </div>
  );
}

export function ExtractorDiff({ diff }: { diff: ExtractorDiffRecord }) {
  const held = diff.decision === 'held';
  // THIN is the one band whose evidence is worth laying out, because it is the
  // one where two answers were on the table and they DISAGREED. On WEAK and
  // GONE there is no pair to compare -- nothing scored, or nothing was there --
  // and printing a list would be dressing an absence up as a choice.
  const disagreed = held && diff.band === 'THIN' && diff.rivals.length > 1;

  return (
    <div className="flex w-full flex-col gap-[12px]">
      <CodeComparison
        language="js"
        filename={diff.field}
        beforeCode={spec(diff.before.selector, diff.before.attr, diff.before.transform, ' // [!code --]')}
        afterCode={spec(diff.after.selector, diff.after.attr, diff.after.transform, ' // [!code ++]')}
        beforeLabel={t('diff.pane.before')}
        afterLabel={
          held
            ? t('diff.pane.refused')
            : diff.decision === 'reverted'
              ? t('diff.pane.takenBack')
              : t('diff.pane.after')
        }
      />

      {/* Null on every healed cell, because `field_runs.reason` is null on
          every healed cell -- see `assayScore`. The band is simply absent
          rather than filled in with the likelier of the two heal words. */}
      {diff.band && <Band band={diff.band} />}

      {/* Suppressed when the THIN block is drawn, because that block's own
          sentence ends on the same words. The refusal said twice, four lines
          apart, is the duplicated fact docs/APP-DESIGN.md 5b calls P2 -- and
          repeating it makes it read as two separate findings rather than one. */}
      {!disagreed && (
        <p className="meta-12_5 text-[var(--text-secondary)]">
          {held ? t('diff.nothingPublished') : t('diff.published')}
        </p>
      )}

      {/* The two the gate could not separate, and what each of them said.
          THE VALUES ARE THE POINT. A person deciding this cell cannot act on
          how close two candidates scored; they can act on the fact that one
          element says one thing and the other says something else, because
          that is a question they know the answer to and the gate does not. */}
      {disagreed && (
        <div className="flex flex-col gap-[10px] rounded-[var(--radius-control)] border border-[var(--border-hairline)] bg-[var(--surface-subtle)] px-[16px] py-[12px]">
          <p className="meta-12_5 text-[var(--text-primary)]">{t('diff.thin.disagreed')}</p>
          <dl className="flex flex-col gap-[8px]">
            {diff.rivals.slice(0, 2).map((r) => (
              <div key={r.selector} className="flex flex-col gap-[2px]">
                <dt className="mono-label-12 truncate text-[var(--text-muted)]">{r.selector}</dt>
                <dd className="body-13_5 text-[var(--text-primary)]">
                  {/* An element that is there and empty is a real answer and
                      is stored as `''`. It is said in words rather than left
                      as a blank line the reader has to interpret. */}
                  {r.value === '' ? (
                    <span className="text-[var(--text-muted)]">{t('diff.emptyElement')}</span>
                  ) : (
                    r.value
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  );
}
