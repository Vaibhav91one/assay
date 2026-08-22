'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useRef, useState, useTransition } from 'react';
import { CircleAlert, Eye, Hammer, ListChecks, ChevronRight, PencilLine } from 'lucide-react';
import { turn, type TraceEvent } from '@/lib/chat-stream';
import { DEFAULT_MODEL } from '@/lib/models';
import { Composer } from './composer';
import { Trace, ToolChips } from './trace';
import { SchemaTable, HeldCell, tierFor } from './schema-table';
import { ManualFields } from './manual-fields';
import { build, type ChatResult, type Proposal } from './watch-actions';

/**
 * "What should Assay watch?" -- the composer, the trace, and the schema the
 * turn comes back with.
 *
 * The shape of a turn: the operator types, the request opens an SSE stream, the
 * steps arrive as the agent's tools actually run, and the reply lands whole at
 * the end. See `src/agent/http.ts` for why the reply is not typed out character
 * by character -- in short, the model never writes it, so there is no generation
 * to animate.
 */
export function Watch({ waiting, auth }: { waiting: number; auth: string }) {
  const [result, setResult] = useState<ChatResult | null>(null);
  const [asked, setAsked] = useState<string | null>(null);
  const [events, setEvents] = useState<TraceEvent[]>([]);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [running, setRunning] = useState(false);
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [manual, setManual] = useState(false);
  const abort = useRef<AbortController | null>(null);

  const submit = useCallback(async (message: string) => {
    abort.current?.abort();
    const ctl = new AbortController();
    abort.current = ctl;

    setAsked(message);
    setResult(null);
    setEvents([]);
    setManual(false);
    // The clock starts when the request leaves, not when the first step lands:
    // the wait before a page answers is part of the wait.
    setStartedAt(Date.now());
    setRunning(true);

    try {
      const r = await turn(
        { message, history: [], model },
        (e) => setEvents((prev) => [...prev, e]),
        ctl.signal,
      );
      // A stream that ended without a result is a turn that did not land. It is
      // not an empty proposal and must never render as one.
      setResult(r);
    } catch {
      if (!ctl.signal.aborted) setResult(null);
    } finally {
      if (!ctl.signal.aborted) setRunning(false);
    }
  }, [model]);

  const restart = () => {
    setResult(null); setAsked(null); setEvents([]); setStartedAt(null); setManual(false);
  };

  if (result?.kind === 'propose') {
    return <ProposalView asked={asked} result={result} events={events} onRestart={restart} />;
  }

  return (
    <div className="flex w-full max-w-[700px] flex-col items-center gap-[28px]">
      <h1 className="display-28 flex flex-wrap items-center justify-center gap-[12px] text-center text-[var(--text-primary)]">
        What should
        <Image src="/brand/assay-mark.svg" alt="" width={26} height={26} className="inline-block rounded-[7px]" />
        Assay watch?
      </h1>

      {asked && (
        <p className="self-end rounded-[var(--radius-control)] bg-[var(--surface-subtle)] px-[16px] py-[10px]">
          <span className="body-13_5 text-[var(--text-primary)]">{asked}</span>
        </p>
      )}

      <Composer auth={auth} model={model} onModel={setModel} onSubmit={submit} busy={running} />

      <Trace events={events} running={running} startedAt={startedAt} />

      {/* need_url / need_fields / manual all land here: a sentence, not an
          error. The manual path is a real path -- the model only ever
          proposes, so its absence costs typing, not capability. */}
      {result && !running && (
        <div className="motion-fade-up flex w-full flex-col gap-[8px] rounded-[var(--radius-card)] border border-[var(--border-default)] bg-[var(--surface-subtle)] px-[20px] py-[16px]">
          <p className="body-13_5 text-[var(--text-primary)]">{result.reply}</p>
          {!result.model_configured && (
            <p className="meta-12_5 text-[var(--text-secondary)]">
              Nothing about how Assay decides what to publish changes either way.
            </p>
          )}
        </div>
      )}

      {!running && events.length > 0 && <ToolChips events={events} />}

      {/* The composer's own promise: "describe the fields yourself". Reachable
          whether or not a model answered, because the moment it is needed most
          is the moment the model could not help. */}
      {!running && (
        manual
          ? <ManualFields seedUrl={urlIn(asked)} onCancel={() => setManual(false)} />
          : (
            <button
              type="button"
              onClick={() => setManual(true)}
              className="press-row flex w-full items-center gap-[16px] rounded-[var(--radius-card)] border border-[var(--border-default)] bg-[var(--surface-card)] px-[20px] py-[14px] text-left transition-colors duration-[var(--duration-tint)] hover:bg-[var(--surface-subtle)]"
            >
              <PencilLine size={18} strokeWidth={1.5} className="shrink-0 text-[var(--text-primary)]" aria-hidden />
              <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
                <span className="body-14 text-[var(--text-primary)]">Describe the fields yourself</span>
                <span className="caption-12 text-[var(--text-secondary)]">
                  a page, and what to watch on it -- no model needed
                </span>
              </span>
              <ChevronRight size={16} strokeWidth={1.5} className="shrink-0 text-[var(--text-muted)]" aria-hidden />
            </button>
          )
      )}

      {!running && !manual && <StartFrom waiting={waiting} />}
    </div>
  );
}

