/**
 * A report's per-day numbers (PRODUCT_SPEC.md §8's four charts: milk/day, pumping output/day,
 * sleep hours/day, diaper changes/day).
 *
 * IT REUSES `todayTotals`, ONE BUCKET AT A TIME, and that is the whole design. Today's tiles and
 * a report's last bar are the same question asked twice, and the two answers have to agree or
 * the report is the thing a parent stops trusting. Re-deriving the sums here would mean a second
 * implementation of two rules that are easy to get wrong and invisible when they are:
 *
 *   - sleep is counted by OVERLAP with the local day, so a nap from 23:30 to 00:40 gives 30
 *     minutes to one day and 40 to the next, and the two days add up to the nap exactly once;
 *   - a running sleep timer contributes the part that has already happened, to today only.
 *
 * `reports.test.ts` asserts the agreement directly — the last bucket of a 7-day series equals
 * `todayTotals` over the same rows — so the two can never drift apart silently.
 *
 * Rows are expected to be filtered for the child in view and for visibility already, exactly as
 * `todayTotals` expects them: this function does not know who is looking.
 */
import type { VolumeUnit } from '../entry/units';
import type { DayBounds } from '../today/day';
import type { ActiveTimer, TodayActivity } from '../today/rows';
import { todayTotals, type TodayTotals } from '../today/totals';
import { dayBuckets, type ReportRange } from './range';

export interface DayPoint {
  day: DayBounds;
  totals: TodayTotals;
}

export interface ReportSeries {
  /** One point per local day of the range, oldest first. */
  points: DayPoint[];
  milkMl: number[];
  pumpedMl: number[];
  sleepMinutes: number[];
  diapers: number[];
  feeds: number[];
}

/** `unit` is the household's milk unit, as `todayTotals` takes it: each day adds its amounts as they read. */
export function reportSeries(
  rows: readonly TodayActivity[],
  running: readonly ActiveTimer[],
  range: ReportRange,
  timeZone: string,
  nowMs: number,
  unit?: VolumeUnit,
): ReportSeries {
  const points = dayBuckets(range, timeZone).map(day => ({
    day,
    totals: todayTotals(rows, running, day, nowMs, unit),
  }));
  return {
    points,
    milkMl: points.map(p => p.totals.milkMl),
    pumpedMl: points.map(p => p.totals.pumpedMl),
    sleepMinutes: points.map(p => p.totals.sleepMinutes),
    diapers: points.map(p => p.totals.diapers),
    feeds: points.map(p => p.totals.feeds),
  };
}

/** The rows whose START falls inside the range — what a COUNT of sessions means. */
export const inRange = <T extends { startMs: number }>(
  rows: readonly T[],
  range: ReportRange,
): T[] => rows.filter(r => r.startMs >= range.fromMs && r.startMs < range.toMs);

/**
 * The days that hold at least one entry of any kind.
 *
 * Every per-day average in this file divides by the range's whole length, not by this — thirty
 * days with four logged is four bottles over thirty days, and dividing by four would flatter the
 * number into meaninglessness. It is here because a household that has used the app for two days
 * needs the screen to say so rather than draw twenty-eight empty bars as if they were zeros.
 */
export const daysWithEntries = (series: ReportSeries): number =>
  series.points.filter(
    p =>
      p.totals.milkMl > 0 ||
      p.totals.pumpedMl > 0 ||
      p.totals.sleepMinutes > 0 ||
      p.totals.diapers > 0 ||
      p.totals.feeds > 0,
  ).length;
