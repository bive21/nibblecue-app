import { describe, expect, it } from 'vitest';
import { volumeText } from '../entry/units';
import { localDayBounds, shiftDay, zonedToUtc } from '../today/day';
import { DEFAULT_DAY_WINDOW } from '../today/dayWindow';
import type { ActiveTimer, TodayActivity } from '../today/rows';
import { todayTotals } from '../today/totals';
import { dashboardHeadline } from './dashboard';
import {
  compareWindows,
  dayGlance,
  dayMarks,
  GLANCE_FIGURES,
  GLANCE_SAME,
  glanceReadFromMs,
  previousWindow,
  rangeGlance,
  rowsOfChild,
  weekGroups,
  windowFigures,
  type Comparison,
  type GlanceFigure,
  type GlanceInput,
} from './glance';
import { GLANCE_VERDICTS, glanceVerdictHits } from './glance.banned';
import {
  comparedNote,
  comparedWith,
  compareSpan,
  comparisonLine,
  comparisonShort,
  comparisonTight,
} from './glance.copy';
import { dayBuckets, rangeOf } from './range';
import { reportSeries } from './series';

/**
 * THE GLANCE — the arithmetic under Reports' two lead cards (`glance.ts`), and the words of their
 * comparisons (`glance.copy.ts`). Two promises are held here beyond the arithmetic itself: every
 * figure is the SAME figure Today and the report series already give (no second rule about what
 * counts), and no sentence a comparison can produce carries a verdict.
 */

const TZ = 'America/Los_Angeles';
/** September 2026 in Los Angeles: no DST edge, so the plain cases stay plain. */
const at = (h: number, m = 0, day = 20): number => zonedToUtc(TZ, 2026, 9, day, h, m);
/** Nine in the morning on the 20th — the moment "today so far" is taken in most of these. */
const NINE = at(9);

let seq = 0;
const row = (over: Partial<TodayActivity> & Pick<TodayActivity, 'type' | 'startMs'>) => {
  seq += 1;
  return {
    id: `g${seq}`,
    childId: 'ada',
    endMs: null,
    isPrivate: false,
    createdBy: 'dana',
    ...over,
  } as TodayActivity;
};
const NONE: ActiveTimer[] = [];
const bottle = (startMs: number, ml = 120) => row({ type: 'bottle', startMs, consumedMl: ml });
const water = (startMs: number) =>
  row({ type: 'bottle', startMs, consumedMl: 60, bottleKind: 'WATER' });
const breast = (startMs: number) =>
  row({
    type: 'breastfeed',
    startMs,
    endMs: startMs + 15 * 60_000,
    leftSeconds: 600,
    rightSeconds: 300,
  });
const diaper = (startMs: number, kind: 'WET' | 'DIRTY' | 'BOTH' | 'DRY' = 'WET') =>
  row({ type: 'diaper', startMs, diaperKind: kind });
const sleep = (startMs: number, endMs: number | null, sleepKind: 'NAP' | 'NIGHT' = 'NAP') =>
  row({ type: 'sleep', startMs, endMs, sleepKind });
const pump = (startMs: number, ml: number) =>
  row({ type: 'pump', startMs, totalMl: ml, childId: null });

/** A week of plain days: eight feeds, six changes and a night's sleep each. */
function week(lastDay = 20, count = 7): TodayActivity[] {
  const out: TodayActivity[] = [];
  for (let d = lastDay - count + 1; d <= lastDay; d += 1) {
    for (let h = 1; h < 24; h += 3) out.push(bottle(at(h, 0, d)));
    for (let h = 2; h < 24; h += 4) out.push(diaper(at(h, 30, d)));
    out.push(sleep(at(13, 0, d), at(14, 30, d)));
  }
  return out;
}

const input = (
  rows: TodayActivity[],
  nowMs = NINE,
  key: 'week' | 'fortnight' | 'month' = 'week',
): GlanceInput => ({
  rows,
  running: NONE,
  range: rangeOf(key, TZ, nowMs),
  timeZone: TZ,
  nowMs,
  window: DEFAULT_DAY_WINDOW,
});

