import { describe, expect, it } from 'vitest';
import { localDayBounds, zonedToUtc } from '../today/day';
import type { ActiveTimer, TodayActivity } from '../today/rows';
import { todayTotals } from '../today/totals';
import { diaperInsight, growthInsight, GROWTH_UNIT, milkFlow, sleepInsight } from './insights';
import { dayBuckets, RANGE_DAYS, rangeOf } from './range';
import { reportSeries } from './series';
import { DEFAULT_DAY_WINDOW } from '../today/dayWindow';

const TZ = 'America/Los_Angeles';
/** The default waking window: what fills the kind on an entry that carries none. */
const CLASSIFY = { timeZone: TZ, window: DEFAULT_DAY_WINDOW };
const at = (h: number, m = 0, day = 14): number => zonedToUtc(TZ, 2026, 9, day, h, m);
const NOON = at(12);
const WEEK = rangeOf('week', TZ, NOON);
const BUCKETS = dayBuckets(WEEK, TZ);

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
const NO_TIMERS: ActiveTimer[] = [];

describe('the 14-day window exists, because it is the interesting one', () => {
  it('sits between the week and the month, and the chips draw four', () => {
    expect(RANGE_DAYS.fortnight).toBe(14);
    expect(dayBuckets(rangeOf('fortnight', TZ, NOON), TZ)).toHaveLength(14);
  });
});

describe('sleepInsight — an entry with no kind falls to the household window', () => {
  // Every one of these was saved WITHOUT a kind: entries from before the window existed, and
  // any a caregiver saved straight from a timer. Before 0095 they all landed in the nap column,
  // which is how a 9 p.m. bedtime turned up as an afternoon nap in the report.
  const unclassified = [
    row({ type: 'sleep', startMs: at(22, 0, 13), endMs: at(5, 0, 14) }), // outside 07:00–19:30
    row({ type: 'sleep', startMs: at(13, 0, 14), endMs: at(14, 0, 14) }), // inside it
  ];

  it('reads the late one as night and the afternoon one as a nap', () => {
    const insight = sleepInsight(unclassified, NO_TIMERS, BUCKETS, WEEK, NOON, CLASSIFY);
    expect(insight.nights).toBe(1);
    expect(insight.naps).toBe(1);
    expect(insight.napMinutes).toBe(60);
    expect(insight.nightMinutes).toBe(120 + 300); // 22:00→00:00 on the 13th, 00:00→05:00 on the 14th
  });

  it('moves with the household own window, and only for entries that carry no kind', () => {
    // A night-shift household: up at 21:00, down at 09:00. The same two sleeps swap sides.
    const nightShift = { timeZone: TZ, window: { wake: '21:00', bed: '09:00' } };
    const insight = sleepInsight(unclassified, NO_TIMERS, BUCKETS, WEEK, NOON, nightShift);
    expect(insight.nights).toBe(1);
    expect(insight.naps).toBe(1);
    expect(insight.napMinutes).toBe(120 + 300);
    expect(insight.nightMinutes).toBe(60);

    // and an entry the parent DID classify is untouched by any window
    const stated = [
      row({ type: 'sleep', startMs: at(13, 0, 14), endMs: at(14, 0, 14), sleepKind: 'NIGHT' }),
    ];
    expect(sleepInsight(stated, NO_TIMERS, BUCKETS, WEEK, NOON, CLASSIFY).nights).toBe(1);
    expect(sleepInsight(stated, NO_TIMERS, BUCKETS, WEEK, NOON, nightShift).nights).toBe(1);
  });
});

