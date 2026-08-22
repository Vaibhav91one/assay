// The calendar's arithmetic, which is the part of a calendar that is actually
// wrong when a calendar is wrong.
//
// Every case pins a clock. Nothing here calls `new Date()` with no argument,
// because the bug this file exists to catch -- a run drawn in the wrong cell --
// only appears on particular days of particular months, and a test that reads
// the wall clock finds it on 1 day in 30 and passes on the other 29.

import { describe, it, expect } from 'vitest';
import {
  addDays,
  bucketByDay,
  dayKey,
  daysFor,
  groupRuns,
  monthGrid,
  projectRuns,
  startOfWeek,
  step,
  summariseGroup,
  titleFor,
  weekGrid,
  windowFor,
} from '../web/app/(app)/schedule/calendar.js';
import { cadenceMs } from '../src/schedule.js';

const HOUR = 3_600_000;
const DAY = 86_400_000;

/** Local time, stated as local time -- `new Date('...Z')` would not be. */
const at = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min);

describe('the week', () => {
  it('starts on Monday', () => {
    // Wednesday 20 August 2025 -> Monday 18th.
    expect(dayKey(startOfWeek(at(2025, 8, 20)))).toBe('2025-08-18');
  });

  it('puts Sunday at the end of the week it finishes, not the start of the next', () => {
    // getDay() calls Sunday 0. Naive `-getDay()` would return the 24th here.
    expect(dayKey(startOfWeek(at(2025, 8, 24)))).toBe('2025-08-18');
  });

  it('leaves a Monday where it is', () => {
    expect(dayKey(startOfWeek(at(2025, 8, 18)))).toBe('2025-08-18');
  });

  it('draws seven days, Monday to Sunday', () => {
    const days = weekGrid(at(2025, 8, 20, 13, 30));
    expect(days).toHaveLength(7);
    expect(days.map(dayKey)).toEqual([
      '2025-08-18', '2025-08-19', '2025-08-20',
      '2025-08-21', '2025-08-22', '2025-08-23', '2025-08-24',
    ]);
    // Midnight, not the anchor's time of day: these are cells, not moments.
    expect(days[0]!.getHours()).toBe(0);
  });

  it('crosses a month boundary without renumbering', () => {
    // The week of Fri 1 August 2025 starts in July.
    expect(weekGrid(at(2025, 8, 1)).map(dayKey)).toEqual([
      '2025-07-28', '2025-07-29', '2025-07-30', '2025-07-31',
      '2025-08-01', '2025-08-02', '2025-08-03',
    ]);
  });
});

describe('the month grid', () => {
  it('is always six weeks, so the controls below it never move', () => {
    for (const m of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) {
      expect(monthGrid(at(2025, m, 1))).toHaveLength(42);
    }
    // February 2021 began on a Monday and has exactly 28 days -- the one shape
    // that fits in four weeks. It still gets six.
    expect(monthGrid(at(2021, 2, 15))).toHaveLength(42);
  });

  it('spills into the previous month at the front', () => {
    // 1 August 2025 was a Friday, so the grid opens on Monday 28 July.
    const grid = monthGrid(at(2025, 8, 14));
    expect(dayKey(grid[0]!)).toBe('2025-07-28');
    expect(dayKey(grid[4]!)).toBe('2025-08-01');
  });

  it('spills into the next month at the back', () => {
    const grid = monthGrid(at(2025, 8, 14));
    expect(dayKey(grid[41]!)).toBe('2025-09-07');
  });

  it('opens on the 1st when the 1st is a Monday, and still spills at the back', () => {
    const grid = monthGrid(at(2025, 9, 10)); // 1 Sept 2025 was a Monday
    expect(dayKey(grid[0]!)).toBe('2025-09-01');
    expect(dayKey(grid[41]!)).toBe('2025-10-12');
  });

  it('is contiguous -- no day is skipped or repeated', () => {
    const grid = monthGrid(at(2025, 3, 15)); // spans the UK DST change on 30 March
    const keys = grid.map(dayKey);
    expect(new Set(keys).size).toBe(42);
    for (let i = 1; i < grid.length; i += 1) {
      expect(dayKey(grid[i]!)).toBe(dayKey(addDays(grid[i - 1]!, 1)));
    }
  });

  it('ignores the anchor day -- any day in the month draws the same grid', () => {
    const first = monthGrid(at(2025, 8, 1)).map(dayKey);
    expect(monthGrid(at(2025, 8, 31, 23, 59)).map(dayKey)).toEqual(first);
  });
});