/** The first URL the operator typed, so the manual form does not ask twice. */
function urlIn(text: string | null): string {
  const m = text ? /https?:\/\/[^\s<>"'`)\]}]+/i.exec(text) : null;
  return m ? m[0].replace(/[.,;:]+$/, '') : '';
}

function StartFrom({ waiting }: { waiting: number }) {
  return (
    <div className="flex w-full flex-col gap-[10px]">
      <p className="label-10 text-[var(--text-muted)]">OR START FROM</p>
      {waiting > 0 && (
        <Row
          href="/decisions"
          icon={<ListChecks size={18} strokeWidth={1.5} className="text-[var(--text-primary)]" aria-hidden />}
          badge={waiting}
          title={`Review ${waiting} decision${waiting === 1 ? '' : 's'} waiting on you`}
          sub="held rows, nothing published yet"
        />
      )}
      <Row
        href="/runs"
        icon={<Eye size={18} strokeWidth={1.5} className="text-[var(--text-primary)]" aria-hidden />}
        title="See what every scraper did last"
        sub="the runs, and what each one published"
      />
    </div>
  );
}

function Row({
  href, icon, title, sub, badge,
}: {
  href: string; icon: React.ReactNode; title: string; sub: string; badge?: number;
}) {
  return (
    <Link
      href={href}
      className="press-row flex items-center gap-[16px] rounded-[var(--radius-card)] border border-[var(--border-default)] bg-[var(--surface-card)] px-[20px] py-[14px] transition-colors duration-[var(--duration-tint)] hover:bg-[var(--surface-subtle)]"
    >
      <span className="relative flex size-[24px] shrink-0 items-center justify-center">
        {icon}
        {badge ? (
          <span className="absolute -left-[6px] -top-[6px] flex size-[16px] items-center justify-center rounded-full bg-[var(--accent-brand)]">
            <span className="caption-11 text-[var(--accent-on-primary)]">{badge}</span>
          </span>
        ) : null}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
        <span className="body-14 text-[var(--text-primary)]">{title}</span>
        <span className="caption-12 text-[var(--text-secondary)]">{sub}</span>
      </span>
      <ChevronRight size={16} strokeWidth={1.5} className="shrink-0 text-[var(--text-muted)]" aria-hidden />
    </Link>
  );
}

/**
 * The proposal, and the one click that makes it real.
 *
 * One bold sentence, one table of the operator's own data, one filled button --
 * docs/APP-DESIGN.md 5b's density law. Everything the machine knows is grey,
 * small, or behind the header disclosure.
 */
function ProposalView({
  asked, result, events, onRestart,
}: {
  asked: string | null;
  result: Extract<ChatResult, { kind: 'propose' }>;
  events: TraceEvent[];
  onRestart: () => void;
}) {
  const p = result.proposal;
  const [keep, setKeep] = useState<string[]>(p.fields.map((f) => f.name));
  const [built, setBuilt] = useState<Awaited<ReturnType<typeof build>> | null>(null);
  const [pending, start] = useTransition();

  const unsure = p.fields.filter((f) => f.confidence !== 'high');

  if (built?.ok) return <Built built={built} proposal={p} onRestart={onRestart} />;

  return (
    <div className="flex w-full max-w-[1000px] flex-col gap-[18px]">
      {asked && (
        <p className="self-end rounded-[var(--radius-control)] bg-[var(--surface-subtle)] px-[16px] py-[10px]">
          <span className="body-13_5 text-[var(--text-primary)]">{asked}</span>
        </p>
      )}

      <div className="flex flex-col gap-[4px]">
        <h2 className="heading-18 text-[var(--text-primary)]">{result.reply}</h2>
        <p className="body-13_5 text-[var(--text-secondary)]">
          These are the fields and what the page says in each one right now. Nothing is
          created until you start it.
        </p>
      </div>

      <SchemaTable proposal={p} keep={keep} onKeep={setKeep} />

      {unsure.length > 0 && (
        <p className="meta-12_5 text-[var(--text-secondary)]">
          {unsure.map((f) => f.name).join(', ')}{' '}
          {unsure.length === 1 ? 'has' : 'have'} nothing solid to anchor to, so{' '}
          {unsure.length === 1 ? 'it starts' : 'they start'} on the strict tier. If{' '}
          {unsure.length === 1 ? 'it moves' : 'they move'}, Assay will hold the cell rather
          than guess.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-[16px]">
        <button
          type="button"
          disabled={pending || keep.length === 0}
          onClick={() => start(async () => setBuilt(await build(p.create, keep)))}
          className="press-wide flex h-[40px] items-center gap-[10px] rounded-[var(--radius-control)] bg-[var(--accent-brand)] px-[18px] disabled:opacity-60"
        >
          <Hammer size={16} strokeWidth={1.5} className="text-[var(--accent-on-primary)]" aria-hidden />
          <span className="body-13_5 text-[var(--accent-on-primary)]">
            {pending ? 'Reading the page for a baseline' : 'Start watching these fields'}
          </span>
        </button>
        <span className="meta-12_5 text-[var(--text-secondary)]">
          {keep.length} of {p.fields.length} field{p.fields.length === 1 ? '' : 's'} · every {p.cadence}
        </span>
        <button type="button" onClick={onRestart} className="meta-13 ml-auto text-[var(--text-secondary)]">
          Start over
        </button>
      </div>

      {built && !built.ok && (
        <p role="alert" className="flex items-center gap-[8px]">
          <CircleAlert size={14} strokeWidth={1.5} className="text-[var(--semantic-danger)]" aria-hidden />
          <span className="meta-12_5 text-[var(--semantic-danger)]">{built.detail}</span>
        </p>
      )}

      <ToolChips events={events} />
    </div>
  );
}

/**
 * After the baseline run: the same columns, now carrying what actually happened.
 *
 * This is where a held cell is real rather than hypothetical. `createTarget`
 * establishes the baseline through the ordinary run path, so a field the gate
 * declined to publish comes back `quarantined` with the code that held it, and
 * the cell renders as a hole with that reason. Nothing here simulates that
 * state -- if the gate published everything, no hole is drawn.
 */
function Built({
  built, proposal, onRestart,
}: {
  built: Extract<Awaited<ReturnType<typeof build>>, { ok: true }>;
  proposal: Proposal;
  onRestart: () => void;
}) {
  const held = built.fields.filter((f) => f.status === 'quarantined');

  return (
    <div className="motion-fade-up flex w-full max-w-[1000px] flex-col gap-[16px]">
      <h2 className="display-28 text-[var(--text-primary)]">Watching {built.id}.</h2>
      <p className="body-13_5 text-[var(--text-secondary)]">
        {held.length === 0
          ? 'The first run is done and the baseline is what the page said just now. Every run from here is compared against it.'
          : `The first run is done. ${held.length} field${held.length === 1 ? '' : 's'} came back held -- Assay published nothing there rather than guess, and it is waiting on you.`}
      </p>

      <div className="w-full overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse">
          <thead>
            <tr className="border-b border-[var(--border-hairline)]">
              <th scope="col" className="label-10 w-[110px] pb-[10px] pr-[16px] text-left font-normal text-[var(--text-muted)]">
                BASELINE
              </th>
              {built.fields.map((f) => (
                <th key={f.field} scope="col" className="pb-[10px] pr-[16px] text-left align-bottom">
                  <span className="mono-value-13 text-[var(--text-primary)]">{f.field}</span>
                  <span className="caption-11 block text-[var(--text-muted)]">
                    {tierFor(proposal.fields.find((x) => x.name === f.field)?.confidence ?? 'high')}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row" className="caption-11 py-[14px] pr-[16px] text-left align-top font-normal text-[var(--text-muted)]">
                run {built.fields[0]?.baseline_run ?? '—'}
              </th>
              {built.fields.map((f) => (
                <td key={f.field} className="py-[14px] pr-[16px] align-top">
                  {f.status === 'quarantined' ? (
                    <HeldCell reason={f.reason} targetId={f.id} />
                  ) : f.baseline === null ? (
                    <span className="caption-12 text-[var(--text-muted)]">the element is there and empty</span>
                  ) : (
                    <span className="body-13_5 line-clamp-3 break-words text-[var(--text-primary)]">{f.baseline}</span>
                  )}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <div className="flex gap-[16px] pt-[4px]">
        <Link href="/runs" className="meta-13 text-[var(--semantic-link)]">See the run ›</Link>
        {held.length > 0 && (
          <Link href="/decisions" className="meta-13 text-[var(--semantic-link)]">
            Decide the held {held.length === 1 ? 'field' : 'fields'} ›
          </Link>
        )}
        <button type="button" onClick={onRestart} className="meta-13 ml-auto text-[var(--text-secondary)]">
          Watch something else
        </button>
      </div>
    </div>
  );
}
