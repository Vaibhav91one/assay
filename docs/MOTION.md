# Motion

Everything the app is allowed to animate, and the numbers it animates with. Two files hold it all:
`web/app/motion.css` (tokens, keyframes, classes, the reduced-motion guard) and `web/lib/motion.ts`
(the same numbers for JavaScript). Five primitives sit in `web/components/motion/`.

This exists because the same three patterns were being hand-rolled per component — a collapse in
`model-access.tsx`, a highlight in three separate menus — and each copy drifted. There is now one
copy, and changing a duration here changes it everywhere.

Colour, type and geometry come from Figma via `tools/tokens.ts`. Timing does not: Figma holds no
duration variables, so `motion.css` is written by hand and is the source of truth for it.

---

## 1. Tokens

Declared in `@theme static`, the same way `shadcn-bridge.css` declares its mappings. That means each
one is both a CSS custom property and a Tailwind utility, so `ease-glide`, `ease-[var(--ease-glide)]`
and `var(--ease-glide)` in raw CSS all produce the same curve.

Named by role. You reach for `--duration-pop` because you are opening a popover, not because you
counted 160ms.

### Easing

| Token | Value | When |
|---|---|---|
| `--ease-glide` | `cubic-bezier(0.23, 1, 0.32, 1)` | The signature curve. Fast out of the gate, long tail, comes to rest without a bounce. Every reveal, glide and expand. If you are unsure, this one. |
| `--ease-pop` | `cubic-bezier(0.16, 1, 0.3, 1)` | Sharper. For motion that appears under the cursor and must feel attached to the click rather than to the layout — popovers, the press scale. |

There is no third curve, and adding one needs a reason that is not "this felt nice". Two curves is
what makes the app feel like one app.

### Duration

| Token | Value | When |
|---|---|---|
| `--duration-tint` | `100ms` | Hover colour, focus ring, press. Below the threshold of being noticed, which is the point. |
| `--duration-pop` | `160ms` | A popover, menu or chip arriving. |
| `--duration-glide` | `220ms` | The highlight travelling between rows. |
| `--duration-reveal` | `300ms` | Content fading up into place. |
| `--duration-expand` | `360ms` | A collapse opening to its own height. Longer than a reveal because the layout below it is moving too. |
| `--duration-settle` | `500ms` | The slowest one-shot allowed. Rare by design. |
| `--duration-stagger` | `90ms` | The gap between one staggered child and the next, not a duration in itself. |

Loops are slower than anything one-shot — a fast loop reads as an alarm.

| Token | Value | When |
|---|---|---|
| `--duration-shimmer` | `1400ms` | The "working" sweep. |
| `--duration-spin` | `700ms` | The ring spinner. |
| `--duration-eq` | `900ms` | One bar of the equaliser, the other two offset from it. |

Two of them describe waiting rather than moving. They are thresholds for a route loader — when it
may start, and how long it must then stay — and they are tuned against each other, so they are
declared together and read together.

| Token | Value | When |
|---|---|---|
| `--duration-loader-delay` | `220ms` | Nothing is drawn before this. A navigation that resolves inside it shows no loader at all. Under about 150ms the delay stops catching the fast cases; over about 250ms a slow route sits blank long enough to feel broken. |
| `--duration-loader-min` | `500ms` | Once a loader has appeared it stays at least this long. A spinner that comes and goes inside 80ms is read as a rendering fault, not as work. |

### The same numbers in TypeScript

```ts
import { DURATION, EASE } from '@/lib/motion';

DURATION.stagger; // 90    -- milliseconds, always
EASE.glide;       // 'cubic-bezier(0.23, 1, 0.32, 1)'
```

Use these only where a number has to be computed — a stagger delay, a `setTimeout` that must outlast
a transition. For a plain style write `var(--duration-pop)` and let the cascade do it. Two copies of
one fact is a risk, and the rule is that CSS is the source: anything in `motion.ts` that disagrees
with `motion.css` is a bug in `motion.ts`.

---

## 2. Keyframes and classes

Seven keyframes, each with a class that applies it with the right token.

