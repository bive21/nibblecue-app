import { describe, expect, it } from 'vitest';
import { localDayBounds, zonedToUtc } from '../today/day';
import type { ActiveTimer, TodayActivity } from '../today/rows';
import { todayTotals } from '../today/totals';
import {
  OBSERVATION_HINT,
  observationFacts,
  observations,
  reportBannedHits,
  REPORT_BANNED,
} from './observations';
import {
  clampToHistory,
  dayBuckets,
  historyFloorMs,
  RANGE_DAYS,
  rangeOf,
  RANGE_MAX_DAYS,
} from './range';
import { daysWithEntries, inRange, reportSeries } from './series';
import { averageGapMinutes, feedGapMinutes, reportStats } from './stats';

const TZ = 'America/Los_Angeles';
/** September 2026 in Los Angeles: no DST edge, so the plain cases stay plain. */
const at = (h: number, m = 0, day = 14): number => zonedToUtc(TZ, 2026, 9, day, h, m);
const NOON = at(12);

let seq = 0;
const row = (over: Partial<TodayActivity> & Pick<TodayActivity, 'type' | 'startMs'>) => {
  seq += 1;
  return {
    id: `a${seq}`,
    childId: 'kid',
    endMs: null,
    isPrivate: false,
    createdBy: 'dana',
    ...over,
  } as TodayActivity;
};
const NOTHING: ActiveTimer[] = [];
const fmt = {
  volume: (ml: number) => `${Math.round(ml / 29.5735)} oz`,
  duration: (min: number) =>
    min >= 60 ? `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, '0')}m` : `${min}m`,
};

describe('rangeOf — whole local days, ending with today', () => {
  it('covers the preset’s days, the last of which is today', () => {
    for (const key of ['today', 'week', 'month'] as const) {
      const r = rangeOf(key, TZ, NOON);
      expect(r.days).toBe(RANGE_DAYS[key]);
      expect(r.toMs).toBe(localDayBounds(TZ, NOON).endMs);
      expect(dayBuckets(r, TZ)).toHaveLength(RANGE_DAYS[key]);
    }
  });

  it('starts at the first instant of the first day and ends after the last', () => {
    const week = rangeOf('week', TZ, NOON);
    const buckets = dayBuckets(week, TZ);
    expect(buckets[0]?.startMs).toBe(week.fromMs);
    expect(buckets[buckets.length - 1]?.endMs).toBe(week.toMs);
    // contiguous, oldest first, no gap and no overlap
    for (let i = 1; i < buckets.length; i += 1) {
      expect(buckets[i]?.startMs).toBe(buckets[i - 1]?.endMs);
    }
  });

  it('walks the CALENDAR across a DST change, not 24-hour steps', () => {
    // 2026-11-01 is when New York leaves DST: that local day is 25 hours long, so a week
    // measured as 7 × 86 400 000 would start an hour late and the first bar would be short
    const ny = 'America/New_York';
    const noonNov3 = zonedToUtc(ny, 2026, 11, 3, 12, 0);
    const week = rangeOf('week', ny, noonNov3);
    const buckets = dayBuckets(week, ny);
    expect(buckets).toHaveLength(7);
    for (let i = 1; i < buckets.length; i += 1) {
      expect(buckets[i]?.startMs).toBe(buckets[i - 1]?.endMs);
    }
    expect(week.toMs - week.fromMs).toBe(7 * 86_400_000 + 3_600_000);
    // and every bucket begins at local midnight, the long day included
    for (const b of buckets) expect(localDayBounds(ny, b.startMs + 60_000).startMs).toBe(b.startMs);
  });

  it('a custom range is ordered, widened to whole days, and capped', () => {
    const backwards = rangeOf('custom', TZ, NOON, { fromMs: at(9, 0, 16), toMs: at(23, 30, 14) });
    const forwards = rangeOf('custom', TZ, NOON, { fromMs: at(23, 30, 14), toMs: at(9, 0, 16) });
    expect(backwards).toEqual(forwards);
    expect(backwards.days).toBe(3);
    expect(backwards.fromMs).toBe(localDayBounds(TZ, at(1, 0, 14)).startMs);
    expect(backwards.toMs).toBe(localDayBounds(TZ, at(1, 0, 16)).endMs);

    const huge = rangeOf('custom', TZ, NOON, {
      fromMs: at(12, 0, 14) - 5 * 365 * 86_400_000,
      toMs: NOON,
    });
    expect(huge.days).toBe(RANGE_MAX_DAYS);
    // the cap moves the START: the recent end is the half a person asking for "everything" means
    expect(huge.toMs).toBe(localDayBounds(TZ, NOON).endMs);
  });

  it('never returns fewer than one day, whatever it is handed', () => {
    const same = rangeOf('custom', TZ, NOON, { fromMs: NOON, toMs: NOON });
    expect(same.days).toBe(1);
    expect(dayBuckets(same, TZ)).toHaveLength(1);
  });
});

