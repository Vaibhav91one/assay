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
import { GateNumbers } from '@/components/disclosure';
import { BreakLive, type Variant } from '@/components/break-live';
import { breakVariants } from './break-actions';
import { runDetail, type CellSummary, type RunDetail } from '@/lib/run-detail';
import { heldBecause } from 'assay/engine/reports/vocabulary';
import { extractorDiff } from 'assay/engine/reports/extractor-diff';
import { schemaDiff } from 'assay/engine/reports/schema-diff';
import { ExtractorDiff } from '@/components/diff/extractor-diff';
import { SchemaDiff } from '@/components/diff/schema-diff';
import { t } from '@/lib/copy';
import { stamp } from '@/lib/when';

export const metadata: Metadata = { title: t('title.run') };
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
  const [selector, shape] = await Promise.all([
    d.focus ? extractorDiff(d.runId, d.focus) : null,
    previous === null ? [] : schemaDiff(previous, d.runId),
  ]);
  const shapeMoved = shape.some((c) => c.kind !== 'same');

  // Only on a held cell, and only from what the gate recorded. `gate` is null
  // on every run that published, so there is nothing to guard beyond that.
  // The demo control, and it is absent on every install that is not pointed at
  // the testbed. Both halves are checked here rather than inside the component:
  // a client component that decides whether it should exist has already shipped
  // in the bundle of every reader it decided against.
  const testbedHost = hostOf(process.env.ASSAY_TESTBED ?? null);
  const variants: Variant[] =
    testbedHost && hostOf(d.url) === testbedHost ? await breakVariants() : [];

  const counterfactual =
    d.cells.some((c) => c.status === 'quarantined') ? d.gate?.candidates[0]?.value || null : null;

  const focusReason = selector
    ? (d.cells.find((c) => c.field === selector.field)?.reason ?? null)
    : null;
  // All three keys, not just the selector: `attr` and `transform` are engine
  // constants today (src/reports/extractor-diff.ts, ENGINE_READ) and comparing
  // them costs nothing, but the day one of them becomes per-field data a diff
  // that moved only that key must not be swallowed by this branch.
  const sameExtractor =
    !!selector &&
    selector.before.selector === selector.after.selector &&
    selector.before.attr === selector.after.attr &&
    selector.before.transform === selector.after.transform;

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

      <div className="flex w-full max-w-[1100px] flex-col gap-[32px] pb-[64px] px-[20px] md:pl-[56px] md:pr-[32px] pt-[18px]">
        {/* The diagram opens the page with no heading and no caption. It is the
            first thing under a top bar that already says which run this is, and
            a card that can be dragged should look draggable rather than carry a
            sentence saying so. */}
        <FlowCanvas flow={d.flow} />

        {d.cells.length > 0 && (
          <section className="flex flex-col gap-[12px]">
            <Heading>{t('run.section.fields')}</Heading>
            <Fields cells={d.cells} />
            {/* THE COUNTERFACTUAL, under the row it is about.
                `gate.candidates[0]` is the element that WOULD have been
                published, recorded at the moment of the refusal -- so this is
                not a hypothetical the screen constructed, it is the fork that
                was not taken, read off `field_runs.ranked`. Present exactly
                when a cell was held, because that is the only time the list is
                written. One sentence, no box: it is a fact about a decision,
                not a boast about one. */}
            {counterfactual && (
              <p className="meta-13 max-w-[820px] text-[var(--text-secondary)]">
                {t('counterfactual.before')}{' '}
                <span className="mono-value-12_5 text-[var(--text-primary)]">
                  “{counterfactual}”
                </span>
                {t('counterfactual.after')}
              </p>
            )}
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
            {/* The reason and the rival VALUES both come from this page, not
                from `extractorDiff`. That module composes the change to how a
                field is READ -- `heal_history` against `field_state` -- and has
                never carried either: its `rivals` are `{ selector, score }`,
                and a score is the one thing the band replaced. `runDetail`
                already loaded the cell and its `field_runs.ranked`, so both are
                on hand here and neither needs a second query.

                `value` is mapped across and `score` is dropped at this
                boundary, so `ExtractorDiff` cannot print one. */}
            {/* IDENTICAL PANES ARE NOT A DIFF. `spec()` marks the selector line
                `[!code --]` on the left and `[!code ++]` on the right whatever
                it says, so a run where the selector did not move rendered the
                same three lines twice, one struck red and one added green, and
                a reader spent several seconds looking for the character that
                changed. There is no such character.

                It is a real state on both paths. A heal can move where a
                selector POINTS without rewriting it -- `heal_history` with
                `from_selector === to_selector`, which the proof screen already
                says in words -- and a held run whose top candidate IS the
                baseline still in force produces the same pair.

                No band is lost by not drawing the diff here. A HELD run cannot
                reach this branch in practice: `before` is the baseline selector
                still in force and `after` is the best candidate on the page,
                and the gate only ran because the baseline stopped resolving --
                so the two are a different element by construction. What does
                reach it is a heal, and `ExtractorDiff` draws no band on a heal
                (`src/runner.ts` writes `{ status: 'healed' }` and no reason, so
                there is none to draw). If a held run ever did land here, the
                right home for the fix is an unchanged-branch inside
                `components/diff/extractor-diff.tsx`, which this call site
                cannot reach. */}
            {sameExtractor ? (
              <div className="flex w-full flex-col gap-[12px]">
                <p className="meta-13 text-[var(--text-secondary)]">
                  {t('run.selector.same.before')}{' '}
                  <span className="mono-value-12_5 text-[var(--text-primary)]">
                    {selector.after.selector ?? t('run.selector.none')}
                  </span>{' '}
                  {t('run.selector.same.after')}
                </p>
              </div>
            ) : (
              <ExtractorDiff
                diff={selector}
                reason={focusReason}
                rivals={(d.gate?.candidates ?? []).map((c) => ({
                  selector: c.selector,
                  value: c.value,
                }))}
              />
            )}
          </section>
        )}

        {/* The band is NOT repeated here. It is drawn once, on the selector
            diff above, which is where the refusal itself is drawn -- and it has
            to be there rather than here, because a run held on `no_candidates`
            has an empty `ranked` and so no gate section at all, while the diff
            renders on every held run. This section is what it says it is: the
            elements the gate weighed. */}
        {d.gate && (
          <section className="flex flex-col gap-[12px]">
            <Heading note={d.gate.field}>The gate</Heading>
            <Candidates gate={d.gate} />
          </section>
        )}

        {variants.length > 0 && (
          <section className="flex flex-col gap-[12px]">
            <Heading note={d.scraper}>Break it</Heading>
            <BreakLive slug={d.scraper} variants={variants} />
          </section>
        )}

        <section className="flex flex-col gap-[24px]">
          <Heading note={`${d.scraper} · ${d.history.length} run${d.history.length === 1 ? '' : 's'}`}>History</Heading>
          <OutcomeDonut history={d.history} scraper={d.scraper} />
          <PageSizeBars history={d.history} runId={d.runId} scraper={d.scraper} />
        </section>

        <section className="flex flex-col gap-[12px]">
          <Heading>Sources</Heading>
          <Evidence d={d} />
        </section>
      </div>
    </>
  );
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
    // A SCROLLER BELOW 768. Each column here qualifies the one beside it -- a
    // status with no field, a reason with no status -- so a stacked row stops being
    // a row. The wrapper scrolls; the page body never does.
    <div className="w-full overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse">
        <thead>
          <tr className="border-b border-[var(--border-hairline)] text-left">
            {[
              t('run.table.head.field'),
              t('run.table.head.status'),
              t('run.table.head.value'),
              t('run.table.head.reason'),
              '',
            ].map((h, i) => (
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
                    {c.status === 'quarantined' ? t('run.cell.held') : c.status}
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
                      {t('run.cell.held')}
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
                      {t('run.link.proof')}
                    </ProofSheet>
                    {c.status === 'quarantined' && (
                      <Link href="/fields?show=held" className="meta-13 text-[var(--semantic-link)]">
                        {t('run.link.decide')}
                      </Link>
                    )}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * What the gate decided, and what it was choosing between.
 *
 * THE SCORE COLUMN AND ITS BAR ARE STILL GONE. This screen printed `0.7354`
 * against `τ 0.6` and a proportional bar beside each candidate, which is
 * precisely the confidence float docs/FEATURES.md §4 refuses, arrived at one
 * screen at a time: a reader given four scores out of one will pick their own
 * cut-off, and picking it is the decision the gate has already made on better
 * evidence. What replaces it is the band -- one word off `field_runs.reason` --
 * and the list of what each candidate SAYS, which is the half of the evidence a
 * person can judge.
 *
 * WHAT CHANGED, 2026-08-23: the numbers are now REACHABLE, behind one collapsed
 * `show the numbers ›`. This is an extension of that decision and not a revert
 * of it, and the distinction is the whole of it: a column is something a reader
 * arrives at, a disclosure is something a reader ASKS FOR. The band remains the
 * interface -- it is what is drawn, what is scanned, what a screenshot carries.
 * But the proof story is "here is exactly what I weighed", and a proof that
 * cannot produce the two numbers the comparison was made between is asking to
 * be taken on trust. Relocating the arithmetic to /docs/assay-score put it in a
 * document; this puts it against the cell it decided, still one click away from
 * nobody who did not want it. See the amendment to docs/FEATURES.md §4.
 *
 * The rank column stays and is still not a score. An ordinal says the engine
 * put these in an order and does not invite anyone to threshold it.
 *
 * `gate.reproduces` is consulted again, which is what it was kept for. It is
 * the check that stops the screen drawing a threshold that does not explain the
 * recorded reason -- and now that a threshold can be on the screen, it has
 * something to withhold again. `GateNumbers` does the withholding.
 */
function Candidates({ gate }: { gate: NonNullable<RunDetail['gate']> }) {
  return (
    <div className="flex flex-col gap-[10px]">
      <p className="meta-12_5 text-[var(--text-secondary)]">{t('run.gate.caption')}</p>
      {/* A SCROLLER BELOW 768. Each column here qualifies the one beside it --
          a status with no field, a reason with no status -- so a stacked row
          stops being a row. The wrapper scrolls; the page body never does. */}
      <div className="w-full overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse">
          <thead>
            <tr className="border-b border-[var(--border-hairline)] text-left">
              {[
                t('run.gate.head.rank'),
                t('run.gate.head.element'),
                t('run.gate.head.text'),
              ].map((h) => (
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
                <td className="mono-value-13 w-[180px] py-[10px] text-[var(--text-primary)]">
                  {c.selector}
                </td>
                <td className="body-13_5 py-[10px] text-[var(--text-secondary)]">
                  {c.value || t('common.dash')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* The hybrid. Collapsed, asked for, never scanned. See the note above. */}
      <GateNumbers gate={gate} />
    </div>
  );
}

/** Every fact on the canvas, beside the column it was read from. The receipt. */
function Evidence({ d }: { d: RunDetail }) {
  return (
    // A SCROLLER BELOW 768. Each column here qualifies the one beside it -- a
    // status with no field, a reason with no status -- so a stacked row stops being
    // a row. The wrapper scrolls; the page body never does.
    <div className="w-full overflow-x-auto">
      <table className="w-full min-w-[560px] border-collapse">
        <thead>
          <tr className="border-b border-[var(--border-hairline)] text-left">
            {[
              t('run.evidence.head.stage'),
              t('run.evidence.head.fact'),
              t('run.evidence.head.value'),
              t('run.evidence.head.source'),
            ].map((h) => (
              <th key={h} className="caption-12 pb-[8px] font-normal text-[var(--text-muted)]">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {d.flow.nodes.flatMap((n) =>
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
    </div>
  );
}

/** A url's host, or null when there is not one. Never throws on junk. */
function hostOf(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ prose */

function headline(d: RunDetail): string {
  const size = d.pageBytes == null ? null : `${(d.pageBytes / 1024).toFixed(1)} kB`;
  // The same four words /runs and /schedule use for the same four outcomes.
  // This branch said "held a cell for review" while the table said "held <x>
  // for review" and the calendar said "held a field for review" -- three names
  // for the one state, which /docs/glossary settles as "held for review".
  const what =
    d.outcome === 'skipped'
      ? t('runs.outcome.skipped')
      : d.outcome === 'held'
        ? t('runs.outcome.held')
        : d.outcome === 'healed'
          ? t('runs.outcome.healed')
          : t('runs.outcome.clean');
  return [d.scraper, stamp(d.startedAt), size, what].filter(Boolean).join(' · ');
}