| Class | Keyframe | What it does |
|---|---|---|
| `.motion-pop-in` | `pop-in` | Scale 0.94 → 1 with a fade, from whatever `transform-origin` you set. Set the origin to the corner it grew out of, or it looks like it arrived from the middle of the screen. |
| `.motion-fade-in` | `fade-in` | Opacity only. |
| `.motion-fade-up` | `fade-up` | Opacity plus 6px of travel. What `Stagger` puts on its children. |
| `.motion-shimmer` | `shimmer-text` | A gradient clipped to the glyphs, swept on a linear loop. |
| `.motion-spin` | `spin` | Rotation. |
| `.motion-eq` | `eq-bounce` | Applies to the element's direct children; the second and third are offset by a third of a cycle each. |
| `.motion-pixel` | `pixel-on` | One cell of a grid brightening as a wavefront passes. No component uses it yet. |

### Press

Three classes, because the same scale on a 24px icon and a 320px button are not the same gesture —
the smaller the target, the more it has to move before the finger believes it.

| Class | Scale | On |
|---|---|---|
| `.press-icon` | `0.94` | Icon buttons |
| `.press-row` | `0.96` | Menu rows, list items |
| `.press-wide` | `0.98` | Full-width and wide buttons |

---

## 3. Primitives

All four are headless: no colour, no size, no border. Every one takes `className`. They are in
`web/components/motion/`.

### Collapse

```tsx
import { Collapse } from '@/components/motion/collapse';

<Collapse open={open} contentClassName="pt-[10px]">
  <p>Opens to whatever height this turns out to be.</p>
</Collapse>
```

```ts
function Collapse(props: {
  open: boolean;
  children: React.ReactNode;
  className?: string;         // on the animating grid wrapper
  contentClassName?: string;  // on the clipped inner element
}): React.ReactElement
```

A grid row of `0fr` and one of `1fr` are both animatable lengths, so the browser animates to auto
height — which `height: auto` will never do on its own. No measurement, no `ResizeObserver`, no
fixed max-height that clips long content.

Two rules. **Padding goes on `contentClassName`, never a margin** — margins escape the `overflow:
hidden` clip and the row jumps on open. And closed content is `inert`, so a keyboard user cannot tab
into a collapsed section and type into a field nobody can see.

No hooks and no handlers, so it works from a server component. The caller owns `open`.

### useGlide

```tsx
import { useGlide } from '@/components/motion/glide';

const glide = useGlide<HTMLButtonElement>(active, rows.length);

<div className="relative" onMouseLeave={() => setActive(null)}>
  <span aria-hidden className="absolute inset-x-0 rounded-[var(--radius-control)]
        bg-[var(--surface-subtle)]" style={glide.style} />
  {rows.map((row, i) => (
    <button key={row} ref={glide.setRef(i)} onMouseEnter={() => setActive(i)}
            className="relative block w-full">{row}</button>
  ))}
</div>
```

```ts
function useGlide<T extends HTMLElement = HTMLElement>(
  activeIndex: number | null,
  length: number,
): {
  setRef: (index: number) => (el: T | null) => void;
  style: React.CSSProperties;
}
```

One highlight that travels, rather than every row lighting its own lamp. The difference is visible:
when each row owns its background, moving between two rows is one thing switching off and another
switching on, and the eye reads two events. When a single band animates its `top` and `height`, the
eye reads one object moving, and the list feels like a track instead of a set of buttons.

The span must be a child of a `position: relative` container — measurement is `offsetTop` and
`offsetHeight` against the offset parent. It must be `aria-hidden`: it is a rendering of the
selection, not the selection.

Three cases it already handles. `activeIndex: null` fades the band out **in place** rather than
letting it fly home. A changing `length` re-measures and drops stale refs. And the first appearance
is instant, not animated — a band that travels on its first appearance slides in from `top: 0` and
reads as a selection sweeping down from nowhere, so opacity always transitions but position only
does once there is a previous position to travel from.

Known ceiling: it re-measures on `activeIndex` or `length` change, not on resize. A row that changes
height while it is the active row leaves the band behind.

### Stagger

```tsx
import { Stagger } from '@/components/motion/stagger';

<Stagger className="flex flex-col gap-[8px]">
  {rows.map((r) => <Row key={r.id} {...r} />)}
</Stagger>
```

```ts
function Stagger(props: {
  children: React.ReactNode;
  step?: number;             // ms between neighbours, default DURATION.stagger (90)
  className?: string;        // on the container
  itemClassName?: string;    // on each generated wrapper
}): React.ReactElement
```