describe('sleepInsight — the night, the naps, and what they add up to', () => {
  const rows = [
    // last night, 23:30 → 05:40 = 370 minutes: 30 of them on the 13th, 340 on the 14th
    row({ type: 'sleep', startMs: at(23, 30, 13), endMs: at(5, 40, 14), sleepKind: 'NIGHT' }),
    row({ type: 'sleep', startMs: at(9, 0, 14), endMs: at(9, 45, 14), sleepKind: 'NAP' }),
    row({ type: 'sleep', startMs: at(13, 0, 13), endMs: at(14, 30, 13), sleepKind: 'NAP' }),
  ];
  const insight = sleepInsight(rows, NO_TIMERS, BUCKETS, WEEK, NOON, CLASSIFY);

  it('splits by the kind the PARENT chose, never by a clock', () => {
    expect(insight.nightMinutes).toBe(30 + 340);
    expect(insight.napMinutes).toBe(45 + 90);
    expect(insight.nights).toBe(1);
    expect(insight.naps).toBe(2);
  });

  it('counts by overlap, so a night that crosses midnight lands on both days once', () => {
    expect(insight.nightByDay[5]).toBe(30);
    expect(insight.nightByDay[6]).toBe(340);
    expect(insight.nightByDay.reduce((a, b) => a + b, 0)).toBe(370);
  });

  it('gives the longest sleep to the day it BEGAN, not the day it ended', () => {
    // the night BEGAN on the 13th, so its whole 370 minutes are that day's longest, even
    // though 340 of them were slept on the 14th
    expect(insight.longestByDay[5]).toBe(370);
    expect(insight.longestByDay[6]).toBe(45);
    expect(insight.longestMinutes).toBe(370);
    expect(insight.longestAtMs).toBe(at(23, 30, 13));
  });

  it('averages over the days of the RANGE, and reports a share of a day', () => {
    expect(insight.perDayMinutes).toBeCloseTo(505 / 7, 6);
    expect(insight.napsPerDay).toBeCloseTo(2 / 7, 6);
    expect(insight.averageNapMinutes).toBeCloseTo((45 + 90) / 2, 6);
    expect(insight.averageNightMinutes).toBe(370);
    expect(insight.dayShare).toBeCloseTo(505 / 7 / 1440, 6);
  });

  it('agrees with the Today tiles: night + nap + in progress IS the total', () => {
    // the invariant that stops the insight card and the stat tile disagreeing
    const series = reportSeries(rows, NO_TIMERS, WEEK, TZ, NOON);
    for (let i = 0; i < BUCKETS.length; i += 1) {
      const fromInsight =
        (insight.nightByDay[i] ?? 0) + (insight.napByDay[i] ?? 0) + (insight.runningByDay[i] ?? 0);
      expect(fromInsight, `day ${i}`).toBe(series.sleepMinutes[i]);
    }
  });

  it('counts a sleep in progress as its own segment, so the three still sum to the total', () => {
    // a timer carries no kind (`ActiveTimer`), so it cannot join either side; giving it one
    // would be the app deciding a nap was a night
    const live: ActiveTimer[] = [
      { id: 't', type: 'sleep', childId: 'kid', startedAtMs: at(11, 30), startedBy: 'dana' },
    ];
    const withTimer = sleepInsight(rows, live, BUCKETS, WEEK, NOON, CLASSIFY);
    expect(withTimer.runningByDay[6]).toBe(30);
    expect(withTimer.napByDay[6]).toBe(insight.napByDay[6]);
    const totals = todayTotals(rows, live, localDayBounds(TZ, NOON), NOON);
    expect(
      (withTimer.nightByDay[6] ?? 0) +
        (withTimer.napByDay[6] ?? 0) +
        (withTimer.runningByDay[6] ?? 0),
    ).toBe(totals.sleepMinutes);
  });

  it('is all zeros, never NaN, for a household with no sleep logged', () => {
    const none = sleepInsight([], NO_TIMERS, BUCKETS, WEEK, NOON, CLASSIFY);
    for (const v of [
      none.perDayMinutes,
      none.averageNapMinutes,
      none.averageNightMinutes,
      none.longestMinutes,
      none.dayShare,
    ]) {
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBe(0);
    }
    expect(none.longestAtMs).toBeNull();
  });
});

describe('milkFlow — where the milk went', () => {
  const rows = [
    row({ type: 'bottle', startMs: at(8), consumedMl: 120 }),
    row({ type: 'bottle', startMs: at(13), consumedMl: 90 }),
    row({ type: 'breastfeed', startMs: at(11), endMs: at(11, 20) }),
    row({ type: 'pump', startMs: at(7), endMs: at(7, 20), totalMl: 150 }),
    row({ type: 'pump', startMs: at(15), endMs: at(15, 20), totalMl: 140 }),
  ];
  const flow = milkFlow(rows, reportSeries(rows, NO_TIMERS, WEEK, TZ, NOON), WEEK);

  it('reports both sides in the same unit, on one scale', () => {
    expect(flow.takenMl).toBe(210);
    expect(flow.pumpedMl).toBe(290);
    expect(flow.netMl).toBe(80);
  });

  it('counts a breastfeed as a feed even though it carries no millilitres', () => {
    expect(flow.feeds).toBe(3);
    expect(flow.bottles).toBe(2);
    expect(flow.breastfeeds).toBe(1);
    expect(flow.breastShare).toBeCloseTo(1 / 3, 6);
    expect(flow.feedsPerDay).toBeCloseTo(3 / 7, 6);
  });

  it('is 0 rather than NaN with nothing logged', () => {
    const none = milkFlow([], reportSeries([], NO_TIMERS, WEEK, TZ, NOON), WEEK);
    expect(none.breastShare).toBe(0);
    expect(none.netMl).toBe(0);
  });
});

