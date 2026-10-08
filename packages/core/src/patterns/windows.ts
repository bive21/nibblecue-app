/**
 * YOUR BABY'S USUAL WINDOWS — the one inference this product allows, and the sentences it
 * refuses to write.
 *
 * WHAT IT SAYS. "A morning nap started between 9:05 and 9:50 on 11 of the last 14 days." That
 * is a count and two order statistics over rows the household typed, and a parent can go and
 * check every one of them in their own timeline. Nothing in this file compares the household to
 * a guideline, to another household, or to itself last month.
 *
 * WHAT IT REFUSES TO SAY, AND WHY. Three sentences are unavailable here by construction, not by
 * wording, because the numbers that would carry them are never computed:
 *
 *   · "The next nap is around 9:30."       A PREDICTION. Nothing in this file extrapolates
 *                                          forward; every value is an order statistic of
 *                                          samples that have already happened.
 *   · "Put her down at 9:15."              AN INSTRUCTION. There is no verb in this module's
 *                                          vocabulary that takes the parent as its subject.
 *   · "Bedtime has drifted later."         A TREND, and a parent reads a trend as a verdict.
 *                                          The samples are pooled, never split into an earlier
 *                                          half and a later half, so no direction exists to name.
 *
 * The single number closest to trouble is the MEDIAN CLOCK TIME. "The middle first feed was at
 * 7:15 a.m." is a fact, but a lone clock time under a heading with the word "usual" in it is the
 * exact shape of a prediction, and a tired reader would take it as one. So a clock median is
 * computed (the span needs it to be honest about where its middle sits) and is never put into a
 * sentence. Only the LENGTH median is — a duration cannot be read as "when".
 *
 * A WINDOW ALWAYS CARRIES ITS N, IN THE SENTENCE. A window over 5 days and a window over 30 are
 * different kinds of number, and a reader who cannot tell which one they are holding has been
 * misled by omission, which is the same defect as saying something false (`observations.ts` makes
 * the same argument about averages).
 *
 * FOURTEEN COMPLETE DAYS, ENDING YESTERDAY. Fourteen because `reports/range.ts` already argues
 * it: long enough for a rhythm to have a shape, short enough to still be the same baby. COMPLETE
 * because today is half a day — a denominator that counted today would score every evening window
 * as one miss until the evening arrived, and the card would drift all day for no reason a parent
 * could see.
 *
 * WHY NOT A MEDIAN GAP, as the nudge's `usualGap` was (the nudge and its code are gone, 2026-09-18
 * and 2026-09-26). A gap is a length with no position in the day. This file answers "at what time
 * of day", which needs the local wall clock and a per-day pick rather than a list of differences.
 *
 * This module reads no clock: `nowMs` and the time zone are arguments, like everywhere else in
 * `packages/core`.
 */
import { NIGHT_FROM_HOUR, NIGHT_TO_HOUR } from '../reports/dashboard';
import { shiftDay, wallClock, type DayBounds } from '../today/day';
import type { TodayActivity } from '../today/rows';
import { countsAsFeed } from '../today/totals';

const MIN = 60_000;
const HOUR = 3_600_000;
const MINUTES_PER_DAY = 1440;

/** The span every window is measured over: the 14 complete local days before today. */
export const USUAL_WINDOW_DAYS = 14;

/**
 * HOW MANY SIGHTINGS A WINDOW NEEDS BEFORE IT EXISTS AT ALL.
 *
 * Five. Two points are a line segment, not a window — the "spread" would be the distance between
 * exactly two entries and the cluster inside it would be one of them, which is a statistic in
 * shape only. Three and four are not much better: the tightest-half window would hold two, and a
 * single late morning would move it by an hour.
 *
 * Five is the first count where the window says something the individual entries do not: the
 * cluster holds at least three sightings, so it survives one unusual day, and five mornings is
 * also about the smallest run a parent would themselves describe as "usually". Below it the card
 * says it is still watching and prints the count so far, which is information rather than a
 * silence — a window built on two days would not be.
 *
 * It is deliberately NOT a share of the fortnight. A morning nap on 5 of 14 days is a true thing
 * to know, and the sentence prints both numbers, so suppressing it would be the app deciding what
 * is worth knowing about somebody else's baby.
 */
