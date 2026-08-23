'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Flow, FlowNode, StageKey, StageKind, StageTone } from '@/lib/run-flow';

/**
 * The run, as draggable cards on a dotted canvas with measured connectors.
 *
 * The mechanics are the supplied Flowchart component's -- absolute cards, a
 * pointer drag, connectors whose endpoints are MEASURED off the live rects
 * rather than assumed from the layout, a ResizeObserver so a card that grows
 * moves its own connector, and a selection that lights every edge touching the
 * selected card. Click the gate and you see what fed it, which is the question
 * this diagram exists to answer.
 *
 * Everything else was replaced. Its palette was another design system's
 * (`bg-surface`, `text-ink`, `shadow-card`, `--accent`, `--line-strong`) and is
 * mapped onto Assay's tokens here; no token was added. Its content was a demo
 * -- ice-cream flavours, an if/else over toppings -- and is gone entirely. The
 * nodes are whatever `flowFor` could evidence from the store, so this component
 * renders a flow, it never invents one.
 *
 * The dropdown chips went with the demo. There is nothing to choose on a run
 * that already happened, and a control that changes nothing is theatre.
 *
 * Motion: only `stroke`, `opacity` and `background` transition, at
 * `--duration-tint`/`--duration-glide`. Position is never transitioned -- a
 * dragged card must track the pointer exactly, and an eased `left` lags behind
 * it. That is also why the drag survives reduced motion untouched: the global
 * `*` rule in motion.css neutralises transitions, and there is no transition on
 * the thing being dragged.
 */

const CARD_W = 320;
const PAD = 40;
/** The gutter between the two columns. Wide enough for an edge label to sit in
 *  it rather than under a card -- the SVG is painted beneath the cards, so a
 *  label anywhere else is a label nobody can read. */
const GAP = 132;

const TONE: Record<StageTone, string> = {
  info: 'var(--text-secondary)',
  success: 'var(--semantic-success)',
  warning: 'var(--semantic-warning)',
  danger: 'var(--semantic-danger)',
};

const KIND: Record<StageKind, string> = {
  io: 'fetch',
  decision: 'decision',
  engine: 'engine',
  outcome: 'outcome',
};

type Pos = { x: number; y: number };