describe('a stretch of days is Today’s own arithmetic, summed', () => {
  const rows = [
    ...week(),
    water(at(10, 0, 18)),
    diaper(at(11, 0, 18), 'DRY'),
    diaper(at(12, 0, 18), 'BOTH'),
    pump(at(6, 0, 19), 150),
    breast(at(7, 0, 19)),
  ];
  const range = rangeOf('week', TZ, NINE);
  const buckets = dayBuckets(range, TZ);
  const w = windowFigures(rows, NONE, buckets, NINE);

  it('is todayTotals for each day, so a bar here is the tile on Today for that day', () => {
    buckets.forEach((day, i) => {
      const t = todayTotals(rows, NONE, day, NINE);
      expect(w.byDay.feeds[i], `feeds ${i}`).toBe(t.feeds);
      expect(w.byDay.sleepMinutes[i], `sleep ${i}`).toBe(t.sleepMinutes);
      expect(w.byDay.diapers[i], `diapers ${i}`).toBe(t.diapers);
      expect(w.byDay.pumpedMl[i], `pumped ${i}`).toBe(t.pumpedMl);
    });
  });

  it('agrees with the report series and the old headline, figure for figure', () => {
    const series = reportSeries(rows, NONE, range, TZ, NINE);
    expect(w.byDay.feeds).toEqual(series.feeds);
    expect(w.byDay.sleepMinutes).toEqual(series.sleepMinutes);
    expect(w.byDay.diapers).toEqual(series.diapers);
    const head = dashboardHeadline(rows, buckets, w.sleepMinutes, 0);
    expect(w.loggedDays).toBe(head.loggedDays);
    expect(w.feeds).toBe(head.feeds);
    expect(w.diapers).toBe(head.diapers);
    expect(w.perLoggedDay.feeds).toBeCloseTo(head.feedsPerLoggedDay, 9);
    expect(w.perLoggedDay.sleepMinutes).toBeCloseTo(head.sleepMinutesPerLoggedDay, 9);
  });

  it('leaves water out of the feeds and a dry check out of the changes, and counts a BOTH once', () => {
    const d18 = buckets.findIndex(b => b.startMs === localDayBounds(TZ, at(12, 0, 18)).startMs);
    // eight bottles of milk and the water bottle beside them; six changes, a dry check and a BOTH
    expect(w.byDay.feeds[d18]).toBe(8);
    expect(w.byDay.diapers[d18]).toBe(7);
    expect(w.kinds.both).toBe(1);
    expect(w.kinds.wet + w.kinds.dirty + w.kinds.both).toBe(w.diapers);
    expect(w.breastfeeds).toBe(1);
    expect(w.breastfeedMinutes).toBe(15);
    expect(w.pumpSessions).toBe(1);
    expect(w.has).toEqual({ feeds: true, sleep: true, diapers: true, pumped: true });
  });

  it('divides by the days with entries, and never by zero', () => {
    const three = windowFigures(week(20, 3), NONE, buckets, NINE);
    expect(three.loggedDays).toBe(3);
    expect(three.logged).toEqual([false, false, false, false, true, true, true]);
    expect(three.perLoggedDay.feeds).toBeCloseTo(three.feeds / 3, 9);
    const empty = windowFigures([], NONE, buckets, NINE);
    expect(empty.perLoggedDay).toEqual({ feeds: 0, sleepMinutes: 0, diapers: 0, pumpedMl: 0 });
    expect(empty.has).toEqual({ feeds: false, sleep: false, diapers: false, pumped: false });
  });
});

describe('the day’s sleep and its split are one figure', () => {
  it('naps with seconds in them: the figure is the naps as their rows say them', () => {
    // 44m 40s, 1h 29m 40s and 29m 35s from the timer: rows of 45m, 1h 30m and 30m. The figure
    // read 2h 44m over a split whose naps said 2h 45m (the pre-launch sweep, 2026-09-27)
    const naps = [
      sleep(at(8, 0), at(8, 0) + (44 * 60 + 40) * 1000),
      sleep(at(10, 0), at(10, 0) + (89 * 60 + 40) * 1000),
      sleep(at(11, 40), at(11, 40) + (29 * 60 + 35) * 1000),
    ];
    const g = dayGlance(input(naps, at(18, 0)));
    expect(g.figures.sleepMinutes).toBe(165);
    expect(g.sleep.nightMinutes + g.sleep.napMinutes + g.sleep.runningMinutes).toBe(165);
  });
});

