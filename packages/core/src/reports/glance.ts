/**
 * THE GLANCE — what Reports leads with (the owner, 2026-09-26: *"it just feels boring to normal
 * users who are not used to seeing graphs. think from these user POV, and make it simple, easy to
 * understand, while still being useful information"*).
 *
 * Reports now opens on two cards a person who never reads a graph can read at a glance: TODAY SO
 * FAR — feeds, sleep, diapers, as big numbers with the owner's pictures and a picture of the day —
 * and THE LAST 7, 14 OR 30 DAYS, as "about N a day" with a small bar per day. Under each figure, in
 * words, how it compares with the same stretch before it: "2 more than yesterday", "about the same
 * as the week before" (a Plus line — `reports` sells "trends, comparisons and the pediatrician
 * summary"). This file is the arithmetic of both cards and nothing else; the words are
 * `glance.copy.ts`, the pictures are the design system's.
 *
 * IT ADDS NO NEW RULE ABOUT WHAT COUNTS. Every figure is `todayTotals` over a day, summed — the
 * same function Today's tiles, the report series and the visit sheet read — so "7 feeds" here is
 * the "7 feeds" on Today, a water bottle is not a feed, a DRY check is not a change, and a sleep is
 * counted by overlap with the day, the nap still being timed included. Days with entries are the
 * rule `dashboardHeadline` already uses. What is new is only:
 *
 *   1. THE PREVIOUS WINDOW (`previousWindow`): the same number of local days before the range,
 *      with its last day cut at the time of day it is now. At nine in the morning today holds nine
 *      hours; comparing it with all of yesterday would say "5 fewer than yesterday" every morning,
 *      about a day that is not over. `sameTimeYesterday` made that argument for Today first; this
 *      is it for a week.
 *   2. THE COMPARISON (`compareWindows`): a difference, rounded to what a person would say, with
 *      "about the same" under a stated step. Never a verdict — the numbers are not good or bad,
 *      more is not better, and a smaller one is a fact and not a fault (CLAUDE.md §2 rules 1, 3, 6).
 *      It compares this household with ITSELF, never with a guideline, another household, or one
 *      twin with the other (docs/MULTIPLES.md §6).
 *   3. THE PICTURES' DATA (`dayMarks`, `weekGroups`): when each feed and diaper happened and when
 *      the baby slept, clipped to the day; and a long range folded into weeks, because thirty
 *      numbers do not fit across a phone and a picture nobody can read is not a picture.
 *
 * A COMPARISON NEEDS SOMETHING TO COMPARE. One is drawn only when both stretches hold that kind of
 * entry, and — for a range — when the stretch before had entries on at least half its days. "About
 * 8 more a day than the week before" said about the week the app was installed is a sentence about
 * the log, not the baby, and the stool card's `confident` makes the same refusal for the same
 * reason.
 */
import type { VolumeUnit } from '../entry/units';
import { localDayBounds, shiftDay, type DayBounds } from '../today/day';
import type { DayWindow } from '../today/dayWindow';
import type { ActiveTimer, DiaperKind, TodayActivity } from '../today/rows';
import {
  countsAsDiaper,
  countsAsFeed,
  countsAsMilk,
  diaperKinds,
  sameTimeYesterday,
  todayTotals,
  type DiaperKinds,
} from '../today/totals';
import { nightInsight, type NightInsight } from './dashboard';
import { diaperInsight, OVERLAP_READ_BACK_MS, sleepInsight } from './insights';
import { dayBuckets, type ReportRange } from './range';

const MIN = 60_000;
const HOUR = 60 * MIN;

/** The four figures the two cards lead with. Pumping is the household's; the other three the baby's. */
export type GlanceFigure = 'feeds' | 'sleep' | 'diapers' | 'pumped';
export const GLANCE_FIGURES: readonly GlanceFigure[] = ['feeds', 'sleep', 'diapers', 'pumped'];

/* ---------------------------------------------------------------------------- a stretch */