Wraps each child in a `div.motion-fade-up` with an `animationDelay` of `index * step`. A wrapper
rather than `cloneElement`, which has to guess where the child keeps its `className` and gets it
wrong on anything that is not a plain host element.

`step` is the gap between neighbours, not the total. Ten children at the default means the last one
starts 810ms in, which is already too long. Past six or so, drop the step or stagger only the first
few.

### Shimmer, Spinner, Equaliser

```tsx
import { Shimmer, Spinner, Equaliser } from '@/components/motion/shimmer';

<Shimmer className="body-14">Healing 3 selectors</Shimmer>

<p className="flex items-center gap-[8px]"><Spinner /> Reading the page</p>
```

```ts
function Shimmer(props: { children: React.ReactNode; className?: string }): React.ReactElement
function Spinner(props: { size?: number; className?: string }): React.ReactElement
function Equaliser(props: { className?: string }): React.ReactElement
```

`Shimmer` is a label whose own words say what is happening. It carries `role="status"`, so a screen
reader hears it when it appears and again when the words change. The sweep is decoration on top of a
sentence that stands without it. Recolour it with `--motion-shimmer-base` and
`--motion-shimmer-glow`; they default to `--text-secondary` and `--text-primary`.

`Spinner` says only "something". Next to a Shimmer it is `aria-hidden` and adds nothing an assistive
reader needs. Alone it is a glyph with no text, which is a state nothing should ship in — give it a
sentence to stand beside.

`Equaliser` is for live audio, where the point is that input is being heard right now. It is not a
substitute for a Spinner on work that has no signal behind it.

None of the three takes focus. A progress indicator is not a control.

### RouteLoader

```tsx
import { RouteLoader } from '@/components/motion/route-loader';

export default function DecisionsLoading() {
  return (
    <>
      <TopBar title="Decisions" status="loading…" />
      <RouteLoader>Reading the queue.</RouteLoader>
    </>
  );
}
```

```ts
function RouteLoader(props: { children: React.ReactNode }): React.ReactElement
```

The body of a route's `loading.tsx`: a centred `Spinner` and the sentence saying what is being read.
It replaced the layout-matching skeletons those files used to draw. A skeleton has to guess the shape
of data nobody has read yet — two cards, six rows — and when it guesses wrong the page jumps anyway,
which is the one thing it existed to prevent.

Keep the sentence specific to the route. "Reading the queue" and "Reading every page kept for these
fields" are different facts and a generic "Loading…" throws both away.

It applies the two threshold tokens above, and both matter more than the fade does. Without the
delay every warm navigation flashes a spinner; without the minimum, a route that lands just after the
delay strobes.

The exit is worth explaining, because the App Router does not make it easy. React swaps a
`loading.tsx` segment out the instant the page is ready: no unmount hook, nothing to animate against.
So on unmount the effect cleanup clones the loader, pins the clone over the box the original held,
and lets that copy serve out the rest of the minimum and then fade. The copy is outside React by
then — `aria-hidden`, `pointer-events: none`, and it removes itself. The arriving page is already
mounted and painted underneath, so the loader genuinely dissolves off it rather than being cut.

One consequence to know about: while the copy is holding, the `TopBar` underneath has already swapped
to the arrived page's status. The copy covers the body only. For up to 500ms the bar can read the new
state while the body still says it is reading.

---

## 4. The reduced-motion contract

One media query in `motion.css`, and it is deliberately `*` rather than a list of the classes above:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    animation-delay: 0ms !important;
    transition-duration: 0.01ms !important;
    transition-delay: 0ms !important;
    scroll-behavior: auto !important;
  }
}
```

Scoping it to this file's own classes would be tidier and would be wrong. Someone writes a
`transition-` utility next week without reading this document, and the promise still has to hold. It
already covers the hand-rolled expander in `model-access.tsx`, which predates all of this.

Not `animation: none`: that fires `animationend` never and strands anything waiting on it. A 0.01ms
animation still completes, it just does so before the frame is painted.

**Motion that carries meaning has to keep carrying it.** Turning animation off must not turn
information off. Two rules exist for exactly that:

- `.motion-shimmer` drops its gradient and puts the text fill back. Frozen mid-sweep it would leave
  half the glyphs transparent. The word still reads "Healing 3 selectors", the `role="status"` still
  announces, only the sweep is gone.
- `.motion-eq` pins all three bars to `scaleY(0.7)`. Stopped where the 0.01ms run left them they
  can be a 35%-height sliver that reads as a rendering bug.

The spinner needs no rule. A ring that has stopped turning is still a ring, and still sits beside
the label saying what is running.

### When JavaScript has to branch

CSS cannot stop a sweep driven by `requestAnimationFrame`. For that, and only that:

```ts
import { usePrefersReducedMotion } from '@/lib/motion';

