import type { HistoryPoint } from '@/lib/run-detail';
import type { RunOutcome } from '@/lib/run-flow';

/**
 * Two charts, hand-rolled in SVG.
 *
 * docs/STACK.md §8 lists charts as "none -- hand-rolled SVG", and §"not used"
 * says a chart library is never right for these: the run strip, the lead bar
 * and the rank bars are already bespoke. A donut is an arc and a bar is a
 * rectangle; neither is worth a dependency, and adding one would contradict a
 * written decision to save about forty lines.
 *
 * Both read from the token palette and neither carries information in colour
 * alone -- each has the same numbers written out beside it, as a table for the
 * donut and as a caption plus per-bar title for the series. Colour is the
 * redundant channel here, not the only one.
 *
 * What they chart, and why these two:
 *
 *   * the outcome mix has real variance on a real target (ikea: 25 healed,
 *     4 clean, 1 held) and it is the number the product is judged on -- how
 *     often it healed versus how often it refused to guess. It is drawn only
 *     when at least two outcomes are non-zero: a donut that is one full ring is
 *     a sentence pretending to be a picture, which is the failure this file was
 *     warned about.
 *   * page size per run is the detector's own input series. `page_bytes` is on
 *     `runs` rather than `captures` precisely so it has no holes in it, so it
 *     is the one per-run number that exists for every run including skipped
 *     ones -- and it moves (ikea: 183 kB to 260 kB), which is what a break in
 *     a template looks like from the outside.
 *
 * The gate's own numbers are deliberately NOT a third chart: score and margin
 * exist only on a held run, and they are drawn where they mean something, on
 * the candidate list beside the thresholds they were judged against.
 */

const LABEL: Record<RunOutcome, string> = {
  clean: 'clean',
  healed: 'healed',
  held: 'held',
  skipped: 'skipped',
};

const COLOUR: Record<RunOutcome, string> = {
  clean: 'var(--accent-brand)',
  healed: 'var(--semantic-success)',
  held: 'var(--semantic-warning)',
  skipped: 'var(--border-default)',
};

const ORDER: RunOutcome[] = ['clean', 'healed', 'held', 'skipped'];

/* ------------------------------------------------------------------ donut */

const R = 52;
const STROKE = 18;
const C = 2 * Math.PI * R;