describe('volumes in the household’s unit: the entries as they read, added up', () => {
  // a newborn's week: eight bottles of 1 oz a day, each stored as 30 ml — 56 of them, 1680 ml,
  // which as one sum is 56.81 oz and read "56.75 oz" (the pre-launch sweep, 2026-09-27)
  const rows: TodayActivity[] = [];
  for (let d = 14; d <= 20; d += 1)
    for (let h = 0; h < 24; h += 3) rows.push(bottle(at(h, 30, d), 30));
  const range = rangeOf('week', TZ, at(23, 59));
  const buckets = dayBuckets(range, TZ);

  it('the week, each day and the series say the ounces that were given', () => {
    const w = windowFigures(rows, NONE, buckets, at(23, 59), 'oz');
    expect(volumeText(w.milkMl, 'oz')).toBe('56 oz');
    const series = reportSeries(rows, NONE, range, TZ, at(23, 59), 'oz');
    expect(series.milkMl.map(ml => volumeText(ml, 'oz'))).toEqual(Array(7).fill('8 oz'));
    const glance = rangeGlance({ ...input(rows, at(23, 59)), unit: 'oz' });
    expect(volumeText(glance.figures.milkMl, 'oz')).toBe('56 oz');
  });

  it('without a unit, the stored ml as they are — what a milliliter household reads', () => {
    expect(windowFigures(rows, NONE, buckets, at(23, 59)).milkMl).toBe(56 * 30);
    expect(windowFigures(rows, NONE, buckets, at(23, 59), 'ml').milkMl).toBe(56 * 30);
  });
});

describe('the stretch before: the same days, cut at the same time of day', () => {
  it('is as many local days, ending where the range begins, its last one cut at now', () => {
    const range = rangeOf('week', TZ, NINE);
    const before = previousWindow(range, TZ, NINE);
    expect(before.whole).toHaveLength(7);
    expect(before.whole[6]?.endMs).toBe(range.fromMs);
    expect(before.whole[0]?.startMs).toBe(shiftDay(TZ, NINE, -13).startMs);
    for (let i = 1; i < 7; i += 1)
      expect(before.whole[i]?.startMs).toBe(before.whole[i - 1]?.endMs);
    // six whole days and that morning, up to nine, against six whole days and this morning
    expect(before.sameTime.slice(0, 6)).toEqual(before.whole.slice(0, 6));
    const last = before.sameTime[6]!;
    expect(last.endMs - last.startMs).toBe(9 * 3_600_000);
  });

  it('walks the calendar across the clocks going back, so it is still seven days', () => {
    const ny = 'America/New_York';
    const nov7 = zonedToUtc(ny, 2026, 11, 7, 12, 0);
    const before = previousWindow(rangeOf('week', ny, nov7), ny, nov7);
    expect(before.whole).toHaveLength(7);
    // Oct 25 – Oct 31 ends where Nov 1, the 25-hour day, begins
    expect(before.whole[0]?.startMs).toBe(zonedToUtc(ny, 2026, 10, 25));
    for (const b of before.whole)
      expect(localDayBounds(ny, b.startMs + 60_000).startMs).toBe(b.startMs);
  });

  it('is read from sixteen hours before it, so its first morning’s sleep is counted', () => {
    const range = rangeOf('week', TZ, NINE);
    const first = previousWindow(range, TZ, NINE).whole[0]!;
    expect(glanceReadFromMs(range, TZ, NINE)).toBe(first.startMs - 16 * 3_600_000);
  });
});