export const USUAL_WINDOW_MIN_SAMPLES = 5;

/**
 * The four recurring things a household logs whose answer to "when does this happen" is a time of
 * day rather than a count. Order is reading order on the card: the day starts with a feed, holds
 * a nap, ends at bedtime, and the night that follows is the one every parent asks about.
 */
const USUAL_WINDOW_IDS = ['firstFeed', 'morningNap', 'bedtime', 'longestNight'] as const;
export type UsualWindowId = (typeof USUAL_WINDOW_IDS)[number];

/**
 * THE DEFINITIONS, AS NUMBERS, SO THE CARD CAN PRINT THEM.
 *
 * Each of these is a boundary the app chose and the household did not, which makes it exactly the
 * kind of thing that has to be visible: `patterns/copy.ts` turns these constants into the "how
 * these are counted" line, so a parent who disagrees with the app about what counts as a morning
 * nap can see the disagreement instead of being puzzled by the number.
 */
/** A morning nap: a sleep that started between 5 a.m. and noon and was not marked as night sleep. */
export const MORNING_FROM_MINUTE = 5 * 60;
export const MORNING_TO_MINUTE = 12 * 60;
/** Bedtime is looked for from 5 p.m. until 3 a.m. — minutes are counted from the evening's own midnight. */
export const EVENING_FROM_MINUTE = 17 * 60;
const EVENING_TO_MINUTE = 27 * 60;
/**
 * When no sleep that evening was marked NIGHT, the fallback starts an hour later.
 *
 * The entry sheet defaults a sleep to NAP, so a household that never touches the control has no
 * night sleeps at all and would otherwise get no bedtime row. The fallback gives them one — but a
 * 5:30 p.m. catnap is not bedtime in anybody's house, so the unmarked fallback begins at 6 p.m.
 * while a sleep the parent explicitly called night is believed whenever they say it.
 */
export const EVENING_FALLBACK_FROM_MINUTE = 18 * 60;
/** The night, borrowed from the night card rather than restated, so the two cannot disagree. */
export const NIGHT_FROM_MINUTE = NIGHT_FROM_HOUR * 60;
export const NIGHT_TO_MINUTE = (24 + NIGHT_TO_HOUR) * 60;

/** The smallest and largest value observed, and the middle one. Minutes throughout. */
export interface UsualSpan {
  from: number;
  to: number;
  /** The median. Printed only for lengths — see the header on why a clock median stays inside. */
  median: number;
}

/** The narrowest window holding at least half the sightings, with the number actually inside it. */
export interface UsualCluster {
  from: number;
  to: number;
  count: number;
}

export interface UsualWindow {
  id: UsualWindowId;
  /** Local days looked at — the denominator every sentence prints. */
  days: number;
  /** Days that carried this event. The N. */
  samples: number;
  /**
   * Minutes after the local midnight of the day the event belongs to. Past 1440 for a bedtime or
   * a night stretch that began after midnight, which is the honest way to say "that evening's"
   * rather than pretending 00:40 is early in the morning it technically falls in.
   */
  clock: UsualSpan;
  cluster: UsualCluster;
  /** How long it ran. Only the night stretch is a length as well as a time. */
  length: UsualSpan | null;
}

/** An event seen, but not yet often enough to draw a window around. */
export interface UsualWindowWatch {
  id: UsualWindowId;
  days: number;
  samples: number;
  /** What it needs before a window appears — printed, so the wait is not a mystery. */
  needed: number;
}

export interface UsualWindows {
  days: number;
  /** Days of the span with any entry at all, so the card can say when a gap is the log's. */
  loggedDays: number;
  windows: UsualWindow[];
  watching: UsualWindowWatch[];
}

/**
 * The days a window is measured over: `USUAL_WINDOW_DAYS` complete local days ending yesterday,
 * oldest first.
 *
 * Walked with `shiftDay` rather than by subtracting 24 hours, for the reason `range.ts` gives:
 * the day the clocks move is 23 or 25 hours long, and a fortnight built out of milliseconds
 * quietly gains or loses an hour twice a year.
 */
export function usualWindowDays(timeZone: string, nowMs: number): DayBounds[] {
  const out: DayBounds[] = [];
  for (let back = USUAL_WINDOW_DAYS; back >= 1; back -= 1) {
    out.push(shiftDay(timeZone, nowMs, -back));
  }
  return out;
}

