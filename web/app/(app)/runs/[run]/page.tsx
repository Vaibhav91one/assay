import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { TopBar } from '@/components/top-bar';
import { actionVariants } from '@/components/button';
import { StatusLine, type Tone } from '@/components/status-line';
import { FlowCanvas } from '@/components/flow-canvas';
import { OutcomeDonut, PageSizeBars } from '@/components/run-charts';
import { ProofSheet } from '@/components/proof-sheet';
import { runDetail, type CellSummary, type RunDetail } from '@/lib/run-detail';
import type { Flow } from '@/lib/run-flow';
import { heldBecause } from 'assay/engine/reports/vocabulary';
import { extractorDiff } from 'assay/engine/reports/extractor-diff';
import { schemaDiff } from 'assay/engine/reports/schema-diff';
import { ExtractorDiff } from '@/components/diff/extractor-diff';
import { SchemaDiff } from '@/components/diff/schema-diff';
import { t } from '@/lib/copy';
import { stamp } from '@/lib/when';

export const metadata: Metadata = { title: 'Run · Assay' };
export const dynamic = 'force-dynamic';

/**
 * One run, as what it did.
 *
 * `/explain/[proof]` is the other half of this and is deliberately not
 * duplicated here. That screen is entered from a warehouse row months later and
 * answers "where did this VALUE come from" -- provenance, how long it has
 * stood, the record verbatim. This one is entered from the operator's runs list
 * and answers "what did this EXECUTION do" -- which fork was taken at each
 * stage and on what evidence. Every cell below links across to its proof rather
 * than restating it.
 */
export default async function RunPage({ params }: { params: Promise<{ run: string }> }) {
  const { run } = await params;
  const id = Number(run);
  const d = Number.isInteger(id) ? await runDetail(id) : null;
  if (!d) notFound();

  // The run before this one for the same target, off the history this page had
  // already loaded rather than out of a second query. `history` is every run
  // for the target, oldest first, so the entry in front of this one is the run
  // the record's shape is compared against.
  const at = d.history.findIndex((h) => h.runId === d.runId);
  const previous = at > 0 ? d.history[at - 1]!.runId : null;

  // Both are null on a run with nothing to show, and both sections are then
  // absent. Neither renders an empty state: an empty state on a clean run says
  // "no changes here" to a reader who has already read `clean` in the top bar.
  // Scrubbed once, here, and handed to both surfaces that draw it -- the canvas
  // and the Sources table are two renderings of ONE object, and scrubbing it
  // twice is how they end up disagreeing.
  const flow = withoutNumbers(d.flow);

  const [selector, shape] = await Promise.all([
    d.focus ? extractorDiff(d.runId, d.focus) : null,
    previous === null ? [] : schemaDiff(previous, d.runId),
  ]);
  const shapeMoved = shape.some((c) => c.kind !== 'same');

  return (
    <>
      <TopBar
        title={`Run ${d.runId}`}
        status={headline(d)}
        // The scraper this run was of. "Run it again" is the commonest thing to
        // want from a page showing what one run did, and it was not reachable
        // from here at all.
        scraper={d.scraper}
        action={
          <Link href="/runs" className={actionVariants({ variant: 'outline' })}>
            <ArrowLeft size={16} strokeWidth={1.5} aria-hidden />
            All runs
          </Link>
        }
      />

      <div className="flex w-full max-w-[1100px] flex-col gap-[32px] pb-[64px] pl-[56px] pr-[32px] pt-[18px]">
        {/* The diagram opens the page with no heading and no caption. It is the
            first thing under a top bar that already says which run this is, and
            a card that can be dragged should look draggable rather than carry a
            sentence saying so. */}
        <FlowCanvas flow={flow} />

        {d.cells.length > 0 && (
          <section className="flex flex-col gap-[12px]">
            <Heading>Fields</Heading>
            <Fields cells={d.cells} />
          </section>
        )}

        {/* The shape of the published record, against the run before it. Absent
            when nothing about it moved, and absent on the first run for a
            target, which has nothing to be compared with. */}
        {previous !== null && shapeMoved && (
          <section className="flex flex-col gap-[12px]">
            <Heading note={`run ${previous} → run ${d.runId}`}>{t('run.section.record')}</Heading>
            <SchemaDiff
              changes={shape}
              scraper={d.scraper}
              fromRun={previous}
              toRun={d.runId}
            />
          </section>
        )}

        {/* What moved in HOW the field is read -- or, on a held run, what would
            have moved. This sits above the gate rather than below it for the
            same reason the canvas sits above the Sources table: the compact
            statement first, the full evidence under it. */}
        {selector && (
          <section className="flex flex-col gap-[12px]">
            <Heading note={selector.field}>{t('run.section.selector')}</Heading>
            <ExtractorDiff diff={selector} />
          </section>
        )}

        {d.gate && (
          <section className="flex flex-col gap-[12px]">
            <Heading note={d.gate.field}>The gate</Heading>
            <Candidates gate={d.gate} />
          </section>
        )}

        <section className="flex flex-col gap-[24px]">
          <Heading note={`${d.scraper} · ${d.history.length} run${d.history.length === 1 ? '' : 's'}`}>History</Heading>
          <OutcomeDonut history={d.history} scraper={d.scraper} />
          <PageSizeBars history={d.history} runId={d.runId} scraper={d.scraper} />
        </section>

        <section className="flex flex-col gap-[12px]">
          <Heading>Sources</Heading>
          <Evidence flow={flow} />
        </section>
      </div>
    </>
  );
}

