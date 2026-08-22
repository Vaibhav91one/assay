import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { TopBar } from '@/components/top-bar';
import { actionVariants } from '@/components/button';
import { StatusLine, type Tone } from '@/components/status-line';
import { Bar } from '@/components/bar';
import { FlowCanvas } from '@/components/flow-canvas';
import { OutcomeDonut, PageSizeBars } from '@/components/run-charts';
import { ProofSheet } from '@/components/proof-sheet';
import { runDetail, type CellSummary, type RunDetail } from '@/lib/run-detail';
import { heldBecause } from 'assay/engine/reports/vocabulary';
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
        <FlowCanvas flow={d.flow} />

        {d.cells.length > 0 && (
          <section className="flex flex-col gap-[12px]">
            <Heading>Fields</Heading>
            <Fields cells={d.cells} />
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
 * The ranked list, against the two thresholds it was judged by.
 *
 * `Bar` rather than a third chart: this is a proportion with a real denominator
 * (a score out of 1), which is the one thing that component is for.
 */
function Candidates({ gate }: { gate: NonNullable<RunDetail['gate']> }) {
  return (
    <div className="flex flex-col gap-[10px]">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-[var(--border-hairline)] text-left">
            {['#', 'element', 'text on the page', 'score', ''].map((h, i) => (
              <th key={h + i} className="caption-12 pb-[8px] font-normal text-[var(--text-muted)]">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {gate.candidates.map((c, i) => (
            <tr key={i} className="border-b border-[var(--border-hairline)]">
              <td className="mono-label-12 w-[32px] py-[10px] text-[var(--text-muted)]">{i + 1}</td>
              <td className="mono-value-13 w-[140px] py-[10px] text-[var(--text-primary)]">
                {c.selector}
              </td>
              <td className="body-13_5 py-[10px] text-[var(--text-secondary)]">{c.value || '—'}</td>
              <td className="mono-value-13 w-[80px] py-[10px] text-[var(--text-primary)]">
                {c.score.toFixed(4)}
              </td>
              <td className="w-[110px] py-[10px]">
                <Bar
                  value={Math.round(c.score * 1000)}
                  of={1000}
                  tone={i === 0 ? 'var(--semantic-warning)' : 'var(--border-default)'}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="meta-12_5 text-[var(--text-secondary)]">
        {gate.reproduces ? (
          <>
            The gate publishes only when the score clears{' '}
            <span className="mono-value-12_5 text-[var(--text-primary)]">τ {gate.tau}</span> AND the
            margin over the runner-up clears{' '}
            <span className="mono-value-12_5 text-[var(--text-primary)]">δ {gate.delta}</span>. Here
            the score was{' '}
            <span className="mono-value-12_5 text-[var(--text-primary)]">
              {gate.score.toFixed(4)}
            </span>{' '}
            and the margin{' '}
            <span className="mono-value-12_5 text-[var(--text-primary)]">
              {gate.margin.toFixed(4)}
            </span>
            .
          </>
        ) : (
          // Refusing to draw a threshold that does not explain the recorded
          // outcome is the same refusal the gate itself makes.
          <>
            The scores are as the gate recorded them. The thresholds are not shown: the target’s
            contract no longer reproduces this run’s recorded reason, so the numbers on it today are
            not the ones this run was judged under.
          </>
        )}
      </p>
    </div>
  );
}

/** Every fact on the canvas, beside the column it was read from. The receipt. */
function Evidence({ d }: { d: RunDetail }) {
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
        {d.flow.nodes.flatMap((n) =>
          n.facts.map((f) => (
            <tr key={`${n.id}-${f.label}`} className="border-b border-[var(--border-hairline)]">
              <td className="meta-12_5 w-[190px] py-[8px] text-[var(--text-secondary)]">
                {n.title}
              </td>
              <td className="meta-12_5 w-[150px] py-[8px] text-[var(--text-muted)]">{f.label}</td>
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