export function FlowCanvas({ flow }: { flow: Flow }) {
  const [pos, setPos] = useState<Record<string, Pos>>(() =>
    Object.fromEntries(flow.nodes.map((n) => [n.id, { x: n.x, y: n.y }])),
  );
  const [selected, setSelected] = useState<StageKey | null>(null);
  const [size, setSize] = useState<Record<string, { w: number; h: number }>>({});
  const refs = useRef(new Map<string, HTMLElement>());
  const drag = useRef<{ id: string; dx: number; dy: number; x0: number; y0: number } | null>(null);
  // A drag ends in a click on the card that was dragged. Without this, letting
  // go of a card toggles its selection off, which reads as the diagram
  // forgetting what you just picked up.
  //
  // A THRESHOLD rather than a flag: a real click carries a pixel or two of
  // movement between press and release, so "the pointer moved at all" swallowed
  // every selection. Four pixels is under a deliberate drag and over a hand.
  const moved = useRef(false);
  // Set once the operator has moved something. From then on the auto-layout
  // below stops touching positions -- a card that snapped back to a computed
  // spot after being dragged there would be the canvas arguing with its user.
  const arranged = useRef(false);

  // Measured, not assumed. A card's height depends on how many facts the store
  // had for that stage, which is not known until it has rendered.
  useLayoutEffect(() => {
    const ro = new ResizeObserver((entries) => {
      setSize((prev) => {
        let next = prev;
        for (const e of entries) {
          const id = (e.target as HTMLElement).dataset.node;
          if (!id) continue;
          const w = e.contentRect.width;
          const h = e.contentRect.height;
          if (prev[id]?.w === w && prev[id]?.h === h) continue;
          if (next === prev) next = { ...prev };
          next[id] = { w, h };
        }
        return next;
      });
    });
    for (const el of refs.current.values()) ro.observe(el);
    return () => ro.disconnect();
  }, [flow]);

  /**
   * Lay the cards out once, from what they actually measured.
   *
   * `flowFor` can only guess a pitch, and it guesses wrong: a card's height is
   * the number of facts the store happened to have for that stage, so a run
   * that recorded five candidates overlaps the card below it and a skipped run
   * leaves a hole. The columns alternate so seven stages do not become a
   * two-thousand-pixel scroll, and so every connector has a horizontal run to
   * bow across instead of being a vertical line hidden behind a card.
   */
  useEffect(() => {
    if (arranged.current) return;
    const heights = flow.nodes.map((n) => size[n.id]?.h);
    if (heights.some((h) => !h)) return;
    arranged.current = true;
    const step = (Math.max(...(heights as number[])) + 32) / 2;
    setPos(
      Object.fromEntries(
        flow.nodes.map((n, i) => [
          n.id,
          { x: i % 2 === 0 ? PAD / 2 : PAD / 2 + CARD_W + GAP, y: Math.round(i * step) },
        ]),
      ),
    );
  }, [flow, size]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent, id: string) => {
      // Left button only, and never from a link inside the card.
      if (e.button !== 0) return;
      const p = pos[id];
      if (!p) return;
      drag.current = { id, dx: e.clientX - p.x, dy: e.clientY - p.y, x0: e.clientX, y0: e.clientY };
      moved.current = false;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    [pos],
  );

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    e.preventDefault();
    if (Math.abs(e.clientX - d.x0) + Math.abs(e.clientY - d.y0) <= 4) return;
    moved.current = true;
    arranged.current = true;
    setPos((prev) => ({
      ...prev,
      [d.id]: { x: Math.max(0, e.clientX - d.dx), y: Math.max(0, e.clientY - d.dy) },
    }));
  }, []);

  const endDrag = useCallback(() => {
    drag.current = null;
  }, []);

  const select = useCallback((id: StageKey) => {
    if (moved.current) {
      moved.current = false;
      return;
    }
    setSelected((s) => (s === id ? null : id));
  }, []);

  const height =
    Math.max(...flow.nodes.map((n) => (pos[n.id]?.y ?? n.y) + (size[n.id]?.h ?? 150))) + PAD;
  const width =
    Math.max(CARD_W + PAD, ...flow.nodes.map((n) => (pos[n.id]?.x ?? n.x) + CARD_W)) + PAD;

  // Whether there is anything below the fold, measured off the element rather
  // than compared against the cap -- the cap is a `min()` of a viewport unit,
  // so only the browser knows what it resolved to. This is the whole of the
  // scroll affordance: a canvas whose last stage is cut off by a flat edge
  // reads as a diagram that ends there, and the `Hold` node -- the one the
  // operator came for -- is the last stage on every held run.
  const [more, setMore] = useState(false);
  const box = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const check = () => setMore(el.scrollHeight - el.scrollTop - el.clientHeight > 8);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    window.addEventListener('resize', check);
    el.addEventListener('scroll', check, { passive: true });
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', check);
      el.removeEventListener('scroll', check);
    };
  }, [height, width]);

  return (
    <div className="flex flex-col">
      <div
        ref={box}
        className="relative w-full overflow-auto rounded-[var(--radius-card)] border border-[var(--border-default)]"
        style={{
          // The dotted canvas, in the page ground rather than a fourth surface.
          background:
            'radial-gradient(var(--border-default) 1px, transparent 1px) 0 0 / 18px 18px, var(--bg-page)',
          // 700 was a flat number and it clipped the last pipeline node on any
          // laptop: the page spends ~220px above this on the top bar and the
          // canvas's own gutters, so a 800px-tall viewport had 580px to give and
          // was told to take 700. `min()` keeps the 700px ceiling on a big
          // screen and yields to the viewport everywhere else.
          maxHeight: 'min(700px, calc(100vh - 220px))',
        }}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <div className="relative" style={{ width, height, minWidth: '100%' }}>
          <Connectors flow={flow} pos={pos} size={size} selected={selected} />
          {flow.nodes.map((n) => (
            <Card
              key={n.id}
              node={n}
              pos={pos[n.id] ?? { x: n.x, y: n.y }}
              selected={selected === n.id}
              onSelect={() => select(n.id)}
              onPointerDown={(e) => onPointerDown(e, n.id)}
              register={(el) => {
                if (el) refs.current.set(n.id, el);
                else refs.current.delete(n.id);
              }}
            />
          ))}
        </div>
      </div>
      {/* Only when there IS more. A permanent "scroll for more" under a canvas
          that fits is the caption every reader learns to stop believing. */}
      {more && (
        /* copy(G) */
        <p className="caption-11 pt-[8px] text-[var(--text-muted)]" aria-hidden>
          ↓ more of the pipeline below — scroll the canvas
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ cards */

function Card({
  node,
  pos,
  selected,
  onSelect,
  onPointerDown,
  register,
}: {
  node: FlowNode;
  pos: Pos;
  selected: boolean;
  onSelect: () => void;
  onPointerDown: (e: React.PointerEvent) => void;
  register: (el: HTMLElement | null) => void;
}) {
  const tone = TONE[node.tone];
  return (
    <div
      ref={register}
      data-node={node.id}
      className="motion-fade-up absolute touch-none select-none"
      style={{ left: pos.x, top: pos.y, width: CARD_W }}
      onPointerDown={onPointerDown}
    >
      {/* The kind pill, above the card rather than inside it, so the row of
          pills reads as the shape of the pipeline on its own. */}
      <span
        className="label-10 ml-[10px] inline-block rounded-[var(--radius-control)] border border-[var(--border-hairline)] bg-[var(--surface-subtle)] px-[8px] py-[2px] uppercase text-[var(--text-muted)]"
        aria-hidden
      >
        {KIND[node.kind]}
      </span>
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        className="mt-[4px] block w-full cursor-grab rounded-[var(--radius-card)] border bg-[var(--surface-card)] p-[14px] text-left outline-none transition-[box-shadow,border-color] duration-[var(--duration-tint)] ease-[var(--ease-glide)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--semantic-link)] active:cursor-grabbing"
        style={{
          borderColor: selected ? tone : 'var(--border-default)',
          boxShadow: selected
            ? 'var(--shadow-elevation-floating)'
            : 'var(--shadow-elevation-control)',
        }}
      >
        <span className="flex items-center gap-[8px]">
          <span className="size-[8px] shrink-0 rounded-full" style={{ background: tone }} aria-hidden />
          <span className="heading-16 text-[var(--text-primary)]">{node.title}</span>
        </span>
        <span className="meta-12_5 mt-[6px] block text-[var(--text-secondary)]">{node.summary}</span>

        {node.branch && (
          <span className="mt-[10px] flex flex-col gap-[3px]">
            <span className="meta-12_5 flex items-center gap-[6px]" style={{ color: tone }}>
              <span aria-hidden>→</span> {node.branch.taken}
            </span>
            {/* The other arm of the same `if` in the engine. A statement about
                the code, struck through so it cannot be read as a claim about
                this run. */}
            <span className="meta-12_5 flex items-center gap-[6px] text-[var(--text-muted)] line-through decoration-[var(--border-default)]">
              <span aria-hidden className="no-underline">
                ×
              </span>{' '}
              {node.branch.notTaken}
            </span>
          </span>
        )}

        {node.facts.length > 0 && (
          <span className="mt-[10px] block border-t border-[var(--border-hairline)] pt-[8px]">
            {node.facts.map((f) => (
              <span key={f.label} className="flex items-baseline justify-between gap-[10px]" title={f.source}>
                <span className="mono-label-12 shrink-0 text-[var(--text-muted)]">{f.label}</span>
                <span className="mono-value-12_5 truncate text-[var(--text-primary)]">{f.value}</span>
              </span>
            ))}
          </span>
        )}
      </button>
    </div>
  );
}

/* ------------------------------------------------------------- connectors */

/**
 * One cubic bezier per edge, from the bottom edge of the source card to the top
 * edge of the target, using the measured rects. The control points are pulled
 * vertically by half the gap, so a card dragged sideways bows its connector
 * rather than snapping it to an elbow.
 */
function Connectors({
  flow,
  pos,
  size,
  selected,
}: {
  flow: Flow;
  pos: Record<string, Pos>;
  size: Record<string, { w: number; h: number }>;
  selected: StageKey | null;
}) {
  // Nothing to draw until the cards have been measured once; the first paint
  // would otherwise put every connector at height zero.
  const measured = flow.nodes.every((n) => size[n.id]);
  if (!measured) return null;

  return (
    <svg
      className="pointer-events-none absolute inset-0 size-full overflow-visible"
      aria-hidden
      focusable="false"
    >
      <defs>
        <marker id="fc-head" viewBox="0 0 8 8" refX="6" refY="4" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M0 0 L8 4 L0 8 z" fill="var(--border-default)" />
        </marker>
        <marker id="fc-head-lit" viewBox="0 0 8 8" refX="6" refY="4" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M0 0 L8 4 L0 8 z" fill="var(--accent-brand)" />
        </marker>
      </defs>
      {flow.edges.map((e) => {
        const a = pos[e.from];
        const b = pos[e.to];
        const sa = size[e.from];
        const sb = size[e.to];
        if (!a || !b || !sa || !sb) return null;
        // +22 for the kind pill, which sits above the card and is part of the
        // measured wrapper, so the card's own top edge is below it.
        const x1 = a.x + sa.w / 2;
        const y1 = a.y + sa.h;
        const x2 = b.x + sb.w / 2;
        const y2 = b.y + 22;
        const bow = Math.max(28, Math.abs(y2 - y1) / 2);
        const lit = selected === e.from || selected === e.to;
        return (
          <g key={`${e.from}-${e.to}`}>
            <path
              d={`M${x1},${y1} C${x1},${y1 + bow} ${x2},${y2 - bow} ${x2},${y2}`}
              fill="none"
              stroke={lit ? 'var(--accent-brand)' : 'var(--border-default)'}
              strokeWidth={lit ? 2 : 1.5}
              markerEnd={`url(#${lit ? 'fc-head-lit' : 'fc-head'})`}
              className="transition-[stroke,stroke-width] duration-[var(--duration-glide)] ease-[var(--ease-glide)]"
            />
            {/* In the gutter, on a chip of the page ground, because the SVG is
                painted beneath the cards and anywhere else is under one. */}
            <g transform={`translate(${PAD / 2 + CARD_W + GAP / 2} ${(y1 + y2) / 2})`}>
              <rect
                x={-e.label.length * 3.9 - 6}
                y={-9}
                width={e.label.length * 7.8 + 12}
                height={18}
                rx={4}
                fill="var(--bg-page)"
              />
              <text
                textAnchor="middle"
                dominantBaseline="central"
                className="mono-label-12 transition-[fill] duration-[var(--duration-glide)] ease-[var(--ease-glide)]"
                fill={lit ? 'var(--accent-brand)' : 'var(--text-muted)'}
              >
                {e.label}
              </text>
            </g>
          </g>
        );
      })}
    </svg>
  );
}
