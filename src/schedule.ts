// Cadence: the only arithmetic the scheduler needs.
//
// `paused` and an unparseable cadence both yield null, and a null next_run_at
// is never selected by `WHERE next_run_at <= now()`. So pausing a target is a
// property of the data, not a branch in the loop.

const MS: Record<string, number> = { h: 3600e3, d: 86400e3 };

/** Milliseconds between runs, or null for a target that should not run. */
export function cadenceMs(cadence: string | null | undefined): number | null {
  if (!cadence || cadence === 'paused') return null;
  if (cadence === 'hourly') return MS.h;
  if (cadence === 'daily') return MS.d;
  if (cadence === 'weekly') return 7 * MS.d;
  const m = /^(\d+)\s*([hd])$/.exec(String(cadence).trim());
  return m ? Number(m[1]) * MS[m[2]]! : null;
}

/** When a target running now should next come due. Null means never. */
export function nextRunAt(cadence: string | null | undefined, from = new Date()): Date | null {
  const ms = cadenceMs(cadence);
  return ms == null ? null : new Date(from.getTime() + ms);
}
