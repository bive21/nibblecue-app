/**
 * "YOUR WEEK", AS THE WEEK'S RECORDS ADD UP (the owner's handoff, 2026-10-08, "Your week · Option 1,
 * weekly totals first"; docs/CELEBRATIONS.md §4).
 *
 * WHAT IT MEASURES IS REPORTS' OWN ARITHMETIC. Every figure is summed one local day at a time from
 * `todayTotals`, the function Today's tiles and Reports' days already share, so the sheet and the
 * full report cannot disagree about a sleep that crossed midnight (counted by its overlap with each
 * day), a feed at the breast (the minutes its sides recorded, never the span a pause stretched), a
 * bottle (milk only, never water, what was taken and never what was offered) or a change (never a
 * DRY check). Running timers are not records yet: none is passed in, so a sleep still being timed
 * adds nothing until it is saved.
 *
 * WHICH CATEGORIES APPEAR is the week's own records, never today's Quick log tiles: a category with
 * at least one record in the week is shown, in the fixed order `WEEK_CATEGORIES`, and one with none
 * is left out rather than drawn as a zero (no record is not an explicit zero).
 *
 * EACH AVERAGE HAS ITS OWN DENOMINATOR: the distinct local days on which THAT category was recorded
 * with a usable measurement, never the days the household logged anything, and never seven by
 * default. A category with a record whose amount or duration was not entered keeps its known total
 * and says how many were not measured, and has no average at all — an average over a partly
 * measured week would be a smaller number than the truth.
 *
 * PUMPING IS THE PARENT'S, beside the baby's and never inside it: its own row, its own days, and it
 * never makes a day count as a day the baby had entries.
 *
 * THE PATTERN is a fact about the records and nothing more: on at least `PATTERN_MIN_NIGHTS` nights
 * with a recorded night-sleep start, the 30-minute window most of them started in, with its count.
 * Not a bedtime, not advice, not a forecast; with fewer nights, nothing.
 */
import { volumeAsRead, type VolumeUnit } from '../entry/units';
import { dayBuckets, type ReportRange } from '../reports/range';
import { wallMinutes } from '../schedule/time';
import { localDayKey } from '../today/day';
import type { TodayActivity } from '../today/rows';
import { countsAsMilk, recordedMs, todayTotals } from '../today/totals';

export type WeekCategory = 'sleep' | 'bottle' | 'nursing' | 'diapers' | 'solids';

/** The cards' order. Four at most are cards; any fifth is a compact row under them. */
export const WEEK_CATEGORIES: readonly WeekCategory[] = [
  'sleep',
  'bottle',
  'nursing',
  'diapers',
  'solids',
];
export const WEEK_MAX_CARDS = 4;

export interface WeekMetric {
  category: WeekCategory;
  /**
   * The week's total: minutes (sleep, nursing), ml (bottle) or a count (diapers, meals). A
   * category none of whose records was measured is its record count instead (`measure: 'count'`).
   */
  total: number;
  measure: 'minutes' | 'ml' | 'count';
  /** The records counted. */
  entries: number;
  /** Records whose amount or duration was not entered: kept in `entries`, never as a zero. */
  unmeasured: number;
  /** Distinct local days with a record of this category. */
  days: number;
  /** `total` per recorded day, or null where an average would mislead (anything unmeasured). */
  average: number | null;
}

export interface WeekPumping {
  ml: number;
  sessions: number;
  days: number;
  unmeasured: number;
  average: number | null;
  /** Who logged the sessions: the sheet calls them "Your pumping" only when they are all the viewer's. */
  loggedBy: string[];
}

export interface WeekPattern {
  /** Minutes after midnight, local: the window's start and end (the end may be past midnight). */
  fromMinute: number;
  toMinute: number;
  /** Nights whose night sleep started inside the window, of `nights` with a recorded start. */
  count: number;
  nights: number;
}

export interface WeekReport {
  /** Distinct local days with a baby-care record (pumping never counts toward it). */
  babyDays: number;
  /** The categories with records, in `WEEK_CATEGORIES` order. */
  metrics: WeekMetric[];
  pumping: WeekPumping | null;
  pattern: WeekPattern | null;
}

