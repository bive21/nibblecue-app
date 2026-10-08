/**
 * The stash's days-left figure: ONE question — how long the stash covers if every feed came from
 * it — with the feeds a day read from the household's own log (the rhythm standing in while the
 * log is thin) and the usual bottle from the bottles it gave.
 */
import { describe, expect, it } from 'vitest';
import { ruleFrom, type Rule } from '../schedule/types';
import { localDayKey } from '../today/day';
import {
  FEED_DAY_SHARE,
  feedRateDays,
  feedsPerDayFrom,
  feedsPerDayFromLog,
  plannedDailyMl,
  SAME_FEED_MS,
  supplyOutlook,
  usualBottleMl,
  type FeedEntry,
} from './outlook';

const r = (input: Parameters<typeof ruleFrom>[0]): Rule => ruleFrom(input);

const OZ = 29.5735;
const MIN = 60_000;
const HOUR = 60 * MIN;
const TZ = 'America/Los_Angeles';
/** Noon on Wednesday the 23rd in the household's zone: the seven days before it are the window. */
const NOW = Date.parse('2026-09-23T19:00:00.000Z');
const DAYS = feedRateDays(TZ, NOW);

/** One day's feeds for one baby: a bottle or a breastfeed at each listed hour of that day. */
function day(
  bounds: { startMs: number },
  feeds: readonly (readonly ['bottle' | 'breastfeed', number, number?])[],
  childId = 'ada',
): FeedEntry[] {
  return feeds.map(([kind, hour, ml]) => ({
    kind,
    childId,
    startMs: bounds.startMs + hour * HOUR,
    ml: kind === 'bottle' ? (ml ?? null) : null,
  }));
}

/** The owner's household: four bottles of 3 oz and four breastfeeds, every day of the week. */
const HALF_AND_HALF: readonly (readonly ['bottle' | 'breastfeed', number, number?])[] = [
  ['breastfeed', 6],
  ['bottle', 9, 3 * OZ],
  ['breastfeed', 12],
  ['bottle', 15, 3 * OZ],
  ['breastfeed', 18],
  ['bottle', 21, 3 * OZ],
  ['breastfeed', 23.5],
  ['bottle', 2.5, 3 * OZ],
];

describe('the window', () => {
  it('is the seven complete days before today, in the household’s own zone', () => {
    expect(DAYS).toHaveLength(7);
    expect(localDayKey(TZ, DAYS[0]?.startMs ?? 0)).toBe('2026-09-16');
    expect(localDayKey(TZ, DAYS[6]?.startMs ?? 0)).toBe('2026-09-22');
  });
});

describe('how many feeds a day the household wrote down', () => {
  it('reads an interval', () => {
    expect(
      feedsPerDayFrom([
        r({ id: 'f', activity: 'bottle', ruleType: 'INTERVAL', everyMinutes: 180 }),
      ]),
    ).toBe(8);
  });
  it('counts set times, either kind of feed', () => {
    const times = ['07:00', '10:00', '13:00', '16:00', '19:00'].map(t =>
      r({ id: t, activity: 'breastfeed', ruleType: 'FIXED', atLocalTime: t }),
    );
    expect(feedsPerDayFrom(times)).toBe(5);
  });
  it('is null with no feeding rhythm at all', () => {
    expect(
      feedsPerDayFrom([r({ id: 'p', activity: 'pump', ruleType: 'INTERVAL', everyMinutes: 180 })]),
    ).toBe(null);
  });
  it("the owner's own arithmetic: every 3 hours at 3 oz is 24 oz a day", () => {
    const feeds = feedsPerDayFrom([
      r({ id: 'f', activity: 'bottle', ruleType: 'INTERVAL', everyMinutes: 180 }),
    ]);
    expect(plannedDailyMl(feeds, 89)).toBe(712); // ≈ 24 oz
  });
});

