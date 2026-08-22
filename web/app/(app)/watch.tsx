'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRef, useState, useTransition } from 'react';
import { ArrowRight, Check, CircleAlert, Eye, Hammer, ListChecks, ChevronRight } from 'lucide-react';
import { ask, build, type ChatResult, type Proposal } from './watch-actions';

/**
 * "What should Assay watch?" -- the composer, and the proposal it comes back
 * with.
 *
 * Two controls the frame draws are deliberately absent. `docs/STATES.md`
 * resolved both: the paperclip (#11, "deleted with the chat bars") and the
 * one-shot mode the Watch switch pairs with (#4, "deleted everywhere"). A
 * switch with nothing to switch to, and a file picker nothing reads, are two
 * dead controls on the first screen anyone sees.
 */
export function Watch({ waiting }: { waiting: number }) {
  const [result, setResult] = useState<ChatResult | null>(null);
  const [asked, setAsked] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const box = useRef<HTMLTextAreaElement>(null);

  function submit(text: string) {
    const message = text.trim();
    if (!message) return;
    setAsked(message);
    start(async () => setResult(await ask(message, [])));
  }

  if (result?.kind === 'propose') {
    return <ProposalView asked={asked} result={result} onRestart={() => { setResult(null); setAsked(null); }} />;
  }

  return (
    <div className="flex w-full max-w-[700px] flex-col items-center gap-[28px]">
      <h1 className="display-28 flex flex-wrap items-center justify-center gap-[12px] text-center text-[var(--text-primary)]">
        What should
        <Image src="/brand/assay-mark.svg" alt="" width={26} height={26} className="inline-block rounded-[7px]" />
        Assay watch?
      </h1>

      <form
        className="flex w-full flex-col rounded-[var(--radius-card)] border border-[var(--border-default)] bg-[var(--surface-card)] px-[20px] pb-[16px] pt-[18px] focus-within:border-[var(--semantic-link)]"
        onSubmit={(e) => { e.preventDefault(); submit(box.current?.value ?? ''); }}
      >
        <textarea
          ref={box}
          name="message"
          rows={2}
          disabled={pending}
          placeholder="Paste a URL, or describe what you want to keep an eye on"
          className="nav-15 w-full resize-none bg-transparent outline-none placeholder:text-[var(--text-muted)] disabled:opacity-60"
          onKeyDown={(e) => {
            // Enter sends; Shift+Enter is a newline. A URL is one line, and
            // needing to reach for a button to send one is friction.
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(e.currentTarget.value); }
          }}
        />
        <div className="flex items-center justify-end pt-[12px]">
          <button
            type="submit"
            disabled={pending}
            aria-label="Read this page"
            className="flex size-[32px] items-center justify-center rounded-[8px] bg-[var(--accent-brand)] disabled:opacity-60"
          >
            <ArrowRight size={16} strokeWidth={2} className="text-[var(--accent-on-primary)]" aria-hidden />
          </button>
        </div>
      </form>

      {pending && (
        <p role="status" className="meta-12_5 text-[var(--text-secondary)]">
          Reading the page. This takes as long as fetching it does.
        </p>
      )}

      {/* need_url / need_fields / manual all land here: a sentence, not an
          error. The manual path is a real path -- the model only ever
          proposes, so its absence costs typing, not capability. */}
      {result && !pending && (
        <div className="flex w-full flex-col gap-[8px] rounded-[var(--radius-card)] border border-[var(--border-default)] bg-[var(--surface-subtle)] px-[20px] py-[16px]">
          <p className="body-13_5 text-[var(--text-primary)]">{result.reply}</p>
          {!result.model_configured && (
            // The reply above already names the variable. This adds the part
            // it does not say: the model's absence costs typing, not any of
            // the guarantees -- it only ever proposes, the gate decides.
            <p className="meta-12_5 text-[var(--text-secondary)]">
              Nothing about how Assay decides what to publish changes either way.
            </p>
          )}
        </div>
      )}

      {/* Always here, not only before the first ask. When the model cannot
          help, these two rows are the way forward -- hiding them then is
          hiding the escape hatch at the moment it is needed. */}
      {!pending && <StartFrom waiting={waiting} />}
    </div>
  );
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
      className="flex items-center gap-[16px] rounded-[var(--radius-card)] border border-[var(--border-default)] bg-[var(--surface-card)] px-[20px] py-[14px] hover:bg-[var(--surface-subtle)]"
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

/** The design's confidence column is two words. The model reports three. */
function tone(c: Proposal['fields'][number]['confidence']) {
  return c === 'high'
    ? { word: 'clear', colour: 'var(--semantic-success)', Icon: Check }
    : { word: 'unsure', colour: 'var(--semantic-warning)', Icon: CircleAlert };
}

