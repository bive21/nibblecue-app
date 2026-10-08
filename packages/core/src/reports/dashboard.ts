/**
 * THE DASHBOARD: what a new parent gets to see first, and in what order.
 *
 * The old Reports screen was a fixed stack — sleep, then milk, then diapers, for everyone. It
 * answered "how much" well and answered "what is my day actually like" not at all, and the
 * second question is the one a first-time parent asks out loud. This file adds three things and
 * no opinions:
 *
 *  1. A CLOCK. Twenty-four columns, one per hour of the local day, counting how often something
 *     was logged in that hour across the range. It is the household's own day drawn as a shape,
 *     and it is the piece most likely to show a parent something they had not noticed — the
 *     evening cluster, the 4 a.m. feed that has quietly moved to 5, the nap that always lands
 *     after the walk. The app draws the shape. It never names it.
 *  2. THE NIGHT, counted as a night rather than as a calendar day. 19:00 to 07:00 the next
 *     morning, so a 23:40 feed and a 02:10 feed belong to the same night — which is how the
 *     person who got up for both of them counts it.
 *  3. AN ORDER. A household that never logs pumping should not scroll past an empty pumping
 *     card to reach the one about sleep, so the order is decided by what this household
 *     actually logs. Presence only: no card is ever ranked by whether its numbers look good,
 *     because "good" is not a judgment this app makes.
 *
 * DST is why the night window is built from the NEXT DAY'S start rather than from `+24h`, and
 * why the clock clamps its hour index: a 25-hour day has an hour 24, and a column for it would
 * be a column nobody has.
 */
import type { ActivityType } from '../domain/domain-types';
import type { DayBounds } from '../today/day';
import type { TodayActivity } from '../today/rows';
import { countsAsDiaper, countsAsFeed } from '../today/totals';

const HOUR = 3_600_000;
const MIN = 60_000;

/* ------------------------------------------------------------------- the clock */

export const CLOCK_HOURS = 24;

/** Which local hour a moment falls in, inside the day it belongs to. Clamped for DST. */
export function hourOfDay(atMs: number, day: DayBounds): number {
  return Math.min(CLOCK_HOURS - 1, Math.max(0, Math.floor((atMs - day.startMs) / HOUR)));
}

export interface ClockRing {
  type: ActivityType;
  /** 24 counts, midnight first. */
  byHour: number[];
  total: number;
  /** The fullest hour, or null when nothing was logged. */
  peakHour: number | null;
}

/**
 * Whether an entry belongs on its type's ring. The bottle ring is drawn under the word "Feeds"
 * and the diaper ring under "Diapers" (`DashboardCards`), so each counts what those words count
 * everywhere else: a bottle of water is not a feed and a DRY check is not a change
 * (`countsAsFeed`, `countsAsDiaper`). Both entries stay in the log.
 */
const onRing = (r: TodayActivity): boolean =>
  r.type === 'bottle' ? countsAsFeed(r) : r.type === 'diaper' ? countsAsDiaper(r) : true;

/**
 * One ring per type asked for. Counting STARTS, not durations: a nap that runs 13:00–15:00 is
 * one entry at 13:00 and not two hours of shading, because the question the clock answers is
 * "when does this happen", and an entry that straddles a boundary has one answer to that.
 */
export function clockRings(
  rows: readonly TodayActivity[],
  buckets: readonly DayBounds[],
  types: readonly ActivityType[],
): ClockRing[] {
  return types.map(type => {
    const byHour = new Array<number>(CLOCK_HOURS).fill(0);
    let total = 0;
    for (const r of rows) {
      if (r.type !== type || !onRing(r)) continue;
      const day = buckets.find(d => r.startMs >= d.startMs && r.startMs < d.endMs);
      if (day === undefined) continue;
      const h = hourOfDay(r.startMs, day);
      byHour[h] = (byHour[h] ?? 0) + 1;
      total += 1;
    }
    let peakHour: number | null = null;
    let best = 0;
    for (let h = 0; h < CLOCK_HOURS; h += 1) {
      const n = byHour[h] ?? 0;
      if (n > best) {
        best = n;
        peakHour = h;
      }
    }
    return { type, byHour, total, peakHour };
  });
}

/* ------------------------------------------------------------------- the night */

/** 19:00 to 07:00 — the shift the person who got up for it would call one night. */
export const NIGHT_FROM_HOUR = 19;
export const NIGHT_TO_HOUR = 7;