describe('clampToHistory — the free window narrows the chart, it does not refuse it', () => {
  it('keeps the most recent N days and leaves the key alone', () => {
    const month = rangeOf('month', TZ, NOON);
    const held = clampToHistory(month, TZ, 7);
    expect(held.key).toBe('month');
    expect(held.days).toBe(7);
    expect(held.toMs).toBe(month.toMs);
    expect(held.fromMs).toBe(rangeOf('week', TZ, NOON).fromMs);
  });

  it('does nothing when the plan has no window, or the range already fits', () => {
    const month = rangeOf('month', TZ, NOON);
    expect(clampToHistory(month, TZ, null)).toEqual(month);
    expect(clampToHistory(month, TZ, 30)).toEqual(month);
    expect(clampToHistory(rangeOf('today', TZ, NOON), TZ, 7)).toEqual(rangeOf('today', TZ, NOON));
  });

  /**
   * THE FLOOR AND THE CLAMP ARE THE SAME ARITHMETIC, and that is the point of the function: the
   * Activity log and Reports both narrow to the free window, and one of them being a day out would
   * put an entry on a list the other says does not exist.
   */
  it('puts the floor exactly where the clamped range starts', () => {
    expect(historyFloorMs(NOON, TZ, 7)).toBe(
      clampToHistory(rangeOf('month', TZ, NOON), TZ, 7).fromMs,
    );
    expect(historyFloorMs(NOON, TZ, 7)).toBe(rangeOf('week', TZ, NOON).fromMs);
  });

  it('reaches everything when the plan has no window', () => {
    expect(historyFloorMs(NOON, TZ, null)).toBeNull();
  });

  it('is a whole local day, so "7 days" is seven headings and not 168 hours', () => {
    const floor = historyFloorMs(NOON, TZ, 7) as number;
    // midnight local, and an entry logged at 00:01 seven days ago is INSIDE the window
    expect(floor).toBe(zonedToUtc(TZ, 2026, 9, 8, 0, 0));
    expect(zonedToUtc(TZ, 2026, 9, 8, 0, 1)).toBeGreaterThan(floor);
    // while 23:59 the day before is outside it
    expect(zonedToUtc(TZ, 2026, 9, 7, 23, 59)).toBeLessThan(floor);
  });

  it('one day means today only', () => {
    expect(historyFloorMs(NOON, TZ, 1)).toBe(rangeOf('today', TZ, NOON).fromMs);
  });
});

describe('reportSeries — the report and Today are the same arithmetic', () => {
  const rows = [
    row({ type: 'bottle', startMs: at(8), consumedMl: 120 }),
    row({ type: 'bottle', startMs: at(13), consumedMl: 90 }),
    row({ type: 'diaper', startMs: at(9), diaperKind: 'WET' }),
    row({ type: 'sleep', startMs: at(1), endMs: at(3), sleepKind: 'NIGHT' }),
    row({ type: 'pump', startMs: at(7), endMs: at(7, 20), totalMl: 150 }),
    // yesterday, so the week has more than one bar
    row({ type: 'bottle', startMs: at(10, 0, 13), consumedMl: 100 }),
    row({ type: 'diaper', startMs: at(11, 0, 13), diaperKind: 'BOTH' }),
  ];

  it('the LAST bucket of a range equals `todayTotals` over the same rows', () => {
    // the invariant that stops the two screens disagreeing; if this breaks, one of them is lying
    const week = reportSeries(rows, NOTHING, rangeOf('week', TZ, NOON), TZ, NOON);
    const last = week.points[week.points.length - 1];
    expect(last?.totals).toEqual(todayTotals(rows, NOTHING, localDayBounds(TZ, NOON), NOON));
  });

  it('gives one point per day, oldest first, with yesterday in its own bucket', () => {
    const week = reportSeries(rows, NOTHING, rangeOf('week', TZ, NOON), TZ, NOON);
    expect(week.points).toHaveLength(7);
    expect(week.milkMl[6]).toBe(210);
    expect(week.milkMl[5]).toBe(100);
    expect(week.milkMl.slice(0, 5)).toEqual([0, 0, 0, 0, 0]);
    expect(week.diapers[6]).toBe(1);
    expect(week.diapers[5]).toBe(1);
  });

  it('splits a sleep across midnight the way the day tiles do, exactly once', () => {
    const overnight = [row({ type: 'sleep', startMs: at(23, 30, 13), endMs: at(0, 40, 14) })];
    const week = reportSeries(overnight, NOTHING, rangeOf('week', TZ, NOON), TZ, NOON);
    expect(week.sleepMinutes[5]).toBe(30);
    expect(week.sleepMinutes[6]).toBe(40);
    expect(week.sleepMinutes.reduce((a, b) => a + b, 0)).toBe(70);
  });

  it('says how much of the window was actually used', () => {
    const week = reportSeries(rows, NOTHING, rangeOf('week', TZ, NOON), TZ, NOON);
    expect(daysWithEntries(week)).toBe(2);
    expect(week.points).toHaveLength(7);
  });

  it('`inRange` takes a session by the day its START falls in', () => {
    const week = rangeOf('week', TZ, NOON);
    expect(inRange(rows, week)).toHaveLength(rows.length);
    expect(inRange(rows, rangeOf('today', TZ, NOON))).toHaveLength(5);
  });
});