const reduced = usePrefersReducedMotion();
```

Returns `false` during SSR and on the first client render, then corrects — the server does not know
the user's setting, and being wrong for one frame costs at most one frame of motion. Most components
should not call this; the media query above already handles CSS-driven motion without a line of JS.

### How this was verified

Two throwaway headless Chrome instances against `/motion`, one launched with
`--force-prefers-reduced-motion` and one without, reading computed styles over the DevTools protocol.
Measured, not eyeballed:

| | motion allowed | reduced motion |
|---|---|---|
| `matchMedia` / the hook | `false` / "off" | `true` / "on" |
| shimmer animation | `1.4s` | `1e-05s` |
| shimmer background | `linear-gradient(…)` | `none` |
| shimmer text fill | `rgba(0, 0, 0, 0)` | `rgb(107, 107, 107)` |
| spinner iterations | `infinite` | `1` |
| equaliser bar | `matrix(1, 0, 0, 0.35, 0, 0)` | `matrix(1, 0, 0, 0.7, 0, 0)` |
| collapse transition | `0.36s` | `1e-05s` |
| third staggered child delay | `0.18s` | `0s` |
| press transition | `0.1s` | `1e-05s` |

---

## 5. When not to animate

Motion is a claim that something changed. Making that claim when nothing did is the whole failure
mode, and it is more common than under-animating.

- **A list that was already there.** Stagger results that just landed. Staggering a re-render makes
  a fast page look slow, and the user learns to distrust the animation as a signal.
- **Anything on a path the user takes many times a day.** The tenth time, 300ms is 300ms of waiting.
  Reveals are for arrivals, not for navigation between two screens someone lives in.
- **An error, a break, a quarantined cell.** These want to be read, not watched. A number that
  animates in is a number someone waits for instead of reading.
- **More than one thing at once in the same region.** Two competing animations produce no focal
  point and the eye picks neither.
- **Layout that is still settling.** Animating during data load means animating twice — once on the
  skeleton and once on the real thing.
- **To fill time.** A shimmer is honest when work is running and dishonest when it is covering a
  slow query nobody is fixing. `Working` in `components/loading.tsx` deliberately has no progress
  bar for the same reason: a bar is a promise of a denominator, and most routes do not have one.

The house rule: if removing the animation loses no information, it is decoration, and decoration is
allowed only where it is cheap and quiet. If removing it *does* lose information, then §4 applies
and it needs a static form that still says the same thing.

---

## 6. Seeing them

`/motion` renders every primitive on one page — dev only, unlinked, not a product surface. Run
`npm run dev --workspace web` and open it. Turn the OS reduced-motion setting on and reload: the
banner at the top flips, the shimmer becomes plain text, the bars stop at a legible height, and
nothing else moves.

---

## 7. Where this came from

The motion vocabulary here was adapted from Beautiful UI (beautifului.dev), MIT, © 2026 Shane Levine.

No files were copied. The keyframes and primitives in `motion.css` and `components/motion/` were
written from a described vocabulary — which effects a small app needs, what each one is for, roughly
how long each should run — onto Assay's own tokens. The durations, the two easing curves, the
reduced-motion contract and the component APIs are this repo's.

This note is a courtesy, not a compliance step. MIT requires the notice to travel with copies of the
covered work, and nothing here is a copy of it; there was no obligation to credit and this does not
create one. It records where the ideas came from, which is worth recording on its own.

One detail worth knowing if the licence is ever checked: the MIT grant for Beautiful UI is published
as a web page the author controls, not as a LICENSE file in a repository. A page can change or go
away, and there is no commit to point at for what it said on the day it was read. If this ever needs
to be relied on rather than acknowledged, capture the page as it stands then.