/** The first instant a window's rows can come from — what a query reads back to. */
export function usualWindowFromMs(timeZone: string, nowMs: number): number {
  return shiftDay(timeZone, nowMs, -USUAL_WINDOW_DAYS).startMs;
}

/**
 * Minutes after the local midnight the day began at, extended past 1440 for an instant that has
 * crossed into the next calendar day.
 *
 * Read off the WALL CLOCK rather than as `(atMs - day.startMs) / 60000`: on the day the clocks
 * go forward, 9:00 in the morning is 480 minutes after midnight by subtraction and 540 by the
 * clock on the wall, and it is the clock on the wall that the parent set the nap by.
 */
function minuteOfDay(timeZone: string, atMs: number, day: DayBounds): number {
  const w = wallClock(timeZone, atMs);
  const minute = w.hour * 60 + w.minute;
  return atMs >= day.endMs ? minute + MINUTES_PER_DAY : minute;
}

// a bottle of water is logged and kept, and is not a feed (`countsAsFeed`; the feeding audit's
// M7): the baby's usual feeding window is when they are FED, and water at 10:40 is not that
const isFeed = (r: TodayActivity): boolean => countsAsFeed(r);
const isSleep = (r: TodayActivity): boolean => r.type === 'sleep';

/** One day's answer for one event, or null when that day did not have one. */
interface Sighting {
  minute: number;
  lengthMinutes: number | null;
}

/**
 * At most one sighting per day per event — never two, because a day with three naps must not
 * count three times as loudly as a day with one. The day picks its own representative and the
 * window is built from one number per day, which is what makes "on 11 of the last 14 days"
 * a sentence about days rather than about entries.
 */
function sightingOf(
  id: UsualWindowId,
  rows: readonly TodayActivity[],
  day: DayBounds,
  timeZone: string,
): Sighting | null {
  // the two evening events belong to the evening they began in, so their candidates run past
  // midnight; half a day past the day's end is a safe superset of both windows
  const crossesMidnight = id === 'bedtime' || id === 'longestNight';
  const horizon = day.endMs + (crossesMidnight ? 12 * HOUR : 0);
  const candidates = rows.filter(r => r.startMs >= day.startMs && r.startMs < horizon);

  if (id === 'firstFeed') {
    let firstMs: number | null = null;
    for (const r of candidates) {
      if (!isFeed(r) || r.startMs >= day.endMs) continue;
      if (firstMs === null || r.startMs < firstMs) firstMs = r.startMs;
    }
    return firstMs === null
      ? null
      : { minute: minuteOfDay(timeZone, firstMs, day), lengthMinutes: null };
  }

  if (id === 'morningNap') {
    let earliest: number | null = null;
    for (const r of candidates) {
      // the kind the PARENT chose, never a clock: a household that calls a 6 a.m. sleep the
      // night is taken at its word, exactly as `insights.ts` takes it
      if (!isSleep(r) || r.sleepKind === 'NIGHT') continue;
      const m = minuteOfDay(timeZone, r.startMs, day);
      if (m < MORNING_FROM_MINUTE || m >= MORNING_TO_MINUTE) continue;
      if (earliest === null || m < earliest) earliest = m;
    }
    return earliest === null ? null : { minute: earliest, lengthMinutes: null };
  }

  if (id === 'bedtime') {
    let marked: number | null = null;
    let unmarked: number | null = null;
    for (const r of candidates) {
      if (!isSleep(r)) continue;
      const m = minuteOfDay(timeZone, r.startMs, day);
      if (m < EVENING_FROM_MINUTE || m >= EVENING_TO_MINUTE) continue;
      if (r.sleepKind === 'NIGHT') {
        if (marked === null || m < marked) marked = m;
      } else if (m >= EVENING_FALLBACK_FROM_MINUTE && (unmarked === null || m < unmarked)) {
        unmarked = m;
      }
    }
    const minute = marked ?? unmarked;
    return minute === null ? null : { minute, lengthMinutes: null };
  }

  // longestNight — a FINISHED sleep, because a running timer has no length yet and a sleep the
  // parent never closed would otherwise be the longest one every time
  let bestMinute: number | null = null;
  let bestMinutes = 0;
  for (const r of candidates) {
    if (!isSleep(r) || r.endMs === null || r.endMs <= r.startMs) continue;
    const m = minuteOfDay(timeZone, r.startMs, day);
    if (m < NIGHT_FROM_MINUTE || m >= NIGHT_TO_MINUTE) continue;
    const minutes = Math.round((r.endMs - r.startMs) / MIN);
    if (bestMinute === null || minutes > bestMinutes) {
      bestMinute = m;
      bestMinutes = minutes;
    }
  }
  return bestMinute === null ? null : { minute: bestMinute, lengthMinutes: bestMinutes };
}

