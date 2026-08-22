/**
 * `TimelineLanes` on `06 · Components`: one row per thing, one dot per event,
 * placed on a shared clock.
 *
 * Filled is something that happened; hollow is something scheduled. They are
 * different marks rather than different colours because the difference is
 * between a fact and a plan, and no palette should be asked to carry that.
 *
 * `dim` is a lane that is not running: its rule is heavier and its label goes
 * quiet, and no upcoming dots are drawn on it because nothing is coming. What
 * it already did stays drawn -- pausing does not un-happen this morning.
 */
export interface Tick {
  /** Where on the window, 0 to 1. Anything outside is dropped, not clamped. */
  at: number;
  kind: 'ran' | 'upcoming';
  title?: string;
}

export interface Lane {
  key: string;
  label: string;
  ticks: Tick[];
  dim?: boolean;
  /** The two right-hand cells: what the cadence is, and what is next. */
  cadence: React.ReactNode;
  next: React.ReactNode;
}

export function TimelineLanes({
  lanes,
  axis,
  nowAt,
  legend = 'filled = ran · hollow = coming up',
}: {
  lanes: Lane[];
  /** Three labels across the window. The middle one is branded. */
  axis: [string, string, string];
  /**
   * Where the middle label sits, 0 to 1. It is a real position on the clock,
   * not the centre of the row -- a `now` pinned to the middle would put every
   * morning's dots on the wrong side of it.
   */
  nowAt: number;
  legend?: string;
}) {
  const nowPct = Math.min(0.94, Math.max(0.06, nowAt)) * 100;

  return (
    <div className="flex w-full flex-col items-start">
      <div className="flex w-full items-center pt-[34px]">
        <div className="w-[212px] shrink-0" />
        <div className="relative h-[12px] w-[620px] shrink-0">
          <span className="label-10 absolute left-0 text-[var(--text-muted)]">{axis[0]}</span>
          <span
            className="label-10 absolute -translate-x-1/2 text-[var(--accent-brand)]"
            style={{ left: `${nowPct}%` }}
          >
            {axis[1]}
          </span>
          <span className="label-10 absolute right-0 text-[var(--text-muted)]">{axis[2]}</span>
        </div>
      </div>

      <div className="flex w-full flex-col pt-[10px]">
        {lanes.map((l) => (
          <div
            key={l.key}
            className="flex w-full items-center border-t border-[var(--border-hairline)] py-[13px]"
          >
            <p
              className={`body-13_5 w-[212px] shrink-0 truncate pr-[12px] ${
                l.dim ? 'text-[var(--text-muted)]' : 'text-[var(--text-primary)]'
              }`}
            >
              {l.label}
            </p>
            <div className="relative h-[14px] w-[620px] shrink-0">
              <span
                className="absolute left-0 top-[7px] h-px w-full"
                style={{ background: l.dim ? 'var(--border-default)' : 'var(--border-hairline)' }}
              />
              {/* A paused lane still shows what it already did. Dimming the
                  lane is about what is coming; hiding this morning's runs
                  would make the header count and the picture disagree. */}
              {l.ticks
                .filter((t) => t.kind === 'ran' || !l.dim)
                .map((t, i) => (
                  <span
                    key={`${t.kind}-${i}`}
                    title={t.title}
                    className="absolute top-[4px] size-[7px] rounded-full"
                    style={{
                      left: `calc(${(t.at * 100).toFixed(3)}% - 3.5px)`,
                      background: t.kind === 'ran' ? 'var(--accent-brand)' : 'transparent',
                      boxShadow: t.kind === 'ran' ? undefined : 'inset 0 0 0 1px var(--accent-brand)',
                    }}
                  />
                ))}
            </div>
            <div className="min-w-px flex-1" />
            <p
              className={`caption-12 w-[70px] shrink-0 ${
                l.dim ? 'text-[var(--text-muted)]' : 'text-[var(--text-secondary)]'
              }`}
            >
              {l.cadence}
            </p>
            <p className="caption-12 w-[80px] shrink-0 text-right text-[var(--text-muted)]">
              {l.next}
            </p>
          </div>
        ))}
      </div>

      <div className="flex items-start pt-[16px]">
        <div className="w-[212px] shrink-0" />
        <p className="caption-11 text-[var(--text-muted)]">{legend}</p>
      </div>
    </div>
  );
}
