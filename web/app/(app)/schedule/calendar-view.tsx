'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Menu } from '@base-ui/react/menu';
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Search, X } from 'lucide-react';
import { Collapse } from '@/components/motion/collapse';
import { Stagger } from '@/components/motion/stagger';
import { useGlide } from '@/components/motion/glide';
import { Empty } from '@/components/empty';
import { ProofSheet } from '@/components/proof-sheet';
import { actionVariants } from '@/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { stamp, when } from '@/lib/when';
import { t } from '@/lib/copy';
import { HeldCell } from '../schema-table';
import { RunNow } from './run-now';
import { ScraperLifecycle } from '../fields/scraper-lifecycle';
import type { CalendarData, Cell, Clock, RanEntry } from './data';
import {
  VIEWS,
  addDays,
  bucketByDay,
  dayKey,
  daysFor,
  groupRuns,
  projectRuns,
  sameDay,
  startOfDay,
  step,
  summariseGroup,
  titleFor,
  untilText,
  type Outcome,
  type RunGroup,
  type ViewKind,
} from './calendar';

/**
 * The schedule as a calendar.
 *
 * THREE KINDS OF MARK, AND THE DIFFERENCE BETWEEN THEM IS THE SCREEN.
 *
 *   ran        a run that happened. Filled, coloured by what it decided.
 *   next       `targets.next_run_at` -- the single future run Assay records.
 *              Ringed, in the accent, because it is coming and it is a fact.
 *   projected  the cadence, continued. Ringed AND DASHED, muted, and the
 *              legend says in words that it is not stored.
 *
 * A calendar that painted thirty future runs the same as thirty past ones
 * would be claiming a month of certainty out of one database column. This
 * product publishes its wrong-value rate rather than do that, so the third
 * mark is drawn differently, labelled differently in its dialog, and counted
 * separately in every cell it appears in.
 *
 * IN THE GRIDS, RUNS ARE GROUPED BY SCRAPER. A backfill puts thirty runs in
 * one minute and a 6h cadence puts four in a day; thirty marks differing only
 * in a run id is a cell nobody reads, and the one held run in it disappears.
 * The group takes the most serious outcome present, never the most common one.
 * Only what HAPPENED is grouped -- the stored next run keeps its own mark, and
 * projections keep their own counted line, because blurring those together is
 * exactly the claim this screen exists not to make.
 *
 * The reference this was built from is a general event calendar -- categories,
 * colours, attendees, create and delete. None of those exist here. A run is an
 * instant with an outcome, not a block with a duration, so there is no hour
 * grid: an empty 14:00 row would imply Assay knows a run occupies an hour, and
 * it does not record a duration at all.
 */

/** A run, with its timestamp parsed once. */
export type Ran = Omit<RanEntry, 'at' | 'outcome'> & { at: Date; outcome: Outcome };

type Mark =
  | { kind: 'ran'; at: Date; run: Ran }
  | { kind: 'next'; at: Date; clock: Clock }
  | { kind: 'projected'; at: Date; clock: Clock };

/** What a grid cell draws: groups of what happened, then what is coming. */
type Item =
  | { kind: 'group'; at: Date; group: RunGroup<Ran> }
  | { kind: 'next'; at: Date; clock: Clock }
  | { kind: 'projected'; at: Date; clock: Clock };

const ALL = '__all__';

/** Per scraper, per window. An hourly cadence over six weeks is 1,008 dots. */
const PROJECTION_CAP = 200;

const markScraper = (m: Mark) => (m.kind === 'ran' ? m.run.scraper : m.clock.scraper);
const itemScraper = (i: Item) => (i.kind === 'group' ? i.group.scraper : i.clock.scraper);

const TONE: Record<Outcome, string> = {
  // Amber for held, never red: the gate declined to guess. Nothing broke.
  held: 'var(--semantic-warning)',
  healed: 'var(--semantic-success)',
  // Most runs are clean. A wall of green at the same weight as a held cell is
  // how a held cell gets missed -- the same reasoning `/runs` uses.
  clean: 'var(--text-muted)',
};

const SAID: Record<Outcome, string> = {
  held: t('schedule.said.held'),
  healed: t('schedule.said.healed'),
  clean: t('schedule.said.clean'),
};