describe('placing a run in a cell', () => {
  it('puts a run in the day it started, not the day it was read', () => {
    const runs = [
      { at: at(2025, 8, 20, 9, 15), id: 'morning' },
      { at: at(2025, 8, 20, 21, 40), id: 'evening' },
      { at: at(2025, 8, 21, 3, 0), id: 'next day' },
    ];
    const byDay = bucketByDay(runs);
    expect(byDay.get('2025-08-20')!.map((r) => r.id)).toEqual(['morning', 'evening']);
    expect(byDay.get('2025-08-21')!.map((r) => r.id)).toEqual(['next day']);
  });

  it('splits at local midnight, to the millisecond', () => {
    const byDay = bucketByDay([
      { at: at(2025, 8, 20, 23, 59), id: 'late' },
      { at: new Date(2025, 7, 20, 23, 59, 59, 999), id: 'latest' },
      { at: at(2025, 8, 21, 0, 0), id: 'midnight' },
    ]);
    expect(byDay.get('2025-08-20')!.map((r) => r.id)).toEqual(['late', 'latest']);
    expect(byDay.get('2025-08-21')!.map((r) => r.id)).toEqual(['midnight']);
  });

  it('sorts within a day, whatever order the store returned', () => {
    const byDay = bucketByDay([
      { at: at(2025, 8, 20, 18, 0), id: 'c' },
      { at: at(2025, 8, 20, 6, 0), id: 'a' },
      { at: at(2025, 8, 20, 12, 0), id: 'b' },
    ]);
    expect(byDay.get('2025-08-20')!.map((r) => r.id)).toEqual(['a', 'b', 'c']);
  });

  it('leaves a day with no runs absent rather than empty', () => {
    // The grid must be able to tell "nothing ran" from "nothing was read".
    expect(bucketByDay([{ at: at(2025, 8, 20), id: 'x' }]).has('2025-08-19')).toBe(false);
  });

  it('places every run of a month grid inside that grid', () => {
    const grid = new Set(monthGrid(at(2025, 8, 14)).map(dayKey));
    const runs = Array.from({ length: 42 }, (_, i) => ({ at: addDays(at(2025, 7, 28, 11, 0), i) }));
    for (const key of bucketByDay(runs).keys()) expect(grid.has(key)).toBe(true);
  });
});