describe('today so far, against yesterday up to this time', () => {
  it('counts yesterday only up to the time of day it is now', () => {
    // yesterday: three feeds before nine and five after; today: five before nine
    const rows = [
      ...[1, 4, 7].map(h => bottle(at(h, 0, 19))),
      ...[10, 13, 16, 19, 22].map(h => bottle(at(h, 0, 19))),
      ...[0, 2, 4, 6, 8].map(h => bottle(at(h, 30, 20))),
    ];
    const g = dayGlance(input(rows));
    expect(g.figures.feeds).toBe(5);
    expect(g.previous.feeds).toBe(3);
    expect(g.comparisons.feeds).toEqual({ direction: 'more', amount: 2 });
  });

  it('draws nothing to compare when yesterday held none of that kind', () => {
    const rows = [bottle(at(7, 0, 19)), bottle(at(8, 0, 20)), diaper(at(8, 30, 20))];
    const g = dayGlance(input(rows));
    expect(g.comparisons.feeds).toEqual({ direction: 'same', amount: 0 });
    expect(g.comparisons.diapers).toBeUndefined();
    // and nothing today of a kind yesterday had is not a comparison either
    const quiet = dayGlance(input([diaper(at(7, 0, 19)), bottle(at(8, 0, 20))]));
    expect(quiet.comparisons.diapers).toBeUndefined();
  });

  it('reads the night 7 p.m. to 7 a.m. as last night, and nothing in it as no line at all', () => {
    const rows = [
      bottle(at(18, 50, 19)), // before the night began
      bottle(at(23, 40, 19)),
      bottle(at(3, 10, 20)),
      sleep(at(19, 30, 19), at(23, 30, 19), 'NIGHT'),
      sleep(at(0, 10, 20), at(6, 40, 20), 'NIGHT'),
    ];
    const g = dayGlance(input(rows));
    expect(g.lastNight).toEqual({ feeds: 2, longestMinutes: 390 });
    expect(dayGlance(input([bottle(at(8, 0, 20))])).lastNight).toBeNull();
  });

  it('splits the day’s sleep the way it was classified, the nap in progress apart', () => {
    const rows = [sleep(at(20, 0, 19), at(6, 0, 20), 'NIGHT'), sleep(at(7, 30, 20), at(8, 0, 20))];
    const running: ActiveTimer[] = [
      { id: 't', type: 'sleep', childId: 'ada', startedAtMs: at(8, 40, 20), startedBy: 'dana' },
    ];
    const g = dayGlance({ ...input(rows), running });
    expect(g.sleep).toEqual({ nightMinutes: 360, napMinutes: 30, runningMinutes: 20, naps: 1 });
    expect(g.figures.sleepMinutes).toBe(410);
  });

  it('counts the rash ticks of today only', () => {
    const rows = [
      row({ type: 'diaper', startMs: at(8, 0, 20), diaperKind: 'WET', diaperRash: true }),
      row({ type: 'diaper', startMs: at(8, 0, 19), diaperKind: 'WET', diaperRash: true }),
    ];
    expect(dayGlance(input(rows)).rash).toBe(1);
  });
});

describe('the pictures: when things happened, clipped to the day', () => {
  const day = localDayBounds(TZ, NINE);

  it('adds the sleep blocks up to the day’s sleep figure, to the minute', () => {
    const rows = [
      sleep(at(20, 0, 19), at(6, 10, 20), 'NIGHT'),
      sleep(at(7, 5, 20), at(7, 50, 20)),
      sleep(at(8, 20, 20), null), // saved without an end: no length, as todayTotals reads it
    ];
    const running: ActiveTimer[] = [
      { id: 't', type: 'sleep', childId: 'ada', startedAtMs: at(8, 30, 20), startedBy: 'dana' },
    ];
    const marks = dayMarks(rows, running, day, NINE);
    const minutes = marks.sleeps.reduce((sum, s) => sum + (s.toMs - s.fromMs), 0) / 60_000;
    expect(Math.round(minutes)).toBe(todayTotals(rows, running, day, NINE).sleepMinutes);
    // last night's sleep is clipped at midnight, and the timer runs to now
    expect(marks.sleeps[0]).toEqual({ fromMs: day.startMs, toMs: at(6, 10, 20), running: false });
    expect(marks.sleeps.at(-1)).toEqual({ fromMs: at(8, 30, 20), toMs: NINE, running: true });
  });

  it('marks the feeds and the changes the figures count, and no others', () => {
    const rows = [
      bottle(at(1, 0)),
      water(at(2, 0)),
      breast(at(3, 0)),
      diaper(at(4, 0), 'DRY'),
      diaper(at(5, 0), 'BOTH'),
      row({ type: 'diaper', startMs: at(6, 0) }),
      bottle(at(23, 0, 19)),
    ];
    const marks = dayMarks(rows, NONE, day, NINE);
    expect(marks.feeds.map(f => f.kind)).toEqual(['bottle', 'breast']);
    expect(marks.diapers.map(d => d.kind)).toEqual(['BOTH', null]);
    const totals = todayTotals(rows, NONE, day, NINE);
    expect(marks.feeds).toHaveLength(totals.feeds);
    expect(marks.diapers).toHaveLength(totals.diapers);
  });
});