function ProposalView({
  asked, result, onRestart,
}: {
  asked: string | null;
  result: Extract<ChatResult, { kind: 'propose' }>;
  onRestart: () => void;
}) {
  const p = result.proposal;
  const [keep, setKeep] = useState<string[]>(p.fields.map((f) => f.name));
  const [built, setBuilt] = useState<{ id: string; fields: { field: string; baseline: string | null }[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const unsure = p.fields.filter((f) => f.confidence !== 'high');

  if (built) {
    return (
      <div className="flex w-full max-w-[900px] flex-col gap-[16px]">
        <h2 className="display-28 text-[var(--text-primary)]">Watching {built.id}.</h2>
        <p className="body-13_5 text-[var(--text-secondary)]">
          The first run is done and the baseline is what the page said just now. Every run from
          here is compared against it.
        </p>
        <ul className="flex flex-col gap-[8px]">
          {built.fields.map((f) => (
            <li key={f.field} className="flex items-baseline gap-[12px]">
              <span className="mono-value-13 shrink-0 text-[var(--text-primary)]">{f.field}</span>
              <span className="body-13_5 truncate text-[var(--text-secondary)]">
                {f.baseline ?? 'nothing on the page yet'}
              </span>
            </li>
          ))}
        </ul>
        <div className="flex gap-[16px] pt-[4px]">
          <Link href="/runs" className="meta-13 text-[var(--semantic-link)]">See the run ›</Link>
          <button type="button" onClick={onRestart} className="meta-13 text-[var(--text-secondary)]">
            Watch something else
          </button>
        </div>
      </div>
    );
  }

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
          Check these are the right fields and I will build the scraper.
        </p>
      </div>

      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-[var(--border-hairline)] text-left">
            <th className="caption-12 w-[36px] pb-[8px] font-normal text-[var(--text-muted)]" />
            <th className="caption-12 pb-[8px] font-normal text-[var(--text-muted)]">field</th>
            <th className="caption-12 pb-[8px] font-normal text-[var(--text-muted)]">example from this page</th>
            <th className="caption-12 pb-[8px] text-right font-normal text-[var(--text-muted)]">confidence</th>
          </tr>
        </thead>
        <tbody>
          {p.fields.map((f) => {
            const { word, colour, Icon } = tone(f.confidence);
            const on = keep.includes(f.name);
            return (
              <tr key={f.name} className="border-b border-[var(--border-hairline)]">
                <td className="py-[12px]">
                  <input
                    type="checkbox"
                    checked={on}
                    aria-label={`Watch ${f.name}`}
                    onChange={() =>
                      setKeep((k) => (on ? k.filter((n) => n !== f.name) : [...k, f.name]))
                    }
                    className="size-[15px] accent-[var(--accent-brand)]"
                  />
                </td>
                <td className={`mono-value-13 py-[12px] ${on ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)] line-through'}`}>
                  {f.name}
                </td>
                <td className="body-13_5 max-w-0 truncate py-[12px] pr-[16px] text-[var(--text-secondary)]">
                  {f.example ?? <span className="text-[var(--text-muted)]">nothing there right now</span>}
                </td>
                <td className="py-[12px] text-right">
                  <span className="inline-flex items-center gap-[6px]">
                    <Icon size={14} strokeWidth={1.5} style={{ color: colour }} aria-hidden />
                    <span className="caption-12" style={{ color: colour }}>{word}</span>
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {unsure.length > 0 && (
        <p className="meta-12_5 text-[var(--text-secondary)]">
          {unsure.map((f) => f.name).join(', ')}{' '}
          {unsure.length === 1 ? 'has' : 'have'} nothing solid to anchor to. If it moves, Assay
          will hold the cell rather than guess.
        </p>
      )}

      <div className="flex items-center gap-[16px]">
        <button
          type="button"
          disabled={pending || keep.length === 0}
          onClick={() =>
            start(async () => {
              const r = await build(p.create, keep);
              if (r.ok) { setBuilt({ id: r.id, fields: r.fields }); setError(null); }
              else setError(r.detail);
            })
          }
          className="flex h-[40px] items-center gap-[10px] rounded-[var(--radius-control)] bg-[var(--accent-brand)] px-[18px] disabled:opacity-60"
        >
          <Hammer size={16} strokeWidth={1.5} className="text-[var(--accent-on-primary)]" aria-hidden />
          <span className="body-13_5 text-[var(--accent-on-primary)]">
            {pending ? 'Reading the page for a baseline' : 'Build the scraper'}
          </span>
        </button>
        <span className="meta-12_5 text-[var(--text-secondary)]">
          {keep.length} of {p.fields.length} fields · every {p.cadence}
        </span>
        <button type="button" onClick={onRestart} className="meta-13 ml-auto text-[var(--text-secondary)]">
          Start over
        </button>
      </div>

      {error && (
        <p role="alert" className="flex items-center gap-[8px]">
          <CircleAlert size={14} strokeWidth={1.5} className="text-[var(--semantic-danger)]" aria-hidden />
          <span className="meta-12_5 text-[var(--semantic-danger)]">{error}</span>
        </p>
      )}
    </div>
  );
}