describe('how many feeds a day the household logged', () => {
  const week = DAYS.flatMap(d => day(d, HALF_AND_HALF));

  it('counts a bottle and a breastfeed alike: the owner’s half-and-half week is eight a day', () => {
    expect(feedsPerDayFromLog(week, DAYS)).toEqual({ perDay: 8, days: 7 });
  });

  it('counts a breastfeed and its top-up bottle as one feed, and a second side as the same feed', () => {
    const topped = DAYS.flatMap(d =>
      day(d, [
        ['breastfeed', 6],
        // the second side, then a top-up, each within half an hour of the entry before it
        ['breastfeed', 6.25],
        ['bottle', 6.6, 1 * OZ],
        ['breastfeed', 10],
        ['breastfeed', 14],
        ['breastfeed', 18],
      ]),
    );
    expect(feedsPerDayFromLog(topped, DAYS)).toEqual({ perDay: 4, days: 7 });
    expect(SAME_FEED_MS).toBe(30 * MIN);
  });

  it('counts each twin’s feed, however close together they are', () => {
    const twins = DAYS.flatMap(d => [
      ...day(d, HALF_AND_HALF, 'ada'),
      ...day(d, HALF_AND_HALF, 'bo'),
    ]);
    expect(feedsPerDayFromLog(twins, DAYS)).toEqual({ perDay: 16, days: 7 });
  });

  /**
   * THE FORGOTTEN ENTRY (the owner, 2026-09-26: "consider the human aspect of like forget to
   * logging"). A day nobody logged, and a day with most of its feeds never written down, are days
   * about the log, not about the feeds: they are not counted, and the count is not dragged down.
   */
  it('leaves out a day nobody logged and a day logged under half as fully as the usual one', () => {
    const holes = DAYS.flatMap((d, i) =>
      i === 2 ? [] : i === 4 ? day(d, HALF_AND_HALF.slice(0, 3)) : day(d, HALF_AND_HALF),
    );
    expect(3).toBeLessThan(8 * FEED_DAY_SHARE);
    expect(feedsPerDayFromLog(holes, DAYS)).toEqual({ perDay: 8, days: 5 });
  });

  it('keeps a day with one feed forgotten: the middle day still says eight', () => {
    const one = DAYS.flatMap((d, i) =>
      i === 3 ? day(d, HALF_AND_HALF.slice(1)) : day(d, HALF_AND_HALF),
    );
    expect(feedsPerDayFromLog(one, DAYS)).toEqual({ perDay: 8, days: 7 });
  });

  it('says nothing from fewer than three whole days, and never counts today', () => {
    const young = [DAYS[5], DAYS[6]].flatMap(d => (d === undefined ? [] : day(d, HALF_AND_HALF)));
    expect(feedsPerDayFromLog(young, DAYS)).toBeNull();
    // today's feeds are half a day, and are not in the window at all
    const today = day({ startMs: (DAYS[6]?.endMs ?? 0) + 0 }, HALF_AND_HALF);
    expect(feedsPerDayFromLog([...young, ...today], DAYS)).toBeNull();
  });
});

describe('the usual bottle', () => {
  it('is the middle of the bottles given', () => {
    const bottles = DAYS.flatMap(d =>
      day(d, [
        ['bottle', 8, 3 * OZ],
        ['bottle', 12, 3 * OZ],
        ['bottle', 16, 4 * OZ],
      ]),
    );
    expect(usualBottleMl(bottles)).toBeCloseTo(3 * OZ, 5);
  });

  it('leaves out a top-up given within half an hour of a breastfeed, before or after it', () => {
    const topped = DAYS.flatMap(d =>
      day(d, [
        ['breastfeed', 6],
        ['bottle', 6.3, 1 * OZ],
        ['bottle', 9.6, 1 * OZ],
        ['breastfeed', 9.9],
        ['bottle', 13, 3 * OZ],
        ['bottle', 17, 3 * OZ],
      ]),
    );
    expect(usualBottleMl(topped)).toBeCloseTo(3 * OZ, 5);
  });

  it('is unknown for a household that nurses every feed and never logged a bottle', () => {
    expect(
      usualBottleMl(
        DAYS.flatMap(d =>
          day(d, [
            ['breastfeed', 6],
            ['breastfeed', 9],
          ]),
        ),
      ),
    ).toBe(null);
    // a bottle logged without an amount says nothing about its size
    expect(usualBottleMl(day(DAYS[0] ?? { startMs: 0 }, [['bottle', 8]]))).toBe(null);
  });
});