/** Sorted ascending. */
function spanOf(sorted: readonly number[]): UsualSpan {
  const n = sorted.length;
  const mid = Math.floor(n / 2);
  const hi = sorted[mid] ?? 0;
  const lo = sorted[mid - 1] ?? hi;
  return {
    from: sorted[0] ?? 0,
    to: sorted[n - 1] ?? 0,
    median: n % 2 === 1 ? hi : Math.round((lo + hi) / 2),
  };
}

/**
 * THE TIGHT WINDOW: the narrowest span that holds at least half the sightings.
 *
 * The full spread is the honest headline and it is also the fragile one — a single 5:40 a.m.
 * start turns "the first feed was between 6:40 and 8:15" into "between 5:40 and 8:15", which is
 * true and tells a parent nothing. So the card prints both, and this is the second: the window
 * the days actually clustered in, with the exact number inside it rather than the word "half",
 * because "8 of the 13" is checkable and "half" is not.
 *
 * `count` can exceed the half it was built from when sightings tie on a minute; it is counted
 * rather than assumed, so the sentence's number is the real one.
 */
function clusterOf(sorted: readonly number[]): UsualCluster {
  const n = sorted.length;
  const need = Math.ceil(n / 2);
  let from = sorted[0] ?? 0;
  let to = sorted[need - 1] ?? from;
  for (let i = 1; i + need <= n; i += 1) {
    const a = sorted[i] ?? 0;
    const b = sorted[i + need - 1] ?? a;
    if (b - a < to - from) {
      from = a;
      to = b;
    }
  }
  const count = sorted.filter(v => v >= from && v <= to).length;
  return { from, to, count };
}

/**
 * The household's own windows over `days`, which is `usualWindowDays(...)` unless a test says
 * otherwise. Events with no sighting at all are absent entirely — a household that never logs
 * sleep should not read three rows about sleep — and events under the minimum are returned as
 * something still being watched rather than as a window.
 */
export function usualWindows(
  rows: readonly TodayActivity[],
  days: readonly DayBounds[],
  timeZone: string,
): UsualWindows {
  const loggedDays = days.filter(d =>
    rows.some(r => r.startMs >= d.startMs && r.startMs < d.endMs),
  ).length;

  const windows: UsualWindow[] = [];
  const watching: UsualWindowWatch[] = [];

  for (const id of USUAL_WINDOW_IDS) {
    const sightings: Sighting[] = [];
    for (const day of days) {
      const s = sightingOf(id, rows, day, timeZone);
      if (s !== null) sightings.push(s);
    }
    const samples = sightings.length;
    if (samples === 0) continue;
    if (samples < USUAL_WINDOW_MIN_SAMPLES) {
      watching.push({ id, days: days.length, samples, needed: USUAL_WINDOW_MIN_SAMPLES });
      continue;
    }
    const minutes = sightings.map(s => s.minute).sort((a, b) => a - b);
    const lengths = sightings
      .map(s => s.lengthMinutes)
      .filter((n): n is number => n !== null)
      .sort((a, b) => a - b);
    windows.push({
      id,
      days: days.length,
      samples,
      clock: spanOf(minutes),
      cluster: clusterOf(minutes),
      // a length span is drawn only when every sighting carried one, so its N is the same N
      length: lengths.length === samples ? spanOf(lengths) : null,
    });
  }

  return { days: days.length, loggedDays, windows, watching };
}

/** True when there is nothing to draw and nothing to wait for. */
export const usualWindowsEmpty = (w: UsualWindows): boolean =>
  w.windows.length === 0 && w.watching.length === 0;