export interface NightInsight {
  /** Feeds of either kind that started in each night window, oldest first. */
  feedsByNight: number[];
  /** The longest completed sleep that started in each night window, in minutes. */
  longestByNight: number[];
  /** Night windows that held anything at all — the divisor for the averages below. */
  nights: number;
  feedsPerNight: number;
  /** Averaged over nights with something logged, never over calendar nights. */
  averageLongestMinutes: number;
  /** The longest single overnight sleep in the range, and when it began. */
  bestMinutes: number;
  bestAtMs: number | null;
}

/**
 * Nights are indexed by the day they BEGIN on, so `feedsByNight[i]` is the night that started
 * on the evening of `buckets[i]`. The last bucket's night runs past the end of the range and is
 * counted for the part that has happened, which is the same rule the rest of the range uses.
 */
export function nightInsight(
  rows: readonly TodayActivity[],
  buckets: readonly DayBounds[],
): NightInsight {
  const feedsByNight: number[] = [];
  const longestByNight: number[] = [];
  let nights = 0;
  let feeds = 0;
  let longestSum = 0;
  let bestMinutes = 0;
  let bestAtMs: number | null = null;

  for (let i = 0; i < buckets.length; i += 1) {
    const day = buckets[i];
    if (day === undefined) continue;
    const next = buckets[i + 1];
    const from = day.startMs + NIGHT_FROM_HOUR * HOUR;
    const to = (next?.startMs ?? day.endMs) + NIGHT_TO_HOUR * HOUR;

    let f = 0;
    let longest = 0;
    for (const r of rows) {
      if (r.startMs < from || r.startMs >= to) continue;
      // a bottle of water at 2 a.m. is not a night feed (`countsAsFeed`)
      if (countsAsFeed(r)) f += 1;
      if (r.type === 'sleep' && r.endMs !== null && r.endMs > r.startMs) {
        const minutes = Math.round((r.endMs - r.startMs) / MIN);
        if (minutes > longest) longest = minutes;
        if (minutes > bestMinutes) {
          bestMinutes = minutes;
          bestAtMs = r.startMs;
        }
      }
    }
    feedsByNight.push(f);
    longestByNight.push(longest);
    if (f > 0 || longest > 0) {
      nights += 1;
      feeds += f;
      longestSum += longest;
    }
  }

  const d = Math.max(1, nights);
  return {
    feedsByNight,
    longestByNight,
    nights,
    feedsPerNight: feeds / d,
    averageLongestMinutes: longestSum / d,
    bestMinutes,
    bestAtMs,
  };
}

/* --------------------------------------------------------------- the headline */

export interface DashboardHeadline {
  /** Calendar days in the range. */
  days: number;
  /** Days of the range that carried at least one entry — what the averages divide by. */
  loggedDays: number;
  feeds: number;
  feedsPerLoggedDay: number;
  sleepMinutesPerLoggedDay: number;
  diapers: number;
  diapersPerLoggedDay: number;
  longestSleepMinutes: number;
}

/**
 * The four figures across the top. Each divides by DAYS WITH ENTRIES rather than by calendar
 * days, for the reason the monthly note gives at length: nobody logs every day, and an average
 * that silently assumes they did is a smaller number than the truth.
 *
 * THE COUNTS ARE OF ENTRIES INSIDE THE BUCKETS, like `loggedDays` beside them. The caller may pass
 * rows from before the range — Reports reads a little further back so last night's sleep can be
 * counted by overlap (`useReport`) — and a feed from yesterday evening is not one of this range's.
 * A DRY check is not a diaper change and a bottle of water is not a feed (`countsAsDiaper`,
 * `countsAsFeed`): "3 diapers a day" beside a diaper card that said 1 was the report disagreeing
 * with itself (the care audit, M2).
 */
export function dashboardHeadline(
  rows: readonly TodayActivity[],
  buckets: readonly DayBounds[],
  sleepMinutesTotal: number,
  longestSleepMinutes: number,
): DashboardHeadline {
  let loggedDays = 0;
  for (const day of buckets) {
    if (rows.some(r => r.startMs >= day.startMs && r.startMs < day.endMs)) loggedDays += 1;
  }
  const inside = rows.filter(r => buckets.some(d => r.startMs >= d.startMs && r.startMs < d.endMs));
  const feeds = inside.filter(countsAsFeed).length;
  const diapers = inside.filter(countsAsDiaper).length;
  const d = Math.max(1, loggedDays);
  return {
    days: buckets.length,
    loggedDays,
    feeds,
    feedsPerLoggedDay: feeds / d,
    sleepMinutesPerLoggedDay: sleepMinutesTotal / d,
    diapers,
    diapersPerLoggedDay: diapers / d,
    longestSleepMinutes,
  };
}

