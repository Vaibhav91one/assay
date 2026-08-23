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
// the diff that was NOT applied, with the reason it was not applied under it --
// the screen Bright Data has no reason to draw, because there the refusal never
// happens. Everything below leans that way on purpose.
//
// THE REASON IS A WORD, NOT A NUMBER, and this file is where that changed. It
// used to print `Best 0.7354 against τ 0.6, ahead of the runner-up by 0.1258
// against δ 0.16`, and it worked out which test had failed by re-running the
// comparison on those numbers. Both are gone. The band comes off
// `field_runs.reason` through `src/reports/assay-score.ts`, and what is drawn
// beside it on a THIN refusal is the pair of VALUES the gate could not separate
// -- which is the half of the evidence a person can actually judge. See the
// amendment to docs/FEATURES.md §4 dated 2026-08-23.
//
// A server component. Nothing here has state, and the one client boundary is
// `CodeComparison`, which needs one because shiki is a WASM-backed grammar
// engine and cannot run on the server. Its unhighlighted branch renders here,
// so the code is in the HTML on first paint and gains colour afterwards.

import type { ExtractorDiff as ExtractorDiffRecord } from 'assay/engine/reports/extractor-diff';
import { bandFor } from 'assay/engine/reports/assay-score';
import { CodeComparison } from '@/components/ui/code-comparison';
import { AssayScore } from '@/components/assay-score';
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
 * One rival, as the reader can act on it: where it is, and what it says.
 *
 * NO SCORE, AND THE TYPE IS WHY. `ExtractorDiffRecord.rivals` carries
 * `{ selector, score }` and this deliberately does not accept that shape -- the
 * caller maps the value in and drops the score at the prop boundary, so
 * printing one here is a compile error rather than a thing review has to
 * notice. Same reasoning for `diff` below, which arrives as a `Pick`.
 */
export interface RivalValue {
  selector: string;
  /** The text that candidate holds on the page. The half a person can judge. */
  value: string;
}

/**
 * What a person is looking at, and what they may do about it.
 *
 * `diff` IS A `Pick`, NOT THE WHOLE RECORD. The record still carries `score`,
 * `margin`, `tau` and `delta` -- they are data and they stay -- but this
 * component may not render them, and the narrow type is the enforcement. The
 * four keys it does take are the ones that draw the two panes.
 *
 * `reason` is `field_runs.reason`, passed down rather than read here: the
 * extraction diff is composed from `heal_history` and `field_state` and has
 * never carried the gate's reason. The band is derived from it and from
 * nothing else -- see `src/reports/assay-score.ts`. Deriving it from the score
 * and the thresholds instead is what this component used to do, and it is a
 * second thing that can be wrong: re-running the arithmetic to work out which
 * test failed produces a confident sentence the moment a contract is edited
 * under it.
 */
export function ExtractorDiff({
  diff,
  reason,
  rivals = [],
}: {
  diff: Pick<ExtractorDiffRecord, 'field' | 'before' | 'after' | 'decision'>;
  reason: string | null;
  rivals?: RivalValue[];
}) {
  const held = diff.decision === 'held';
  const band = bandFor(reason);

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

      {/* A published heal has no stored reason -- `src/runner.ts:263` writes
          `{ status: 'healed' }` and nothing else -- so `clear_margin` and
          `benign_tie` never reach `field_runs` and no band can be drawn here
          without inventing one. The sentence says what the two panes show and
          claims nothing about WHICH of the two heals it was. */}
      {!held && (
        <p className="meta-12_5 text-[var(--text-secondary)]">
          {diff.decision === 'reverted' ? t('diff.movedThenTakenBack') : t('diff.moved')}
        </p>
      )}

      {held && <AssayScore reason={reason} />}

      {/* The band's own sentence ends every held case with "nothing was
          published", so this line exists only for the case where there is no
          band: a reason code this build does not know, or `brake_unreadable`,
          which is deliberately un-worded. The reader still has to be told the
          cell is empty. */}
      {held && band === null && (
        <p className="meta-12_5 text-[var(--text-secondary)]">{t('diff.nothingPublished')}</p>
      )}

      {/* THIN ONLY, and only two. THIN is the one band whose sentence is not
          actionable on its own: "they carried different values" is a fact about
          two things the reader cannot see. The pair the margin was a
          measurement OF is what settles it, and the VALUES are what settles it
          -- a person can look at "Recall & Safety Alerts" beside "Recall &
          Safety Alerts (archived)" and answer in five seconds. The scores that
          separated them cannot be looked at in the same way, which is why the
          score column that used to sit here is gone rather than moved.

          The other bands do not get this block: WEAK and GONE have no rival to
          show, AGREED published, and POLICY and BRAKED are a person's rule
          rather than a question about the page. */}
      {band === 'THIN' && rivals.length > 1 && (
        <div className="flex flex-col gap-[8px] rounded-[var(--radius-control)] border border-[var(--border-hairline)] bg-[var(--surface-subtle)] px-[16px] py-[12px]">
          <p className="label-10 text-[var(--text-muted)]">{t('diff.rivals.eyebrow')}</p>
          {/* `dl` and not a table: two rows of "where" and "what it says" is a
              description list, and a two-row table gets a header a reader then
              has to read before the two lines under it. */}
          <dl className="flex flex-col gap-[6px]">
            {rivals.slice(0, 2).map((r) => (
              <div key={r.selector + r.value} className="flex items-baseline gap-[12px]">
                <dt className="mono-value-12_5 w-[140px] shrink-0 truncate text-[var(--text-muted)]">
                  {r.selector}
                </dt>
                <dd className="body-13_5 min-w-0 flex-1 text-[var(--text-primary)]">
                  {r.value || t('common.dash')}
                </dd>
              </div>
            ))}
          </dl>
          <p className="meta-12_5 border-t border-[var(--border-hairline)] pt-[8px] text-[var(--text-secondary)]">
            {t('diff.rivals.disagree')}
          </p>
        </div>
      )}
    </div>
  );
}
