// The change to how a field is read, drawn as a diff -- including the one that
// was refused.
//
// Bright Data's Self-Healing tool ends at a code diff with Accept and Decline.
// The operator reads a rewritten scraper, in a hurry, with no number beside it,
// and clicks. This draws the same picture and puts the decision on the other
// side of it: the gate has already decided, on two thresholds, and the diff is
// the receipt rather than the prompt.
//
// Which makes the `held` state the important one and not the edge case. It is
// the diff that was NOT applied, with the margin that was too thin printed
// under it -- the screen Bright Data has no reason to draw, because there the
// refusal never happens. Everything below leans that way on purpose.
//
// A server component. Nothing here has state, and the one client boundary is
// `CodeComparison`, which needs one because shiki is a WASM-backed grammar
// engine and cannot run on the server. Its unhighlighted branch renders here,
// so the code is in the HTML on first paint and gains colour afterwards.

import type { ExtractorDiff as ExtractorDiffRecord } from 'assay/engine/reports/extractor-diff';
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

const n = (v: number) => v.toFixed(4);

/**
 * One line of numbers, in the product's voice.
 *
 * NO PERCENTAGE AND NO CONFIDENCE, here or anywhere near this component.
 * docs/FEATURES.md 4 and CONTRIBUTING.md both refuse it in the same words: a
 * float relocates the abstain decision to whoever cares least about it. What is
 * printed instead is what was actually compared -- a score against tau, a
 * margin against delta -- which is a measurement the reader can check rather
 * than a feeling the product is asking them to share.
 *
 * WHICH TEST FAILED IS DERIVED FROM THE NUMBERS, not read from
 * `field_runs.reason`. The arithmetic is `src/heal.ts:249` and it is on the
 * page: score first, then margin, then neither -- which is a policy holding a
 * heal the gate itself allowed. Deriving it means the sentence cannot disagree
 * with the numbers printed beside it, which is the failure mode a reason code
 * copied onto a screen has.
 */
function verdict(d: ExtractorDiffRecord): React.ReactNode {
  const thresholds = (
    <>
      <Num>τ {d.tau}</Num> and <Num>δ {d.delta}</Num>
    </>
  );

  if (d.decision !== 'held') {
    return (
      <>
        Cleared {thresholds}, so the selector moved
        {d.decision === 'reverted' ? ' — and was later taken back.' : '.'}
      </>
    );
  }

  // A held run kept its ranked list, so these are never null on this arm. The
  // guard is for the one case that can be: `no_candidates`, where the gate
  // abstained before anything was weighed and there is genuinely no number.
  if (d.score === null || d.margin === null) {
    return <>Nothing on the page was close enough to score. {t('diff.nothingPublished')}</>;
  }

  const belowTau = d.score <= d.tau;
  const thinMargin = d.margin <= d.delta;

  return (
    <>
      Best <Num>{n(d.score)}</Num> against <Num>τ {d.tau}</Num>, ahead of the runner-up by{' '}
      <Num>{n(d.margin)}</Num> against <Num>δ {d.delta}</Num>.{' '}
      {belowTau
        ? 'Nothing on the page looked enough like this field.'
        : thinMargin
          ? 'Two candidates were too close to separate.'
          : 'Both thresholds cleared, and a policy withheld it anyway.'}{' '}
      {t('diff.nothingPublished')}
    </>
  );
}

const Num = ({ children }: { children: React.ReactNode }) => (
  <span className="mono-value-12_5 text-[var(--text-primary)]">{children}</span>
);

export function ExtractorDiff({ diff }: { diff: ExtractorDiffRecord }) {
  const held = diff.decision === 'held';

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

      <p className="meta-12_5 text-[var(--text-secondary)]">{verdict(diff)}</p>

      {/* The two the gate could not separate, and the gap between them.
          Deliberately TWO and not the whole ranked list: the full list, with
          the text each candidate held, is the section below this one, and
          printing it twice on one screen is the duplicated fact
          docs/APP-DESIGN.md 5b calls P2. What is here is the pair the margin
          is a measurement OF -- which the list does not say, because a list
          of scores does not point at the subtraction between two of them. */}
      {held && diff.rivals.length > 1 && (
        <dl className="flex flex-col gap-[6px] rounded-[var(--radius-control)] border border-[var(--border-hairline)] bg-[var(--surface-subtle)] px-[16px] py-[12px]">
          {diff.rivals.slice(0, 2).map((r) => (
            <div key={r.selector} className="flex items-baseline gap-[12px]">
              <dt className="mono-value-12_5 min-w-0 flex-1 truncate text-[var(--text-primary)]">
                {r.selector}
              </dt>
              <dd className="mono-value-12_5 text-[var(--text-secondary)]">{n(r.score)}</dd>
            </div>
          ))}
          <div className="flex items-baseline gap-[12px] border-t border-[var(--border-hairline)] pt-[6px]">
            <dt className="meta-12_5 flex-1 text-[var(--text-muted)]">{t('diff.tooClose')}</dt>
            <dd className="mono-value-12_5 text-[var(--semantic-warning)]">
              {diff.margin === null ? t('common.dash') : n(diff.margin)}
            </dd>
          </div>
        </dl>
      )}
    </div>
  );
}