/* ------------------------------------------------------- the number scrub */

/**
 * A score is a four-decimal number and a threshold is a Greek letter. Both are
 * data, and neither may be rendered.
 *
 * A CONTENT RULE AND NOT A LIST OF LABELS, on purpose. Matching
 * `label === 'margin'` would silently stop working the day someone renames a
 * fact in `run-flow.ts`, and it would stop working by letting a float through
 * -- failing open, on the one policy that must fail closed. Matching the shape
 * of the value cannot miss a rename. `\d\.\d{4}` is exactly what
 * `Number(x).toFixed(4)` produces, which is how every score in this repo is
 * written; page size is `toFixed(1)` and survives, which is the point of
 * pinning the precision rather than banning decimals.
 */
const NUMERIC = /\d\.\d{4}|[τδ]/;

/**
 * The same flow, with the gate's arithmetic taken out of it.
 *
 * THIS IS A STOPGAP AND IS IN THE WRONG FILE. The facts, the node summaries and
 * one edge label are built by `web/lib/run-flow.ts`, which is where the Assay
 * score belongs -- the gate node should carry the band instead of a score and a
 * margin, and then nothing would need scrubbing. `web/lib` is frozen for this
 * feature, so the numbers are removed at the point of render instead and the
 * proper change is named in the handover.
 *
 * Summaries lose whole SENTENCES rather than tokens: "Refused. Score 0.7412,
 * margin 0.0409." with the numbers deleted reads "Refused. Score , margin ."
 * A sentence that existed to carry a number goes with it. Facts go entirely --
 * a fact is a label, a value and the column it came from, and a fact with its
 * value removed is not a smaller fact, it is a broken one.
 */
function withoutNumbers(flow: Flow): Flow {
  return {
    nodes: flow.nodes.map((node) => ({
      ...node,
      summary: node.summary
        .split(/(?<=\.)\s+/)
        .filter((s) => !NUMERIC.test(s))
        .join(' '),
      facts: node.facts.filter((f) => !NUMERIC.test(f.value)),
    })),
    // `best 0.7412` -> `best`. The edge says which way the pipeline went, and
    // it still says it without the number stapled to the end.
    edges: flow.edges.map((e) => ({ ...e, label: e.label.replace(/\s*\d\.\d{4}/g, '') })),
  };
}

/* ----------------------------------------------------------------- pieces */

/**
 * A section heading: a noun, at `title-20`, with the qualifier beside it.
 *
 * Not the `label-10` all-caps eyebrow the dense tabular screens use. This page
 * is read top to bottom rather than scanned, and four eyebrows down it read as
 * captions on the tables rather than as the structure of the page. `title-20`
 * is what `(app)/page.tsx` already sets a prominent line at, so this is a step
 * up the existing scale rather than a size invented for one screen.
 *
 * `note` is the qualifier the eyebrow used to swallow -- `recall_title`, the
 * scraper and its run count. It is information, so it stays; it is not the
 * name of the section, so it sits beside the heading and not inside it.
 */
function Heading({ children, note }: { children: React.ReactNode; note?: string }) {
  return (
    <h2 className="flex items-baseline gap-[10px]">
      <span className="title-20 text-[var(--text-primary)]">{children}</span>
      {note && <span className="mono-value-12_5 text-[var(--text-muted)]">{note}</span>}
    </h2>
  );
}

const TONE: Record<string, Tone> = {
  live: 'success',
  healed: 'success',
  quarantined: 'warning',
  stale: 'info',
  degraded: 'danger',
};