describe('reportStats — sums, counts and two different divisors', () => {
  const rows = [
    row({ type: 'bottle', startMs: at(8), consumedMl: 120 }),
    row({ type: 'bottle', startMs: at(13), consumedMl: 90 }),
    row({ type: 'bottle', startMs: at(10, 0, 13), consumedMl: 90 }),
    row({ type: 'pump', startMs: at(7), endMs: at(7, 20), totalMl: 150 }),
    row({ type: 'pump', startMs: at(15), endMs: at(15, 25), totalMl: 130 }),
    row({ type: 'sleep', startMs: at(1), endMs: at(3), sleepKind: 'NIGHT' }),
    row({ type: 'sleep', startMs: at(14), endMs: at(14, 45), sleepKind: 'NAP' }),
    row({ type: 'diaper', startMs: at(9), diaperKind: 'WET' }),
    row({ type: 'diaper', startMs: at(16), diaperKind: 'BOTH' }),
    row({ type: 'breastfeed', startMs: at(6), endMs: at(6, 25) }),
    row({ type: 'breastfeed', startMs: at(11), endMs: at(11, 15) }),
  ];
  const range = rangeOf('week', TZ, NOON);
  const series = reportSeries(rows, NOTHING, range, TZ, NOON);
  const stats = reportStats(rows, series, range);

  it('averages an amount over its SESSIONS', () => {
    expect(stats.milk.totalMl).toBe(300);
    expect(stats.milk.count).toBe(3);
    expect(stats.milk.averageMl).toBe(100);
    expect(stats.pump.totalMl).toBe(280);
    expect(stats.pump.count).toBe(2);
    expect(stats.pump.averageMl).toBe(140);
  });

  it('averages a count over the DAYS OF THE RANGE, not the days with entries', () => {
    // two diapers over a seven-day window is 0.29 a day. Dividing by the one logged day would
    // say 2.0, which flatters the number into meaning nothing.
    expect(stats.diapers.total).toBe(2);
    expect(stats.diapers.perDay).toBeCloseTo(2 / 7, 6);
    expect(stats.sleep.perDayMinutes).toBeCloseTo(165 / 7, 6);
  });

  it('counts sleep by overlap and stretches by start, and finds the longest', () => {
    expect(stats.sleep.minutes).toBe(165);
    expect(stats.sleep.stretches).toBe(2);
    expect(stats.sleep.longestMinutes).toBe(120);
  });

  it('reports the breastfeeding block, interval included', () => {
    expect(stats.breastfeed.sessions).toBe(2);
    expect(stats.breastfeed.minutes).toBe(40);
    expect(stats.breastfeed.averageMinutes).toBe(20);
    expect(stats.breastfeed.averageIntervalMinutes).toBe(300);
  });

  it('is 0 rather than NaN where there is nothing to divide by', () => {
    const empty = rangeOf('today', TZ, at(12, 0, 1));
    const none = reportStats([], reportSeries([], NOTHING, empty, TZ, at(12, 0, 1)), empty);
    for (const v of [
      none.milk.averageMl,
      none.pump.averageMl,
      none.breastfeed.averageMinutes,
      none.sleep.perDayMinutes,
      none.diapers.perDay,
      none.sleep.longestMinutes,
    ]) {
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBe(0);
    }
    expect(none.breastfeed.averageIntervalMinutes).toBeNull();
  });
});

