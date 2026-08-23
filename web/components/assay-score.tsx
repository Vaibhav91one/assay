// The Assay Score, drawn. One word, its sentence, and the way to the arithmetic.
//
// ONE COMPONENT, EVERY SURFACE. The selector diff and the gate section on
// `/runs/[run]` used to state the same refusal in two different shapes -- one as
// `Best 0.7354 against τ 0.6`, the other as a score column with a bar beside it
// -- and each worked out which threshold had failed on its own. Two renderings
// of one fact is how two screens come to disagree about it. There is one here,
// and a second surface adds a call rather than a design.
//
// It is also drawn ONCE PER SCREEN, which is a different rule and is enforced at
// the call sites: the run page draws it on the selector diff and deliberately
// not again over the candidate list forty pixels below.
//
// THE WORD IS THE WHOLE THING. No float, no percentage, no bar, no gauge, no
// ring -- docs/FEATURES.md §4 refuses all of them and the amendment dated
// 2026-08-23 keeps refusing them. `src/reports/assay-score.ts` carries the
// reasoning and the copy; this file carries only the colour and the layout,
// so a change to what a band MEANS cannot be made here by accident.
//
// A server component. It has no state, and the only interactive thing on it is
// a link.

import Link from 'next/link';
import { CircleAlert, CircleSlash, Check, Hand } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { bandFor, BAND_MEANS, ASSAY_SCORE_DOC, type Band } from 'assay/engine/reports/assay-score';
import { t } from '@/lib/copy';

/**
 * Colour and glyph, paired, exactly as `StatusLine` pairs them.
 *
 * The palette carries no alarm red on its own: severity is read off the pair,
 * never off a fill, so a reader who cannot separate the two tints still gets
 * the mark. The pairing is also what stops the band becoming a rating -- CLEAR
 * and AGREED are both "published", THIN and WEAK and GONE are all "held", and
 * POLICY and BRAKED are "held by a person's rule". Three groups, three glyphs,
 * and no implied order inside a group, because there is none: WEAK is not worse
 * than GONE, it is a different thing that happened.
 */
const LOOK: Record<Band, { colour: string; tint: string; icon: LucideIcon }> = {
  CLEAR: { colour: 'var(--semantic-success)', tint: 'var(--semantic-success-subtle)', icon: Check },
  AGREED: { colour: 'var(--semantic-success)', tint: 'var(--semantic-success-subtle)', icon: Check },
  THIN: { colour: 'var(--semantic-warning)', tint: 'var(--semantic-warning-subtle)', icon: CircleAlert },
  WEAK: { colour: 'var(--semantic-warning)', tint: 'var(--semantic-warning-subtle)', icon: CircleAlert },
  GONE: { colour: 'var(--semantic-warning)', tint: 'var(--semantic-warning-subtle)', icon: CircleSlash },
  POLICY: { colour: 'var(--semantic-link)', tint: 'var(--surface-subtle)', icon: Hand },
  BRAKED: { colour: 'var(--semantic-link)', tint: 'var(--surface-subtle)', icon: Hand },
};

/**
 * The band for one stored reason, or nothing at all.
 *
 * RETURNS NULL RATHER THAN A PLACEHOLDER when `bandFor` does not recognise the
 * reason. A dash, an "unknown" pill or a greyed-out word would all be the
 * component asserting that it looked and found nothing to say, which is a claim
 * about the decision; drawing nothing is the absence of a claim. The reason
 * code itself is still on the screen -- the Fields table prints it through
 * `heldBecause`, which has the same rule -- so nothing is hidden by this, only
 * un-worded. See the note on `bandFor`.
 */
export function AssayScore({ reason }: { reason: string | null | undefined }) {
  const band = bandFor(reason);
  if (!band) return null;
  const { colour, tint, icon: Icon } = LOOK[band];

  return (
    <Link
      href={ASSAY_SCORE_DOC}
      // The whole badge, not a "learn more" tacked on the end. The promise the
      // hidden numbers rest on is that the word can always be turned back into
      // the arithmetic, and a promise kept by a small link at the end of a
      // sentence is one most readers never find.
      // No `hover:bg-*` here: the tint is an inline style, which wins over a
      // utility class, so a hover background would be a rule that never fires.
      // The underline on the trailing link is the affordance.
      className="focus-ring group flex items-start gap-[10px] rounded-[var(--radius-control)] border border-[var(--border-hairline)] px-[12px] py-[10px]"
      style={{ background: tint }}
    >
      <Icon size={15} strokeWidth={1.5} style={{ color: colour }} className="mt-[1px] shrink-0" aria-hidden />
      <span className="flex min-w-0 flex-col gap-[2px]">
        <span className="mono-label-12" style={{ color: colour }}>
          {band}
        </span>
        <span className="meta-12_5 text-[var(--text-secondary)]">
          {BAND_MEANS[band]}{' '}
          <span className="text-[var(--semantic-link)] group-hover:underline">
            {t('assayScore.more')}
          </span>
        </span>
      </span>
    </Link>
  );
}
