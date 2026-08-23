// The shape of the published record at one run against the run before it.
//
// In Bright Data's Scraper Studio this is a button. After the LLM rewrites a
// scraper, an operator has to notice that a field was added or renamed and
// click **Update Schema** before saving to production. Nothing computes it and
// nothing insists on it; a drift that nobody clicked is a drift that ships.
// Here it is derived from the run's own `field_runs` rows, so there is nothing
// to remember, and the screen can show it whether or not anybody asks.
//
// A server component -- see the note in `./extractor-diff.tsx` on why the one
// client boundary is `CodeComparison` and why its unhighlighted branch is what
// lands on first paint.

import type { ShapeChange, FieldShape } from 'assay/engine/reports/schema-diff';
import { CodeComparison } from '@/components/ui/code-comparison';
import { t } from '@/lib/copy';

/**
 * A held cell is drawn as a HOLE, and the hole is drawn the way this app
 * already draws one.
 *
 * `/compare` calls a cell it will not report on `withheld` and paints it on
 * `--semantic-warning-subtle`; the run page's own field table prints the word
 * `held` on the same surface. So the line is `null` -- which is literally what
 * `field_runs.value` holds, never an empty string and never a dash that could
 * be mistaken for one -- with the word `held` beside it and the same warning
 * band behind it, via `// [!code highlight]` and the highlight colour
 * `CodeComparison` defaults to.
 *
 * The alternative was a third colour and a fourth word for a fact this repo has
 * already named twice. A second visual language for the same thing is how two
 * screens end up disagreeing about what a hole is.
 *
 * The warning band OVERRIDES the diff band, and that is the point rather than a
 * precedence accident. A cell that went to quarantined is a change, so the
 * right-hand pane would otherwise mark it as an addition and paint it on the
 * success surface -- a green line for the run that published nothing, which is
 * the exact opposite of what happened.
 */
function line(s: FieldShape, mark: string): string {
  if (s.status === 'quarantined') {
    return `  ${s.field}: null, // ${t('diff.held')} // [!code highlight]`;
  }
  // Numbers unquoted, everything else quoted, null bare. The rendering follows
  // the type this field was GIVEN by `shapeOf`, so what the reader sees is the
  // inference the diff was computed on rather than a second guess at it.
  const v =
    s.value === null ? 'null' : s.type === 'number' ? s.value : JSON.stringify(s.value);
  return `  ${s.field}: ${v},${mark}`;
}

/** The `before` side of a change, when it has one. */
const before = (c: ShapeChange): FieldShape | null => ('before' in c ? c.before : null);
const after = (c: ShapeChange): FieldShape | null => ('after' in c ? c.after : null);

/**
 * One pane's source.
 *
 * Both panes walk the SAME `ShapeChange[]` in the same order -- changes first,
 * then unchanged, alphabetical within each -- and each skips the changes that
 * have no side of its own. So an added field appears only on the right and a
 * removed one only on the left, which puts the two panes out of step by a line
 * exactly where a field was added or removed.
 *
 * That is left alone rather than padded. Emitting a blank on the other side to
 * keep the rows level would be drawing a line for a field that does not exist
 * in that run, and the `+`/`-` band already says which side is missing. This
 * screen does not invent content to make a layout tidy.
 */
function pane(changes: ShapeChange[], side: 'before' | 'after'): string {
  const pick = side === 'before' ? before : after;
  const mark = side === 'before' ? ' // [!code --]' : ' // [!code ++]';
  const rows = changes.flatMap((c) => {
    const s = pick(c);
    if (!s) return [];
    return [line(s, c.kind === 'same' ? '' : mark)];
  });
  return ['{', ...rows, '}', ''].join('\n');
}

export function SchemaDiff({
  changes,
  scraper,
  fromRun,
  toRun,
}: {
  changes: ShapeChange[];
  /** The pane's filename. The scraper, which is what the record is OF. */
  scraper: string;
  fromRun: number;
  toRun: number;
}) {
  return (
    <CodeComparison
      language="js"
      filename={scraper}
      beforeCode={pane(changes, 'before')}
      afterCode={pane(changes, 'after')}
      // The run ids, not `before`/`after`. This diff spans two executions and
      // the reader is on one of them; which one is the question the label is
      // there to answer, and "before" does not answer it.
      beforeLabel={`run ${fromRun}`}
      afterLabel={`run ${toRun}`}
    />
  );
}
