/**
 * The stat tiles and the two blocks under them (PRODUCT_SPEC.md §8).
 *
 * EVERY FIGURE IS A SUM, A COUNT OR A QUOTIENT OF THE TWO. Nothing here compares a household to
 * another household, to a guideline, or to its own past; nothing is flagged, colored or ranked.
 * That is not caution, it is the product (CLAUDE.md §2 rules 1 and 3) — and it is also why the
 * shapes below are so plain. A field called `averageMl` can only ever be read one way.
 *
 * TWO DIVISORS, AND THEY ARE DIFFERENT ON PURPOSE:
 *   - "average per session" divides by the number of sessions, so it is undefined with none and
 *     reports 0 rather than NaN;
 *   - "average per day" divides by the number of days in the RANGE, not by the days that have
 *     an entry. Four bottles in thirty days is 0.13 bottles a day. Dividing by the four logged
 *     days would say 1.0 and mean nothing. `daysWithEntries` exists so the screen can say how
 *     much of the window was actually used, which is the honest way to carry that caveat.
 *
 * Sleep is the one figure taken from the SERIES rather than from the rows, because sleep is
 * counted by overlap with each local day (`series.ts` says why); every other figure counts a
 * session by the day its start falls in.
 */
import type { TodayActivity } from '../today/rows';
import { countsAsFeed, countsAsMilk, recordedMs } from '../today/totals';
import { inRange, type ReportSeries } from './series';
import type { ReportRange } from './range';

const MIN = 60_000;

export interface AmountStat {
  /** ml, canonical. The screen converts at the edge. */
  totalMl: number;
  count: number;
  /** Per session, 0 when there were none. */
  averageMl: number;
}

export interface SleepStat {
  minutes: number;
  /** Over the days of the RANGE, not the days with sleep in them. */
  perDayMinutes: number;
  /** Sessions whose start falls in the range — "stretch count" in §8. */
  stretches: number;
  /** The longest single logged sleep, by its own duration. 0 when there is none. */
  longestMinutes: number;
}

export interface CountStat {
  total: number;
  perDay: number;
}

export interface BreastfeedStat {
  sessions: number;
  minutes: number;
  /** Per session, 0 with none. */
  averageMinutes: number;
  /** Mean gap between consecutive starts; null with fewer than two sessions. */
  averageIntervalMinutes: number | null;
}

export interface ReportStats {
  milk: AmountStat;
  pump: AmountStat;
  sleep: SleepStat;
  diapers: CountStat;
  breastfeed: BreastfeedStat;
  /** Feeds of both kinds, for the interval observation. */
  feeds: CountStat;
}

const mean = (total: number, n: number): number => (n > 0 ? total / n : 0);
/**
 * An entry's length as it was RECORDED (`recordedMs`): a breastfeed's minutes at the breast,
 * left plus right, not the wall clock from start to end — a pause or a Finish tapped while paused
 * stretched that, and Reports printed "30m" for a feed the toast had called 18 min (the feeding
 * audit, H1). Every other type is its span.
 */
const durationMinutes = (r: TodayActivity): number => Math.round(recordedMs(r) / MIN);

export function reportStats(
  rows: readonly TodayActivity[],
  series: ReportSeries,
  range: ReportRange,
): ReportStats {
  const days = Math.max(1, range.days);
  const scoped = inRange(rows, range);
  // the bottles the milk total is made of: a water bottle is in neither (`countsAsMilk`), so the
  // average bottle is milk over milk bottles rather than milk over every bottle
  const bottles = scoped.filter(countsAsMilk);
  const pumps = scoped.filter(r => r.type === 'pump');
  const sleeps = scoped.filter(r => r.type === 'sleep');
  const breastfeeds = scoped.filter(r => r.type === 'breastfeed');

  const milkMl = series.milkMl.reduce((a, b) => a + b, 0);
  const pumpedMl = series.pumpedMl.reduce((a, b) => a + b, 0);
  const sleepMinutes = series.sleepMinutes.reduce((a, b) => a + b, 0);
  const diapers = series.diapers.reduce((a, b) => a + b, 0);
  const feeds = series.feeds.reduce((a, b) => a + b, 0);
  const bfMinutes = breastfeeds.reduce((sum, r) => sum + durationMinutes(r), 0);

  return {
    milk: {
      totalMl: milkMl,
      count: bottles.length,
      averageMl: mean(milkMl, bottles.length),
    },
    pump: {
      totalMl: pumpedMl,
      count: pumps.length,
      averageMl: mean(pumpedMl, pumps.length),
    },
    sleep: {
      minutes: sleepMinutes,
      perDayMinutes: sleepMinutes / days,
      stretches: sleeps.length,
      longestMinutes: sleeps.reduce((max, r) => Math.max(max, durationMinutes(r)), 0),
    },
    diapers: { total: diapers, perDay: diapers / days },
    feeds: { total: feeds, perDay: feeds / days },
    breastfeed: {
      sessions: breastfeeds.length,
      minutes: bfMinutes,
      averageMinutes: mean(bfMinutes, breastfeeds.length),
      averageIntervalMinutes: averageGapMinutes(breastfeeds),
    },
  };
}

/**
 * The mean gap between consecutive starts, in minutes.
 *
 * START to start, like everything else that measures a rhythm in this app
 * (`schedule/sessions.ts` `intervalAnchor` records why at length). It spans midnight and it
 * spans the range's own edges, so a feed at 23:40 and the next at 02:10 is a gap of 150
 * minutes rather than two separate days — which is what a parent means by "how often".
 */
export function averageGapMinutes(rows: readonly { startMs: number }[]): number | null {
  if (rows.length < 2) return null;
  const starts = rows.map(r => r.startMs).sort((a, b) => a - b);
  const first = starts[0] as number;
  const last = starts[starts.length - 1] as number;
  return Math.round((last - first) / (starts.length - 1) / MIN);
}

/**
 * Feeds of both kinds, for "a feed about every N" — bottle and breast are one rhythm. A bottle of
 * water is not a feed (`countsAsFeed`), so it never shortens the gap.
 */
export function feedGapMinutes(rows: readonly TodayActivity[], range: ReportRange): number | null {
  return averageGapMinutes(inRange(rows, range).filter(countsAsFeed));
}