describe('projections', () => {
  const next = at(2025, 8, 20, 12, 0);

  it('project nothing without a stored next run -- pause has no future', () => {
    expect(projectRuns(null, cadenceMs('daily'), at(2025, 8, 1), at(2025, 9, 1))).toEqual([]);
  });

  it('project nothing without a cadence', () => {
    expect(projectRuns(next, cadenceMs('paused'), at(2025, 8, 1), at(2025, 9, 1))).toEqual([]);
    expect(projectRuns(next, cadenceMs('nonsense'), at(2025, 8, 1), at(2025, 9, 1))).toEqual([]);
  });

  it('exclude the stored next run itself, which is a fact and gets its own mark', () => {
    const out = projectRuns(next, cadenceMs('daily'), at(2025, 8, 20), at(2025, 8, 24));
    expect(out.map((d) => dayKey(d))).toEqual(['2025-08-21', '2025-08-22', '2025-08-23']);
    expect(out.some((d) => d.getTime() === next.getTime())).toBe(false);
  });

  it('step by the cadence, matching src/schedule.ts rather than correcting it', () => {
    const out = projectRuns(next, cadenceMs('6h'), at(2025, 8, 20), at(2025, 8, 21, 12, 0));
    expect(out.map((d) => d.getTime() - next.getTime())).toEqual([6 * HOUR, 12 * HOUR, 18 * HOUR]);
  });

  it('stay inside the window at both ends', () => {
    const from = at(2025, 9, 1);
    const to = at(2025, 10, 1);
    const out = projectRuns(next, cadenceMs('daily'), from, to);
    expect(out[0]!.getTime()).toBeGreaterThanOrEqual(from.getTime());
    expect(out[out.length - 1]!.getTime()).toBeLessThan(to.getTime());
    expect(out).toHaveLength(30);
  });

  it('reach a far window without walking every step to it', () => {
    // A weekly target whose next run is three years back still projects into
    // this month; the skip is arithmetic, not a loop.
    const out = projectRuns(at(2022, 1, 3, 9, 0), cadenceMs('weekly'), at(2025, 8, 1), at(2025, 9, 1));
    expect(out).toHaveLength(4);
    for (const d of out) expect(d.getDay()).toBe(1); // still Mondays
  });

  it('cap rather than draw an hourly cadence across a six-week grid', () => {
    const out = projectRuns(next, cadenceMs('hourly'), at(2025, 8, 1), at(2025, 10, 1), 50);
    expect(out).toHaveLength(50);
  });

  it('project nothing when the window ends before the next run', () => {
    expect(projectRuns(next, cadenceMs('daily'), at(2025, 7, 1), at(2025, 8, 1))).toEqual([]);
  });
});

describe('navigation', () => {
  it('moves a month at a time in month view, landing on the 1st', () => {
    const out = step('month', at(2025, 8, 31), 1);
    expect(dayKey(out)).toBe('2025-09-01');
    expect(dayKey(step('month', at(2025, 1, 15), -1))).toBe('2024-12-01');
  });

  it('moves a week at a time in week view', () => {
    expect(dayKey(step('week', at(2025, 8, 20), 1))).toBe('2025-08-27');
    expect(dayKey(step('week', at(2025, 8, 20), -1))).toBe('2025-08-13');
  });

  it('moves a day at a time in day view, across a month boundary', () => {
    expect(dayKey(step('day', at(2025, 8, 31), 1))).toBe('2025-09-01');
  });

  it('does not move the list, which is already all of it', () => {
    const anchor = at(2025, 8, 20);
    expect(step('list', anchor, 1)).toBe(anchor);
    expect(step('list', anchor, -1)).toBe(anchor);
  });
});

describe('the window a view covers', () => {
  it('is half-open, so a run at midnight belongs to exactly one view', () => {
    const { from, to } = windowFor('day', at(2025, 8, 20, 15, 0), null, at(2025, 8, 20));
    expect(dayKey(from)).toBe('2025-08-20');
    expect(dayKey(to)).toBe('2025-08-21');
    expect(from.getHours()).toBe(0);
  });

  it('covers all 42 cells of a month grid', () => {
    const { from, to } = windowFor('month', at(2025, 8, 14), null, at(2025, 8, 14));
    expect(dayKey(from)).toBe('2025-07-28');
    expect(dayKey(to)).toBe('2025-09-08');
    expect(Math.round((to.getTime() - from.getTime()) / DAY)).toBe(42);
  });

  it('opens the list back to the earliest run that was actually read', () => {
    const { from } = windowFor('list', at(2025, 8, 20), at(2025, 5, 3, 14, 0), at(2025, 8, 20));
    expect(dayKey(from)).toBe('2025-05-03');
  });

  it('falls back to today when nothing has ever run', () => {
    const { from } = windowFor('list', at(2025, 8, 20), null, at(2025, 8, 20, 9, 0));
    expect(dayKey(from)).toBe('2025-08-20');
  });
});