/** Every figure of a run of local days, summed from `todayTotals` one day at a time. */
export interface WindowFigures {
  /** Local days in the stretch (a cut last day still counts as one). */
  days: number;
  /** Days holding at least one entry that STARTED in them — `dashboardHeadline`'s rule. */
  loggedDays: number;
  /** One per day, oldest first: whether it holds an entry. A day with none is not a zero. */
  logged: boolean[];
  /** One value per day, oldest first — the small bars' columns. */
  byDay: { feeds: number[]; sleepMinutes: number[]; diapers: number[]; pumpedMl: number[] };
  feeds: number;
  /** By overlap with each day, a sleep still being timed included (as Today's tile counts it). */
  sleepMinutes: number;
  diapers: number;
  pumpedMl: number;
  pumpSessions: number;
  /** The bottles of milk the feeds include, and what they held — never water (`countsAsMilk`). */
  bottles: number;
  milkMl: number;
  /** The feeds at the breast, and their minutes as each entry recorded them (`recordedMs`). */
  breastfeeds: number;
  breastfeedMinutes: number;
  /** What the changes held, each counted once: a BOTH is `both`, never also wet and dirty. */
  kinds: DiaperKinds;
  /**
   * Each figure over the days WITH ENTRIES, not the calendar days — the divisor the old "at a
   * glance" strip used and said out loud ("across the 5 days with entries, not all 7"). Nobody logs
   * every day, and an average that assumes they did is a smaller number than the truth.
   */
  perLoggedDay: { feeds: number; sleepMinutes: number; diapers: number; pumpedMl: number };
  /** Whether the stretch holds any entry of each figure's kind. */
  has: Record<GlanceFigure, boolean>;
}

const startsIn = (atMs: number, day: DayBounds): boolean => atMs >= day.startMs && atMs < day.endMs;

/**
 * A stretch of days as figures. `running` is the timers still going — pass none for a stretch in
 * the past, where a timer running now has no part. `unit` is the household's milk unit, as
 * `todayTotals` takes it: the milk and pumped figures add each entry up as it reads.
 */
export function windowFigures(
  rows: readonly TodayActivity[],
  running: readonly ActiveTimer[],
  buckets: readonly DayBounds[],
  nowMs: number,
  unit?: VolumeUnit,
): WindowFigures {
  const byDay = {
    feeds: [] as number[],
    sleepMinutes: [] as number[],
    diapers: [] as number[],
    pumpedMl: [] as number[],
  };
  const logged: boolean[] = [];
  const kinds: DiaperKinds = { wet: 0, dirty: 0, both: 0 };
  let pumpSessions = 0;
  let bottles = 0;
  let milkMl = 0;
  let breastfeeds = 0;
  let breastfeedMinutes = 0;
  for (const day of buckets) {
    const t = todayTotals(rows, running, day, nowMs, unit);
    byDay.feeds.push(t.feeds);
    byDay.sleepMinutes.push(t.sleepMinutes);
    byDay.diapers.push(t.diapers);
    byDay.pumpedMl.push(t.pumpedMl);
    pumpSessions += t.pumpSessions;
    bottles += t.milkBottles ?? 0;
    milkMl += t.milkMl;
    breastfeeds += t.breastfeeds ?? 0;
    breastfeedMinutes += t.breastfeedMinutes ?? 0;
    const k = diaperKinds(rows, day);
    kinds.wet += k.wet;
    kinds.dirty += k.dirty;
    kinds.both += k.both;
    logged.push(rows.some(r => startsIn(r.startMs, day)));
  }
  const sum = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0);
  const feeds = sum(byDay.feeds);
  const sleepMinutes = sum(byDay.sleepMinutes);
  const diapers = sum(byDay.diapers);
  const pumpedMl = sum(byDay.pumpedMl);
  const loggedDays = logged.filter(Boolean).length;
  const d = Math.max(1, loggedDays);
  return {
    days: buckets.length,
    loggedDays,
    logged,
    byDay,
    feeds,
    sleepMinutes,
    diapers,
    pumpedMl,
    pumpSessions,
    bottles,
    milkMl,
    breastfeeds,
    breastfeedMinutes,
    kinds,
    perLoggedDay: {
      feeds: feeds / d,
      sleepMinutes: sleepMinutes / d,
      diapers: diapers / d,
      pumpedMl: pumpedMl / d,
    },
    has: {
      feeds: feeds > 0,
      sleep: sleepMinutes > 0,
      diapers: diapers > 0,
      pumped: pumpedMl > 0 || pumpSessions > 0,
    },
  };
}

/* ------------------------------------------------------------------- the stretch before */