/** The fewest nights with a recorded start before a window is named: a product rule, not a clinical one. */
export const PATTERN_MIN_NIGHTS = 5;
const PATTERN_WINDOW_MIN = 30;
const PATTERN_STEP_MIN = 15;
const DAY_MIN = 24 * 60;

const per = (total: number, days: number, unmeasured: number): number | null =>
  unmeasured > 0 || days === 0 ? null : total / days;

export function weekReport(input: {
  /** The child's records and the household's pump sessions, read from a day before the week. */
  rows: readonly TodayActivity[];
  range: ReportRange;
  timeZone: string;
  unit?: VolumeUnit;
}): WeekReport {
  const { rows, range, timeZone } = input;
  const unit = input.unit ?? 'ml';
  const buckets = dayBuckets(range, timeZone);
  const startsIn = (r: TodayActivity, b: { startMs: number; endMs: number }): boolean =>
    r.startMs >= b.startMs && r.startMs < b.endMs;

  const sum = { sleep: 0, bottleMl: 0, nursing: 0, diapers: 0, solids: 0, pumpMl: 0 };
  const count = {
    bottle: 0,
    bottleUnknown: 0,
    nursing: 0,
    nursingUnknown: 0,
    sessions: 0,
    pumpUnknown: 0,
  };
  const days = { sleep: 0, bottle: 0, nursing: 0, diapers: 0, solids: 0, pump: 0 };
  let babyDays = 0;
  const loggedBy = new Set<string>();

  for (const day of buckets) {
    // the shared arithmetic; no running timers — a record is what was saved
    const t = todayTotals(rows, [], day, day.endMs, unit);
    const inDay = rows.filter(r => startsIn(r, day));
    const bottles = inDay.filter(countsAsMilk);
    const feeds = inDay.filter(r => r.type === 'breastfeed');
    const meals = inDay.filter(r => r.type === 'solids');
    const pumps = inDay.filter(r => r.type === 'pump');

    sum.sleep += t.sleepMinutes;
    sum.bottleMl += bottles.reduce(
      (s, r) => s + (r.consumedMl == null ? 0 : volumeAsRead(r.consumedMl, unit)),
      0,
    );
    sum.nursing += t.breastfeedMinutes ?? 0;
    sum.diapers += t.diapers;
    sum.solids += meals.length;
    sum.pumpMl += t.pumpedMl;

    count.bottle += bottles.length;
    count.bottleUnknown += bottles.filter(r => r.consumedMl == null).length;
    count.nursing += feeds.length;
    count.nursingUnknown += feeds.filter(r => recordedMs(r) === 0).length;
    count.sessions += pumps.length;
    count.pumpUnknown += pumps.filter(r => r.totalMl == null).length;
    for (const p of pumps) loggedBy.add(p.createdBy);

    const has = {
      sleep: t.sleepMinutes > 0,
      bottle: bottles.length > 0,
      nursing: feeds.length > 0,
      diapers: t.diapers > 0,
      solids: meals.length > 0,
    };
    if (has.sleep) days.sleep += 1;
    if (has.bottle) days.bottle += 1;
    if (has.nursing) days.nursing += 1;
    if (has.diapers) days.diapers += 1;
    if (has.solids) days.solids += 1;
    if (pumps.length > 0) days.pump += 1;
    if (Object.values(has).some(Boolean)) babyDays += 1;
  }

  const metrics: WeekMetric[] = [];
  for (const category of WEEK_CATEGORIES) {
    switch (category) {
      case 'sleep':
        if (sum.sleep > 0)
          metrics.push({
            category,
            total: sum.sleep,
            measure: 'minutes',
            entries: rows.filter(r => r.type === 'sleep').length,
            unmeasured: 0,
            days: days.sleep,
            average: per(sum.sleep, days.sleep, 0),
          });
        break;
      case 'bottle': {
        if (count.bottle === 0) break;
        const known = count.bottle - count.bottleUnknown;
        metrics.push(
          known === 0
            ? {
                category,
                total: count.bottle,
                measure: 'count',
                entries: count.bottle,
                unmeasured: count.bottleUnknown,
                days: days.bottle,
                average: null,
              }
            : {
                category,
                total: sum.bottleMl,
                measure: 'ml',
                entries: count.bottle,
                unmeasured: count.bottleUnknown,
                days: days.bottle,
                average: per(sum.bottleMl, days.bottle, count.bottleUnknown),
              },
        );
        break;
      }
      case 'nursing': {
        if (count.nursing === 0) break;
        const known = count.nursing - count.nursingUnknown;
        metrics.push(
          known === 0
            ? {
                category,
                total: count.nursing,
                measure: 'count',
                entries: count.nursing,
                unmeasured: count.nursingUnknown,
                days: days.nursing,
                average: null,
              }
            : {
                category,
                total: sum.nursing,
                measure: 'minutes',
                entries: count.nursing,
                unmeasured: count.nursingUnknown,
                days: days.nursing,
                average: per(sum.nursing, days.nursing, count.nursingUnknown),
              },
        );
        break;
      }
      case 'diapers':
        if (sum.diapers > 0)
          metrics.push({
            category,
            total: sum.diapers,
            measure: 'count',
            entries: sum.diapers,
            unmeasured: 0,
            days: days.diapers,
            average: per(sum.diapers, days.diapers, 0),
          });
        break;
      case 'solids':
        if (sum.solids > 0)
          metrics.push({
            category,
            total: sum.solids,
            measure: 'count',
            entries: sum.solids,
            unmeasured: 0,
            days: days.solids,
            average: per(sum.solids, days.solids, 0),
          });
        break;
    }
  }

  const pumping: WeekPumping | null =
    count.sessions === 0
      ? null
      : {
          ml: sum.pumpMl,
          sessions: count.sessions,
          days: days.pump,
          unmeasured: count.pumpUnknown,
          average: per(sum.pumpMl, days.pump, count.pumpUnknown),
          loggedBy: [...loggedBy].sort(),
        };

  return {
    babyDays,
    metrics,
    pumping,
    pattern: sum.sleep > 0 ? nightStartPattern(rows, range, timeZone) : null,
  };
}