function Fields({ cells }: { cells: CellSummary[] }) {
  return (
    <table className="w-full border-collapse">
      <thead>
        <tr className="border-b border-[var(--border-hairline)] text-left">
          {['field', 'status', 'value', 'reason', ''].map((h, i) => (
            <th key={h + i} className="caption-12 pb-[8px] font-normal text-[var(--text-muted)]">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {cells.map((c) => {
          const why = heldBecause(c.reason);
          return (
            <tr key={c.field} className="border-b border-[var(--border-hairline)] align-top">
              <td className="mono-value-13 w-[160px] py-[12px] text-[var(--text-primary)]">
                {c.field}
              </td>
              <td className="w-[140px] py-[12px]">
                <StatusLine tone={TONE[c.status] ?? 'info'} muted={c.status === 'live'}>
                  {c.status === 'quarantined' ? 'held' : c.status}
                </StatusLine>
              </td>
              <td className="body-13_5 py-[12px] text-[var(--text-primary)]">
                {/* A held cell is null AND labelled, never an empty string and
                    never a dash that could be mistaken for one.

                    `held`, matching the status column two cells to the left,
                    which says `held` for the same cell. This said `withheld`,
                    so one row of one table gave the same cell two names.
                    `withheld` is the /compare word for a diff that will not
                    render; a cell is held. */}
                {c.value === null ? (
                  <span
                    className="rounded-[6px] px-[6px] py-[1px]"
                    style={{
                      color: 'var(--semantic-warning)',
                      background: 'var(--semantic-warning-subtle)',
                    }}
                  >
                    held
                  </span>
                ) : (
                  c.value
                )}
              </td>
              <td className="meta-12_5 py-[12px] text-[var(--text-secondary)]">
                {/* A code with no wording is printed as a code, never given an
                    invented one. src/reports/vocabulary.ts. */}
                {why ? why.plain ?? <code className="mono-value-12_5">{why.code}</code> : '—'}
              </td>
              <td className="py-[12px] text-right">
                <span className="flex justify-end gap-[16px]">
                  <ProofSheet
                    proof={c.proofId}
                    className="focus-ring meta-13 rounded-[var(--radius-control)] text-[var(--semantic-link)]"
                  >
                    proof ›
                  </ProofSheet>
                  {c.status === 'quarantined' && (
                    <Link href="/decisions" className="meta-13 text-[var(--semantic-link)]">
                      decide ›
                    </Link>
                  )}
                </span>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/**
 * What was on the page and what each of them said.
 *
 * THE SCORE COLUMN, THE BARS AND THE THRESHOLD SENTENCE CAME OFF HERE, and not
 * as a tidy-up. The Assay score replaced them: the gate's outcome is now shown
 * as one of five words, once, in the section above this one, with a link to the
 * page that defines it. Leaving four-decimal scores and a τ/δ sentence directly
 * under that band would have handed the reader back the float the band exists
 * to withhold -- and `reproduces`, whose whole job was deciding whether the
 * thresholds could honestly be drawn, has nothing left to guard once they are
 * not drawn at all.
 *
 * What remains is the part a person can act on: which elements were considered
 * and what text each one held. That is the evidence; the scores were the
 * arithmetic over it, and the arithmetic is on the proof record.
 */
function Candidates({ gate }: { gate: NonNullable<RunDetail['gate']> }) {
  return (
    <table className="w-full border-collapse">
      <thead>
        <tr className="border-b border-[var(--border-hairline)] text-left">
          {['#', 'element', 'text on the page'].map((h) => (
            <th key={h} className="caption-12 pb-[8px] font-normal text-[var(--text-muted)]">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {gate.candidates.map((c, i) => (
          <tr key={i} className="border-b border-[var(--border-hairline)]">
            <td className="mono-label-12 w-[32px] py-[10px] text-[var(--text-muted)]">{i + 1}</td>
            <td className="mono-value-13 w-[240px] py-[10px] text-[var(--text-primary)]">
              {c.selector}
            </td>
            <td className="body-13_5 py-[10px] text-[var(--text-secondary)]">{c.value || '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Every fact on the canvas, beside the column it was read from. The receipt. */
function Evidence({ flow }: { flow: Flow }) {
  return (
    <table className="w-full border-collapse">
      <thead>
        <tr className="border-b border-[var(--border-hairline)] text-left">
          {['stage', 'fact', 'value', 'read from'].map((h) => (
            <th key={h} className="caption-12 pb-[8px] font-normal text-[var(--text-muted)]">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {flow.nodes.flatMap((n) =>
          n.facts.map((f) => (
            <tr key={`${n.id}-${f.label}`} className="border-b border-[var(--border-hairline)]">
              <td className="meta-12_5 w-[190px] py-[8px] text-[var(--text-secondary)]">
                {n.title}
              </td>
              {/* 110, not 150. `read from` is the only column here that has to
                  hold a sentence, and at the larger mono label its longest one
                  -- "field_runs joined runs, earlier run_id for this target and
                  field" -- came up five pixels short and wrapped, which cost
                  the row its 34px and broke the table's rhythm. The forty
                  pixels come from `fact`, whose widest label is 72px wide. */}
              <td className="meta-12_5 w-[110px] py-[8px] text-[var(--text-muted)]">{f.label}</td>
              <td className="mono-value-12_5 max-w-[260px] truncate py-[8px] text-[var(--text-primary)]">
                {f.value}
              </td>
              <td className="mono-label-12 py-[8px] text-[var(--text-secondary)]">{f.source}</td>
            </tr>
          )),
        )}
      </tbody>
    </table>
  );
}

/* ------------------------------------------------------------------ prose */

function headline(d: RunDetail): string {
  const size = d.pageBytes == null ? null : `${(d.pageBytes / 1024).toFixed(1)} kB`;
  const what =
    d.outcome === 'skipped'
      ? 'skipped — the page had not changed'
      : d.outcome === 'held'
        ? 'held a cell for review'
        : d.outcome === 'healed'
          ? 'moved, found it again'
          : 'clean';
  return [d.scraper, stamp(d.startedAt), size, what].filter(Boolean).join(' · ');
}
