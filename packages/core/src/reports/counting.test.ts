/**
 * WHAT A REPORT COUNTS — the audit fixes of 2026-09-24, each against the surface a parent reads.
 *
 *   - A bottle of WATER is not milk and not a feed (the feeding audit, M7, decided by the owner's
 *     review): out of the milk total, the bottle count and average, the feed count, the gap
 *     between feeds, the night feeds and the clock's "Feeds" ring. Still in the log.
 *   - A DRY check is not a diaper change (the care audit, M2): out of the headline's diapers a
 *     day and the clock's "Diapers" ring, as it already was out of the diaper card.
 *   - A breastfeed lasts the minutes at the breast, left plus right (the feeding audit, H1), not
 *     the wall clock a pause stretched.
 *   - The sleep that began before the range counts for its part inside it, once it is read
 *     (the care audit, H7): `overlapReadFromMs` is how far back to read.
 */
import { describe, expect, it } from 'vitest';
import { localDayBounds, zonedToUtc } from '../today/day';
import { DEFAULT_DAY_WINDOW } from '../today/dayWindow';
import type { ActiveTimer, TodayActivity } from '../today/rows';
import { todayTotals } from '../today/totals';
import { clockRings, dashboardHeadline, nightInsight } from './dashboard';
import { milkFlow, overlapReadFromMs, OVERLAP_READ_BACK_MS, sleepInsight } from './insights';
import { dayBuckets, rangeOf } from './range';
import { inRange, reportSeries } from './series';
import { feedGapMinutes, reportStats } from './stats';

const TZ = 'America/Los_Angeles';
const at = (h: number, m = 0, day = 14): number => zonedToUtc(TZ, 2026, 9, day, h, m);
const NOON = at(12);
const WEEK = rangeOf('week', TZ, NOON);
const BUCKETS = dayBuckets(WEEK, TZ);
const NOTHING: ActiveTimer[] = [];
const CLASSIFY = { timeZone: TZ, window: DEFAULT_DAY_WINDOW };
const HOUR = 3_600_000;

let seq = 0;
const row = (over: Partial<TodayActivity> & Pick<TodayActivity, 'type' | 'startMs'>) => {
  seq += 1;
  return {
    id: `c${seq}`,
    childId: 'kid',
    endMs: null,
    isPrivate: false,
    createdBy: 'dana',
    ...over,
  } as TodayActivity;
};

describe('a bottle of water is not milk and not a feed', () => {
  const rows = [
    row({ type: 'bottle', startMs: at(8), consumedMl: 120, bottleKind: 'EBM' }),
    row({ type: 'bottle', startMs: at(10), consumedMl: 60, bottleKind: 'WATER' }),
    row({ type: 'bottle', startMs: at(11), consumedMl: 90, bottleKind: 'FORMULA' }),
    row({ type: 'breastfeed', startMs: at(6), endMs: at(6, 20) }),
    // 2 a.m.: a water bottle in the night window, and one feed
    row({ type: 'bottle', startMs: at(2, 0, 13), consumedMl: 30, bottleKind: 'WATER' }),
    row({ type: 'bottle', startMs: at(3, 0, 13), consumedMl: 90, bottleKind: 'EBM' }),
  ];
  const series = reportSeries(rows, NOTHING, WEEK, TZ, NOON);

  it('leaves it out of the milk total, the bottle count and the average bottle', () => {
    const stats = reportStats(rows, series, WEEK);
    expect(stats.milk.totalMl).toBe(300);
    expect(stats.milk.count).toBe(3);
    expect(stats.milk.averageMl).toBe(100);
  });

  it('leaves it out of the feeds, the share at the breast and the gap between feeds', () => {
    const milk = milkFlow(rows, series, WEEK);
    expect(milk.bottles).toBe(3);
    expect(milk.feeds).toBe(4);
    expect(milk.breastShare).toBe(0.25);
    expect(series.feeds.reduce((a, b) => a + b, 0)).toBe(4);
    // start to start over the four feeds: 03:00 on the 13th to 11:00 on the 14th is 32 h / 3
    expect(feedGapMinutes(rows, WEEK)).toBe(Math.round((32 * 60) / 3));
  });

  it('is not a night feed, and not on the clock ring drawn under "Feeds"', () => {
    const night = nightInsight(rows, BUCKETS);
    // the night that began on the evening of the 12th holds the 3 a.m. bottle and not the water
    expect(night.feedsByNight[BUCKETS.length - 3]).toBe(1);
    const [bottles] = clockRings(rows, BUCKETS, ['bottle']);
    expect(bottles?.byHour[10]).toBe(0);
    expect(bottles?.byHour[2]).toBe(0);
    expect(bottles?.total).toBe(3);
  });

  it('is not a feed in the headline either', () => {
    expect(dashboardHeadline(rows, BUCKETS, 0, 0).feeds).toBe(4);
  });
});