export interface PreviousWindow {
  /** The same number of local days, ending where the range begins, each whole. */
  whole: DayBounds[];
  /**
   * The same days with the last one cut at the time of day it is now in the range's last day — so
   * six whole days and this morning are compared with six whole days and that morning.
   */
  sameTime: DayBounds[];
}

/**
 * The stretch a range is compared with. Walked on the calendar like the range itself
 * (`rangeOf`), so a week that crosses the clocks changing is still seven local days.
 */
export function previousWindow(
  range: ReportRange,
  timeZone: string,
  nowMs: number,
): PreviousWindow {
  const days = Math.max(1, range.days);
  const first = shiftDay(timeZone, range.fromMs + 12 * HOUR, -days);
  const whole = dayBuckets(
    { key: range.key, fromMs: first.startMs, toMs: range.fromMs, days },
    timeZone,
  );
  // how far into its last day the range has got: all of it for a range that ended before today
  const lastDay = localDayBounds(timeZone, range.toMs - 1);
  const elapsed = Math.max(0, Math.min(nowMs, lastDay.endMs) - lastDay.startMs);
  const last = whole[whole.length - 1];
  const sameTime =
    last === undefined
      ? whole
      : [
          ...whole.slice(0, -1),
          { startMs: last.startMs, endMs: Math.min(last.endMs, last.startMs + elapsed) },
        ];
  return { whole, sameTime };
}

/**
 * THE FIRST INSTANT A GLANCE NEEDS READ, so the stretch before the range can be compared with it:
 * the previous window's first day, less the sixteen hours a sleep can reach back into it
 * (`OVERLAP_READ_BACK_MS`, `insights.ts`).
 */
export const glanceReadFromMs = (range: ReportRange, timeZone: string, nowMs: number): number => {
  const first = previousWindow(range, timeZone, nowMs).whole[0];
  return (first?.startMs ?? range.fromMs) - OVERLAP_READ_BACK_MS;
};

/* ----------------------------------------------------------------------- the comparison */

/** Which way a figure moved against the stretch before, and by how much — in its own unit. */
export interface Comparison {
  direction: 'more' | 'less' | 'same';
  /**
   * The difference, rounded to what the sentence says: a whole count, whole minutes (a day) or
   * five-minute steps (a range's average), millilitres. Per day for a range; the whole day for a day.
   */
  amount: number;
}

export type Comparisons = Partial<Record<GlanceFigure, Comparison>>;

/**
 * THE STEPS UNDER WHICH TWO STRETCHES ARE "ABOUT THE SAME". A rounding, stated here once, and
 * never a judgment of the size of anything:
 *
 *   · a count is exact for a day ("same as yesterday" means the same number) and rounds to a whole
 *     one a day for a range (under half a feed a day either way is "about the same");
 *   · sleep under 10 minutes over a day, or 15 minutes a day over a range, is the noise of when a
 *     parent tapped Start — a nap logged at 1:04 rather than 1:00 — and a sentence about it would
 *     be a sentence about the tapping;
 *   · a volume under 15 ml (half an ounce) is Today's own "same" (`SAME_VOLUME_ML` in the app's
 *     `today/rows.ts`), so the two screens say "the same" about the same difference.
 */
export const GLANCE_SAME = {
  sleepDayMinutes: 10,
  sleepRangeMinutes: 15,
  /** A range's sleep difference is written to the nearest five minutes, "about 35m more a day". */
  sleepRangeStep: 5,
  volumeMl: 15,
} as const;

function compareValues(
  figure: GlanceFigure,
  current: number,
  previous: number,
  days: number,
): Comparison {
  const d = current - previous;
  const direction = d > 0 ? 'more' : 'less';
  const same: Comparison = { direction: 'same', amount: 0 };
  switch (figure) {
    case 'feeds':
    case 'diapers': {
      const n = Math.round(Math.abs(d));
      return n === 0 ? same : { direction, amount: n };
    }
    case 'sleep': {
      if (days === 1) {
        const m = Math.round(Math.abs(d));
        return m < GLANCE_SAME.sleepDayMinutes ? same : { direction, amount: m };
      }
      const step = GLANCE_SAME.sleepRangeStep;
      const m = Math.round(Math.abs(d) / step) * step;
      return m < GLANCE_SAME.sleepRangeMinutes ? same : { direction, amount: m };
    }
    case 'pumped': {
      const ml = Math.abs(d);
      return ml < GLANCE_SAME.volumeMl ? same : { direction, amount: Math.round(ml) };
    }
  }
}

