import { describe, expect, it } from 'vitest';
import { zonedToUtc } from '../today/day';
import type { TodayActivity } from '../today/rows';
import {
  CLOCK_HOURS,
  clockRings,
  DASHBOARD_CARDS,
  dashboardHeadline,
  dashboardPlan,
  hourOfDay,
  NIGHT_FROM_HOUR,
  NIGHT_TO_HOUR,
  nightInsight,
} from './dashboard';
import { dayBuckets, rangeOf } from './range';

const TZ = 'America/Los_Angeles';
const at = (h: number, m = 0, day = 14): number => zonedToUtc(TZ, 2026, 9, day, h, m);
const NOON = at(12);
const WEEK = rangeOf('week', TZ, NOON);
const BUCKETS = dayBuckets(WEEK, TZ);

let seq = 0;
const row = (over: Partial<TodayActivity> & Pick<TodayActivity, 'type' | 'startMs'>) => {
  seq += 1;
  return {
    id: `d${seq}`,
    childId: 'kid',
    endMs: null,
    isPrivate: false,
    createdBy: 'dana',
    ...over,
  } as TodayActivity;
};

describe('the clock is the household’s own day drawn as a shape', () => {
  it('counts starts by local hour, midnight first', () => {
    const rows = [
      row({ type: 'bottle', startMs: at(3, 10, 12) }),
      row({ type: 'bottle', startMs: at(3, 50, 13) }),
      row({ type: 'bottle', startMs: at(19, 0, 13) }),
      row({ type: 'sleep', startMs: at(13, 0, 13), endMs: at(14, 30, 13) }),
    ];
    const [bottles, sleeps] = clockRings(rows, BUCKETS, ['bottle', 'sleep']);
    expect(bottles?.byHour).toHaveLength(CLOCK_HOURS);
    expect(bottles?.byHour[3]).toBe(2);
    expect(bottles?.byHour[19]).toBe(1);
    expect(bottles?.total).toBe(3);
    expect(bottles?.peakHour).toBe(3);
    // a nap counts once, at the hour it began — not as two hours of shading
    expect(sleeps?.byHour[13]).toBe(1);
    expect(sleeps?.byHour[14]).toBe(0);
  });

  it('has no peak and no total when nothing of that type was logged', () => {
    const [ring] = clockRings([row({ type: 'bottle', startMs: at(9) })], BUCKETS, ['pump']);
    expect(ring?.total).toBe(0);
    expect(ring?.peakHour).toBeNull();
  });

  it('clamps the hour index, so a 25-hour day cannot produce an hour 24', () => {
    const day = BUCKETS[0]!;
    expect(hourOfDay(day.startMs, day)).toBe(0);
    expect(hourOfDay(day.startMs + 25 * 3_600_000, day)).toBe(23);
    expect(hourOfDay(day.startMs - 5_000, day)).toBe(0);
  });

  it('ignores entries that fall outside the range’s own days', () => {
    const [ring] = clockRings([row({ type: 'bottle', startMs: at(9, 0, 1) })], BUCKETS, ['bottle']);
    expect(ring?.total).toBe(0);
  });
});

describe('a night is a night, not a calendar day', () => {
  it('puts a 23:40 feed and a 02:10 feed in the same night', () => {
    const rows = [
      row({ type: 'bottle', startMs: at(23, 40, 12) }),
      row({ type: 'breastfeed', startMs: at(2, 10, 13) }),
      // 18:00 is before the window opens and belongs to the day, not the night
      row({ type: 'bottle', startMs: at(18, 0, 12) }),
    ];
    const n = nightInsight(rows, BUCKETS);
    const i = BUCKETS.findIndex(d => at(23, 40, 12) >= d.startMs && at(23, 40, 12) < d.endMs);
    expect(n.feedsByNight[i]).toBe(2);
    expect(n.nights).toBe(1);
    expect(n.feedsPerNight).toBe(2);
    expect(NIGHT_FROM_HOUR).toBe(19);
    expect(NIGHT_TO_HOUR).toBe(7);
  });

  it('takes the longest completed overnight sleep and remembers when it began', () => {
    const start = at(22, 0, 12);
    const rows = [
      row({ type: 'sleep', startMs: start, endMs: at(4, 30, 13) }),
      row({ type: 'sleep', startMs: at(5, 0, 13), endMs: at(6, 0, 13) }),
      // still running: no end, so no length, so it cannot be the longest
      row({ type: 'sleep', startMs: at(21, 0, 13), endMs: null }),
    ];
    const n = nightInsight(rows, BUCKETS);
    expect(n.bestMinutes).toBe(390);
    expect(n.bestAtMs).toBe(start);
    expect(n.averageLongestMinutes).toBe(390);
  });

  it('averages over nights that held something, never over empty ones', () => {
    const rows = [row({ type: 'bottle', startMs: at(23, 0, 13) })];
    const n = nightInsight(rows, BUCKETS);
    expect(n.nights).toBe(1);
    expect(n.feedsPerNight).toBe(1);
    expect(n.feedsByNight.filter(x => x === 0).length).toBeGreaterThan(0);
  });
});

