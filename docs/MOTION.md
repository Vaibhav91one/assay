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
| `--duration-dismiss` | `110ms` | A popup leaving. Deliberately shorter than `--duration-pop`: arriving is an event worth watching land, leaving is not, and a popup that takes as long to go as it took to come feels stuck to the cursor. |

Loops are slower than anything one-shot — a fast loop reads as an alarm.

| Token | Value | When |
|---|---|---|
| `--duration-shimmer` | `1400ms` | The "working" sweep. |
| `--duration-spin` | `700ms` | The ring spinner. |
| `--duration-eq` | `900ms` | One bar of the equaliser, the other two offset from it. |
| `--duration-orbit` | `3000ms` | One lap of the light around the primary button's edge. The slowest loop here, because it runs forever behind a control someone is meant to want to press — anything quicker stops being a highlight and becomes a thing to get away from. |

Two more that are geometry rather than timing, declared here because they exist
only as part of a piece of motion and are the knobs it is tuned with.

| Token | Value | When |
|---|---|---|
| `--shimmer-spread` | `90deg` | How wide the bright wedge of the edge light is. |
| `--shimmer-cut` | `1.5px` | How thick the rim it travels along is. |

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

Nine keyframes, each with a class that applies it with the right token.

| Class | Keyframe | What it does |
|---|---|---|
| `.motion-pop-in` | `pop-in` | Scale 0.94 → 1 with a fade, from whatever `transform-origin` you set. Set the origin to the corner it grew out of, or it looks like it arrived from the middle of the screen. For a plain element; anything Base UI mounts should use `.motion-popup` below instead, which also knows how to leave. |
| `.motion-fade-in` | `fade-in` | Opacity only. |
| `.motion-fade-up` | `fade-up` | Opacity plus 6px of travel. What `Stagger` puts on its children. |
| `.motion-bar-fill` | `bar-fill` | A bar growing from nothing to the width it was always going to have. |
| `.motion-shimmer` | `shimmer-text` | A gradient clipped to the glyphs, swept on a linear loop. |
| `.shimmer-edge` | `shimmer-orbit` | A wedge of light travelling around a control's rim. One button in the product wears it. |
| `.motion-spin` | `spin` | Rotation. |
| `.motion-eq` | `eq-bounce` | Applies to the element's direct children; the second and third are offset by a third of a cycle each. |
| `.motion-pixel` | `pixel-on` | One cell of a grid brightening as a wavefront passes. No component uses it yet. |

Three more are transitions rather than keyframes, and are described below
because a transition is the right tool whenever the thing can be interrupted.

| Class | What it does |
|---|---|
| `.motion-popup` | Every Base UI popup: arrives on `--duration-pop`, leaves on `--duration-dismiss`. |
| `.motion-sheet` | A panel that comes in from an edge. Arrives on `--duration-reveal`, leaves on `--duration-dismiss`. Reads its direction off the `data-side` the sheet was already pinned by, so the two cannot disagree. |
| `.motion-scrim` | The dim behind a sheet, on the same two durations. |
| `.icon-swap` | The hover swap on a button with a glyph on the left. |
| `.focus-ring` / `.focus-ring-inset` | Where the keyboard is. |

### Focus

Not the browser's outline. The same promise — a sighted keyboard user can
always see where they are — drawn in the app's own palette so it reads as part
of this design system rather than as the user agent's default: a 2px hairline
in the surface colour so the ring never touches the control, then a 2px brand
ring outside it. It follows the control's own `border-radius` for free, because
`box-shadow` does. `:focus-visible` only, so a mouse click never draws it.

`.focus-ring` is on the base of `actionVariants`, so every button variant gets
the same one and a button cannot ship without it.