const figureTotal = (w: WindowFigures, f: GlanceFigure): number =>
  f === 'feeds'
    ? w.feeds
    : f === 'sleep'
      ? w.sleepMinutes
      : f === 'diapers'
        ? w.diapers
        : w.pumpedMl;

const figurePerDay = (w: WindowFigures, f: GlanceFigure): number =>
  f === 'feeds'
    ? w.perLoggedDay.feeds
    : f === 'sleep'
      ? w.perLoggedDay.sleepMinutes
      : f === 'diapers'
        ? w.perLoggedDay.diapers
        : w.perLoggedDay.pumpedMl;

/**
 * Each figure against the stretch before: a day's totals against yesterday up to the same time, a
 * range's per-day figures against the same days before, cut the same way. `whole` is the stretch
 * before uncut, which is what says whether the household was logging then at all.
 */
export function compareWindows(
  current: WindowFigures,
  previous: WindowFigures,
  whole: WindowFigures,
  days: number,
): Comparisons {
  const out: Comparisons = {};
  // a range compares averages, so the stretch before has to have been logged to be averaged
  if (days > 1 && whole.loggedDays * 2 < whole.days) return out;
  for (const figure of GLANCE_FIGURES) {
    if (!current.has[figure] || !whole.has[figure]) continue;
    out[figure] =
      days === 1
        ? compareValues(figure, figureTotal(current, figure), figureTotal(previous, figure), 1)
        : compareValues(
            figure,
            figurePerDay(current, figure),
            figurePerDay(previous, figure),
            days,
          );
  }
  return out;
}

/* ------------------------------------------------------------------------- the pictures */

/** A feed, where it falls in the day, and which kind — the dots on today's strip. */
export interface FeedMark {
  atMs: number;
  kind: 'bottle' | 'breast';
}

/** A change, where it falls, and what it held (null for a change saved without a kind). */
export interface DiaperMark {
  atMs: number;
  kind: Exclude<DiaperKind, 'DRY'> | null;
}

/** A sleep, clipped to the day: the blocks on a strip. `running` is a timer still going. */
export interface SleepSpan {
  fromMs: number;
  toMs: number;
  running: boolean;
}

export interface DayMarks {
  feeds: FeedMark[];
  diapers: DiaperMark[];
  sleeps: SleepSpan[];
}

/**
 * WHEN THINGS HAPPENED IN ONE DAY, for the day's strip. The same rows the day's totals count, in
 * the same way — a feed is `countsAsFeed`, a change is `countsAsDiaper`, and a sleep is its overlap
 * with the day, a running timer up to now — so the blocks on the strip add up to the day's sleep
 * figure to the minute (the test holds them to `todayTotals`).
 */
export function dayMarks(
  rows: readonly TodayActivity[],
  running: readonly ActiveTimer[],
  day: DayBounds,
  nowMs: number,
): DayMarks {
  const feeds: FeedMark[] = rows
    .filter(r => countsAsFeed(r) && startsIn(r.startMs, day))
    .map(r => ({
      atMs: r.startMs,
      kind: countsAsMilk(r) ? ('bottle' as const) : ('breast' as const),
    }))
    .sort((a, b) => a.atMs - b.atMs);
  const diapers: DiaperMark[] = rows
    .filter(r => countsAsDiaper(r) && startsIn(r.startMs, day))
    .map(r => ({
      atMs: r.startMs,
      kind:
        r.diaperKind === 'WET' || r.diaperKind === 'DIRTY' || r.diaperKind === 'BOTH'
          ? r.diaperKind
          : null,
    }))
    .sort((a, b) => a.atMs - b.atMs);
  const clip = (from: number, to: number, isRunning: boolean): SleepSpan | null => {
    const lo = Math.max(from, day.startMs);
    const hi = Math.min(to, day.endMs);
    return hi > lo ? { fromMs: lo, toMs: hi, running: isRunning } : null;
  };
  const sleeps: SleepSpan[] = [
    ...rows.filter(r => r.type === 'sleep').map(r => clip(r.startMs, r.endMs ?? r.startMs, false)),
    ...running.filter(t => t.type === 'sleep').map(t => clip(t.startedAtMs, nowMs, true)),
  ]
    .filter((s): s is SleepSpan => s !== null)
    .sort((a, b) => a.fromMs - b.fromMs);
  return { feeds, diapers, sleeps };
}