describe('a range, and the stretch before it', () => {
  it('compares a day’s worth of each figure, over the days with entries', () => {
    // this week: eight feeds a day; the week before: seven, on every day. Late in the evening, so
    // the stretch before is cut after its last feed and the two weeks are whole
    const late = at(23, 30);
    const before: TodayActivity[] = [];
    for (let d = 7; d <= 13; d += 1)
      for (let h = 1; h < 22; h += 3) before.push(bottle(at(h, 0, d)));
    const g = rangeGlance(input([...before, ...week()], late));
    expect(g.comparisons.feeds).toEqual({ direction: 'more', amount: 1 });
    // at nine in the morning the week before is cut at nine too: its last day holds three feeds,
    // not seven, so the difference is the whole days' and that morning's — never all of that day
    const morning = rangeGlance(
      input([...before, ...week(19, 6), ...[1, 4, 7].map(h => bottle(at(h, 0, 20)))]),
    );
    expect(morning.previous.byDay.feeds.at(-1)).toBe(3);
    expect(morning.figures.byDay.feeds.at(-1)).toBe(3);
  });

  it('refuses to compare with a stretch that was barely logged', () => {
    // three days of the week before, of seven: under half, so no line at all
    const g = rangeGlance(input([...week(13, 3), ...week()]));
    expect(g.comparisons).toEqual({});
    // four of seven is half and more
    expect(rangeGlance(input([...week(13, 4), ...week()])).comparisons.feeds).toBeDefined();
  });

  it('draws a week a day at a time, and anything longer a week at a time', () => {
    const w = rangeGlance(input(week()));
    expect(w.diary).toHaveLength(7);
    expect(w.weeks).toBeNull();
    const month = rangeGlance(input(week(20, 30), NINE, 'month'));
    expect(month.diary).toBeNull();
    expect(month.weeks?.map(x => x.days)).toEqual([2, 7, 7, 7, 7]);
  });

  it('splits sleep over the days with entries, like every other "a day" on the card', () => {
    const rows = [...week(20, 3), sleep(at(20, 0, 19), at(5, 0, 20), 'NIGHT')];
    const g = rangeGlance(input(rows));
    expect(g.figures.loggedDays).toBe(3);
    const night = g.sleep.nightPerLoggedDay * 3;
    const nap = g.sleep.napPerLoggedDay * 3;
    expect(Math.round(night + nap)).toBe(g.figures.sleepMinutes);
    expect(g.sleep.napsPerLoggedDay).toBe(1);
    expect(g.sleep.averageNapMinutes).toBe(90);
  });
});

describe('weeks, counted back from today', () => {
  it('keeps the whole week at the recent end, and a short one at the old end', () => {
    const range = rangeOf('fortnight', TZ, NINE);
    const buckets = dayBuckets(range, TZ);
    const w = windowFigures(week(20, 10), NONE, buckets, NINE);
    const groups = weekGroups(w, buckets);
    expect(groups.map(g => g.days)).toEqual([7, 7]);
    expect(groups[1]?.toMs).toBe(range.toMs);
    // the older week holds three days with entries, and its "a day" is over those three
    expect(groups[0]?.loggedDays).toBe(3);
    expect(groups[0]?.perLoggedDay.feeds).toBe(8);
    expect(groups[1]?.perLoggedDay.feeds).toBe(8);
    expect(groups[1]?.loggedDays).toBe(7);
  });
});