export function CalendarView({
  data,
  initialView = 'list',
}: {
  data: CalendarData;
  /** Seeded from `?view=`; every switch after that is client state. */
  initialView?: ViewKind;
}) {
  const now = useMemo(() => new Date(data.now), [data.now]);
  const earliest = useMemo(() => (data.earliest ? new Date(data.earliest) : null), [data.earliest]);

  const [view, setView] = useState<ViewKind>(initialView);
  const [anchor, setAnchor] = useState<Date>(() => startOfDay(now));
  const [query, setQuery] = useState('');
  const [scraper, setScraper] = useState(ALL);
  const [field, setField] = useState(ALL);
  const [outcome, setOutcome] = useState(ALL);
  const [open, setOpen] = useState<Mark | Item | null>(null);

  const runs: Ran[] = useMemo(
    () => data.runs.map((r) => ({ ...r, at: new Date(r.at), outcome: r.outcome as Outcome })),
    [data.runs],
  );

  const scrapers = useMemo(
    () => [...new Set([...data.clocks.map((c) => c.scraper), ...data.runs.map((r) => r.scraper)])].sort(),
    [data.clocks, data.runs],
  );
  const fields = useMemo(() => {
    const seen = new Set<string>();
    for (const r of data.runs) for (const c of r.cells) seen.add(c.field);
    for (const c of data.clocks) for (const t of c.targetIds) {
      const f = t.split('__')[1];
      if (f) seen.add(f);
    }
    return [...seen].sort();
  }, [data.runs, data.clocks]);

  // An outcome filter is a question only a run that happened can answer. So it
  // hides the future rather than pretending `next_run_at` came out clean --
  // and the active-filter row below says that is what it did.
  const hidesFuture = outcome !== ALL;

  const days = useMemo(() => daysFor(view, anchor), [view, anchor]);
  const from = view === 'list' ? (earliest ?? now) : days[0]!;
  const to = view === 'list' ? addDays(startOfDay(now), 366) : addDays(days[days.length - 1]!, 1);

  const keep = useCallback(
    (m: Mark) => {
      if (scraper !== ALL && markScraper(m) !== scraper) return false;
      if (field !== ALL) {
        const has = m.kind === 'ran'
          ? m.run.cells.some((c) => c.field === field)
          : m.clock.targetIds.some((t) => t.split('__')[1] === field);
        if (!has) return false;
      }
      if (m.kind === 'ran') {
        if (outcome !== ALL && m.run.outcome !== outcome) return false;
        if (query && !matches(m.run, query)) return false;
        return true;
      }
      if (hidesFuture) return false;
      return !query || m.clock.scraper.toLowerCase().includes(query.toLowerCase());
    },
    [scraper, field, outcome, query, hidesFuture],
  );

  const marks = useMemo(() => {
    const out: Mark[] = [];
    for (const r of runs) {
      if (view !== 'list' && (r.at < from || r.at >= to)) continue;
      out.push({ kind: 'ran', at: r.at, run: r });
    }
    // Never behind `now`: a projection drawn in the past is a claim about a
    // run that either happened (and is already above) or did not.
    const floor = new Date(Math.max(from.getTime(), now.getTime()));
    for (const c of data.clocks) {
      if (c.paused || !c.nextRunAt) continue;
      const next = new Date(c.nextRunAt);
      if (next >= from && next < to) out.push({ kind: 'next', at: next, clock: c });
      // The list carries the stored next run -- one row per scraper, at the
      // top of a newest-first list, which is where "and what is coming" goes.
      // It does not carry projections: a hundred rows that are all arithmetic
      // would drown the runs the list exists to show.
      if (view === 'list') continue;
      for (const at of projectRuns(next, c.cadenceMs, floor, to, PROJECTION_CAP)) {
        out.push({ kind: 'projected', at, clock: c });
      }
    }
    return out.filter(keep).sort((a, b) => a.at.getTime() - b.at.getTime());
  }, [runs, data.clocks, view, from, to, now, keep]);

  /** Day buckets of grouped items -- what the three grid views draw. */
  const byDay = useMemo(() => {
    const out = new Map<string, Item[]>();
    for (const [key, dayMarks] of bucketByDay(marks)) {
      const ran = dayMarks.filter((m): m is Extract<Mark, { kind: 'ran' }> => m.kind === 'ran');
      const items: Item[] = groupRuns(ran.map((m) => m.run)).map((g) => ({
        kind: 'group', at: g.at, group: g,
      }));
      for (const m of dayMarks) {
        if (m.kind !== 'ran') items.push(m);
      }
      out.set(key, items.sort((a, b) => a.at.getTime() - b.at.getTime()));
    }
    return out;
  }, [marks]);

  const showsProjections = view !== 'list' && marks.some((m) => m.kind === 'projected');
  const showsGroups = view !== 'list' && marks.some((m) => m.kind === 'ran');

  // An install with no scrapers at all gets the card and not the grid. Six
  // weeks of ruled empty cells is an empty table pretending to be a quiet
  // month, and the one thing every empty state in this product must not do is
  // look like a normal reading.
  const nothingAtAll = data.runs.length === 0 && data.clocks.length === 0;

  const filtered = scraper !== ALL || field !== ALL || outcome !== ALL || query !== '';
  const clear = () => { setScraper(ALL); setField(ALL); setOutcome(ALL); setQuery(''); };

  const drillTo = (day: Date) => { setAnchor(startOfDay(day)); setView('day'); };

  return (
    <div className="flex w-full flex-col gap-[16px]">
      <Header
        view={view}
        anchor={anchor}
        earliest={earliest}
        now={now}
        onView={setView}
        onAnchor={setAnchor}
      />

      <Controls
        query={query} onQuery={setQuery}
        scraper={scraper} onScraper={setScraper} scrapers={scrapers}
        field={field} onField={setField} fields={fields}
        outcome={outcome} onOutcome={setOutcome}
      />

      <Collapse open={filtered} contentClassName="pb-[2px]">
        <ActiveFilters
          query={query} scraper={scraper} field={field} outcome={outcome}
          hidesFuture={hidesFuture} count={marks.length}
          onQuery={setQuery} onScraper={setScraper} onField={setField} onOutcome={setOutcome}
          onClear={clear}
        />
      </Collapse>

      <Legend showsProjections={showsProjections} grouped={showsGroups} workers={data.workers} />

      {!nothingAtAll && view === 'month' && (
        <MonthGrid days={days} anchor={anchor} byDay={byDay} now={now} onOpen={setOpen} onDrill={drillTo} />
      )}
      {!nothingAtAll && view === 'week' && (
        <WeekColumns days={days} byDay={byDay} now={now} onOpen={setOpen} onDrill={drillTo} />
      )}
      {!nothingAtAll && view === 'day' && (
        <DayColumn day={days[0]!} byDay={byDay} now={now} onOpen={setOpen} />
      )}
      {view === 'list' && (
        <RunList marks={marks} onOpen={setOpen} capped={data.capped} earliest={earliest} />
      )}

      {marks.length === 0 && (
        <Empty title={filtered ? t('schedule.empty.filtered.title') : emptyTitle(view, data)}>
          {filtered ? t('schedule.empty.filtered.body') : emptyBody(view, data)}
        </Empty>
      )}

      <Detail entry={open} onOpen={setOpen} onClose={() => setOpen(null)} workers={data.workers} now={now} />
    </div>
  );
}

const matches = (r: Ran, q: string) => {
  const needle = q.toLowerCase();
  if (String(r.runId).includes(needle)) return true;
  if (r.scraper.toLowerCase().includes(needle)) return true;
  return r.cells.some(
    (c) =>
      c.field.toLowerCase().includes(needle) ||
      (c.value ?? '').toLowerCase().includes(needle) ||
      (c.reason ?? '').toLowerCase().includes(needle),
  );
};

const emptyTitle = (view: ViewKind, data: CalendarData) =>
  data.runs.length === 0 && data.clocks.length === 0
    ? 'Nothing is scheduled.'
    : view === 'list'
      ? 'No runs yet.'
      : 'Nothing here.';