/**
 * The 30-minute window most recorded night-sleep starts of the week fall in, or null. A night is
 * the evening it began: a start at 00:30 belongs to the night before, so its local date is taken
 * twelve hours earlier, and its minute is read past midnight (24:30) so it sorts after 23:00.
 */
export function nightStartPattern(
  rows: readonly TodayActivity[],
  range: ReportRange,
  timeZone: string,
): WeekPattern | null {
  const starts = new Map<string, number>();
  for (const r of rows) {
    if (r.type !== 'sleep' || r.sleepKind !== 'NIGHT' || r.endMs === null) continue;
    if (r.startMs < range.fromMs || r.startMs >= range.toMs) continue;
    const night = localDayKey(timeZone, r.startMs - 12 * 3_600_000);
    const minute = wallMinutes(timeZone, r.startMs);
    const evening = minute < 12 * 60 ? minute + DAY_MIN : minute;
    // the first start of each night: a sleep resumed after a waking is not a second bedtime
    const was = starts.get(night);
    if (was === undefined || evening < was) starts.set(night, evening);
  }
  const nights = starts.size;
  if (nights < PATTERN_MIN_NIGHTS) return null;
  const all = [...starts.values()];
  let best: { from: number; count: number } | null = null;
  for (const m of all) {
    const from = Math.floor(m / PATTERN_STEP_MIN) * PATTERN_STEP_MIN;
    const n = all.filter(x => x >= from && x < from + PATTERN_WINDOW_MIN).length;
    if (best === null || n > best.count || (n === best.count && from < best.from))
      best = { from, count: n };
  }
  // a window says something only when most nights are in it
  if (best === null || best.count < 3 || best.count * 2 <= nights) return null;
  return {
    fromMinute: best.from % DAY_MIN,
    toMinute: (best.from + PATTERN_WINDOW_MIN) % DAY_MIN,
    count: best.count,
    nights,
  };
}