describe('the rounding, stated once', () => {
  const W = (over: Partial<Record<GlanceFigure, number>>, days = 1) => {
    const base = windowFigures([], NONE, [], NINE);
    const v = { feeds: 0, sleep: 0, diapers: 0, pumped: 0, ...over };
    return {
      ...base,
      days,
      loggedDays: days,
      feeds: v.feeds,
      sleepMinutes: v.sleep,
      diapers: v.diapers,
      pumpedMl: v.pumped,
      perLoggedDay: {
        feeds: v.feeds,
        sleepMinutes: v.sleep,
        diapers: v.diapers,
        pumpedMl: v.pumped,
      },
      has: { feeds: true, sleep: true, diapers: true, pumped: true },
    };
  };
  const cmp = (
    cur: Partial<Record<GlanceFigure, number>>,
    prev: Partial<Record<GlanceFigure, number>>,
    days = 1,
  ) => compareWindows(W(cur, days), W(prev, days), W(prev, days), days);

  it('is exact for a day’s counts and about the same only under the steps', () => {
    expect(cmp({ feeds: 7 }, { feeds: 7 }).feeds).toEqual({ direction: 'same', amount: 0 });
    expect(cmp({ feeds: 5 }, { feeds: 7 }).feeds).toEqual({ direction: 'less', amount: 2 });
    expect(cmp({ sleep: 609 }, { sleep: 600 }).sleep?.direction).toBe('same');
    expect(cmp({ sleep: 612 }, { sleep: 600 }).sleep).toEqual({ direction: 'more', amount: 12 });
    expect(cmp({ pumped: 100 }, { pumped: 90 }).pumped?.direction).toBe('same');
    expect(cmp({ pumped: 120 }, { pumped: 90 }).pumped).toEqual({ direction: 'more', amount: 30 });
    expect(GLANCE_SAME.volumeMl).toBe(15);
  });

  it('rounds a range’s averages to a whole count and to five minutes', () => {
    expect(cmp({ feeds: 8.4 }, { feeds: 8 }, 7).feeds?.direction).toBe('same');
    expect(cmp({ feeds: 8.6 }, { feeds: 8 }, 7).feeds).toEqual({ direction: 'more', amount: 1 });
    expect(cmp({ sleep: 812 }, { sleep: 800 }, 7).sleep?.direction).toBe('same');
    expect(cmp({ sleep: 837 }, { sleep: 800 }, 7).sleep).toEqual({ direction: 'more', amount: 35 });
  });
});

