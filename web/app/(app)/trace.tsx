'use client';

import { useEffect, useState } from 'react';
import { Check, ChevronRight, CircleAlert, CircleSlash, ExternalLink, Search, Eye } from 'lucide-react';
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

/**
 * How a tool call came back, as three states the record actually distinguishes.
 *
 * `ok` and `found` are what the tool handlers emit (`Step` in
 * `src/agent/index.ts`), so these three are read off the call and not guessed
 * at: a call that answered, a call that answered with nothing, and a call that
 * did not answer. `assay_inspect` on a 404 sets `ok: false`; `assay_inspect` on
 * a page with no candidates sets `ok: true, found: 0`. They used to be drawn
 * identically -- the same glyph in the same amber -- which put a broken URL and
 * a thin page in the same box.
 */
function outcomeOf(event: Extract<TraceEvent, { kind: 'tool_result' }>) {
  if (!event.ok) return 'failed' as const;
  return event.found === 0 ? 'empty' as const : 'found' as const;
}

const OUTCOME = {
  found: { colour: 'var(--semantic-success)', Icon: Check },
  empty: { colour: 'var(--semantic-warning)', Icon: CircleSlash },
  failed: { colour: 'var(--semantic-danger)', Icon: CircleAlert },
} as const;

/** One completed tool call. The words come from the event, never from a table here. */
function Row({ event }: { event: Extract<TraceEvent, { kind: 'tool_result' }> }) {
  const outcome = outcomeOf(event);
  // The glyph carries the outcome as a SHAPE as well as a colour -- a tick, a
  // barred circle, an alert -- so the three are told apart with the colour off.
  // On a found call the glyph names the tool instead, which is the more useful
  // thing to say when nothing went wrong.
  const Icon = outcome === 'found'
    ? (event.tool === 'assay_inspect' ? Search : Eye)
    : OUTCOME[outcome].Icon;

  // Measured on --bg-page: `text/secondary` is 5.33:1, `semantic/danger` 4.83:1
  // and `semantic/warning` 2.94:1. The warning is the one that does not reach
  // 4.5:1, and it is the colour this row already carried for an empty result --
  // kept because it is the palette's word for "held", and the glyph beside it
  // says the same thing at 3:1. A found call's detail is `text/secondary`, not
  // the green: green on 12px prose is 3.30:1 and reads worse than the grey it
  // replaced, and "it worked" is not the sentence that needs the colour.
  const detail = outcome === 'found' ? 'var(--text-secondary)' : OUTCOME[outcome].colour;

  return (
    <div className="flex items-baseline gap-[10px] py-[3px]">
      <Icon
        size={13}
        strokeWidth={1.5}
        className="shrink-0 translate-y-[2px]"
        style={{ color: OUTCOME[outcome].colour }}
        aria-hidden
      />
      <span className="mono-value-12_5 shrink-0 text-[var(--text-secondary)]">{event.tool}</span>
      <span className="caption-12 min-w-0 flex-1 truncate" style={{ color: detail }}>
        {event.detail}
      </span>
      {event.url && <PageLink url={event.url} />}
    </div>
  );
}

/**
 * The page a call read, as a page you can go and look at.
 *
 * It was grey text. It is the operator's own URL -- `assay_inspect` can only
 * read a page the operator named, never one the model chose -- so the honest
 * thing is a link to it, and the thing they wanted from a trace row that says
 * `fetch 404` is to click the URL and see the 404 themselves.
 *
 * `http`/`https` only, checked here rather than trusted: this is the one string
 * in the row that becomes an `href`, and a scheme test is what stops it ever
 * becoming a `javascript:` one. A URL that fails the test renders as the text
 * it always was.
 */
function PageLink({ url }: { url: string }) {
  if (!/^https?:\/\//i.test(url)) {
    return <span className="caption-11 max-w-[220px] shrink-0 truncate text-[var(--text-muted)]">{url}</span>;
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="focus-ring caption-11 flex max-w-[220px] shrink-0 items-baseline gap-[4px] rounded-[var(--radius-control)] text-[var(--semantic-link)] hover:underline"
    >
      <span className="min-w-0 truncate">{url}</span>
      <ExternalLink size={11} strokeWidth={1.5} className="shrink-0 translate-y-[1px]" aria-hidden />
      {/* The glyph says "new tab" to the eye; this says it to a screen reader.
          Without it the two are not told the same thing. */}
      <span className="sr-only">(opens in a new tab)</span>
    </a>
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
  // A turn where a call failed says so on the closed summary, in words, rather
  // than hiding the one row worth reading behind the disclosure. Counted off
  // the same records the rows are drawn from, so the two cannot disagree.
  const failed = results.filter((r) => !r.ok).length;

  return (
    <div className="flex w-full flex-col">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex items-center gap-[8px] self-start rounded-[var(--radius-control)] px-[8px] py-[5px] transition-colors duration-[var(--duration-tint)] hover:bg-[var(--surface-subtle)]"
      >
        {failed > 0 ? (
          <CircleAlert size={13} strokeWidth={1.5} className="text-[var(--semantic-danger)]" aria-hidden />
        ) : (
          <Check size={13} strokeWidth={1.5} className="text-[var(--semantic-success)]" aria-hidden />
        )}
        <span className="caption-12 text-[var(--text-secondary)]">
          {results.length} call{results.length === 1 ? '' : 's'}
          {pages.size > 0 && ` · ${pages.size} page${pages.size === 1 ? '' : 's'} read`}
          {found > 0 && ` · ${found} element${found === 1 ? '' : 's'} examined`}
          {failed > 0 && ` · ${failed} did not answer`}
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