const emptyBody = (view: ViewKind, data: CalendarData) => {
  if (data.runs.length === 0 && data.clocks.length === 0) {
    return 'A scraper takes a cadence when it is created. Until one exists there is no clock to draw.';
  }
  if (data.runs.length === 0 || view === 'list') return 'The first run happens when a scraper is due.';
  return 'No run landed in this window, and nothing is due in it either.';
};

/* ------------------------------------------------------------------ header */

function Header({
  view, anchor, earliest, now, onView, onAnchor,
}: {
  view: ViewKind;
  anchor: Date;
  earliest: Date | null;
  now: Date;
  onView: (v: ViewKind) => void;
  onAnchor: (d: Date) => void;
}) {
  const navigable = view !== 'list';
  return (
    <div className="flex w-full flex-wrap items-center gap-x-[16px] gap-y-[10px]">
      <div className="flex items-center gap-[4px]">
        <IconButton
          label={`Previous ${view}`}
          disabled={!navigable}
          onClick={() => onAnchor(step(view, anchor, -1))}
        >
          <ChevronLeft size={16} strokeWidth={1.5} aria-hidden />
        </IconButton>
        <button
          type="button"
          onClick={() => onAnchor(startOfDay(now))}
          disabled={!navigable}
          className={actionVariants({ variant: 'outline' })}
        >
          <CalendarDays size={14} strokeWidth={1.5} aria-hidden />
          {t('schedule.today')}
        </button>
        <IconButton
          label={`Next ${view}`}
          disabled={!navigable}
          onClick={() => onAnchor(step(view, anchor, 1))}
        >
          <ChevronRight size={16} strokeWidth={1.5} aria-hidden />
        </IconButton>
      </div>

      <h2 className="title-20 min-w-0 flex-1 truncate text-[var(--text-primary)]" aria-live="polite">
        {titleFor(view, anchor, earliest)}
      </h2>

      {/* Buttons where there is room; a native select where there is not.
          `<select>` needs no library, no portal and no focus trap, and it is
          the control a phone already knows how to open. */}
      <div className="hidden items-center gap-[2px] rounded-[var(--radius-control)] border border-[var(--border-default)] p-[2px] sm:flex">
        {VIEWS.map((v) => (
          <button
            key={v}
            type="button"
            aria-pressed={view === v}
            onClick={() => onView(v)}
            className={`meta-12_5 press-row rounded-[6px] px-[12px] py-[5px] capitalize transition-colors duration-[var(--duration-tint)] ${
              view === v
                ? 'bg-[var(--surface-subtle)] text-[var(--text-primary)]'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            {v}
          </button>
        ))}
      </div>
      <label className="sm:hidden">
        <span className="sr-only">{t('schedule.view')}</span>
        <select
          value={view}
          onChange={(e) => onView(e.target.value as ViewKind)}
          className="meta-12_5 h-[32px] rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-card)] px-[10px] capitalize text-[var(--text-primary)]"
        >
          {VIEWS.map((v) => (
            <option key={v} value={v}>{v}</option>
          ))}
        </select>
      </label>
    </div>
  );
}

function IconButton({
  label, onClick, disabled, children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="press-icon flex size-[32px] items-center justify-center rounded-[var(--radius-control)] border border-[var(--border-default)] text-[var(--text-primary)] transition-colors duration-[var(--duration-tint)] hover:bg-[var(--surface-subtle)] disabled:text-[var(--text-muted)]"
    >
      {children}
    </button>
  );
}

/* ----------------------------------------------------------------- filters */

function Controls({
  query, onQuery, scraper, onScraper, scrapers, field, onField, fields, outcome, onOutcome,
}: {
  query: string; onQuery: (v: string) => void;
  scraper: string; onScraper: (v: string) => void; scrapers: string[];
  field: string; onField: (v: string) => void; fields: string[];
  outcome: string; onOutcome: (v: string) => void;
}) {
  return (
    <div className="flex w-full flex-wrap items-center gap-[8px]">
      <div className="relative min-w-[200px] flex-1">
        <Search
          size={14}
          strokeWidth={1.5}
          aria-hidden
          className="pointer-events-none absolute left-[10px] top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
        />
        <input
          type="search"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder={t('schedule.search')}
          aria-label={t('schedule.searchLabel')}
          className="meta-12_5 h-[32px] w-full rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-card)] pl-[30px] pr-[10px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
        />
      </div>
      <Pick label={t('schedule.pick.scraper')} value={scraper} onChange={onScraper}
        options={[{ value: ALL, label: t('schedule.pick.everyScraper') }, ...scrapers.map((s) => ({ value: s, label: s }))]} />
      <Pick label={t('schedule.pick.field')} value={field} onChange={onField}
        options={[{ value: ALL, label: t('schedule.pick.everyField') }, ...fields.map((f) => ({ value: f, label: f }))]} />
      <Pick label={t('schedule.pick.outcome')} value={outcome} onChange={onOutcome} options={[
        { value: ALL, label: t('schedule.pick.everyOutcome') },
        { value: 'held', label: t('schedule.pick.held'), tone: 'var(--semantic-warning)' },
        { value: 'healed', label: t('schedule.pick.healed'), tone: 'var(--semantic-success)' },
        { value: 'clean', label: t('schedule.pick.clean') },
      ]} />
    </div>
  );
}

/**
 * `filter-menu.tsx` as a control rather than a set of links.
 *
 * That file's options are `<Link>`s so the filter lives in the URL and the
 * server does the filtering -- right for a table it pages through, wrong here,
 * where the whole window is already in the client and a round trip per filter
 * would make the calendar feel like it is loading. Same Base UI `Menu`, same
 * classes; the difference is `onClick` instead of `href`.
 */
function Pick({
  label, value, options, onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string; tone?: string }[];
  onChange: (v: string) => void;
}) {
  const active = options.find((o) => o.value === value) ?? options[0]!;
  return (
    <Menu.Root>
      <Menu.Trigger aria-label={label} className={actionVariants({ variant: 'outline' })}>
        <span className="truncate" style={{ color: active.tone }}>{active.label}</span>
        <ChevronDown size={12} strokeWidth={1.5} aria-hidden />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner sideOffset={6} align="start" className="z-50">
          <Menu.Popup className="motion-pop-in max-h-[320px] w-[220px] origin-[var(--transform-origin)] overflow-y-auto rounded-[10px] border border-[var(--border-default)] bg-[var(--surface-card)] p-[3px] shadow-elevation-floating">
            {options.map((o) => (
              <Menu.Item
                key={o.value}
                onClick={() => onChange(o.value)}
                className={`meta-12_5 press-row block cursor-default truncate rounded-[6px] px-[12px] py-[8px] outline-none ${
                  o.value === value ? 'bg-[var(--surface-subtle)]' : ''
                } data-highlighted:bg-[var(--surface-subtle)]`}
                style={{ color: o.tone ?? 'var(--text-secondary)' }}
              >
                {o.label}
              </Menu.Item>
            ))}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

function ActiveFilters({
  query, scraper, field, outcome, hidesFuture, count,
  onQuery, onScraper, onField, onOutcome, onClear,
}: {
  query: string; scraper: string; field: string; outcome: string;
  hidesFuture: boolean; count: number;
  onQuery: (v: string) => void; onScraper: (v: string) => void;
  onField: (v: string) => void; onOutcome: (v: string) => void; onClear: () => void;
}) {
  return (
    <div className="flex w-full flex-wrap items-center gap-[8px]">
      <span className="caption-11 text-[var(--text-muted)]">{count} shown</span>
      {query && <Chip label={`“${query}”`} onClear={() => onQuery('')} />}
      {scraper !== ALL && <Chip label={scraper} mono onClear={() => onScraper(ALL)} />}
      {field !== ALL && <Chip label={field} mono onClear={() => onField(ALL)} />}
      {outcome !== ALL && <Chip label={outcome} onClear={() => onOutcome(ALL)} />}
      <button
        type="button"
        onClick={onClear}
        className="caption-11 text-[var(--semantic-link)] underline-offset-2 hover:underline"
      >
        {t('schedule.clear')}
      </button>
      {hidesFuture && (
        // Said rather than left to be noticed: the marks did not vanish, they
        // were never eligible. A stored next run has no outcome yet.
        <span className="caption-11 basis-full text-[var(--text-secondary)]">
          Filtering by outcome hides what has not run — the next run and its projections have no
          outcome to match.
        </span>
      )}
    </div>
  );
}

function Chip({ label, mono, onClear }: { label: string; mono?: boolean; onClear: () => void }) {
  return (
    <span className="flex items-center gap-[6px] rounded-full border border-[var(--border-default)] bg-[var(--surface-subtle)] py-[3px] pl-[10px] pr-[6px]">
      <span className={`${mono ? 'mono-value-12_5' : 'caption-12'} max-w-[180px] truncate text-[var(--text-primary)]`}>
        {label}
      </span>
      <button
        type="button"
        onClick={onClear}
        aria-label={`Clear ${label}`}
        className="press-icon flex size-[15px] items-center justify-center rounded-full text-[var(--text-muted)] hover:text-[var(--text-primary)]"
      >
        <X size={11} strokeWidth={2} aria-hidden />
      </button>
    </span>
  );
}

/* ------------------------------------------------------------------ legend */

function Legend({
  showsProjections, grouped, workers,
}: {
  showsProjections: boolean;
  grouped: boolean;
  workers: number;
}) {
  return (
    <div className="flex w-full flex-col gap-[5px]">
      <p className="caption-11 flex flex-wrap items-center gap-x-[14px] gap-y-[5px] text-[var(--text-secondary)]">
        <Key tone={TONE.clean} kind="ran">{t('schedule.legend.clean')}</Key>
        <Key tone={TONE.healed} kind="ran">{t('schedule.legend.healed')}</Key>
        <Key tone={TONE.held} kind="ran">{t('schedule.legend.held')}</Key>
        <Key tone="var(--accent-brand)" kind="next">{t('schedule.legend.next')}</Key>
        <Key tone="var(--text-muted)" kind="projected">{t('schedule.legend.projected')}</Key>
      </p>
      {grouped && (
        <p className="caption-11 text-[var(--text-muted)]">
          One line per scraper per day, counting every run in it. Where a scraper&apos;s runs
          disagree the line takes the most serious of them — a day with one hold in thirty reads as
          holding one.
        </p>
      )}
      {showsProjections && (
        <p className="caption-11 max-w-[820px] text-[var(--text-muted)]">
          Assay stores one future run per scraper. Every dashed mark after it is arithmetic on the
          cadence, not a record — a run moves when the page has not changed since the last one, waits
          when no worker is consuming the queue{workers === 0 ? ' (none is right now)' : ''}, and
          stops when a scraper is paused.
        </p>
      )}
    </div>
  );
}

function Key({ tone, kind, children }: { tone: string; kind: Mark['kind']; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-[6px]">
      <Dot tone={tone} kind={kind} />
      {children}
    </span>
  );
}

/**
 * The one place the three kinds are drawn, so they cannot drift apart.
 *
 * Filled / ringed / ringed-and-dashed, which is the old lane legend's
 * "filled = ran · hollow = coming up" with the third state it was missing.
 * Shape carries the distinction as well as colour: a dashed ring survives
 * greyscale, a colourblind reader and a printed page.
 */
function Dot({ tone, kind, size = 8 }: { tone: string; kind: Mark['kind']; size?: number }) {
  return (
    <span
      aria-hidden
      className="inline-block shrink-0 rounded-full"
      style={{
        width: size,
        height: size,
        background: kind === 'ran' ? tone : 'transparent',
        border: kind === 'ran' ? undefined : `1.5px ${kind === 'projected' ? 'dashed' : 'solid'} ${tone}`,
      }}
    />
  );
}

const TIME = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' });

const itemTone = (i: Item) =>
  i.kind === 'group' ? TONE[i.group.worst] : i.kind === 'next' ? 'var(--accent-brand)' : 'var(--text-muted)';

const itemDotKind = (i: Item): Mark['kind'] => (i.kind === 'group' ? 'ran' : i.kind);

/** What an item says, in the product's words. */
function itemSaid(i: Item): string {
  if (i.kind === 'group') return summariseGroup(i.group.counts);
  if (i.kind === 'next') return `next run, stored · every ${i.clock.cadence}`;
  return `projected · every ${i.clock.cadence}, not stored`;
}

const itemKey = (i: Item) =>
  i.kind === 'group' ? `g:${i.group.scraper}` : `${i.kind}:${i.clock.scraper}:${i.at.getTime()}`;

/** One clickable row. The same shape in every grid view; only the density changes. */
function ItemRow({
  item, onOpen, tabIndex, dense,
}: {
  item: Item;
  onOpen: (i: Item) => void;
  tabIndex?: number;
  dense?: boolean;
}) {
  return (
    <button
      type="button"
      tabIndex={tabIndex}
      onClick={(e) => { e.stopPropagation(); onOpen(item); }}
      aria-label={`${TIME.format(item.at)} ${itemScraper(item)} — ${itemSaid(item)}`}
      className={`press-row flex w-full items-center gap-[6px] rounded-[5px] px-[4px] text-left transition-colors duration-[var(--duration-tint)] hover:bg-[var(--surface-subtle)] ${
        dense ? 'py-[1px]' : 'py-[3px]'
      } ${item.kind === 'projected' ? 'opacity-70' : ''}`}
    >
      <Dot tone={itemTone(item)} kind={itemDotKind(item)} size={dense ? 6 : 8} />
      <span className={`${dense ? 'caption-11' : 'meta-12_5'} min-w-0 flex-1 truncate text-[var(--text-primary)]`}>
        {itemScraper(item)}
      </span>
      <span className="caption-11 shrink-0 text-[var(--text-secondary)]">
        {item.kind === 'group' ? countLabel(item.group) : TIME.format(item.at)}
      </span>
    </button>
  );
}

/**
 * The number on a grouped line is the group's own length. There is no display
 * cap above it to drift out of sync -- a group holds every run it counted.
 */
const countLabel = (g: RunGroup<Ran>) =>
  g.counts.held > 0 ? `${g.runs.length} · ${g.counts.held} held` : `${g.runs.length}`;

/* ------------------------------------------------------------------- month */

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Every run drawn in a cell, counted -- not the lines drawn for them. */
const runsIn = (items: Item[]) =>
  items.reduce((n, i) => n + (i.kind === 'group' ? i.group.runs.length : 0), 0);

/**
 * Six weeks, always. A grid that changed height between months would move
 * every control under it.
 *
 * Keyboard: this is the date-picker grid pattern -- one roving tabindex over
 * the day cells, arrows moving by a day and a week, Home/End to the ends of
 * the week, PageUp/PageDown to the neighbouring month, and Enter opening that
 * day. The lines inside a cell are `tabIndex={-1}` on purpose: 42 cells with
 * four lines each is 168 stops, and the keyboard route to a line's dialog is
 * Enter into the day and Tab there, which is two keys rather than sixty.
 */
function MonthGrid({
  days, anchor, byDay, now, onOpen, onDrill,
}: {
  days: Date[];
  anchor: Date;
  byDay: Map<string, Item[]>;
  now: Date;
  onOpen: (i: Item) => void;
  onDrill: (d: Date) => void;
}) {
  const [focus, setFocus] = useState(() => {
    const i = days.findIndex((d) => sameDay(d, now));
    return i >= 0 ? i : Math.max(0, days.findIndex((d) => d.getMonth() === anchor.getMonth()));
  });
  const cells = useRef<(HTMLDivElement | null)[]>([]);

  const move = (to: number) => {
    const next = Math.max(0, Math.min(days.length - 1, to));
    setFocus(next);
    cells.current[next]?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent, i: number) => {
    const by: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (e.key in by) { e.preventDefault(); move(i + by[e.key]!); return; }
    if (e.key === 'Home') { e.preventDefault(); move(i - (i % 7)); return; }
    if (e.key === 'End') { e.preventDefault(); move(i - (i % 7) + 6); return; }
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onDrill(days[i]!); }
  };

  return (
    <div className="w-full overflow-x-auto">
      <div className="min-w-[720px]">
        <div className="grid grid-cols-7">
          {WEEKDAYS.map((d) => (
            <div key={d} className="caption-11 pb-[7px] text-[var(--text-muted)]">{d}</div>
          ))}
        </div>
        <div
          role="grid"
          aria-label="Runs by day"
          className="grid grid-cols-7 overflow-hidden rounded-[var(--radius-card)] border border-[var(--border-hairline)] bg-[var(--surface-card)]"
        >
          {days.map((day, i) => {
            const all = byDay.get(dayKey(day)) ?? [];
            const shown = all.filter((x) => x.kind !== 'projected');
            const projected = all.length - shown.length;
            const outside = day.getMonth() !== anchor.getMonth();
            const today = sameDay(day, now);
            return (
              <div
                key={dayKey(day)}
                role="gridcell"
                aria-label={`${day.getDate()} — ${describe(runsIn(all), projected)}`}
                tabIndex={focus === i ? 0 : -1}
                ref={(el) => { cells.current[i] = el; }}
                onFocus={() => setFocus(i)}
                onKeyDown={(e) => onKeyDown(e, i)}
                onClick={() => onDrill(day)}
                className={`flex min-h-[104px] cursor-pointer flex-col gap-[2px] border-b border-r border-[var(--border-hairline)] p-[6px] outline-none transition-colors duration-[var(--duration-tint)] focus-visible:bg-[var(--surface-subtle)] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--semantic-link)] ${
                  outside ? 'bg-[var(--surface-subtle)]' : ''
                }`}
              >
                <span
                  className={`caption-12 flex size-[19px] shrink-0 items-center justify-center rounded-full ${
                    today
                      ? 'bg-[var(--accent-brand)] text-[var(--accent-on-primary)]'
                      : outside
                        ? 'text-[var(--text-muted)]'
                        : 'text-[var(--text-secondary)]'
                  }`}
                >
                  {day.getDate()}
                </span>
                {shown.slice(0, 3).map((x) => (
                  <ItemRow key={itemKey(x)} item={x} onOpen={onOpen} tabIndex={-1} dense />
                ))}
                {shown.length > 3 && (
                  <span className="caption-11 px-[4px] text-[var(--text-secondary)]">
                    +{shown.length - 3} more scraper{shown.length - 3 === 1 ? '' : 's'}
                  </span>
                )}
                {projected > 0 && (
                  <span className="caption-11 flex items-center gap-[5px] px-[4px] text-[var(--text-muted)]">
                    <Dot tone="var(--text-muted)" kind="projected" size={6} />
                    {projected} projected
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const describe = (runs: number, projected: number) => {
  const parts = [];
  if (runs) parts.push(`${runs} run${runs === 1 ? '' : 's'}`);
  if (projected) parts.push(`${projected} projected`);
  return parts.length ? parts.join(', ') : 'nothing';
};

/* ------------------------------------------------------------- week and day */

/**
 * Seven columns of scrapers, not a grid of hours.
 *
 * A run is a moment with an outcome; `runs` records `started_at` and no
 * duration at all. An hour grid would draw every run as a block an hour tall
 * and imply Assay knows something about how long it took.
 */
function WeekColumns({
  days, byDay, now, onOpen, onDrill,
}: {
  days: Date[];
  byDay: Map<string, Item[]>;
  now: Date;
  onOpen: (i: Item) => void;
  onDrill: (d: Date) => void;
}) {
  return (
    <div className="w-full overflow-x-auto">
      <div className="grid min-w-[760px] grid-cols-7 overflow-hidden rounded-[var(--radius-card)] border border-[var(--border-hairline)] bg-[var(--surface-card)]">
        {days.map((day) => {
          const items = byDay.get(dayKey(day)) ?? [];
          const today = sameDay(day, now);
          return (
            <div key={dayKey(day)} className="flex min-h-[280px] flex-col border-r border-[var(--border-hairline)]">
              <button
                type="button"
                onClick={() => onDrill(day)}
                className="press-row flex items-baseline gap-[6px] border-b border-[var(--border-hairline)] px-[8px] py-[7px] text-left transition-colors duration-[var(--duration-tint)] hover:bg-[var(--surface-subtle)]"
              >
                <span className="caption-11 text-[var(--text-muted)]">{WEEKDAYS[(day.getDay() + 6) % 7]}</span>
                <span className={`meta-13 ${today ? 'text-[var(--accent-brand)]' : 'text-[var(--text-primary)]'}`}>
                  {day.getDate()}
                </span>
                <span className="caption-11 ml-auto text-[var(--text-muted)]">
                  {runsIn(items) || ''}
                </span>
              </button>
              <div className="flex flex-col gap-[1px] p-[4px]">
                {items.map((x) => (
                  <ItemRow key={itemKey(x)} item={x} onOpen={onOpen} dense />
                ))}
                {items.length === 0 && (
                  <span className="caption-11 px-[4px] py-[6px] text-[var(--text-muted)]">nothing</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * The drill-in. Grouped like the others, but a group opens in place: this is
 * where someone came to find a particular run, and sending them to a dialog
 * to reach a second dialog would be one click too many.
 */
function DayColumn({
  day, byDay, now, onOpen,
}: {
  day: Date;
  byDay: Map<string, Item[]>;
  now: Date;
  onOpen: (m: Mark | Item) => void;
}) {
  const items = byDay.get(dayKey(day)) ?? [];
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div className="w-full overflow-hidden rounded-[var(--radius-card)] border border-[var(--border-hairline)] bg-[var(--surface-card)]">
      {items.map((x) => {
        const key = itemKey(x);
        const isGroup = x.kind === 'group';
        const open = expanded === key;
        return (
          <div key={key} className="border-b border-[var(--border-hairline)] last:border-b-0">
            <button
              type="button"
              aria-expanded={isGroup ? open : undefined}
              onClick={() => (isGroup ? setExpanded(open ? null : key) : onOpen(x))}
              className={`press-row flex w-full items-center gap-[12px] px-[14px] py-[11px] text-left transition-colors duration-[var(--duration-tint)] hover:bg-[var(--surface-subtle)] ${
                x.kind === 'projected' ? 'opacity-70' : ''
              }`}
            >
              <span className="mono-value-13 w-[52px] shrink-0 text-[var(--text-secondary)]">
                {TIME.format(x.at)}
              </span>
              <Dot tone={itemTone(x)} kind={itemDotKind(x)} />
              <span className="body-13_5 w-[220px] shrink-0 truncate text-[var(--text-primary)]">
                {itemScraper(x)}
              </span>
              <span className="meta-12_5 min-w-0 flex-1 truncate text-[var(--text-secondary)]">
                {itemSaid(x)}
              </span>
              {isGroup && (
                <ChevronDown
                  size={14}
                  strokeWidth={1.5}
                  aria-hidden
                  className={`shrink-0 text-[var(--text-muted)] transition-transform duration-[var(--duration-glide)] ease-[var(--ease-glide)] ${open ? 'rotate-180' : ''}`}
                />
              )}
            </button>
            {isGroup && (
              <Collapse open={open} contentClassName="bg-[var(--surface-subtle)]">
                <div className="flex flex-col">
                  {x.group.runs.map((r) => (
                    <button
                      key={r.runId}
                      type="button"
                      onClick={() => onOpen({ kind: 'ran', at: r.at, run: r })}
                      className="press-row flex w-full items-center gap-[12px] border-t border-[var(--border-hairline)] py-[8px] pl-[66px] pr-[14px] text-left transition-colors duration-[var(--duration-tint)] hover:bg-[var(--surface-card)]"
                    >
                      <Dot tone={TONE[r.outcome]} kind="ran" size={6} />
                      <span className="mono-value-12_5 w-[56px] shrink-0 text-[var(--text-primary)]">
                        {r.runId}
                      </span>
                      <span className="caption-11 w-[52px] shrink-0 text-[var(--text-secondary)]">
                        {TIME.format(r.at)}
                      </span>
                      <span className="meta-12_5 min-w-0 flex-1 truncate text-[var(--text-secondary)]">
                        {SAID[r.outcome]}
                      </span>
                    </button>
                  ))}
                </div>
              </Collapse>
            )}
          </div>
        );
      })}
      {items.length > 0 && sameDay(day, now) && (
        <p className="caption-11 border-t border-[var(--border-hairline)] px-[14px] py-[9px] text-[var(--text-muted)]">
          Now is {TIME.format(now)}.
        </p>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------- list */

/**
 * What happened, newest first -- the view an operator actually opens, and the
 * one place runs are NOT grouped. A run id is the thing being looked up here,
 * and a group has no run id.
 *
 * Table conventions from `fields/page.tsx`: fixed columns, lowercase headings.
 * The travelling band is `useGlide`, which is what it is for: one highlight
 * that moves between rows rather than each row lighting its own background.
 */
function RunList({
  marks, onOpen, capped, earliest,
}: {
  marks: Mark[];
  onOpen: (m: Mark) => void;
  capped: boolean;
  earliest: Date | null;
}) {
  const rows = useMemo(() => [...marks].reverse(), [marks]);
  const [active, setActive] = useState<number | null>(null);
  const glide = useGlide<HTMLButtonElement>(active, rows.length);

  if (rows.length === 0) return null;

  const COLS = 'grid-cols-[64px_150px_minmax(0,1fr)_minmax(0,1.2fr)]';

  return (
    <div className="w-full">
      <div className={`grid ${COLS} gap-x-[12px] border-b border-[var(--border-hairline)] pb-[7px]`}>
        {['run', 'when', 'scraper', 'what happened'].map((h) => (
          <span key={h} className="caption-11 text-[var(--text-muted)]">{h}</span>
        ))}
      </div>
      <div className="relative">
        <span
          aria-hidden
          className="pointer-events-none absolute left-0 right-0 rounded-[6px] bg-[var(--surface-subtle)]"
          style={glide.style}
        />
        {rows.map((m, i) => (
          <button
            key={m.kind === 'ran' ? `r${m.run.runId}` : `${m.kind}:${m.clock.scraper}`}
            type="button"
            ref={glide.setRef(i)}
            onMouseEnter={() => setActive(i)}
            onMouseLeave={() => setActive(null)}
            onFocus={() => setActive(i)}
            onBlur={() => setActive(null)}
            onClick={() => onOpen(m)}
            className={`relative grid w-full ${COLS} gap-x-[12px] border-b border-[var(--border-hairline)] py-[9px] text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--semantic-link)]`}
          >
            <span className="mono-value-12_5 text-[var(--text-primary)]">
              {m.kind === 'ran' ? m.run.runId : '—'}
            </span>
            <span className="body-13_5 truncate text-[var(--text-primary)]">{when(m.at)}</span>
            <span className="body-13_5 truncate text-[var(--text-primary)]">{markScraper(m)}</span>
            <span className="meta-12_5 flex min-w-0 items-center gap-[7px] text-[var(--text-secondary)]">
              <Dot tone={m.kind === 'ran' ? TONE[m.run.outcome] : 'var(--accent-brand)'} kind={m.kind} />
              <span className="truncate">
                {m.kind === 'ran' ? SAID[m.run.outcome] : t('schedule.due')}
              </span>
            </span>
          </button>
        ))}
      </div>
      {capped && earliest && (
        <p className="caption-11 pt-[10px] text-[var(--text-muted)]">
          This is the most recent {rows.length} back to {stamp(earliest)}. There are older runs this
          page did not read.
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ dialog */

function Detail({
  entry, onOpen, onClose, workers, now,
}: {
  entry: Mark | Item | null;
  onOpen: (m: Mark) => void;
  onClose: () => void;
  workers: number;
  now: Date;
}) {
  return (
    <Dialog open={entry !== null} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[85vh] gap-[18px] overflow-y-auto sm:max-w-[640px]">
        {entry?.kind === 'ran' && <RanDetail run={entry.run} />}
        {entry?.kind === 'group' && <GroupDetail group={entry.group} onOpen={onOpen} />}
        {entry?.kind === 'next' && <NextDetail clock={entry.clock} at={entry.at} now={now} workers={workers} />}
        {entry?.kind === 'projected' && <ProjectedDetail clock={entry.clock} at={entry.at} now={now} />}
      </DialogContent>
    </Dialog>
  );
}

const DAY_LONG = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

/**
 * A scraper's day. The mix, then every run in it -- so the count on the grid
 * line and the rows behind it are the same list, not two derivations of it.
 */
function GroupDetail({ group, onOpen }: { group: RunGroup<Ran>; onOpen: (m: Mark) => void }) {
  return (
    <>
      <DialogHeader>
        <DialogTitle className="title-20 text-[var(--text-primary)]">{group.scraper}</DialogTitle>
        <DialogDescription className="body-13_5 text-[var(--text-secondary)]">
          {DAY_LONG.format(group.at)} — {summariseGroup(group.counts)}.
          {group.counts.held > 0
            ? ' A held field was published empty rather than filled with a guess.'
            : ''}
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-col">
        {group.runs.map((r) => (
          <button
            key={r.runId}
            type="button"
            onClick={() => onOpen({ kind: 'ran', at: r.at, run: r })}
            className="press-row flex w-full items-center gap-[12px] border-t border-[var(--border-hairline)] py-[9px] text-left transition-colors duration-[var(--duration-tint)] hover:bg-[var(--surface-subtle)]"
          >
            <Dot tone={TONE[r.outcome]} kind="ran" />
            <span className="mono-value-12_5 w-[54px] shrink-0 text-[var(--text-primary)]">{r.runId}</span>
            <span className="caption-11 w-[52px] shrink-0 text-[var(--text-secondary)]">
              {TIME.format(r.at)}
            </span>
            <span className="meta-12_5 min-w-0 flex-1 truncate text-[var(--text-secondary)]">
              {SAID[r.outcome]}
            </span>
          </button>
        ))}
      </div>
    </>
  );
}

/**
 * What a run did. Not the whole of it -- `/runs/[run]` is the whole of it, and
 * duplicating that page here would make two places for the same fact to drift.
 * This is the cells and the reason, which is what someone clicking a mark on a
 * calendar is asking about.
 */
function RanDetail({ run }: { run: Ran }) {
  return (
    <>
      <DialogHeader>
        <DialogTitle className="title-20 text-[var(--text-primary)]">{run.scraper}</DialogTitle>
        <DialogDescription className="body-13_5 text-[var(--text-secondary)]">
          Run {run.runId} · {stamp(run.at)} · {SAID[run.outcome]}.
        </DialogDescription>
      </DialogHeader>

      {run.cells.length === 0 ? (
        <p className="body-13_5 text-[var(--text-secondary)]">
          This run published no cells. Assay skips the fields when the page has not changed since the
          last run — the run is recorded, the fingerprint is recorded, and nothing was re-evaluated.
        </p>
      ) : (
        // Stagger, because these did just arrive -- the dialog opened on them.
        // A short step, so the last cell is not most of a second behind the first.
        <Stagger className="flex flex-col" step={70}>
          {run.cells.map((c) => <CellRow key={c.field} cell={c} targetId={run.targetId} />)}
        </Stagger>
      )}

      <div className="flex flex-wrap items-center gap-[10px] pt-[2px]">
        <Link href={`/runs/${run.runId}`} className={actionVariants({ variant: 'outline' })}>
          Open run {run.runId}
        </Link>
        <span className="mono-value-12_5 text-[var(--text-muted)]">{run.targetId}</span>
      </div>
    </>
  );
}

/**
 * One published cell.
 *
 * A held one is drawn with `HeldCell`, the SAME component the schema table and
 * the run-now watcher use. That is not tidiness: `HeldCell` puts the gate's
 * reason code through `HELD_BECAUSE` and prints the code only when the
 * vocabulary has no wording for it. Writing the sentence here instead put
 * `thin_margin` in front of the user, which is the one thing APP-DESIGN says
 * the voice cannot survive -- and it would have been a second place for this
 * product's most distinctive state to drift.
 */
function CellRow({ cell, targetId }: { cell: Cell; targetId: string }) {
  const held = cell.status === 'quarantined';
  return (
    <div className="flex flex-col gap-[5px] border-t border-[var(--border-hairline)] py-[9px]">
      <div className="flex items-baseline gap-[10px]">
        <span className="mono-value-13 min-w-0 flex-1 truncate text-[var(--text-primary)]">
          {cell.field}
        </span>
        {!held && (
          <span className="caption-11 rounded-full bg-[var(--surface-subtle)] px-[8px] py-[2px] text-[var(--text-secondary)]">
            {cell.status}
          </span>
        )}
      </div>
      {held ? (
        <HeldCell reason={cell.reason} targetId={targetId} />
      ) : (
        <p className="mono-value-12_5 break-words text-[var(--text-secondary)]">
          {cell.value ?? <span className="caption-12">{t('schedule.noValue')}</span>}
        </p>
      )}
      <ProofSheet
        proof={cell.proof}
        className="focus-ring caption-11 w-fit rounded-[var(--radius-control)] text-[var(--semantic-link)] hover:underline"
      >
        {t('schedule.whereFrom')}
      </ProofSheet>
    </div>
  );
}

/**
 * The one stored future fact, and the control that moves it.
 *
 * `RunNow` is used whole rather than re-implemented: it carries the refusal on
 * a paused scraper, the worker-liveness sentence, and the watch that reads the
 * run record instead of spinning on a timer. Rebuilding any of that here would
 * be a second place for this product's most distinctive refusal to drift.
 */
function NextDetail({
  clock, at, now, workers,
}: {
  clock: Clock;
  at: Date;
  now: Date;
  workers: number;
}) {
  return (
    <>
      <DialogHeader>
        <DialogTitle className="title-20 text-[var(--text-primary)]">{clock.scraper}</DialogTitle>
        <DialogDescription className="body-13_5 text-[var(--text-secondary)]">
          Due {stamp(at)}, {untilText(at, now)}. This is the one future run Assay has stored.
        </DialogDescription>
      </DialogHeader>

      <dl className="grid grid-cols-[110px_minmax(0,1fr)] gap-y-[9px] border-t border-[var(--border-hairline)] pt-[12px]">
        <dt className="caption-11 text-[var(--text-muted)]">{t('schedule.dialog.cadence')}</dt>
        <dd className="meta-12_5 text-[var(--text-primary)]">every {clock.cadence}</dd>
        <dt className="caption-11 text-[var(--text-muted)]">{t('schedule.dialog.fields')}</dt>
        <dd className="meta-12_5 text-[var(--text-primary)]">{clock.fields} watched on this page</dd>
        <dt className="caption-11 text-[var(--text-muted)]">{t('schedule.dialog.after')}</dt>
        <dd className="meta-12_5 text-[var(--text-secondary)]">
          nothing is stored — the dashed marks are the cadence continued
        </dd>
      </dl>

      <RunNow
        workers={workers}
        scrapers={[{ slug: clock.scraper, paused: clock.paused, fields: clock.fields }]}
      />

      {/* The clock, editable, next to the one run it predicts. `RunNow` moves
          next_run_at for one run; this moves the interval every run after it,
          and pauses or forgets the scraper outright. Both act on the same
          scraper and neither is reachable from the other screens, which is why
          they stand together here. */}
      <ScraperLifecycle
        slug={clock.scraper}
        className="border-t border-[var(--border-hairline)] pt-[14px]"
      />
    </>
  );
}

function ProjectedDetail({ clock, at, now }: { clock: Clock; at: Date; now: Date }) {
  const next = clock.nextRunAt ? new Date(clock.nextRunAt) : null;
  return (
    <>
      <DialogHeader>
        <DialogTitle className="title-20 text-[var(--text-primary)]">
          {clock.scraper}, projected
        </DialogTitle>
        <DialogDescription className="body-13_5 text-[var(--text-secondary)]">
          {stamp(at)} is where the cadence lands, {untilText(at, now)}. Assay has not stored this
          run and will not until the one before it has been claimed.
        </DialogDescription>
      </DialogHeader>

      <p className="body-13_5 border-t border-[var(--border-hairline)] pt-[12px] text-[var(--text-secondary)]">
        It moves. A run is skipped when the page has not changed since the last one, waits when no
        worker is consuming the queue, and stops entirely when someone pauses the scraper — and this
        mark is arithmetic on <span className="mono-value-12_5 text-[var(--text-primary)]">every {clock.cadence}</span>,
        so it knows about none of that.
      </p>

      {next && (
        <p className="meta-12_5 text-[var(--text-secondary)]">
          The stored run is {stamp(next)}, {untilText(next, now)}. That one is a fact.
        </p>
      )}

      {/* Where a projected mark lands IS the cadence, so the control that moves
          every mark after this one belongs on the mark the reader clicked. */}
      <ScraperLifecycle
        slug={clock.scraper}
        className="border-t border-[var(--border-hairline)] pt-[14px]"
      />
    </>
  );
}