describe('what the header claims to be showing', () => {
  it('names the month, the week span, the day, and the extent of the list', () => {
    expect(titleFor('month', at(2025, 8, 14), null)).toBe('August 2025');
    expect(titleFor('week', at(2025, 8, 20), null)).toBe('18 Aug – 24 Aug');
    expect(titleFor('day', at(2025, 8, 20), null)).toBe('Wednesday 20 August');
    expect(titleFor('list', at(2025, 8, 20), at(2025, 5, 3))).toBe('Every run since 3 May');
  });

  it('does not claim a start date the list does not have', () => {
    expect(titleFor('list', at(2025, 8, 20), null)).toBe('Every run');
  });
});

describe('grouping a cell by scraper', () => {
  const run = (scraper: string, outcome: 'clean' | 'healed' | 'held', h: number) =>
    ({ scraper, outcome, at: at(2025, 8, 20, h) });

  it('collapses one scraper\'s runs into one entry and counts every one of them', () => {
    const groups = groupRuns([
      run('mattel', 'clean', 9), run('mattel', 'healed', 10), run('mattel', 'clean', 11),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.runs).toHaveLength(3);
    expect(groups[0]!.counts).toEqual({ clean: 2, healed: 1, held: 0 });
    // The count is the group's own length, never a display cap.
    expect(summariseGroup(groups[0]!.counts)).toBe('3 runs, 1 moved');
  });

  it('keeps different scrapers apart', () => {
    const groups = groupRuns([run('ikea', 'clean', 9), run('mattel', 'clean', 8)]);
    expect(groups.map((g) => g.scraper)).toEqual(['mattel', 'ikea']); // by first run
  });

  it('NEVER averages a hold away', () => {
    // Thirty clean runs and one hold is a cell that holds something.
    const runs = [...Array(30)].map(() => run('mattel', 'clean', 9));
    runs.push(run('mattel', 'held', 12));
    const [g] = groupRuns(runs);
    expect(g!.worst).toBe('held');
    expect(g!.counts.held).toBe(1);
    expect(summariseGroup(g!.counts)).toBe('31 runs, 1 held');
  });

  it('lets healed beat clean but never beat held', () => {
    expect(groupRuns([run('a', 'clean', 9), run('a', 'healed', 10)])[0]!.worst).toBe('healed');
    expect(groupRuns([run('a', 'healed', 9), run('a', 'held', 10)])[0]!.worst).toBe('held');
    expect(groupRuns([run('a', 'held', 9), run('a', 'healed', 10)])[0]!.worst).toBe('held');
  });

  it('sorts the group where its earliest run sits, whatever order it was given', () => {
    const g = groupRuns([run('a', 'clean', 15), run('a', 'clean', 6), run('a', 'clean', 11)])[0]!;
    expect(g.at.getHours()).toBe(6);
    expect(g.runs.map((r) => r.at.getHours())).toEqual([6, 11, 15]);
  });

  it('says "clean" only when nothing else happened', () => {
    expect(summariseGroup({ clean: 1, healed: 0, held: 0 })).toBe('1 run, clean');
    expect(summariseGroup({ clean: 4, healed: 0, held: 0 })).toBe('4 runs, clean');
    expect(summariseGroup({ clean: 4, healed: 2, held: 1 })).toBe('7 runs, 1 held');
  });

  it('groups nothing into nothing', () => {
    expect(groupRuns([])).toEqual([]);
  });
});

describe('daysFor', () => {
  it('gives each view the cells it draws', () => {
    expect(daysFor('month', at(2025, 8, 14))).toHaveLength(42);
    expect(daysFor('week', at(2025, 8, 14))).toHaveLength(7);
    expect(daysFor('day', at(2025, 8, 14))).toHaveLength(1);
    expect(dayKey(daysFor('day', at(2025, 8, 14, 22, 0))[0]!)).toBe('2025-08-14');
  });
});