describe('averageGapMinutes — start to start, across midnight', () => {
  it('is the mean gap between consecutive starts', () => {
    expect(averageGapMinutes([{ startMs: at(6) }, { startMs: at(9) }, { startMs: at(12) }])).toBe(
      180,
    );
  });

  it('spans midnight rather than restarting at it', () => {
    expect(averageGapMinutes([{ startMs: at(23, 40, 13) }, { startMs: at(2, 10, 14) }])).toBe(150);
  });

  it('is null with fewer than two, and sorts what it is given', () => {
    expect(averageGapMinutes([])).toBeNull();
    expect(averageGapMinutes([{ startMs: at(9) }])).toBeNull();
    expect(averageGapMinutes([{ startMs: at(12) }, { startMs: at(6) }])).toBe(360);
  });

  it('treats a bottle and a breastfeed as one rhythm', () => {
    const rows = [
      row({ type: 'bottle', startMs: at(6) }),
      row({ type: 'breastfeed', startMs: at(9) }),
      row({ type: 'bottle', startMs: at(12) }),
      row({ type: 'diaper', startMs: at(7) }),
    ];
    expect(feedGapMinutes(rows, rangeOf('today', TZ, NOON))).toBe(180);
  });
});

describe('the observations are arithmetic, and the lint proves it', () => {
  const rows = [
    row({ type: 'bottle', startMs: at(8), consumedMl: 120 }),
    row({ type: 'bottle', startMs: at(11), consumedMl: 90 }),
    row({ type: 'pump', startMs: at(7), endMs: at(7, 20), totalMl: 150 }),
    row({ type: 'sleep', startMs: at(1), endMs: at(3) }),
  ];
  const range = rangeOf('today', TZ, NOON);
  const stats = reportStats(rows, reportSeries(rows, NOTHING, range, TZ, NOON), range);
  const lines = observations(stats, fmt, feedGapMinutes(rows, range));

  it('says the four §8 facts, each with its own sample size', () => {
    expect(lines).toHaveLength(4);
    expect(lines[0]).toBe('A bottle was 4 oz on average, over 2 bottles.');
    expect(lines[1]).toBe('Feeds were 3h 00m apart on average, start to start.');
    expect(lines[2]).toBe('A pumping session gave 5 oz on average, over 1 session.');
    expect(lines[3]).toBe('The longest sleep logged was 2h 00m.');
  });

  it('omits a sentence it has no entries for rather than saying zero', () => {
    const only = [row({ type: 'diaper', startMs: at(9), diaperKind: 'WET' })];
    const r = rangeOf('today', TZ, NOON);
    const s = reportStats(only, reportSeries(only, NOTHING, r, TZ, NOON), r);
    expect(observations(s, fmt, feedGapMinutes(only, r))).toEqual([]);
  });

  it('carries no verdict, no advice and no comparison — at any sample size', () => {
    const sizes = [1, 2, 7, 100];
    for (const n of sizes) {
      const many = Array.from({ length: n }, (_, i) =>
        row({ type: 'bottle', startMs: at(6) + i * 60_000, consumedMl: 100 + i }),
      );
      const r = rangeOf('week', TZ, NOON);
      const s = reportStats(many, reportSeries(many, NOTHING, r, TZ, NOON), r);
      for (const fact of observationFacts(s, fmt, feedGapMinutes(many, r))) {
        for (const line of [fact.sentence, fact.label, fact.value, fact.note ?? '']) {
          expect(reportBannedHits(line), line).toEqual([]);
        }
      }
    }
  });

  it('exempts the HINT, which is the one sentence allowed to name what it refuses to judge', () => {
    // §8's wording is verbatim and it names the four things on purpose: "no judgment of
    // amounts, supply, sleep or growth". The lint flags `supply` — correctly, for a sentence
    // that makes a claim — so the hint is asserted by its exact text instead. A disclaimer is
    // the one place a banned word is the point rather than the defect.
    expect(reportBannedHits(OBSERVATION_HINT)).toEqual(['supply']);
    expect(OBSERVATION_HINT).toMatch(/no judgment of/i);
  });

  it('the lint itself catches what a well-meaning edit would reach for', () => {
    expect(reportBannedHits('Milk intake was low this week.')).toContain('low');
    expect(reportBannedHits('Sleep is better than last week.')).toContain('better');
    expect(reportBannedHits('We recommend a longer stretch.')).toContain('recommend');
    expect(reportBannedHits('Your supply looks healthy.')).toEqual(
      expect.arrayContaining(['supply', 'healthy']),
    );
    expect(REPORT_BANNED.length).toBeGreaterThan(30);
  });

  it('states §8’s hint verbatim', () => {
    expect(OBSERVATION_HINT).toBe(
      'Arithmetic on your entries only. No judgment of amounts, supply, sleep or growth.',
    );
  });
});
