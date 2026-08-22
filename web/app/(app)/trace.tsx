'use client';

import { useEffect, useState } from 'react';
import { Check, ChevronRight, CircleSlash, Search, Eye } from 'lucide-react';
import { Collapse } from '@/components/motion/collapse';
import { Shimmer } from '@/components/motion/shimmer';
import { Stagger } from '@/components/motion/stagger';
import type { TraceEvent } from '@/lib/chat-stream';

/**
 * What the agent did, while it is doing it.
 *
 * EVERY ROW HERE IS A TOOL CALL THAT HAPPENED. The events arrive over SSE from
 * `src/agent/http.ts`, emitted by the tool handlers themselves as they run --
 * there is no stage list in this file, and there is nothing on a timer. If the
 * agent calls one tool, one row appears; if it calls none, none do. A trace that
 * animated through fixed steps would be the exact dishonesty this product's
 * whole claim rests on not committing.
 *
 * A tool that came back with nothing gets a row saying so. That is the half
 * worth showing: docs/APP-DESIGN.md 5 calls a rendered absence a `Hole` and
 * requires it to read as deliberate rather than as loading.
 *
 * Blue is in-motion, per docs/APP-DESIGN.md 5c -- the elapsed counter and the
 * running label are `semantic/link`, never brand orange and never amber, which
 * belongs to held.
 */
export function Trace({
  events,
  running,
  startedAt,
  now = Date.now,
}: {
  events: TraceEvent[];
  running: boolean;
  /** When the request left the browser. Real wall-clock, not a render count. */
  startedAt: number | null;
  /** Injectable so a test does not wait on a real second to pass. */
  now?: () => number;
}) {
  if (!running && events.length === 0) return null;

  const steps = events.filter((e) => e.kind === 'tool_result');

  return (
    <div className="flex w-full flex-col gap-[12px]">
      {running && (
        <div className="flex items-center gap-[10px]">
          <PixelGrid />
          <Shimmer className="body-13_5">Reading the page</Shimmer>
          <Elapsed from={startedAt} now={now} />
        </div>
      )}

      <Stagger className="flex flex-col gap-[2px]" step={60}>
        {steps.map((e, i) => <Row key={i} event={e} />)}
      </Stagger>
    </div>
  );
}

/**
 * Real elapsed time, ticking from the moment the request left.
 *
 * Derived from two clock readings, never from a counter incremented per tick --
 * a dropped frame or a backgrounded tab would make a counter drift away from
 * the truth while still looking authoritative. `now` is injectable so the test
 * can assert the reading without waiting on a real second.
 */
export function Elapsed({ from, now = Date.now }: { from: number | null; now?: () => number }) {
  const [tick, setTick] = useState(() => now());

  useEffect(() => {
    if (from == null) return;
    const t = setInterval(() => setTick(now()), 100);
    return () => clearInterval(t);
  }, [from, now]);

  if (from == null) return null;
  const ms = Math.max(0, tick - from);

  return (
    <span className="mono-value-12_5 tabular-nums text-[var(--semantic-link)]" aria-hidden>
      {(ms / 1000).toFixed(1)}s
    </span>
  );
}

/**
 * The pixel grid. Nine cells brightening under a wavefront.
 *
 * Decorative and `aria-hidden`: the Shimmer beside it is the `role="status"`
 * that actually announces. It says "something is running" and nothing more --
 * it does not encode progress, because there is no progress to encode. The
 * agent takes as long as fetching the page takes and neither this nor anything
 * else knows how long that is.
 */
function PixelGrid() {
  return (
    <span aria-hidden className="grid shrink-0 grid-cols-3 gap-[2px]">
      {Array.from({ length: 9 }, (_, i) => (
        <span
          key={i}
          className="motion-pixel size-[3px] rounded-[1px] bg-[var(--semantic-link)]"
          // A diagonal wavefront: cells on the same anti-diagonal light together.
          style={{ animationDelay: `${((i % 3) + Math.floor(i / 3)) * 90}ms` }}
        />
      ))}
    </span>
  );
}

/** One completed tool call. The words come from the event, never from a table here. */
function Row({ event }: { event: Extract<TraceEvent, { kind: 'tool_result' }> }) {
  const empty = event.ok && event.found === 0;
  const Icon = !event.ok ? CircleSlash : empty ? CircleSlash : event.tool === 'assay_inspect' ? Search : Eye;
  // Amber for "ran and found nothing" and for a failed read: both are absences a
  // person may need to act on, and neither is an error in red.
  const colour = event.ok && !empty ? 'var(--text-muted)' : 'var(--semantic-warning)';

  return (
    <div className="flex items-baseline gap-[10px] py-[3px]">
      <Icon size={13} strokeWidth={1.5} className="shrink-0 translate-y-[2px]" style={{ color: colour }} aria-hidden />
      <span className="mono-value-12_5 shrink-0 text-[var(--text-secondary)]">{event.tool}</span>
      <span className="caption-12 min-w-0 flex-1 truncate" style={{ color: colour }}>
        {event.detail}
      </span>
      {event.url && (
        <span className="caption-11 max-w-[220px] shrink-0 truncate text-[var(--text-muted)]">{event.url}</span>
      )}
    </div>
  );
}

/**
 * The end-of-turn summary: what ran, and what it touched.
 *
 * Built from the same event list the live trace was built from, so the summary
 * and the trace cannot disagree. Collapsed by default -- once a turn has
 * settled, the answer is the thing worth reading and the machinery is behind a
 * disclosure, which is docs/APP-DESIGN.md 5b's density rule ("machine tokens
 * grey, small, right, or behind a disclosure").
 *
 * There is no diff chip here. The source design puts a `+74 -41` file-diff
 * summary in this slot and Assay has no analogue -- nothing in a setup turn
 * edits a file. Rather than invent one, the slot carries the counts that are
 * real: tools called, pages read, elements found.
 */
export function ToolChips({ events }: { events: TraceEvent[] }) {
  const [open, setOpen] = useState(false);
  const results = events.filter((e) => e.kind === 'tool_result');
  if (results.length === 0) return null;

  const pages = new Set(results.map((r) => r.url).filter(Boolean));
  const found = results
    .filter((r) => r.tool === 'assay_inspect' && r.found != null)
    .reduce((n, r) => n + (r.found ?? 0), 0);

  return (
    <div className="flex w-full flex-col">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex items-center gap-[8px] self-start rounded-[var(--radius-control)] px-[8px] py-[5px] transition-colors duration-[var(--duration-tint)] hover:bg-[var(--surface-subtle)]"
      >
        <Check size={13} strokeWidth={1.5} className="text-[var(--text-muted)]" aria-hidden />
        <span className="caption-12 text-[var(--text-secondary)]">
          {results.length} call{results.length === 1 ? '' : 's'}
          {pages.size > 0 && ` · ${pages.size} page${pages.size === 1 ? '' : 's'} read`}
          {found > 0 && ` · ${found} element${found === 1 ? '' : 's'} examined`}
        </span>
        <ChevronRight
          size={13}
          strokeWidth={1.5}
          className="text-[var(--text-muted)] transition-transform duration-[var(--duration-pop)] ease-[var(--ease-glide)]"
          style={{ transform: open ? 'rotate(90deg)' : 'none' }}
          aria-hidden
        />
      </button>

      <Collapse open={open} contentClassName="pt-[6px]">
        <div className="flex flex-col gap-[2px] pl-[8px]">
          {results.map((e, i) => <Row key={i} event={e} />)}
        </div>
      </Collapse>
    </div>
  );
}