describe('the days left', () => {
  const week = DAYS.flatMap(d => day(d, HALF_AND_HALF));
  const logged = feedsPerDayFromLog(week, DAYS)?.perDay ?? null;
  const bottle = usualBottleMl(week);
  const stored = 1000 * OZ;

  /**
   * THE OWNER'S EXAMPLE, EXACTLY. Four bottles of 3 oz and four breastfeeds a day, 1,000 oz in the
   * freezer. The bottles alone come to 12 oz a day — about 83 days — but if every feed came from
   * the stash it would be 24 oz a day, and the stash lasts about 41.
   */
  it('covers every feed: 1,000 oz at eight feeds of 3 oz a day is about 41 days, not 83', () => {
    const o = supplyOutlook({
      totalMl: stored,
      loggedFeedsPerDay: logged,
      plannedFeedsPerDay: null,
      bottleMl: bottle,
      breastfeeds: true,
      // what actually came OUT of the stash over the week: the four bottles a day
      usedMl: 7 * 12 * OZ,
      useCount: 28,
      daysCovered: 7,
    });
    expect(o).toMatchObject({ days: 41, feedsPerDay: 8, basis: 'logged' });
    expect(o?.perDayMl).toBeCloseTo(24 * OZ, 5);
    // and the stash's own pace, as the second figure, for a household that also nurses
    expect(o?.pace?.days).toBe(83);
    expect(o?.pace?.perDayMl).toBeCloseTo(12 * OZ, 5);
  });

  it('answers the same question every week: the stash’s own pace never becomes the divisor', () => {
    const thinStash = supplyOutlook({
      totalMl: stored,
      loggedFeedsPerDay: logged,
      plannedFeedsPerDay: 8,
      bottleMl: bottle,
      breastfeeds: true,
      usedMl: 0,
      useCount: 0,
      daysCovered: 1,
    });
    const busyStash = supplyOutlook({
      totalMl: stored,
      loggedFeedsPerDay: logged,
      plannedFeedsPerDay: 8,
      bottleMl: bottle,
      breastfeeds: true,
      usedMl: 7 * 12 * OZ,
      useCount: 28,
      daysCovered: 7,
    });
    expect(thinStash?.days).toBe(41);
    expect(busyStash?.days).toBe(41);
    // a stash pace that is not a rate yet is not offered at all
    expect(thinStash?.pace).toBeNull();
  });

  it('stands on the rhythm while the log is too thin, and says so', () => {
    const o = supplyOutlook({
      totalMl: stored,
      loggedFeedsPerDay: null,
      plannedFeedsPerDay: 8,
      bottleMl: 89,
      breastfeeds: false,
      usedMl: 0,
      useCount: 0,
      daysCovered: 0,
    });
    expect(o).toMatchObject({ basis: 'planned', feedsPerDay: 8, perDayMl: 712, days: 41 });
    expect(o?.pace).toBeNull();
  });

  it('gives no second figure to a household that only gives bottles', () => {
    const o = supplyOutlook({
      totalMl: stored,
      loggedFeedsPerDay: 8,
      plannedFeedsPerDay: null,
      bottleMl: 89,
      breastfeeds: false,
      usedMl: 7 * 24 * OZ,
      useCount: 56,
      daysCovered: 7,
    });
    expect(o?.pace).toBeNull();
  });

  it('a stash under a day is hours, never a zero — and a sliver is an hour', () => {
    const base = {
      loggedFeedsPerDay: null,
      plannedFeedsPerDay: 8,
      bottleMl: 89,
      breastfeeds: false,
      usedMl: 0,
      useCount: 0,
      daysCovered: 0,
    };
    expect(supplyOutlook({ ...base, totalMl: 240 })).toMatchObject({ days: 0, hours: 8 });
    expect(supplyOutlook({ ...base, totalMl: 5 })?.hours).toBe(1);
  });

  it('drops the column when the stash is empty, or there is no daily need to divide by', () => {
    const base = {
      totalMl: 900,
      loggedFeedsPerDay: 8,
      plannedFeedsPerDay: 8,
      bottleMl: 89,
      breastfeeds: false,
      usedMl: 500,
      useCount: 5,
      daysCovered: 7,
    };
    expect(supplyOutlook({ ...base, totalMl: 0 })).toBe(null);
    // nursing every feed with no bottle ever logged or set: no usual bottle, no number
    expect(supplyOutlook({ ...base, bottleMl: null, breastfeeds: true })).toBe(null);
    // no feeds a day from the log or a rhythm
    expect(supplyOutlook({ ...base, loggedFeedsPerDay: null, plannedFeedsPerDay: null })).toBe(
      null,
    );
  });
});