/** A long range folded into weeks, most recent last — the small bars of 14 and 30 days. */
export interface WeekGroup {
  fromMs: number;
  toMs: number;
  /** The days it covers: seven, or fewer for the oldest when the range is not a whole number of weeks. */
  days: number;
  loggedDays: number;
  /** Each figure over the week's days with entries — the same divisor as the range's own "a day". */
  perLoggedDay: { feeds: number; sleepMinutes: number; diapers: number; pumpedMl: number };
}

/**
 * Seven days to a group, counted back from the range's last day, so the last bar is always the
 * week ending today and a thirty-day range is four weeks and two days rather than a partial week
 * at the recent end — the end a parent is looking at.
 */
export function weekGroups(figures: WindowFigures, buckets: readonly DayBounds[]): WeekGroup[] {
  const out: WeekGroup[] = [];
  for (let end = buckets.length; end > 0; end -= 7) {
    const start = Math.max(0, end - 7);
    const slice = (xs: readonly number[]): number =>
      xs.slice(start, end).reduce((a, b) => a + b, 0);
    const loggedDays = figures.logged.slice(start, end).filter(Boolean).length;
    const d = Math.max(1, loggedDays);
    out.unshift({
      fromMs: buckets[start]?.startMs ?? 0,
      toMs: buckets[end - 1]?.endMs ?? 0,
      days: end - start,
      loggedDays,
      perLoggedDay: {
        feeds: slice(figures.byDay.feeds) / d,
        sleepMinutes: slice(figures.byDay.sleepMinutes) / d,
        diapers: slice(figures.byDay.diapers) / d,
        pumpedMl: slice(figures.byDay.pumpedMl) / d,
      },
    });
  }
  return out;
}

/** A week or less is drawn a day at a time; anything longer, a week at a time. */
export const GLANCE_DAILY_UP_TO = 7;

/* ----------------------------------------------------------------------- the two cards */

export interface GlanceInput {
  /**
   * The rows read for the child (or household) in view, privacy applied — from before the stretch
   * the range is compared with (`glanceReadFromMs`) up to now. Fewer rows than that are not an
   * error: the comparisons simply find nothing before the range and are not drawn.
   */
  rows: readonly TodayActivity[];
  running: readonly ActiveTimer[];
  /** The range card's range: the chips' 7, 14 or 30 days, as the plan narrowed it. */
  range: ReportRange;
  timeZone: string;
  nowMs: number;
  /** The household's wake and bed times, which classify a sleep saved without a kind. */
  window: DayWindow;
  /** The household's milk unit: every volume is added up as its entries read (`todayTotals`). */
  unit?: VolumeUnit;
}

/** TODAY SO FAR. */
export interface DayGlance {
  day: DayBounds;
  /** The moment the figures were taken — where today's strips mark now. */
  nowMs: number;
  figures: WindowFigures;
  /** Yesterday, up to the time of day it is now. */
  previous: WindowFigures;
  comparisons: Comparisons;
  /** Today's sleep split the way the parent classified it, and the naps that started today. */
  sleep: { nightMinutes: number; napMinutes: number; runningMinutes: number; naps: number };
  marks: DayMarks;
  /** 7 p.m. yesterday to 7 a.m. today (`nightInsight`); null when nothing was logged in it. */
  lastNight: { feeds: number; longestMinutes: number } | null;
  /** Changes today with "Rash noted" ticked — a count of ticks, nothing more. */
  rash: number;
}

/** THE LAST 7, 14 OR 30 DAYS. */
export interface RangeGlance {
  range: ReportRange;
  buckets: DayBounds[];
  figures: WindowFigures;
  previous: WindowFigures;
  comparisons: Comparisons;
  /** The sleep split and the naps, over the days with entries like every other "a day" here. */
  sleep: {
    nightPerLoggedDay: number;
    napPerLoggedDay: number;
    napsPerLoggedDay: number;
    /** The average nap's own length — a mean over naps, not over days. */
    averageNapMinutes: number;
  };
  nights: NightInsight;
  /** Each day's sleep, a strip a day, while the range is a week or less; null past that. */
  diary: SleepSpan[][] | null;
  /** The range in weeks, when it is longer than one; null for a week or less. */
  weeks: WeekGroup[] | null;
  rash: { count: number; atMs: number[] };
}

