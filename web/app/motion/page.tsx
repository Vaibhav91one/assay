'use client';

import { notFound } from 'next/navigation';
import { useState } from 'react';
import { Check, EyeOff, KeyRound, Plus, RefreshCw, Split, Trash2 } from 'lucide-react';

import { Collapse } from '@/components/motion/collapse';
import { useGlide } from '@/components/motion/glide';
import { Equaliser, Shimmer, Spinner } from '@/components/motion/shimmer';
import { Stagger } from '@/components/motion/stagger';
import { usePrefersReducedMotion } from '@/lib/motion';

import { Button, actionVariants, type ActionVariant } from '@/components/button';
import { Bar } from '@/components/bar';
import { Copy } from '@/components/copy';
import { Disclosure } from '@/components/disclosure';
import { Empty } from '@/components/empty';
import { Working } from '@/components/loading';
import { FilterMenu } from '@/components/filter-menu';
import { Notifications } from '@/components/notifications';
import { RunStrip, type Bar as RunBar } from '@/components/run-strip';
import { StatusLine } from '@/components/status-line';
import { Toast, TOAST_BUTTON } from '@/components/toast';
import type { Notice } from '@/lib/notifications';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

/**
 * Every component the app draws, on one page, rendered from the module the app
 * imports.
 *
 * The rule this page lives or dies by: nothing here is re-implemented. Each
 * thing below is the real export from the real file, so a change made because
 * of what this page showed is a change to the product, and a drift between this
 * page and the product is impossible rather than merely unlikely. A gallery of
 * look-alikes would be worse than no gallery -- it would start lying the first
 * week and nobody would know which half to believe.
 *
 * Dev only. There is no link to it and it is not a product surface.
 *
 * Turn the OS reduced-motion setting on and reload: the banner flips, the
 * shimmer becomes plain text, the equaliser bars stop at a legible height, and
 * every popover, collapse and press below arrives without moving. That last
 * clause is the one worth re-checking after adding a section -- the guard in
 * `motion.css` is a `*` selector precisely so a new section cannot escape it,
 * but "cannot" is a claim, and this page is where it is looked at.
 */

/**
 * A fixture, not a feed. `Notifications` reads real rows in the product; these
 * four are written here so the panel can be looked at without a database and
 * without the page ever implying a live count. Nothing on this route queries
 * anything.
 */
const SAMPLE: Notice[] = [
  {
    id: 'fixture-1',
    kind: 'held',
    text: 'price on shop.example held — the selector it read stopped resolving',
    href: '/fields?show=held',
    at: new Date(Date.now() - 4 * 60_000),
    outstanding: true,
  },
  {
    id: 'fixture-2',
    kind: 'break',
    text: 'availability stopped matching its baseline at run 118',
    href: '/runs',
    at: new Date(Date.now() - 52 * 60_000),
    outstanding: true,
  },
  {
    id: 'fixture-3',
    kind: 'undelivered',
    text: 'the webhook for shop.example returned 502 and was not retried',
    href: '/settings',
    at: null,
    outstanding: true,
  },
  {
    id: 'fixture-4',
    kind: 'healed',
    text: 'sku recovered on its own at run 121',
    href: '/runs',
    at: new Date(Date.now() - 26 * 60 * 60_000),
    outstanding: false,
  },
];

const FILTERS = [
  { value: 'all', href: '#filter-menu', label: 'Everything' },
  { value: 'waiting', href: '#filter-menu', label: 'Waiting on you', tone: 'var(--semantic-warning)' },
  { value: 'held', href: '#filter-menu', label: 'Held', tone: 'var(--semantic-danger)' },
  { value: 'clean', href: '#filter-menu', label: 'Clean', tone: 'var(--semantic-success)' },
];

const SECTIONS = [
  ['buttons', 'Buttons'],
  ['button-states', 'Button states'],
  ['overlays', 'Overlays'],
  ['status', 'Status and surfaces'],
  ['unadopted', 'Unadopted'],
  ['shimmer', 'Shimmer, spinner, equaliser'],
  ['collapse', 'Collapse'],
  ['glide', 'Glide'],
  ['stagger', 'Stagger'],
  ['press', 'Press'],
] as const;