describe('the headline divides by days with entries', () => {
  it('does not dilute an average with days nobody logged', () => {
    const rows = [
      row({ type: 'bottle', startMs: at(9, 0, 13) }),
      row({ type: 'bottle', startMs: at(13, 0, 13) }),
      row({ type: 'diaper', startMs: at(9, 30, 13), diaperKind: 'WET' }),
      row({ type: 'bottle', startMs: at(9, 0, 14) }),
    ];
    const h = dashboardHeadline(rows, BUCKETS, 600, 300);
    expect(h.days).toBe(7);
    expect(h.loggedDays).toBe(2);
    expect(h.feeds).toBe(3);
    expect(h.feedsPerLoggedDay).toBe(1.5);
    expect(h.sleepMinutesPerLoggedDay).toBe(300);
    expect(h.diapersPerLoggedDay).toBe(0.5);
    expect(h.longestSleepMinutes).toBe(300);
  });

  it('never divides by zero on an empty range', () => {
    const h = dashboardHeadline([], BUCKETS, 0, 0);
    expect(h.loggedDays).toBe(0);
    expect(h.feedsPerLoggedDay).toBe(0);
  });
});

describe('the order comes from what this household logs', () => {
  const base = { hasStash: false, hasSchedule: false, diaperEngaged: false };

  /*
    THE CARDS UNDER TODAY AND THE RANGE (2026-09-26). The two lead cards are on every page with an
    entry and are not in the plan; the old rhythm, night, sleep, feeding and diaper cards are gone as
    cards — their figures lead, their charts sit behind one "See the charts".
  */
  it('ends with the charts, the last section before Memories, once anything is charted', () => {
    // the owner, 2026-10-06: "move the plus feature see the chart and usual windows to the last
    // report section on the most bottom before memories"
    const feedsOnly = dashboardPlan({ ...base, rows: [row({ type: 'bottle', startMs: NOON })] });
    expect(feedsOnly).toEqual(['observations', 'charts', 'patterns']);
    const diapersOnly = dashboardPlan({
      ...base,
      rows: [row({ type: 'diaper', startMs: NOON, diaperKind: 'WET' })],
    });
    expect(diapersOnly.at(-1)).toBe('charts');
    for (const gone of ['rhythm', 'night', 'sleep', 'feeding', 'diapers'])
      expect(DASHBOARD_CARDS as readonly string[], gone).not.toContain(gone);
  });

  it('puts the usual windows under the charts, on feeds or sleeps alone', () => {
    const both = dashboardPlan({
      ...base,
      rows: [row({ type: 'bottle', startMs: NOON }), row({ type: 'sleep', startMs: at(13) })],
    });
    expect(both.slice(-2)).toEqual(['charts', 'patterns']);
    // after every free card, growth and the stash among them
    const full = dashboardPlan({
      ...base,
      hasStash: true,
      rows: [row({ type: 'bottle', startMs: NOON }), row({ type: 'growth', startMs: at(13) })],
    });
    expect(full).toEqual(['growth', 'stash', 'observations', 'charts', 'patterns']);

    const sleepOnly = dashboardPlan({ ...base, rows: [row({ type: 'sleep', startMs: at(13) })] });
    expect(sleepOnly.slice(-2)).toEqual(['charts', 'patterns']);

    // every window is built from a feed or a sleep, so a household that logs neither has none
    const diapersOnly = dashboardPlan({
      ...base,
      rows: [row({ type: 'diaper', startMs: NOON, diaperKind: 'WET' })],
    });
    expect(diapersOnly).not.toContain('patterns');
  });

  it('never shows the stool card to a household that does not log diapers', () => {
    const rows = [row({ type: 'diaper', startMs: NOON, diaperKind: 'WET' })];
    expect(dashboardPlan({ ...base, rows })).not.toContain('stool');
    expect(dashboardPlan({ ...base, rows, diaperEngaged: true })).toContain('stool');
  });

  it('shows nothing at all for an empty range', () => {
    expect(dashboardPlan({ ...base, rows: [] })).toEqual([]);
  });

  it('keeps the stash and schedule cards on their callers’ own answers', () => {
    const rows = [row({ type: 'pump', startMs: NOON, totalMl: 90 })];
    expect(dashboardPlan({ ...base, rows })).toEqual(['observations']);
    expect(dashboardPlan({ ...base, rows, hasStash: true, hasSchedule: true })).toEqual([
      'stash',
      'schedule',
      'observations',
    ]);
  });
});