describe('a DRY check is not a diaper change, on every report figure', () => {
  const rows = [
    row({ type: 'diaper', startMs: at(9), diaperKind: 'WET' }),
    row({ type: 'diaper', startMs: at(10), diaperKind: 'DRY' }),
    row({ type: 'diaper', startMs: at(11), diaperKind: 'DRY' }),
  ];

  it('counts one diaper a day in the headline, as the diaper card does — not three', () => {
    const h = dashboardHeadline(rows, BUCKETS, 0, 0);
    expect(h.diapers).toBe(1);
    expect(h.diapersPerLoggedDay).toBe(1);
  });

  it('leaves the dry checks off the clock ring drawn under "Diapers"', () => {
    const [ring] = clockRings(rows, BUCKETS, ['diaper']);
    expect(ring?.total).toBe(1);
    expect(ring?.byHour[10]).toBe(0);
  });
});

describe('the headline counts only what started inside the range', () => {
  it('ignores a feed and a diaper from the evening before the range began', () => {
    const before = WEEK.fromMs - 3 * HOUR;
    const h = dashboardHeadline(
      [
        row({ type: 'bottle', startMs: before, consumedMl: 90 }),
        row({ type: 'diaper', startMs: before, diaperKind: 'WET' }),
        row({ type: 'bottle', startMs: at(9), consumedMl: 90 }),
      ],
      BUCKETS,
      0,
      0,
    );
    expect(h.feeds).toBe(1);
    expect(h.diapers).toBe(0);
  });
});

describe('a breastfeed lasts the minutes at the breast', () => {
  it('averages the recorded minutes, not the span a pause stretched', () => {
    // a feed paused for twelve minutes: 08:00 to 08:30 on the clock, 18 minutes at the breast
    const rows = [
      row({
        type: 'breastfeed',
        startMs: at(8),
        endMs: at(8, 30),
        leftSeconds: 600,
        rightSeconds: 480,
      }),
      // a feed from before sides were recorded still reads its span
      row({ type: 'breastfeed', startMs: at(11), endMs: at(11, 22) }),
    ];
    const stats = reportStats(rows, reportSeries(rows, NOTHING, WEEK, TZ, NOON), WEEK);
    expect(stats.breastfeed.minutes).toBe(40);
    expect(stats.breastfeed.averageMinutes).toBe(20);
  });
});

/*
  LAST NIGHT'S SLEEP IS PART OF TODAY (the care audit, H7). A sleep from 8 p.m. to 6 a.m.: at noon
  Today's tile says 6h, and a report that read only rows STARTING in its range said nothing.
*/
describe('the sleep that began before the range', () => {
  const today = rangeOf('today', TZ, NOON);
  const buckets = dayBuckets(today, TZ);
  const lastNight = row({
    type: 'sleep',
    startMs: at(20, 0, 13),
    endMs: at(6),
    sleepKind: 'NIGHT',
  });
  const evening = row({ type: 'bottle', startMs: at(19, 0, 13), consumedMl: 120 });
  const all = [lastNight, evening];

  it('reads back sixteen hours, which reaches any evening sleep still running at midnight', () => {
    expect(OVERLAP_READ_BACK_MS).toBe(16 * HOUR);
    expect(overlapReadFromMs(today)).toBe(today.fromMs - 16 * HOUR);
    expect(lastNight.startMs).toBeGreaterThanOrEqual(overlapReadFromMs(today));
  });

  it('was missing when only the rows that started in the range were read', () => {
    const readFromRange = all.filter(r => r.startMs >= today.fromMs);
    const sleep = sleepInsight(readFromRange, NOTHING, buckets, today, NOON, CLASSIFY);
    expect(sleep.perDayMinutes).toBe(0);
  });

  it('counts its part inside the range once it is read, and agrees with Today', () => {
    const read = all.filter(r => r.startMs >= overlapReadFromMs(today));
    const sleep = sleepInsight(read, NOTHING, buckets, today, NOON, CLASSIFY);
    const series = reportSeries(read, NOTHING, today, TZ, NOON);
    expect(sleep.nightMinutes).toBe(6 * 60);
    expect(sleep.perDayMinutes).toBe(6 * 60);
    expect(series.sleepMinutes).toEqual([6 * 60]);
    expect(series.sleepMinutes[0]).toBe(
      todayTotals(read, NOTHING, localDayBounds(TZ, NOON), NOON).sleepMinutes,
    );
  });

  it('brings in nothing that is counted by its start: last evening’s bottle stays out', () => {
    const read = all.filter(r => r.startMs >= overlapReadFromMs(today));
    const series = reportSeries(read, NOTHING, today, TZ, NOON);
    const stats = reportStats(read, series, today);
    expect(stats.milk.totalMl).toBe(0);
    expect(stats.milk.count).toBe(0);
    expect(stats.sleep.stretches).toBe(0);
    expect(inRange(read, today)).toEqual([]);
    expect(dashboardHeadline(read, buckets, 0, 0).feeds).toBe(0);
  });
});