describe('growthInsight — how fast, from their own measurements', () => {
  const rows = [
    row({ type: 'growth', startMs: at(9, 0, 1), weightG: 4200, lengthMm: 540, headMm: 370 }),
    row({ type: 'growth', startMs: at(9, 0, 8), lengthMm: 548 }),
    row({ type: 'growth', startMs: at(9, 0, 15), weightG: 4600, lengthMm: 556 }),
  ];

  it('takes one metric at a time, oldest first, skipping the entries that omit it', () => {
    const length = growthInsight(rows, 'length');
    expect(length?.points.map(p => p.value)).toEqual([540, 548, 556]);
    const weight = growthInsight(rows, 'weight');
    expect(weight?.points).toHaveLength(2);
    const head = growthInsight(rows, 'head');
    expect(head?.points).toHaveLength(1);
  });

  it('says how much, over how long, and how fast — the last in canonical units', () => {
    const length = growthInsight(rows, 'length');
    expect(length?.delta).toBe(16);
    expect(length?.spanDays).toBe(14);
    // 16 mm over 14 days is 34.3 mm over 30
    expect(length?.perMonth).toBeCloseTo((16 / 14) * 30, 5);
    expect(GROWTH_UNIT.length).toBe('mm');
    expect(GROWTH_UNIT.weight).toBe('g');
  });

  it('withholds the rate until a rate means something', () => {
    // two weigh-ins an hour apart would give "+38 kg a month", which is arithmetic on noise
    const sameDay = growthInsight(
      [
        row({ type: 'growth', startMs: at(9), weightG: 4200 }),
        row({ type: 'growth', startMs: at(17), weightG: 4230 }),
      ],
      'weight',
    );
    expect(sameDay?.points).toHaveLength(2);
    expect(sameDay?.perMonth).toBeNull();
    const one = growthInsight([row({ type: 'growth', startMs: at(9), weightG: 4200 })], 'weight');
    expect(one?.perMonth).toBeNull();
    expect(one?.delta).toBe(0);
  });

  it('is null — not an empty card — when the household measures nothing', () => {
    expect(growthInsight([], 'weight')).toBeNull();
    expect(growthInsight([row({ type: 'bottle', startMs: at(9) })], 'length')).toBeNull();
  });
});

describe('diaperInsight — the two kinds, and BOTH counted in each', () => {
  const rows = [
    row({ type: 'diaper', startMs: at(8), diaperKind: 'WET' }),
    row({ type: 'diaper', startMs: at(11), diaperKind: 'BOTH' }),
    row({ type: 'diaper', startMs: at(15), diaperKind: 'DIRTY' }),
    // a DRY check is kept in the timeline but is not a change (§6.4), here as everywhere
    row({ type: 'diaper', startMs: at(16), diaperKind: 'DRY' }),
  ];
  const insight = diaperInsight(rows, BUCKETS, WEEK);

  it('counts BOTH once in each kind, and once in the total', () => {
    expect(insight.wet).toBe(2);
    expect(insight.dirty).toBe(2);
    expect(insight.total).toBe(3);
    expect(insight.perDay).toBeCloseTo(3 / 7, 6);
  });

  it('leaves a dry check out, so the total matches the tile', () => {
    const series = reportSeries(rows, NO_TIMERS, WEEK, TZ, NOON);
    expect(insight.total).toBe(series.diapers.reduce((a, b) => a + b, 0));
  });

  /**
   * The rash tick, counted (the owner, 2026-09-19: it was stored and read back nowhere). A count,
   * and nothing else — `insights.ts` has no opinion about it and the card that shows it has none
   * either.
   */
  it('counts nothing when no entry carried the tick', () => {
    expect(insight.rash).toBe(0);
  });

  it('counts the entries whose rash switch was on, the DRY check among them', () => {
    const ticked = diaperInsight(
      [
        row({ type: 'diaper', startMs: at(8), diaperKind: 'WET', diaperRash: true }),
        row({ type: 'diaper', startMs: at(11), diaperKind: 'BOTH', diaperRash: false }),
        // DRY is out of the wet/dirty arithmetic but its other fields are still the record
        row({ type: 'diaper', startMs: at(16), diaperKind: 'DRY', diaperRash: true }),
        row({ type: 'bath', startMs: at(18), diaperRash: true }),
      ],
      BUCKETS,
      WEEK,
    );
    expect(ticked.rash).toBe(2);
    // …and WHEN, so the card and the visit sheet can both name the days (the owner, 2026-09-20)
    expect(ticked.rashAtMs).toHaveLength(2);
    expect([...ticked.rashAtMs].sort((a, b) => a - b)).toEqual(ticked.rashAtMs);
    // and the kinds are untouched by it
    expect(ticked.wet).toBe(2);
    expect(ticked.total).toBe(2);
  });

  it('ignores an entry outside the range, like every other figure here', () => {
    const old = diaperInsight(
      [
        row({
          type: 'diaper',
          startMs: at(8) - 40 * 86_400_000,
          diaperKind: 'WET',
          diaperRash: true,
        }),
      ],
      BUCKETS,
      WEEK,
    );
    expect(old.rash).toBe(0);
  });
});