/** Every variant, with the one call site that made it a variant. */
const VARIANTS: [ActionVariant, string][] = [
  ['outline', 'Settings, Activity, Check again, a filter'],
  ['primary', 'New scrape. One per screen, never two'],
  ['link', 'Open the decisions'],
  ['success', 'Use this'],
  ['chip', 'a command you are meant to copy'],
  ['quiet', 'Leave this field empty'],
  ['icon', 'a verb with no room for its word'],
];

export default function MotionPage() {
  const reduced = usePrefersReducedMotion();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const rows = ['price', 'title', 'availability', 'sku'];
  const glide = useGlide<HTMLButtonElement>(active, rows.length);

  // 404 in production -- a playground is not a product surface. Below the
  // hooks, not above them: NODE_ENV is fixed for any given build, but a
  // conditional return before a hook is a shape nobody should have to
  // think twice about.
  if (process.env.NODE_ENV === 'production') notFound();

  return (
    <main className="mx-auto flex max-w-[1080px] flex-col gap-[40px] p-[48px]">
      {/*
        Hover and focus cannot be photographed and cannot be reached without a
        pointer and a Tab key, so the states row below forces them. Only two
        declarations, and both name the same tokens the component's own
        `hover:` and `focus-visible:` utilities name -- a duplicated token
        reference, never a duplicated pixel. If these ever stop matching what
        the real control does, that is a bug in this block, not in the control.
      */}
      <style>{`
        .force-hover [data-slot='action']:not([data-variant='primary']):not([data-variant='link']):not([data-variant='success']) { background: var(--surface-subtle); }
        .force-hover [data-slot='action'][data-variant='quiet'] { background: none; text-decoration: underline; }
        .force-focus [data-slot='action'] { outline: 2px solid var(--semantic-link); outline-offset: 2px; }
      `}</style>

      <header className="flex flex-col gap-[10px]">
        <h1 className="title-22">Components</h1>
        <p className="meta-13 text-[var(--text-secondary)]">
          Every one below is imported from the module the app imports. Changing something here
          changes it on every screen. prefers-reduced-motion is currently{' '}
          <strong className="text-[var(--text-primary)]">{reduced ? 'on' : 'off'}</strong>.
        </p>
        <nav className="flex flex-wrap gap-x-[14px] gap-y-[4px] pt-[6px]">
          {SECTIONS.map(([id, title]) => (
            <a
              key={id}
              href={`#${id}`}
              className="meta-12_5 text-[var(--semantic-link)] hover:underline"
            >
              {title}
            </a>
          ))}
        </nav>
      </header>

      <Section
        id="buttons"
        title="Buttons"
        note="Seven variants, from components/button.tsx. Each one exists because the product has it; there is no size axis because no family has two sizes."
      >
        <div className="flex flex-col gap-[14px]">
          {VARIANTS.map(([variant, where]) => (
            <div key={variant} className="flex items-center gap-[16px]">
              <span className="mono-value-12_5 w-[70px] shrink-0 text-[var(--text-muted)]">
                {variant}
              </span>
              <span className="w-[220px] shrink-0">
                <Sample variant={variant} />
              </span>
              <span className="meta-12_5 text-[var(--text-secondary)]">{where}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section
        id="button-states"
        title="Button states"
        note="Every state a control actually reaches. Hover and focus are forced in the first two columns so they can be seen at once; the last three are live — point at them, Tab to them, hold them down."
      >
        <div className="flex flex-col gap-[18px]">
          {(['outline', 'primary', 'quiet', 'icon'] as ActionVariant[]).map((variant) => (
            // A grid rather than flex-wrap, so the six state labels line up into
            // columns down the whole table instead of re-flowing per row.
            <div
              key={variant}
              className="grid grid-cols-[76px_repeat(6,minmax(0,1fr))] items-start gap-[12px]"
            >
              <span className="mono-value-12_5 pt-[18px] text-[var(--text-muted)]">{variant}</span>
              <State label="default">
                <Sample variant={variant} />
              </State>
              <State label="hover (forced)">
                <span className="force-hover">
                  <Sample variant={variant} />
                </span>
              </State>
              <State label="focus (forced)">
                <span className="force-focus">
                  <Sample variant={variant} />
                </span>
              </State>
              <State label="press · hold it">
                <Sample variant={variant} />
              </State>
              <State label="disabled">
                <Sample variant={variant} disabled />
              </State>
              <State label="loading">
                <Sample variant={variant} loading />
              </State>
            </div>
          ))}

          <p className="meta-12_5 text-[var(--text-secondary)]">
            Loading disables as well as marks, because a control that can be pressed twice is a
            control that will be. It carries <span className="mono-value-12_5">aria-busy</span> and
            swaps its glyph for the real <span className="mono-value-12_5">Spinner</span> — the
            same one the rest of the app uses, so it slows down under reduced motion with
            everything else.
          </p>

          <div className="flex items-center gap-[12px]">
            <Button onClick={() => setLoading((v) => !v)} icon={RefreshCw} iconSize={14}>
              {loading ? 'Stop' : 'Run one for real'}
            </Button>
            <Button variant="primary" icon={Plus} loading={loading}>
              New scrape
            </Button>
          </div>

          <Labelled
            label="The icon swap — point at any of these"
            note="A button with a glyph on the left clips its own contents. On hover the row slides one icon-slot left, the glyph leaves through the left edge as it fades, and a second copy of the same glyph arrives from beyond the right edge into the space the label vacated. Nothing changes width: the arriving copy cancels its own footprint, so the button measures the same hovered as not. Sweep in and out quickly — these are transitions, so each piece reverses from wherever it had got to rather than replaying forward, and there is no way to strand a glyph half way."
          >
            <div className="flex flex-wrap items-center gap-[12px]">
              <Sample variant="outline" />
              <Sample variant="primary" />
              <Sample variant="link" />
              <Sample variant="success" />
              <Sample variant="quiet" icon={Plus} />
            </div>
          </Labelled>

          <Labelled
            label="…and the three it deliberately skips"
            note="No left glyph to send anywhere, a glyph that IS the whole button, and a glyph that is currently saying something. The swap is a condition on the render — a left icon, a label, and not loading — rather than a list of variants, because whether a button carries a glyph is a fact about the call site and not about the family."
          >
            <div className="flex flex-wrap items-center gap-[12px]">
              <Sample variant="chip" />
              <Sample variant="icon" />
              <Sample variant="outline" loading />
            </div>
          </Labelled>

          <Labelled
            label="Focus — Tab into these"
            note="Not the browser's outline. A hairline in the surface colour so the ring never touches the control, then the brand ring outside it, following the control's own radius. Orange rather than link blue for a measured reason: #2563eb clears 3:1 on the white card and only 2.4:1 on the near-black rail, and a ring legible on one of two surfaces is not a ring. #ff4d00 clears it on both. :focus-visible only, so clicking one of these with a mouse draws nothing."
          >
            <div className="flex flex-wrap items-center gap-[12px]">
              <Sample variant="outline" />
              <Sample variant="primary" />
              <Sample variant="quiet" />
              <Sample variant="icon" />
              <span className="rounded-[var(--radius-control)] bg-[var(--bg-sidebar)] p-[10px]">
                <Sample variant="primary" />
              </span>
            </div>
          </Labelled>

          <Labelled
            label="The edge light — one button in the product wears this"
            note="The real `New scrape` from the rail, on its real dark surface. A 90° wedge travelling around a 1.5px rim: one registered @property angle and one pseudo-element, where the MagicUI original nests five divs and a container query to draw the same picture. It is pointer-events: none, so press, focus, disabled and loading underneath are the ordinary primary button they always were — and under reduced motion it is not drawn at all, leaving exactly that. Dial it with --duration-orbit, --shimmer-spread and --shimmer-cut."
          >
            <div className="flex flex-wrap items-center gap-[16px]">
              <span className="rounded-[var(--radius-card)] bg-[var(--bg-sidebar)] p-[20px]">
                <button
                  type="button"
                  className={actionVariants({
                    variant: 'primary',
                    className: 'shimmer-edge relative w-[196px] justify-center',
                  })}
                >
                  <Plus size={16} strokeWidth={2} className="shrink-0" aria-hidden />
                  New scrape
                </button>
              </span>
              <span className="rounded-[var(--radius-card)] bg-[var(--bg-sidebar)] p-[20px]">
                <button
                  type="button"
                  disabled
                  className={actionVariants({
                    variant: 'primary',
                    className: 'shimmer-edge relative w-[196px] justify-center',
                  })}
                >
                  <Plus size={16} strokeWidth={2} className="shrink-0" aria-hidden />
                  New scrape
                </button>
              </span>
            </div>
          </Labelled>
        </div>
      </Section>

      <Section
        id="overlays"
        title="Overlays"
        note="The family that is hardest to get right and easiest to break. Each one opens on --duration-pop out of the corner it grew from and closes back into it on --duration-dismiss, quicker than it came — open one and press Escape to watch it go. They share one class, `motion-popup`, so a popover, a menu and a tooltip cannot end up leaving the screen three different ways."
      >
        <div className="flex flex-col gap-[24px]">
          <Labelled
            label="Notifications — three waiting"
            note="The real dropdown, fed four fixture rows, and the trigger is now the bell alone with a dot at its corner. The dot means OUTSTANDING and nothing else: it goes when the work is done, never because someone opened the panel. Losing the word costs a screen reader nothing — the aria-label still reads `Activity, 3 waiting on you`, in full, and the tooltip fires on keyboard focus as well as on hover."
          >
            <Notifications items={SAMPLE} count={SAMPLE.filter((n) => n.outstanding).length} />
          </Labelled>

          <Labelled
            label="Notifications — nothing waiting, so no dot"
            note="Not a failure and not a spinner: the query ran and the answer is none. No dot, and the label reads `Activity, nothing waiting on you`."
          >
            <Notifications items={[]} count={0} />
          </Labelled>

          <Labelled
            label="Disclosure — the popover idiom"
            note="Evidence that supports a decision without being the decision."
          >
            <Disclosure label="the full record">
              <p className="body-13_5 text-[var(--text-secondary)]">
                Whatever the caller puts here. Capped at 360px wide and 60vh tall, because past
                that it has stopped being a disclosure and become a screen someone should have
                designed.
              </p>
            </Disclosure>
          </Labelled>

          <Labelled
            id="filter-menu"
            label="FilterMenu — the Base UI menu"
            note="Each item is a real link, so the filter lives in the URL and the server does the filtering. The options here point back at this section."
          >
            <FilterMenu options={FILTERS} current="waiting" />
          </Labelled>

          <Labelled
            label="Tooltip"
            note="Base UI, on the dark rail surface. The sidebar uses it to name an icon once the rail is collapsed."
          >
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger className={actionVariants({ variant: 'icon' })} aria-label="Delete">
                  <Trash2 size={15} strokeWidth={1.5} aria-hidden />
                </TooltipTrigger>
                <TooltipContent side="right">Delete this scraper</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </Labelled>

          <Labelled
            label="Dialog"
            note="components/ui/dialog.tsx, Radix, still in shadcn's own palette — see Unadopted below. It is shown as it is rather than dressed up, because a gallery that flatters a component is how the component stays wrong."
          >
            <Dialog>
              <DialogTrigger className={actionVariants({ variant: 'outline' })}>
                Open a dialog
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Stop watching this field?</DialogTitle>
                  <DialogDescription>
                    Its baseline is kept, so starting again later does not re-read the page.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <DialogClose className={actionVariants({ variant: 'quiet' })}>Cancel</DialogClose>
                  <DialogClose className={actionVariants({ variant: 'success' })}>
                    <EyeOff size={16} strokeWidth={1.5} aria-hidden />
                    Stop watching
                  </DialogClose>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </Labelled>

          <Labelled
            label="Toast"
            note="A receipt, after the fact — never a question and never a blocking error. role=status, so a reader hears it politely rather than mid-sentence."
          >
            {/*
              `Toast` is `position: fixed` to the viewport bottom, which is right
              in the product and useless in a gallery -- both specimens would
              land on the same spot over the footer. A transform on an ancestor
              makes a fixed descendant resolve against that ancestor instead, so
              each one gets its OWN transformed box: nesting them in a single box
              stacks them again, because the inner `fixed` ignores an ordinary
              wrapper. Nothing about the component changes.
            */}
            <div className="flex flex-col gap-[8px]">
              <div className="relative h-[64px] w-full [transform:translateZ(0)]">
                <Toast message="Command copied" />
              </div>
              <div className="relative h-[64px] w-full [transform:translateZ(0)]">
                <Toast
                  variant="error"
                  message="The browser would not give up the clipboard."
                  action={
                    <button type="button" className={`${TOAST_BUTTON} meta-13 text-[var(--text-inverse)]`}>
                      Undo
                    </button>
                  }
                />
              </div>
            </div>
          </Labelled>

          <Labelled
            label="Copy — a button that produces a toast"
            note="Press it. The receipt names what was copied, because 'Copied' alone leaves the reader guessing which of three controls they hit."
          >
            <Copy
              text="claude setup-token"
              receipt="Command copied"
              className={actionVariants({ variant: 'chip' })}
            >
              claude setup-token
            </Copy>
          </Labelled>
        </div>
      </Section>

      <Section
        id="status"
        title="Status and surfaces"
        note="The quiet half. None of these takes focus and none of them animates, which is the point — a number that animates in is a number someone waits for instead of reading."
      >
        <div className="flex flex-col gap-[20px]">
          <Labelled label="StatusLine" note="Colour and glyph always agree; severity is read off the pair, never off a fill.">
            <div className="flex flex-col gap-[8px]">
              <StatusLine tone="info">3 runs skipped, nothing changed</StatusLine>
              <StatusLine tone="success">clean</StatusLine>
              <StatusLine tone="success" muted>
                clean, and quiet about it
              </StatusLine>
              <StatusLine tone="warning">price held at run 118</StatusLine>
              <StatusLine tone="danger">the webhook returned 502</StatusLine>
              <StatusLine tone="motion">next run in 40 minutes</StatusLine>
            </div>
          </Labelled>

          <Labelled label="Empty" note="The settled state: the query ran and the answer is none.">
            <Empty title="No decisions are waiting">
              Held cells land here the moment the gate refuses one.
            </Empty>
          </Labelled>

          <Labelled label="Bar" note="A proportion with a real denominator. Zero draws no fill at all — a zero that looks like a one is the error this product exists to refuse.">
            <div className="flex items-center gap-[16px]">
              {([[0, 60], [1, 60], [22, 60], [60, 60]] as const).map(([v, of]) => (
                <span key={v} className="flex items-center gap-[8px]">
                  <Bar value={v} of={of} />
                  <span className="caption-11 text-[var(--text-muted)]">
                    {v}/{of}
                  </span>
                </span>
              ))}
            </div>
          </Labelled>

          <Labelled
            label="RunStrip"
            note="One bar per run, oldest left. A run that held something is taller and amber, so it is findable in a row of sixty. Point at one, then Tab through them: every bar is a real link to its own run, its accessible name is the whole sentence so a screen reader never needs the hover, and the hit target is 8px wide against a 3px bar — which is the pitch the gaps already made, so the strip lands on the same pixels it always did."
          >
            <RunStrip
              bars={Array.from(
                { length: 24 },
                (_, i): RunBar => ({
                  runId: 100 + i,
                  held: i === 7 || i === 18,
                  // A fixture, and shaped like the real row rather than like a
                  // convenient one: `runsView` supplies all four of these, so
                  // the strip here says what it says on /runs.
                  at: new Date(Date.now() - (23 - i) * 3 * 3_600_000),
                  scraper: 'shop.example',
                  outcome: i === 7 || i === 18 ? 'held' : i === 3 ? 'healed' : 'clean',
                  heldField: i === 7 ? 'price' : i === 18 ? 'availability' : null,
                }),
              )}
              label="LAST 24 RUNS"
              from="run 100"
              to="run 123"
            />
          </Labelled>

          <Labelled
            label="RunStrip — the thinner row home has"
            note="`homeStats` knows the run, when it happened and whether anything was held, and does not compute a three-way outcome. So a quiet bar here says `nothing held` rather than `clean`: a run with no quarantined cell may still have healed a selector, and the strip says only what was measured."
          >
            <RunStrip
              bars={Array.from({ length: 12 }, (_, i) => ({
                runId: 200 + i,
                held: i === 9,
                at: new Date(Date.now() - (11 - i) * 6 * 3_600_000),
              }))}
            />
          </Labelled>
        </div>
      </Section>

      <Section
        id="unadopted"
        title="Unadopted"
        note="Real modules in web/components/ui that no screen imports. They are here so the page is honest about the shelf rather than only about the product — they render in shadcn's palette because nobody has bent them to ours."
      >
        <div className="flex flex-col gap-[16px]">
          <p className="meta-12_5 text-[var(--text-secondary)]">
            <span className="mono-value-12_5">ui/badge</span>,{' '}
            <span className="mono-value-12_5">ui/card</span> and{' '}
            <span className="mono-value-12_5">ui/dialog</span> have zero importers. Most of the
            rest of <span className="mono-value-12_5">ui/</span> is alive only through{' '}
            <span className="mono-value-12_5">ui/sidebar</span>:{' '}
            <span className="mono-value-12_5">ui/button</span> in particular is on every screen,
            because <span className="mono-value-12_5">SidebarTrigger</span> is one and the top bar
            draws it. That is why the product&rsquo;s buttons got their own file instead of taking
            this one over. <span className="mono-value-12_5">ui/sheet</span> is the one that got out:
            it was moved from Radix to Base UI and the proof sheet is drawn with it, so it is a
            product component now rather than a shelf one.
          </p>

          <div className="flex items-center gap-[10px]">
            <Badge>default</Badge>
            <Badge variant="secondary">secondary</Badge>
            <Badge variant="destructive">destructive</Badge>
            <Badge variant="outline">outline</Badge>
          </div>

          <Card className="max-w-[380px]">
            <CardHeader>
              <CardTitle>ui/card</CardTitle>
              <CardDescription>Zero importers. The app uses hand-written surfaces.</CardDescription>
            </CardHeader>
            <CardContent>
              <Input placeholder="ui/input — alive only inside ui/sidebar" />
            </CardContent>
          </Card>
        </div>
      </Section>

      <Section
        id="shimmer"
        title="Shimmer, spinner, equaliser"
        note="The three ways to say work is happening."
      >
        <div className="flex flex-col gap-[12px]">
          <Shimmer className="body-14">Healing 3 selectors</Shimmer>
          <p className="body-14 flex items-center gap-[8px]">
            <Spinner />
            Reading the page
          </p>
          <p className="body-14 flex items-center gap-[8px]">
            <Equaliser />
            Listening
          </p>
          <Working>Checking</Working>
          <p className="meta-12_5 text-[var(--text-secondary)]">
            <span className="mono-value-12_5">Working</span> is the in-place form, from{' '}
            <span className="mono-value-12_5">components/loading.tsx</span>.{' '}
            <span className="mono-value-12_5">RouteLoader</span> is deliberately not on this page:
            it only appears after a delay on a real navigation and holds a minimum before fading,
            so a static specimen of it would be a picture of a thing that never sits still. See
            docs/MOTION.md.
          </p>
        </div>
      </Section>

      <Section id="collapse" title="Collapse" note="0fr to 1fr. No measurement, no fixed height.">
        <Button variant="quiet" onClick={() => setOpen(!open)} className="text-[var(--semantic-link)]">
          the full record ›
        </Button>
        <Collapse open={open} contentClassName="pt-[10px]">
          <p className="body-13_5 text-[var(--text-secondary)]">
            Two paragraphs, so the height it opens to is not the height of one line. The wrapper
            never learns this number; the grid row does.
          </p>
          <p className="body-13_5 pt-[10px] text-[var(--text-secondary)]">
            Padding sits on the clipped child. A margin here would escape the clip and the row
            would jump on open.
          </p>
        </Collapse>
      </Section>

      <Section
        id="glide"
        title="Glide"
        note="Hover the rows. One band travels; it does not flash in at mount."
      >
        <div className="relative" onMouseLeave={() => setActive(null)}>
          <span
            aria-hidden
            className="absolute inset-x-0 rounded-[var(--radius-control)] bg-[var(--surface-subtle)]"
            style={glide.style}
          />
          {rows.map((row, i) => (
            <button
              key={row}
              type="button"
              ref={glide.setRef(i)}
              onMouseEnter={() => setActive(i)}
              className="press-row body-14 relative block w-full cursor-pointer px-[12px] py-[9px] text-left"
            >
              {row}
            </button>
          ))}
        </div>
      </Section>

      <Section id="stagger" title="Stagger" note="90ms apart. Reload to replay.">
        <Stagger className="flex flex-col gap-[8px]">
          {['first', 'second', 'third', 'fourth'].map((n) => (
            <span key={n} className="body-14 text-[var(--text-secondary)]">
              {n}
            </span>
          ))}
        </Stagger>
      </Section>

      <Section
        id="press"
        title="Press"
        note="Hold each one down. Three scales, because the same movement on a 24px icon and a 320px button are not the same gesture — and every variant above already carries the right one."
      >
        <div className="flex items-center gap-[12px]">
          <Button variant="icon" icon={RefreshCw} aria-label="Run again" />
          <Button variant="outline" icon={KeyRound}>
            press-row
          </Button>
          <Button variant="primary" icon={Plus}>
            press-wide
          </Button>
        </div>
      </Section>
    </main>
  );
}

/**
 * One button per variant, with the label and glyph that variant really carries.
 * A single place to change so the states grid and the variants list cannot
 * disagree about what a variant looks like.
 */
function Sample({
  variant,
  ...props
}: { variant: ActionVariant } & React.ComponentProps<typeof Button>) {
  switch (variant) {
    case 'primary':
      return <Button variant="primary" icon={Plus} {...props}>New scrape</Button>;
    case 'link':
      return <Button variant="link" icon={Split} {...props}>Open the decisions</Button>;
    case 'success':
      // `Check`, which is what decision-card.tsx really draws on Use this. It
      // was `Scale` here and nowhere else -- a gallery that invents a glyph is
      // a gallery that has started lying, which is the one thing this page
      // cannot do.
      return <Button variant="success" icon={Check} iconSize={16} {...props}>Use this</Button>;
    case 'chip':
      return <Button variant="chip" {...props}>claude setup-token</Button>;
    case 'quiet':
      return <Button variant="quiet" {...props}>Leave this field empty</Button>;
    case 'icon':
      return <Button variant="icon" icon={RefreshCw} aria-label="Run again" {...props} />;
    default:
      return <Button variant="outline" icon={RefreshCw} iconSize={14} {...props}>Check again</Button>;
  }
}

function State({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span className="flex flex-col items-start gap-[6px]">
      <span className="caption-11 text-[var(--text-muted)]">{label}</span>
      {children}
    </span>
  );
}

function Labelled({
  id,
  label,
  note,
  children,
}: {
  id?: string;
  label: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <div id={id} className="flex flex-col gap-[8px]">
      <p className="meta-13 text-[var(--text-primary)]">{label}</p>
      {note && <p className="meta-12_5 max-w-[620px] text-[var(--text-secondary)]">{note}</p>}
      <div className="pt-[4px]">{children}</div>
    </div>
  );
}

function Section({
  id,
  title,
  note,
  children,
}: {
  id: string;
  title: string;
  note: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className="flex scroll-mt-[24px] flex-col gap-[10px] border-t border-[var(--border-hairline)] pt-[20px]"
    >
      <h2 className="label-10_5 uppercase text-[var(--text-muted)]">{title}</h2>
      <p className="meta-12_5 max-w-[620px] text-[var(--text-secondary)]">{note}</p>
      <div className="pt-[6px]">{children}</div>
    </section>
  );
}
