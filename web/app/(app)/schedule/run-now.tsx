'use client';

import { useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { HeldCell } from '../schema-table';
import { askForRun, landedSince, type Asked, type Landed } from './actions';

/**
 * "Run this now", said honestly.
 *
 * ASSAY'S WEB PROCESS DOES NOT SCRAPE. So this button does not run anything: it
 * moves the target into the due window and the worker claims it. The label says
 * `Ask for a run` rather than `Run now` because the second one would be a claim
 * this code cannot keep, and every other refusal in this product is about
 * exactly that distinction.
 *
 * The interesting half is what happens next. A queue with nothing consuming it
 * is a state a spinner renders as progress forever, and that is the failure the
 * whole product exists to condemn -- so the worker's presence is a real signal
 * (an advisory lock held by its own connection, `workersUp()` in `src/store`)
 * and when it says zero this says so in a sentence instead of spinning. When a
 * worker IS there, this watches the run RECORD rather than a timer: the run
 * appears with its status, or the wait ends saying it did not.
 */

/** How long to keep looking before saying so. A poll, not a promise. */
const WATCH_MS = 45_000;
const EVERY_MS = 2_000;

export interface Scraper {
  slug: string;
  paused: boolean;
  /** Target rows under this slug -- one per field watched on the page. */
  fields: number;
}

export function RunNow({ scrapers, workers }: { scrapers: Scraper[]; workers: number }) {
  if (scrapers.length === 0) return null;

  return (
    <section className="w-full pt-[36px]">
      <h2 className="label-10 pb-[10px] text-[var(--text-muted)]">ASK FOR A RUN</h2>
      <WorkerLine workers={workers} />
      <div className="flex w-full flex-col pt-[6px]">
        {scrapers.map((s) => (
          <Row key={s.slug} scraper={s} />
        ))}
      </div>
    </section>
  );
}

/**
 * Whether anything is consuming the queue, stated before anyone presses
 * anything.
 *
 * Read on the server at render, so it is the state of the database and not a
 * guess from the browser. Amber and not red: no worker is a normal state of a
 * self-hosted install that has not started one yet, and it is not a fault.
 */
function WorkerLine({ workers }: { workers: number }) {
  if (workers > 0) {
    return (
      <p className="caption-11 text-[var(--text-secondary)]">
        <span className="mr-[7px] inline-block size-[7px] rounded-full align-middle" style={{ background: 'var(--semantic-success)' }} />
        {workers === 1 ? 'A worker is' : `${workers} workers are`} consuming this queue. Asking for a
        run moves the page to the front of it.
      </p>
    );
  }
  return (
    <p className="caption-11 text-[var(--text-secondary)]">
      <span className="mr-[7px] inline-block size-[7px] rounded-full align-middle" style={{ background: 'var(--semantic-warning)' }} />
      No worker is consuming this queue, so nothing would claim a run you asked for. Start one with{' '}
      <span className="mono-value-12_5 text-[var(--text-primary)]">npm run worker</span> — Assay&apos;s
      web process deliberately never scrapes.
    </p>
  );
}

type Phase =
  | { kind: 'idle' }
  | { kind: 'asking' }
  | { kind: 'refused'; detail: string }
  | { kind: 'watching'; asked: Asked; landed: Landed | null }
  | { kind: 'settled'; asked: Asked; landed: Landed; timedOut: boolean };

function Row({ scraper }: { scraper: Scraper }) {
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const router = useRouter();
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const ask = useCallback(async () => {
    setPhase({ kind: 'asking' });
    const asked = await askForRun(scraper.slug);
    if (!asked.ok) {
      setPhase({ kind: 'refused', detail: asked.detail });
      return;
    }
    setPhase({ kind: 'watching', asked, landed: null });

    // No worker means nothing to wait FOR. Polling anyway would draw 45 seconds
    // of activity over a queue nobody is reading, which is the spinner this
    // control exists not to be.
    if (asked.workers === 0) {
      setPhase({ kind: 'settled', asked, landed: { workers: 0, runs: [] }, timedOut: false });
      return;
    }

    const deadline = Date.now() + WATCH_MS;
    const tick = async () => {
      const landed = await landedSince(scraper.slug, asked.since);
      if (landed.runs.length > 0) {
        setPhase({ kind: 'settled', asked, landed, timedOut: false });
        // The lane above this gains a mark for the run that just happened.
        router.refresh();
        return;
      }
      if (Date.now() >= deadline) {
        setPhase({ kind: 'settled', asked, landed, timedOut: true });
        return;
      }
      setPhase({ kind: 'watching', asked, landed });
      timers.current.push(setTimeout(tick, EVERY_MS));
    };
    timers.current.push(setTimeout(tick, EVERY_MS));
  }, [scraper.slug, router]);

  return (
    <div className="flex w-full flex-col gap-[6px] border-t border-[var(--border-hairline)] py-[13px]">
      <div className="flex w-full items-center gap-[16px]">
        <p className={`body-13_5 w-[212px] shrink-0 truncate pr-[12px] ${scraper.paused ? 'text-[var(--text-muted)]' : 'text-[var(--text-primary)]'}`}>
          {scraper.slug}
        </p>
        <p className="caption-12 shrink-0 text-[var(--text-muted)]">
          {scraper.fields} field{scraper.fields === 1 ? '' : 's'}
        </p>
        <div className="min-w-px flex-1" />
        <button
          type="button"
          onClick={ask}
          disabled={phase.kind === 'asking' || phase.kind === 'watching'}
          className="meta-12_5 shrink-0 rounded-[var(--radius-control)] border border-[var(--border-default)] px-[10px] py-[4px] text-[var(--text-primary)] transition-colors duration-[var(--duration-tint)] hover:bg-[var(--surface-subtle)] disabled:text-[var(--text-muted)]"
        >
          {phase.kind === 'asking'
            ? 'Asking…'
            : phase.kind === 'watching'
              ? 'Queued'
              : 'Ask for a run'}
        </button>
      </div>
      <Said phase={phase} />
    </div>
  );
}

/** What actually happened, in the product's voice. Never a spinner on its own. */
function Said({ phase }: { phase: Phase }) {
  if (phase.kind === 'idle' || phase.kind === 'asking') return null;

  if (phase.kind === 'refused') {
    return (
      <p role="alert" className="caption-11 pl-[212px] text-[var(--semantic-warning)]">
        {phase.detail}
      </p>
    );
  }

  if (phase.kind === 'watching') {
    return (
      <p className="caption-11 pl-[212px] text-[var(--text-secondary)]">
        {phase.asked.detail} Watching the run record — nothing yet.
      </p>
    );
  }

  const { asked, landed, timedOut } = phase;

  // Queued with nothing to claim it. Stated as the finished answer it is,
  // rather than left looking like something still in progress.
  if (landed.workers === 0 && landed.runs.length === 0) {
    return (
      <p role="alert" className="caption-11 pl-[212px] text-[var(--semantic-warning)]">
        {asked.detail}
      </p>
    );
  }

  if (landed.runs.length === 0) {
    return (
      <p role="alert" className="caption-11 pl-[212px] text-[var(--semantic-warning)]">
        Queued {timedOut ? `${Math.round(WATCH_MS / 1000)} seconds ago` : 'just now'} and still not
        claimed. {landed.workers === 0
          ? 'The worker that was there has stopped.'
          : 'A worker is up, so it is either mid-run or polling — this screen stopped watching, it did not stop being queued.'}
      </p>
    );
  }

  // The run landed. A held cell is drawn with the SAME component the schema
  // table uses -- amber, the gate's own reason put through the vocabulary, and
  // the route to the person who has to decide it. Rebuilding that rendering
  // here would be a second place for the product's most distinctive state to
  // drift, and the first thing to drift would be the wording of a refusal.
  return (
    <div className="flex flex-col items-start gap-[6px] pl-[212px]">
      {landed.runs.map((r) => (
        <div key={`${r.run}:${r.field ?? ''}`} className="flex flex-col items-start gap-[4px]">
          <p className="caption-11 text-[var(--text-secondary)]">
            <span className="mono-value-12_5 text-[var(--text-primary)]">run {r.run}</span>
            {r.field ? <> · {r.field}</> : null}
            {r.status === 'quarantined' ? null : <> · {r.status}</>}
          </p>
          {r.status === 'quarantined' ? (
            <HeldCell reason={r.reason} targetId={r.target} />
          ) : null}
        </div>
      ))}
    </div>
  );
}