export interface ReportGlance {
  today: DayGlance;
  range: RangeGlance;
}

export function dayGlance(input: GlanceInput): DayGlance {
  const { rows, running, timeZone, nowMs, unit } = input;
  const today = localDayBounds(timeZone, nowMs);
  const yesterday = shiftDay(timeZone, nowMs, -1);
  const figures = windowFigures(rows, running, [today], nowMs, unit);
  const previous = windowFigures(
    rows,
    [],
    [sameTimeYesterday(today, yesterday, nowMs)],
    nowMs,
    unit,
  );
  const whole = windowFigures(rows, [], [yesterday], nowMs, unit);
  const todayRange: ReportRange = {
    key: 'today',
    fromMs: today.startMs,
    toMs: today.endMs,
    days: 1,
  };
  const sleep = sleepInsight(rows, running, [today], todayRange, nowMs, {
    timeZone,
    window: input.window,
  });
  const night = nightInsight(rows, [yesterday, today]);
  const lastFeeds = night.feedsByNight[0] ?? 0;
  const lastLongest = night.longestByNight[0] ?? 0;
  return {
    day: today,
    nowMs,
    figures,
    previous,
    comparisons: compareWindows(figures, previous, whole, 1),
    sleep: {
      nightMinutes: sleep.nightByDay[0] ?? 0,
      napMinutes: sleep.napByDay[0] ?? 0,
      runningMinutes: sleep.runningByDay[0] ?? 0,
      naps: sleep.naps,
    },
    marks: dayMarks(rows, running, today, nowMs),
    lastNight:
      lastFeeds === 0 && lastLongest === 0
        ? null
        : { feeds: lastFeeds, longestMinutes: lastLongest },
    rash: diaperInsight(rows, [today], todayRange).rash,
  };
}

export function rangeGlance(input: GlanceInput): RangeGlance {
  const { rows, running, range, timeZone, nowMs, unit } = input;
  const buckets = dayBuckets(range, timeZone);
  const figures = windowFigures(rows, running, buckets, nowMs, unit);
  const before = previousWindow(range, timeZone, nowMs);
  const previous = windowFigures(rows, [], before.sameTime, nowMs, unit);
  const whole = windowFigures(rows, [], before.whole, nowMs, unit);
  const sleep = sleepInsight(rows, running, buckets, range, nowMs, {
    timeZone,
    window: input.window,
  });
  const d = Math.max(1, figures.loggedDays);
  const sum = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0);
  const diapers = diaperInsight(rows, buckets, range);
  return {
    range,
    buckets,
    figures,
    previous,
    comparisons: compareWindows(figures, previous, whole, range.days),
    sleep: {
      nightPerLoggedDay: sum(sleep.nightByDay) / d,
      napPerLoggedDay: sum(sleep.napByDay) / d,
      napsPerLoggedDay: sleep.naps / d,
      averageNapMinutes: sleep.averageNapMinutes,
    },
    // the rows before the range fall in no night window of it (`nightInsight` counts a night by
    // the evening it began), so handing it the wider read is the same as handing it the range's
    nights: nightInsight(rows, buckets),
    diary:
      range.days <= GLANCE_DAILY_UP_TO
        ? buckets.map(day => dayMarks(rows, running, day, nowMs).sleeps)
        : null,
    weeks: range.days > GLANCE_DAILY_UP_TO ? weekGroups(figures, buckets) : null,
    rash: { count: diapers.rash, atMs: diapers.rashAtMs },
  };
}

export function reportGlance(input: GlanceInput): ReportGlance {
  return { today: dayGlance(input), range: rangeGlance(input) };
}

/**
 * THE ROWS AND TIMERS OF ONE BABY, out of a household's. The "Both" view reads every child's rows
 * at once; its cards are one per child, side by side and never compared (docs/MULTIPLES.md §6), so
 * each card is handed its own child's rows. A household-level row — a pump session — belongs to no
 * child and so to none of their cards: pumping has its own.
 */
export function rowsOfChild<T extends { childId: string | null }>(
  rows: readonly T[],
  childId: string,
): T[] {
  return rows.filter(r => r.childId === childId);
}