export function OutcomeDonut({ history, scraper }: { history: HistoryPoint[]; scraper: string }) {
  const counts = ORDER.map((o) => ({
    outcome: o,
    n: history.filter((h) => h.outcome === o).length,
  })).filter((s) => s.n > 0);
  const total = history.length;

  if (total === 0) return null;

  // One category is a fact, not a picture. Say it in words instead.
  if (counts.length < 2) {
    return (
      <p className="body-13_5 text-[var(--text-secondary)]">
        {/* "Nothing to chart until that changes." came off: it narrated this
            component's own rendering decision to a reader who can see there is
            no chart. The sentence that remains is the fact. */}
        All {total} recorded run{total === 1 ? '' : 's'} of {scraper} came back{' '}
        <span className="text-[var(--text-primary)]">{LABEL[counts[0]!.outcome]}</span>.
      </p>
    );
  }

  let offset = 0;
  const arcs = counts.map((s) => {
    const len = (s.n / total) * C;
    const arc = { ...s, len, offset };
    offset += len;
    return arc;
  });

  return (
    <div className="flex items-center gap-[24px]">
      <svg
        width={2 * (R + STROKE / 2)}
        height={2 * (R + STROKE / 2)}
        viewBox={`0 0 ${2 * (R + STROKE / 2)} ${2 * (R + STROKE / 2)}`}
        role="img"
        aria-label={`${total} run${total === 1 ? '' : 's'} of ${scraper}: ${counts.map((s) => `${s.n} ${LABEL[s.outcome]}`).join(', ')}`}
        className="shrink-0"
      >
        <g transform={`rotate(-90 ${R + STROKE / 2} ${R + STROKE / 2})`}>
          {arcs.map((a) => (
            <circle
              key={a.outcome}
              cx={R + STROKE / 2}
              cy={R + STROKE / 2}
              r={R}
              fill="none"
              stroke={COLOUR[a.outcome]}
              strokeWidth={STROKE}
              // Two dashes: the arc itself, then the rest of the ring as a gap.
              strokeDasharray={`${a.len} ${C - a.len}`}
              strokeDashoffset={-a.offset}
            />
          ))}
        </g>
        <text
          x={R + STROKE / 2}
          y={R + STROKE / 2}
          textAnchor="middle"
          dominantBaseline="central"
          className="mono-value-13"
          fill="var(--text-primary)"
        >
          {total}
        </text>
      </svg>

      {/* The legend IS the text alternative, so it is a table rather than a row
          of coloured words: the numbers are readable with the colours ignored. */}
      <table className="border-collapse">
        <caption className="sr-only">
          Outcomes across {total} recorded run{total === 1 ? '' : 's'} of {scraper}
        </caption>
        <tbody>
          {counts.map((s) => (
            <tr key={s.outcome}>
              <td className="py-[3px] pr-[10px]">
                <span
                  className="block size-[10px] rounded-[2px]"
                  style={{ background: COLOUR[s.outcome] }}
                  aria-hidden
                />
              </td>
              <th scope="row" className="body-13_5 py-[3px] pr-[16px] text-left font-normal text-[var(--text-primary)]">
                {LABEL[s.outcome]}
              </th>
              <td className="mono-value-13 py-[3px] pr-[10px] text-right text-[var(--text-primary)]">
                {s.n}
              </td>
              <td className="meta-12_5 py-[3px] text-right text-[var(--text-muted)]">
                {Math.round((s.n / total) * 100)}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------- bars */

const H = 96;

export function PageSizeBars({
  history,
  runId,
  scraper,
}: {
  history: HistoryPoint[];
  runId: number;
  scraper: string;
}) {
  const points = history.filter((h) => h.pageBytes != null) as (HistoryPoint & {
    pageBytes: number;
  })[];
  if (points.length === 0) return null;

  const max = Math.max(...points.map((p) => p.pageBytes));
  const min = Math.min(...points.map((p) => p.pageBytes));
  const here = points.find((p) => p.runId === runId);
  const w = Math.max(3, Math.min(14, Math.floor(760 / points.length) - 2));

  return (
    <div className="flex flex-col gap-[8px]">
      <div
        // px-[3px]: this run is ringed with an outline, which is painted
        // outside the bar's box and is clipped away when it is the last one.
        className="flex items-end gap-[2px] overflow-x-auto px-[3px]"
        role="img"
        aria-label={`Page size across ${points.length} run${points.length === 1 ? '' : 's'} of ${scraper}, from ${kb(min)} to ${kb(max)}.${
          here ? ` Run ${runId} was ${kb(here.pageBytes)}.` : ''
        }`}
        style={{ height: H }}
      >
        {points.map((p) => {
          const mine = p.runId === runId;
          return (
            <span
              key={p.runId}
              // A bar's height is a proportion of the largest page seen, so a
              // template that doubled in size is visible as one.
              className="shrink-0 rounded-[1px]"
              title={`run ${p.runId} — ${kb(p.pageBytes)} — ${LABEL[p.outcome]}`}
              style={{
                width: mine ? w + 2 : w,
                height: Math.max(2, Math.round((p.pageBytes / max) * H)),
                background: COLOUR[p.outcome],
                // This run, marked by a ring rather than by a colour of its own
                // -- the fill already carries the outcome and cannot be spent
                // twice.
                outline: mine ? '2px solid var(--text-primary)' : undefined,
                outlineOffset: mine ? 1 : undefined,
              }}
            />
          );
        })}
      </div>
      <p className="meta-12_5 text-[var(--text-muted)]">
        {points.length} run{points.length === 1 ? '' : 's'} · {kb(min)} to {kb(max)}
        {here && (
          <>
            {' '}
            · this run <span className="mono-value-12_5 text-[var(--text-primary)]">{kb(here.pageBytes)}</span>
          </>
        )}
        {/* The legend that was here -- "bar colour is the outcome, ringed bar
            is this run" -- explained a picture, and half of it was false
            whenever `here` is undefined: no bar is ringed on a run that is not
            in this series, and it said one was regardless. Every bar already
            carries `run N — size — outcome` as its title, and the row has an
            aria-label saying the same. */}
      </p>
    </div>
  );
}

const kb = (n: number): string => `${(n / 1024).toFixed(1)} kB`;