describe('the words: how much, which way, than what — and never a verdict', () => {
  const fmt = {
    volume: (ml: number) => `${Math.round(ml / 29.5735)} oz`,
    duration: (min: number) =>
      min >= 60 ? `${Math.floor(min / 60)}h ${String(min % 60)}m` : `${min}m`,
  };

  it('says the owner’s two examples the way they said them', () => {
    expect(comparisonLine('feeds', { direction: 'more', amount: 2 }, 1, fmt)).toBe(
      '2 more than yesterday',
    );
    expect(comparisonLine('feeds', { direction: 'same', amount: 0 }, 7, fmt)).toBe(
      'about the same as the week before',
    );
  });

  it('counts in more and fewer, amounts in more and less, a range in "about … a day"', () => {
    expect(comparisonLine('diapers', { direction: 'less', amount: 1 }, 1, fmt)).toBe(
      '1 fewer than yesterday',
    );
    expect(comparisonLine('sleep', { direction: 'less', amount: 40 }, 1, fmt)).toBe(
      '40m less than yesterday',
    );
    expect(comparisonLine('sleep', { direction: 'same', amount: 0 }, 1, fmt)).toBe(
      'about the same as yesterday',
    );
    expect(comparisonLine('pumped', { direction: 'more', amount: 59 }, 14, fmt)).toBe(
      'about 2 oz more a day than the two weeks before',
    );
    expect(comparisonLine('feeds', { direction: 'less', amount: 1 }, 30, fmt)).toBe(
      'about 1 fewer a day than the 30 days before',
    );
  });

  it('shortens beside the figure: the sign replaces more and less, and the amount stands alone when even that is too long', () => {
    expect(comparisonShort('sleep', { direction: 'more', amount: 308 }, 1, fmt)).toBe(
      '+5h 8m than yesterday',
    );
    expect(comparisonTight('sleep', { direction: 'more', amount: 308 }, 1, fmt)).toBe('+5h 8m');
    expect(comparisonShort('feeds', { direction: 'more', amount: 2 }, 1, fmt)).toBe(
      '+2 than yesterday',
    );
    expect(comparisonTight('feeds', { direction: 'more', amount: 2 }, 1, fmt)).toBe('+2');
    expect(comparisonShort('diapers', { direction: 'less', amount: 1 }, 1, fmt)).toBe(
      '\u22121 than yesterday',
    );
    expect(comparisonShort('sleep', { direction: 'same', amount: 0 }, 1, fmt)).toBe(
      'same as yesterday',
    );
    expect(comparisonTight('sleep', { direction: 'same', amount: 0 }, 1, fmt)).toBe('same');
    expect(comparisonShort('pumped', { direction: 'more', amount: 59 }, 14, fmt)).toBe(
      '+2 oz a day than the two weeks before',
    );
    expect(comparisonTight('feeds', { direction: 'less', amount: 1 }, 30, fmt)).toBe('\u22121');
  });

  it('names the stretch before the way a person would', () => {
    expect([1, 7, 14, 30].map(compareSpan)).toEqual([
      'yesterday',
      'the week before',
      'the two weeks before',
      'the 30 days before',
    ]);
    expect(comparedWith(7)).toBe('than the week before');
    expect(comparedNote(1)).toBe('Compared with yesterday, up to this time of day.');
  });

  it('catches a verdict from any of the three lists', () => {
    for (const bad of [
      '2 more than yesterday — better',
      'a good night',
      'back to normal',
      'only 3 feeds',
      'not enough sleep',
      'she seems overtired',
      'sleeping longer than the week before',
      'you should feed sooner',
      'too many diapers',
    ])
      expect(glanceVerdictHits(bad), bad).not.toEqual([]);
    expect(GLANCE_VERDICTS).toContain('better');
    expect(GLANCE_VERDICTS).toContain('normal');
  });

  it('never writes one, at any amount, either way, for any figure and any span', () => {
    const lines: string[] = [];
    for (const figure of GLANCE_FIGURES)
      for (const days of [1, 7, 14, 30])
        for (const direction of ['more', 'less', 'same'] as const)
          for (const amount of [0, 1, 2, 5, 12, 35, 90, 125, 480]) {
            const c: Comparison = { direction, amount };
            lines.push(
              comparisonLine(figure, c, days, fmt),
              comparisonShort(figure, c, days, fmt),
              comparisonTight(figure, c, days, fmt),
            );
          }
    for (const days of [1, 7, 14, 30]) lines.push(comparedWith(days), comparedNote(days));
    expect(lines.length).toBeGreaterThan(400);
    for (const line of lines) expect(glanceVerdictHits(line), line).toEqual([]);
  });
});

describe('twins: each card its own child’s rows', () => {
  it('splits a household by child and leaves the pump to nobody', () => {
    const rows = [bottle(at(7)), { ...bottle(at(8)), childId: 'ben' }, pump(at(6), 120)];
    expect(rowsOfChild(rows, 'ada').map(r => r.startMs)).toEqual([at(7)]);
    expect(rowsOfChild(rows, 'ben').map(r => r.startMs)).toEqual([at(8)]);
    // and each child's comparisons are against that child's own yesterday — never the other's
    const ada = dayGlance(input([...rowsOfChild(rows, 'ada'), bottle(at(7, 30, 19))]));
    expect(ada.comparisons.feeds).toEqual({ direction: 'same', amount: 0 });
  });
});