**The colour was measured, not chosen.** `--semantic-link` (#2563eb) clears 3:1
against the white card at 5.2:1 and manages only 2.4:1 against the #0e0e0f rail.
A focus ring legible on one of the app's two surfaces is not a focus ring.
`--accent-brand` (#ff4d00) clears it on both — 3.3:1 on white, 5.8:1 on the
rail — so that is what it is drawn in.

It is deliberately **not** transitioned, even though `--duration-tint` names the
focus ring as one of its jobs. Someone arriving by keyboard wants to know where
they are on the frame they arrive; 100ms spent fading a ring in is 100ms of not
knowing.

`.focus-ring-inset` is the same ring turned inwards, for a full-bleed row inside
something that clips — a notification line in a popup with `overflow: hidden`,
where an outer ring would simply be cut off by the panel containing it.

Both hand the outline back under `forced-colors: active`, where `box-shadow` is
dropped entirely and the ring would otherwise vanish for exactly the users least
able to afford losing it.

A menu row gets neither. Base UI draws its own `data-highlighted`, and a second
indicator would say the same thing twice.

### The popup idiom

```tsx
<Popover.Popup className="motion-popup rounded-[var(--radius-card)] …">
```

One class for every `Popover.Popup`, `Menu.Popup` and tooltip in the app, so the
way a popup arrives and the way it leaves are decided once. Before it, three
popups shared `motion-pop-in` for the entry and had **no exit at all** — they
were cut, not closed.

A CSS transition rather than a keyframe animation, which is Base UI's own
recommendation and not a preference: a transition can be cancelled midway, so a
popup dismissed before it has finished opening animates smoothly back down
instead of snapping.

Base UI puts `data-starting-style` on the popup for one frame as it opens and
`data-ending-style` on it for the whole of the close, and holds the element
mounted until `getAnimations()` reports the transition finished. So there is no
`keepMounted`, no unmount timer, and nothing for a component to own.

It sets `transform-origin: var(--transform-origin)` itself — the origin Base UI
computed for the side the popup actually opened on — so callers no longer write
`origin-[var(--transform-origin)]` and the popup collapses back into the control
that opened it rather than shrinking into its own middle.

**`z-index` goes on the positioner, never on the popup.** Base UI gives the
positioner `position: absolute` and leaves the popup `position: static`, and
`z-index` on a statically positioned element is ignored outright. A popup that
carries its own `z-50` therefore contributes no stacking level at all and paints
with the ordinary in-flow content — underneath the sidebar rail, which is
`position: fixed; z-index: 10`. That is what made the run strip's tooltip look
clipped at the viewport edge on home: it was not clipped, it was behind the
rail, and the run id at the start of the sentence was the part the rail covered.

### The sheet idiom

```tsx
<Sheet open={open} onOpenChange={setOpen}>
  <SheetTrigger>…</SheetTrigger>
  <SheetContent side="right">…</SheetContent>
</Sheet>
```

The same bargain as the popup idiom, on the same two data attributes, for a
panel that crosses a third of the screen rather than appearing under the cursor.
`--duration-reveal` in rather than `--duration-pop`, because 160ms across that
distance reads as a jump rather than as an arrival; `--duration-dismiss` out,
because that rule does not change with distance.

It slides with `translate` rather than `transform`, so the motion composes with
any transform the caller puts on the panel instead of overwriting it.

**One trap, found by measuring.** Base UI stamps `data-instant="click"` on every
popover opened by clicking its trigger, which is how every popover in this app
opens. Honouring `[data-instant]` unconditionally — which is what the attribute
looks like it is asking for — computed `transition-property: none` and removed
the entry *and* exit animations completely. The rule is scoped to
`[data-instant]:not([data-instant='click'])` for that reason. It is worth knowing
that the broken version and the working version are indistinguishable in a
screenshot and differ by one computed style.

### The icon swap

On a button with a glyph on the left, hovering slides the whole row one
icon-slot to the left — the glyph leaves through the left edge as it fades —
while a second copy of the same glyph arrives from beyond the right edge into
the space the label has just vacated. The button clips, so both journeys happen
behind a mask and the icon reads as one object that travelled through and out
the other side.

`--duration-pop` on `--ease-pop`, because this is motion attached to the cursor.
No new tokens.

Three things make it work rather than merely happen:

- **The label moves deliberately, by exactly one slot**, rather than being left
  to snap sideways when the glyph disappears. A label that jumps on hover is
  worse than no effect.
- **Nothing changes width.** The arriving copy cancels its own footprint with
  `margin-inline-start: calc(-1 * (var(--swap-slot) + var(--action-gap)))`, so
  its resting place is flush with the content box's right edge and it
  contributes nothing to the measured size. The button is the same width
  hovered as not.
- **Transitions, not animations.** A pointer crossing the button twice in 200ms
  reverses each piece from wherever it had got to. There is no way to strand a
  glyph mid-slide or leave two of them on screen.

The two numbers it needs come from the two places that already know them:
`--swap-slot` is set inline from the component's own `iconSize`, and
`--action-gap` is the variant's gap, declared once per variant in `button.tsx`
and spent both on the flex gap and on the slide — so a gap changed there changes
the slide with it and the two cannot drift.

It applies where there is a left glyph to send away, a label for it to travel
past, and no spinner currently saying something — a condition on the render, not
a list of variants, because whether a button carries a glyph is a fact about the
call site and not about the family. `icon` never gets it: that glyph *is* the
button, and sliding it out leaves an empty box.

### The edge light

A wedge of `--shimmer-spread` travelling around a `--shimmer-cut` rim on
`--duration-orbit`. It is on **one** button in the product — `New scrape` in the
rail — and §5 below records the argument about whether it should be there at all.

The mechanism is one pseudo-element. The rim is cut with a two-layer mask (the
whole box minus its own content box), and the angle is animated by registering
`--shimmer-angle` with `@property` so the browser can interpolate it — a
`conic-gradient`'s `from` angle is not animatable on its own. The MagicUI
component this was adapted from nests five divs, a container query and an
oversized rotating element to draw the same picture; none of that is needed once
the angle itself is a typed custom property. No dependency was added: the
original is pure CSS too, and `docs/STACK.md` rules out animation libraries.

It is `pointer-events: none` and sits on top, so press, focus, disabled and
loading underneath are the ordinary primary button they always were.

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

**And motion that carried nothing may be dropped outright**, which is the other
half of the same rule and the newer half. Compressing a purely decorative effect
into 0.01ms does not produce a subtler effect, it produces a flicker, and a
flicker is worse than the thing it replaced. Two are dropped rather than
compressed:

- `.icon-swap` is not drawn at all: the glyph stays on the left, the label stays
  where it is, and the second copy is `display: none`. Removing the swap loses no
  information, which by §5 makes it decoration.
- `.shimmer-edge::before` is not drawn at all. Held at 0.01ms it would freeze as a
  bright wedge stuck at one corner of the button, which reads as a rendering
  fault rather than as a highlight. What is left is an ordinary solid primary
  button, which is what it always was underneath.

`.motion-bar-fill` needs no rule of its own, and the reason is worth stating
because it looks like an omission. The information a bar carries **is** its
width. The global 0.01ms above completes the fill before the frame is painted,
so what lands is the real measurement drawn instantly — which is the
requirement, not a concession to it.

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
| icon-swap lead transition | `0.16s` | `1e-05s` |
| icon-swap trailing copy | `display: block`, `matrix(1, 0, 0, 1, 28, 0)` | `display: none` |
| bar fill animation | `0.3s` | `1e-05s` |
| popup transition, opening | `0.16s` | `1e-05s` |
| popup transition, closing | `0.11s` | `1e-05s` |
| edge light animation | `3s` | `1e-05s` |
| edge light `::before` | `display: block` | `display: none` |
| focus ring, on real Tab | `rgb(255,255,255) 0 0 0 2px, rgb(255,77,0) 0 0 0 4px` | unchanged |

Three notes on reading that table.

The trailing copy's `matrix(1, 0, 0, 1, 28, 0)` is its resting `translateX(200%)`
on a 14px glyph — parked outside the clip, which is where it should be when
nobody is pointing at the button.

The focus ring is deliberately identical in both columns. It is not motion; it
is information, and §4's whole point is that turning animation off must not turn
information off. It was measured after a real `Input.dispatchKeyEvent` Tab over
CDP rather than a scripted `.focus()`, because `:focus-visible` is exactly the
thing a scripted focus does not reliably reproduce.

The popup's closing row is the one that caught a real bug. See the
`data-instant` note in §2: the broken build and the working build were
indistinguishable in a screenshot and differed by one computed style.

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

### The one exception, recorded rather than explained away

`.shimmer-edge` on `New scrape` breaks the rule directly above it. It is a
perpetual loop with nothing behind it: no work is running, nothing changed, and
removing it loses no information whatsoever. By the letter of "to fill time" it
is the exact failure mode this section was written about — and the section
immediately above says a shimmer is dishonest when it is not covering real work.

It is here because the product's owner asked for it, on the product's single
call to action, and drawing the eye to the main action is a real job even though
it is not an *informational* one. That is a defensible reason and it is not the
same as the rule not applying.

So the rule is not amended, and three limits keep the exception from spreading:

- **One button.** Not the `primary` variant — the variant does not apply it, one
  call site does. The moment a second button wears it, it has stopped meaning
  "this one" and is just noise with a house style.
- **It is switched off entirely under reduced motion**, not slowed and not
  frozen. See §4.
- **It is a layer, never a replacement.** Press, focus, disabled and loading are
  the ordinary primary button's, untouched, because the whole effect is one
  `pointer-events: none` pseudo-element.

If this ever needs revisiting, the honest question is not "is it pretty" but
"has a second one appeared", and the second one is the thing to delete.

### Two things that were made *less* animated

Worth recording, because §5 is usually read as a list of things not to add.

**A bar fills once, on arrival, and never again.** `.motion-bar-fill` is a CSS
animation rather than a React effect precisely because a CSS animation runs once
per element *mount*: re-rendering a bar that is already on screen does not replay
it. A bar that fills on every render teaches the reader to ignore it, and the
version of this that used state would have needed a flag per bar to avoid
exactly that.

**The number beside a bar is not animated at all.** The value is a measurement,
and a number that animates into place is a number someone waits for instead of
reading. The fill moves; the figure is correct and legible from the first frame,
and `aria-label` carries it before anything has moved.

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