/* ------------------------------------------------------------------ the order */

/**
 * THE CARDS UNDER THE TWO THAT LEAD (2026-09-26).
 *
 * Reports opens on TODAY SO FAR and on the chips' 7, 14 or 30 days (`glance.ts`), and those two are
 * not in this list: they are on every page with anything logged. What follows them is decided
 * here. The old plan's `rhythm`, `night`, `sleep`, `feeding` and `diapers` cards are gone as cards:
 * their figures are the two lead cards' sentences, their day-by-day charts and the 24-hour clock
 * are behind one "See the charts" (`charts`), and last night is a line on the Today card. That is
 * the owner's ask made structural — the page reads as sentences and pictures first, and the graphs
 * are one tap away for whoever wants them, never the first thing a tired parent is handed.
 */
export const DASHBOARD_CARDS = [
  'foods',
  'stool',
  'growth',
  'stash',
  'schedule',
  'observations',
  'charts',
  'patterns',
] as const;
export type DashboardCard = (typeof DASHBOARD_CARDS)[number];

export interface DashboardInput {
  rows: readonly TodayActivity[];
  /** True when this household keeps a milk stash worth a card. */
  hasStash: boolean;
  /**
   * True only when the household has NO rhythm yet, because that is all the section is for now
   * (2026-09-22). It used to carry four rows of TODAY'S adherence — "Slots today 12 · Logged 9 ·
   * Of the slots so far 75% · Still to come 3" — on a page whose chips at the top say 7, 14 or
   * 30 days. A parent who picked 30 days and scrolled to a panel about this afternoon was
   * reading a section that ignored the one control the page has, and every figure in it is on
   * Schedule already, where a slot can actually be logged or skipped.
   *
   * What was worth keeping is the door: a household with no rhythm at all finds "Set how often"
   * here, and that is the half that does work. `hasSchedule` now means exactly that.
   */
  hasSchedule: boolean;
  /** `stoolPattern(...).engaged` — the owner's own rule, passed in rather than recomputed. */
  diaperEngaged: boolean;
}

const has = (rows: readonly TodayActivity[], ...types: ActivityType[]): boolean =>
  rows.some(r => types.includes(r.type));

/**
 * Which cards this household sees under the two lead cards, in reading order.
 *
 * `charts` and `patterns` come LAST, the page's final section before Memories (the owner,
 * 2026-10-06: "move the plus feature see the chart and usual windows to the last report section on
 * the most bottom before memories"). They used to lead, as the detail of the cards above; but
 * their depth is Plus, and the free cards — what the baby ate, the stool card, growth, the stash,
 * what the numbers say — were read past a gate to be reached. Everything before them is
 * present-or-absent on the household's own log. A card that would render as an empty box is not
 * a card; §4's rule about showing the shape of a locked chart is about GATES, and a household with
 * no growth entries is not gated, it simply has not measured anything yet.
 */
export function dashboardPlan(input: DashboardInput): DashboardCard[] {
  const { rows } = input;
  const anyFeed = has(rows, 'bottle', 'breastfeed');
  const anySleep = has(rows, 'sleep');
  const anyDiaper = has(rows, 'diaper');
  const out: DashboardCard[] = [];
  // WHAT THE BABY ATE, food by food (docs/SOLIDS.md §5), only for a household that logs solids at
  // all — before the first meal there is nothing to track back
  if (has(rows, 'solids')) out.push('foods');
  // the stool card is the diaper figure's second half and appears under the owner's own rule:
  // a household that does not log diaper changes never sees any of it
  if (input.diaperEngaged) out.push('stool');
  if (has(rows, 'growth')) out.push('growth');
  if (input.hasStash) out.push('stash');
  if (input.hasSchedule) out.push('schedule');
  if (rows.length > 0) out.push('observations');
  // THE PLUS PAIR, LAST (see above)
  // the day-by-day charts and the 24-hour clock are drawn from feeds, sleeps and changes; a
  // household that logs none of the three has no chart to open
  if (anyFeed || anySleep || anyDiaper) out.push('charts');
  // THE USUAL WINDOWS, under the charts: they answer "when does it happen" where the lead cards
  // answer "how much". Every window is built from a feed or a sleep, so a household that logs
  // neither has no card — and that is absence, not a gate: the LOCKED state of this card still
  // draws its shape, and it cannot draw the shape of a log that holds nothing (`patterns/windows.ts`).
  if (anyFeed || anySleep) out.push('patterns');
  return out;
}
