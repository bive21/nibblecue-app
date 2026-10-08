/**
 * CELEBRATIONS — the monthly note and the weekly summary (docs/CELEBRATIONS.md).
 *
 * Two moments where the app speaks first, and both are **arithmetic in a warm voice**: a date,
 * and the household's own numbers. What makes them safe is what is missing from them. No claim
 * about development, no comparison with any other baby, no streak to keep, and no verdict on a
 * number — `celebrationBannedHits` runs the same instrument Reports uses over every sentence
 * this module produces, and `index.test.ts` fails on a hit.
 *
 * Pure, and here rather than in the app, for the reason `CELEBRATIONS.md` §7 gives: the client
 * and the Edge Function have to agree on every figure, down to the divisor, or a parent gets a
 * push saying one thing and a card saying another.
 *
 * TWO DECISIONS WORTH THE INK:
 *
 *  - **Per-day figures divide by the days with an entry, not by calendar days.** Nobody logs
 *    every day, and a "3 bottles a day" that quietly assumed thirty-one days when twelve were
 *    logged is not a rounding difference — it is a different claim. `loggedDays` is carried
 *    beside every figure so the card can say which it used.
 *  - **The window never runs into the future.** It ends at `min(mark, now)`, so the month a
 *    baby turns five months old is measured over the days that have actually happened.
 */
import { volumeAsRead, type VolumeUnit } from '../entry/units';
import { localDayBounds, localDayKey, shiftDay, zonedToUtc } from '../today/day';
import { PROMPT_TIMING } from '../plan/welcome';
import { isDaytimeHour } from '../today/daytime';
import { bannedHitsIn, reportBannedHits } from '../reports/observations';
import type { ReportRange } from '../reports/range';
import type { TodayActivity } from '../today/rows';
import { countsAsDiaper, countsAsMilk, recordedMs } from '../today/totals';

/* ------------------------------------------------------------------ the calendar */

/** `celebration_kind` in 0001_init.sql. */
export const CELEBRATION_KINDS = [
  'MONTH_MARK',
  'FIRST_BIRTHDAY',
  'YEAR_MARK',
  'WEEKLY_SUMMARY',
] as const;
export type CelebrationKind = (typeof CELEBRATION_KINDS)[number];

/**
 * ADD MONTHS, CLAMPING THE DAY — the one piece of arithmetic in this file that is easy to get
 * wrong and impossible to notice. Naive month addition turns 31 January into 3 March, because
 * February has no 31st and `Date` rolls over. A baby born on the 31st has their month mark on
 * the LAST day of a short month, which is what a person means by "the 31st, in February".
 *
 * Whole dates in, whole date out: no zone, no instant, no hour. A mark belongs to a calendar
 * day, and turning it into an instant is the caller's job, in the household's own zone.
 */
export function addMonthsClamped(iso: string, months: number): string {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  const target = m - 1 + months;
  const year = y + Math.floor(target / 12);
  const month = ((target % 12) + 12) % 12;
  // day 0 of the NEXT month is the last day of this one
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const day = Math.min(d, lastDay);
  const p2 = (n: number): string => String(n).padStart(2, '0');
  return `${year}-${p2(month + 1)}-${p2(day)}`;
}

export interface CelebrationMark {
  kind: Exclude<CelebrationKind, 'WEEKLY_SUMMARY'>;
  /** Months since birth: 1..11, 12 for the first birthday, 24 and 36 for the year marks. */
  monthNumber: number;
  /** The local calendar day the mark falls on, `yyyy-mm-dd`. */
  onIso: string;
}

/**
 * Every mark a birth date will ever produce, oldest first: the eleven monthly notes, the first
 * birthday, and two and three years. Nothing past three — the app is for the first two years
 * and a bit, and a note at four would be the app still talking about a child who has outgrown
 * it (docs/CELEBRATIONS.md §1).
 */
export const MARK_MONTHS: readonly number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 24, 36];

const kindFor = (months: number): CelebrationMark['kind'] =>
  months === 12 ? 'FIRST_BIRTHDAY' : months >= 24 ? 'YEAR_MARK' : 'MONTH_MARK';

export function celebrationMarks(birthIso: string): CelebrationMark[] {
  return MARK_MONTHS.map(months => ({
    kind: kindFor(months),
    monthNumber: months,
    onIso: addMonthsClamped(birthIso, months),
  }));
}

/**
 * The one mark a child is owed today, or null.
 *
 * THE MOST RECENT ONE, NOT ALL OF THEM. A parent who installs the app when their baby is eight
 * months old is not owed eight cards, and a phone left in a drawer for a fortnight is not owed
 * two. `since` is the floor — the household's own first day — so nothing is ever celebrated
 * from before the app existed, and `graceDays` is how long a mark stays collectable, which is
 * what makes "opened three days late, still shows, dated correctly" true (§5).
 *
 * Whether it has ALREADY been shown is not this function's business: that is the event row,
 * unique on (household, child, kind, occurs_on), and it is what makes two devices produce one
 * card between them.
 */
export function markDue(
  birthIso: string,
  todayIso: string,
  options: { since?: string; graceDays?: number } = {},
): CelebrationMark | null {
  const grace = options.graceDays ?? 7;
  const floorIso = options.since ?? birthIso;
  const earliest = addDaysIso(todayIso, -grace);
  const reached = celebrationMarks(birthIso).filter(
    m => m.onIso <= todayIso && m.onIso >= earliest && m.onIso >= floorIso,
  );
  return reached.at(-1) ?? null;
}

/**
 * THE MARK'S OWN MORNING (§1: "on the day-of-month matching the birth date, from 09:00 local").
 * The note is owed from nine where the household is, and not before: a parent up with the baby at
 * six on the five-month day has not had the day yet. The weekly summary keeps its own hour the
 * same way (`weeklyDue`, "not before their chosen hour"); this is the monthly note's.
 */
export const MARK_FROM_HOUR = 9;

/**
 * The one mark a child is owed at this INSTANT: `markDue`, with the mark's own day held until
 * `MARK_FROM_HOUR` in the household's zone. Only the mark's own day is held: a day of the grace
 * that follows is owed from its first minute, and the hours a card may RISE in are a separate rule
 * (`celebrationMayRise`, on the phone's clock), so this never has to know about the night.
 *
 * NOTHING OLDER STANDS IN FOR IT before nine. The previous mark is at least 28 days back and the
 * grace is a week, so while today's mark waits there is nothing else it could be.
 */
export function markDueAt(
  birthIso: string,
  timeZone: string,
  nowMs: number,
  options: { since?: string; graceDays?: number } = {},
): CelebrationMark | null {
  const todayIso = localDayKey(timeZone, nowMs);
  const mark = markDue(birthIso, todayIso, options);
  if (mark === null || mark.onIso !== todayIso) return mark;
  const [y, m, d] = todayIso.split('-').map(Number) as [number, number, number];
  return nowMs < zonedToUtc(timeZone, y, m, d, MARK_FROM_HOUR) ? null : mark;
}

/** `yyyy-mm-dd` arithmetic in whole days, with no zone involved. */
export function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  const at = new Date(Date.UTC(y, m - 1, d + days));
  return at.toISOString().slice(0, 10);
}

/* ------------------------------------------------------------------ the month-days */

/**
 * THE LAST MONTH-DAY THAT WEARS A HAT: the first birthday. The owner approved a party hat on the top
 * bar's avatar "on the day the baby turns a whole number of months" (2026-09-26), first through two
 * years and the third birthday — and narrowed it the same day: *"party hat should be every month
 * (birth date) for example april 28, makes everyday on 28, with the hat, until they turn 1 year.
 * (understand babies born on 31st, wont get much hats, and that's fine)"*. So one month to twelve,
 * the first birthday included, and never after it.
 *
 * The calendar's year marks (`MARK_MONTHS`: 24 and 36) keep their notes; they no longer wear a
 * hat. A baby born on the 31st still gets one every month — on the last day of a shorter
 * month, the day the chip's age turns over (`addMonthsClamped`) — which is the owner's "that's fine".
 */
export const MONTH_DAY_LAST = 12;

/**
 * THE WHOLE NUMBER OF MONTHS A CHILD TURNS ON `todayIso`, or null on every other day.
 *
 * The same clamped arithmetic as every mark above (`addMonthsClamped`), so a baby born on the 31st
 * turns a month older on the last day of a short month, and the day the hat is worn is the day
 * the monthly note is dated. It is a question about two calendar dates and nothing else: no zone,
 * no instant — the caller says which day it is where the household is (`localDayKey`), exactly as
 * `markDue` is asked. A due date is not read: nothing in this calendar corrects for one.
 *
 * Months one to `MONTH_DAY_LAST` (the first birthday) and nothing after; a birth date that does
 * not parse, or a day before the first month-day, is null.
 */
export function monthDayOn(birthIso: string, todayIso: string): number | null {
  const [by, bm] = birthIso.split('-').map(Number);
  const [ty, tm] = todayIso.split('-').map(Number);
  if (by === undefined || bm === undefined || ty === undefined || tm === undefined) return null;
  const months = (ty - by) * 12 + (tm - bm);
  if (!Number.isInteger(months) || months < 1) return null;
  if (months > MONTH_DAY_LAST) return null;
  // the year and month say WHICH month-day this could be; only the clamped date says it is today
  return addMonthsClamped(birthIso, months) === todayIso ? months : null;
}

/* ------------------------------------------------------------------ the weekly summary */

export interface WeeklyPreference {
  /** 0 = Sunday, the way `Date.getUTCDay` counts. */
  dow: number;
  /** Local hour, 0–23. Nothing fires before it. */
  hour: number;
}

/** Sunday evening, which is when a week is over and the next has not started (§1). */
export const WEEKLY_DEFAULT: WeeklyPreference = { dow: 0, hour: 19 };

/**
 * The local date of the weekly summary that is due now, or null.
 *
 * "Not before their chosen hour" is the whole rule: at 18:59 on the chosen day there is
 * nothing, at 19:01 there is exactly one, and it stays collectable for the rest of that day
 * and `graceDays` after it — a phone that was off on Sunday evening still gets Sunday's.
 */
export function weeklyDue(
  timeZone: string,
  nowMs: number,
  pref: WeeklyPreference = WEEKLY_DEFAULT,
  options: { since?: string; graceDays?: number } = {},
): string | null {
  const grace = options.graceDays ?? 3;
  for (let back = 0; back <= grace; back++) {
    const day = shiftDay(timeZone, nowMs, -back);
    const iso = localDayKey(timeZone, day.startMs);
    if (new Date(`${iso}T00:00:00Z`).getUTCDay() !== pref.dow) continue;
    const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
    // the hour is the household's own clock, so a summary never arrives at lunchtime abroad
    if (zonedToUtc(timeZone, y, m, d, pref.hour) > nowMs) return null;
    if (options.since !== undefined && iso < options.since) return null;
    return iso;
  }
  return null;
}

/* ------------------------------------------------------------------ the windows */

/**
 * The window a monthly note measures: from the PREVIOUS mark — or the birth date, for month one
 * — to `min(mark, now)`. Never into the future, so a per-day figure is never divided by days
 * that have not happened yet (§3).
 */
export function monthWindow(
  mark: CelebrationMark,
  birthIso: string,
  timeZone: string,
  nowMs: number,
): ReportRange {
  /**
   * CONSECUTIVE WINDOWS TILE, they do not overlap. The previous mark's own day belongs to the
   * previous note, so this one starts the day after it — otherwise a bottle at 6 p.m. on the
   * fourth-month day is counted in both the fourth month and the fifth, and the two cards add
   * up to more milk than the household ever poured. Month one is the exception with a reason:
   * the birth date is not a previous mark, it is the first day there was anything to log.
   */
  const previous =
    mark.monthNumber <= 1
      ? birthIso
      : addDaysIso(
          addMonthsClamped(birthIso, MARK_MONTHS[MARK_MONTHS.indexOf(mark.monthNumber) - 1] ?? 1),
          1,
        );
  const fromMs = isoStartMs(timeZone, previous);
  const markEnd = isoEndMs(timeZone, mark.onIso);
  const toMs = Math.min(markEnd, localDayBounds(timeZone, nowMs).endMs);
  return { key: 'custom', fromMs, toMs, days: Math.max(1, wholeDays(timeZone, fromMs, toMs)) };
}

/** The last seven local days, ending with `onIso` — the day the summary belongs to. */
export function weekWindow(onIso: string, timeZone: string): ReportRange {
  const toMs = isoEndMs(timeZone, onIso);
  const fromMs = isoStartMs(timeZone, addDaysIso(onIso, -6));
  return { key: 'week', fromMs, toMs, days: 7 };
}

/**
 * THE WEEK BEFORE, the one a summary is set beside (§4; the owner, 2026-09-28: *"the numbers free,
 * with 'compared with last week' as Plus"*): the seven local days that end the day before
 * `weekWindow(onIso)` begins. The two windows tile, as the month windows do, so no entry is counted
 * in both weeks and the two columns never add up to more than the household logged.
 */
export function weekBeforeWindow(onIso: string, timeZone: string): ReportRange {
  return weekWindow(addDaysIso(onIso, -7), timeZone);
}

const isoStartMs = (timeZone: string, iso: string): number => {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  return zonedToUtc(timeZone, y, m, d);
};
const isoEndMs = (timeZone: string, iso: string): number =>
  localDayBounds(timeZone, isoStartMs(timeZone, iso) + 12 * 3_600_000).endMs;

const wholeDays = (timeZone: string, fromMs: number, toMs: number): number => {
  let days = 0;
  let cursor = fromMs;
  while (cursor < toMs && days < 400) {
    cursor = localDayBounds(timeZone, cursor + 12 * 3_600_000).endMs;
    days += 1;
  }
  return days;
};

/* ------------------------------------------------------------------ the numbers */

export interface CelebrationFigures {
  /** Local days in the window. */
  calendarDays: number;
  /** Days with at least one entry — the divisor for everything "per day" (§3). */
  loggedDays: number;
  milkMl: number;
  bottles: number;
  breastfeeds: number;
  breastfeedMinutes: number;
  /** The sleeps `sleepMinutes` is made of: the sample size a total of them is said with. */
  sleeps: number;
  sleepMinutes: number;
  /** The longest single logged sleep in the window. */
  longestSleepMinutes: number;
  /** Changes, a DRY check never among them (`countsAsDiaper`). */
  diapers: number;
  pumpedMl: number;
  pumpSessions: number;
  /** Set only when the household recorded measurements at BOTH ends of the window. */
  weightChangeG: number | null;
}

/** The per-day figures, divided by the days that were logged rather than by the calendar. */
export interface CelebrationPerDay {
  milkMl: number;
  sleepMinutes: number;
  diapers: number;
}

/**
 * An entry's minutes AS IT WAS RECORDED (`recordedMs`): a breastfeed's time at the breast when its
 * sides were recorded, every other entry its span. A pause is not a feed.
 */
const minutesOf = (r: TodayActivity): number => Math.round(recordedMs(r) / 60_000);

/**
 * The household's own numbers over a window, frozen at the moment they are computed.
 *
 * Sleep is counted by the session's own duration rather than sliced across midnight, which is
 * the right instrument here: the card says "the longest stretch was 5h 10m", and a stretch that
 * a date boundary cut in half was never two stretches. Reports slices, because a chart's bars
 * are days; a celebration's sentences are sessions.
 *
 * THE APP'S OWN COUNTING RULES, as every other total keeps them (2026-09-28, with the year's
 * keepsake, which adds a whole year of these up): a change is `countsAsDiaper`, so a DRY check is
 * not a diaper; a breastfeed's minutes are the ones it recorded (`recordedMs`), not the wall clock
 * a pause stretched; and with the household's `unit` handed in, each volume is added up as it reads
 * in that unit (`volumeAsRead`), so a year of 4 oz bottles is not thirteen ounces short of what the
 * Log says. Without a unit the volumes are the plain sum of stored ml, as they always were.
 */
export function celebrationFigures(
  rows: readonly TodayActivity[],
  range: ReportRange,
  timeZone: string,
  unit?: VolumeUnit,
): CelebrationFigures {
  const scoped = rows.filter(r => r.startMs >= range.fromMs && r.startMs < range.toMs);
  const of = (type: string): TodayActivity[] => scoped.filter(r => r.type === type);
  const asRead = (ml: number): number => (unit === undefined ? ml : volumeAsRead(ml, unit));
  // the bottles of MILK: a water bottle is logged and kept, and is neither milk nor a feed
  // (`countsAsMilk`; the feeding audit's M7) — "142 bottles, 96 oz of milk" means milk
  const bottles = of('bottle').filter(countsAsMilk);
  const pumps = of('pump');
  const sleeps = of('sleep');
  const feeds = of('breastfeed');
  const days = new Set(scoped.map(r => localDayKey(timeZone, r.startMs)));
  const weights = of('growth')
    .filter(r => typeof r.weightG === 'number' && r.weightG !== null)
    .sort((a, b) => a.startMs - b.startMs);

  return {
    calendarDays: range.days,
    loggedDays: days.size,
    milkMl: bottles.reduce((sum, r) => sum + asRead(r.consumedMl ?? 0), 0),
    bottles: bottles.length,
    breastfeeds: feeds.length,
    breastfeedMinutes: feeds.reduce((sum, r) => sum + minutesOf(r), 0),
    sleeps: sleeps.length,
    sleepMinutes: sleeps.reduce((sum, r) => sum + minutesOf(r), 0),
    longestSleepMinutes: sleeps.reduce((max, r) => Math.max(max, minutesOf(r)), 0),
    diapers: scoped.filter(countsAsDiaper).length,
    pumpedMl: pumps.reduce((sum, r) => sum + asRead(r.totalMl ?? 0), 0),
    pumpSessions: pumps.length,
    // only with a measurement at each end: one weight is a fact, not a change
    weightChangeG:
      weights.length >= 2
        ? Math.round((weights.at(-1)?.weightG ?? 0) - (weights[0]?.weightG ?? 0))
        : null,
  };
}

/** Divided by the days that were logged. Zero days means zero, never a division by nothing. */
export function celebrationPerDay(f: CelebrationFigures): CelebrationPerDay {
  const n = Math.max(1, f.loggedDays);
  return {
    milkMl: f.loggedDays === 0 ? 0 : f.milkMl / n,
    sleepMinutes: f.loggedDays === 0 ? 0 : f.sleepMinutes / n,
    diapers: f.loggedDays === 0 ? 0 : f.diapers / n,
  };
}

/** True when the card has to say which divisor it used, because the two disagree (§3). */
export const divisorNeedsSaying = (f: CelebrationFigures): boolean =>
  f.loggedDays > 0 && f.loggedDays < f.calendarDays;

/* ------------------------------------------------------------------ the week before */

/**
 * The figures the weekly summary sets beside the week before, in the order the card draws its own
 * cells: the same figures, never a new one.
 *
 * NOT THE WEIGHT. A week's weight cell is the difference of two measurements, and two differences
 * side by side is a rate of growth set against a rate of growth: the percentile chart's question,
 * which the app leaves to the pediatrician (CLAUDE.md §2 rule 1). The measurements themselves stay
 * on the card, as the household recorded them.
 */
export const WEEK_FIGURES = [
  'milk',
  'milkPerDay',
  'breastfeeds',
  'sleepPerDay',
  'longestSleep',
  'diapersPerDay',
  'pumped',
  'pumpSessions',
] as const;
export type WeekFigure = (typeof WEEK_FIGURES)[number];

export interface WeekComparisonRow {
  figure: WeekFigure;
  /** How the numbers read: millilitres, minutes, or a count (a per-day count keeps one decimal). */
  unit: 'ml' | 'minutes' | 'count';
  thisWeek: number;
  weekBefore: number;
}

export interface WeekComparison {
  /**
   * The days with entries in each week: the sample size (CLAUDE.md §2 rule 6), and the divisor of
   * every per-day figure beside it, so a week logged on three days is read as three days.
   */
  loggedDays: { thisWeek: number; weekBefore: number };
  rows: WeekComparisonRow[];
}

/**
 * THIS WEEK BESIDE THE WEEK BEFORE, as two numbers and nothing else (§4; the owner, 2026-09-28:
 * *"the numbers free, with 'compared with last week' as Plus"*). "Feeds 52, the week before 48":
 * no difference is worked out, no direction is named, and no number is said to be more than it
 * should be, better or worse. Both weeks are the same instrument (`celebrationFigures`), frozen
 * into the card when it is claimed, so a week read on Tuesday says what it said on Sunday.
 *
 * NOTHING TO SET IT BESIDE, NO COMPARISON: null when the week before is unknown or had nothing
 * logged in it, and a figure only when BOTH weeks hold that kind of entry. "Pumped 12 oz, the week
 * before nothing" said about the week a household started logging pumping is a sentence about the
 * log, not the baby: Reports' comparisons refuse it for the same reason (`compareWindows`). When no
 * figure is left, there is no comparison at all, so there is nothing to lock either.
 *
 * Why not Reports' `compareWindows`: it compares `windowFigures`, which slices sleep across midnight
 * for a chart's day columns, and rounds a difference into words. This card counts sessions, and a
 * comparison in another instrument would put a different "this week" under the card's own numbers.
 */
export function weekComparison(
  thisWeek: CelebrationFigures,
  weekBefore: CelebrationFigures | null,
): WeekComparison | null {
  if (weekBefore === null || weekBefore.loggedDays === 0 || thisWeek.loggedDays === 0) return null;
  const now = celebrationPerDay(thisWeek);
  const before = celebrationPerDay(weekBefore);
  const both = (pick: (f: CelebrationFigures) => number): boolean =>
    pick(thisWeek) > 0 && pick(weekBefore) > 0;
  const rows: WeekComparisonRow[] = [];
  const add = (figure: WeekFigure, unit: WeekComparisonRow['unit'], a: number, b: number) =>
    rows.push({ figure, unit, thisWeek: a, weekBefore: b });
  if (both(f => f.milkMl)) {
    add('milk', 'ml', thisWeek.milkMl, weekBefore.milkMl);
    add('milkPerDay', 'ml', now.milkMl, before.milkMl);
  }
  if (both(f => f.breastfeeds))
    add('breastfeeds', 'count', thisWeek.breastfeeds, weekBefore.breastfeeds);
  if (both(f => f.sleepMinutes)) {
    add('sleepPerDay', 'minutes', now.sleepMinutes, before.sleepMinutes);
    add('longestSleep', 'minutes', thisWeek.longestSleepMinutes, weekBefore.longestSleepMinutes);
  }
  if (both(f => f.diapers)) add('diapersPerDay', 'count', now.diapers, before.diapers);
  if (both(f => f.pumpedMl)) {
    add('pumped', 'ml', thisWeek.pumpedMl, weekBefore.pumpedMl);
    add('pumpSessions', 'count', thisWeek.pumpSessions, weekBefore.pumpSessions);
  }
  if (rows.length === 0) return null;
  return {
    loggedDays: { thisWeek: thisWeek.loggedDays, weekBefore: weekBefore.loggedDays },
    rows,
  };
}

/* ------------------------------------------------------------------ the words */

/**
 * The mark, in words: `5 months` · `1 year` · `2 years`. The card's own title puts the child's
 * name after it, and the name is data — it never appears in this file.
 */
export function markLabel(mark: CelebrationMark): string {
  if (mark.monthNumber < 12) return `${mark.monthNumber} month${mark.monthNumber === 1 ? '' : 's'}`;
  const years = Math.round(mark.monthNumber / 12);
  return `${years} year${years === 1 ? '' : 's'}`;
}

/**
 * A CELEBRATION BANS MORE THAN A REPORT DOES, and this is the one place in the app where that
 * is true.
 *
 * Reports ban a verdict on a number. A celebration has to ban PRAISE for one as well, because
 * praise for a number is a verdict wearing a friendlier face — `CELEBRATIONS.md` §3 names
 * "great job keeping up!" outright, and `reportBannedHits` lets it through: `great` is not a
 * clinical word and never needed to be. A parent who logged eleven of thirty-one days has not
 * failed at anything, and a card that congratulates the thirty-one-day household is telling
 * the eleven-day one something it must never say.
 *
 * "Well done" is on this list and is still right in the first-run tour, which says it when a
 * parent TAPS something. Congratulating a deed a person just performed is encouragement;
 * congratulating an arithmetic result is a grade.
 */
export const CELEBRATION_PRAISE_BANNED = [
  'great job',
  'great work',
  'well done',
  'keep it up',
  'keep up',
  // "keeping up" is the form §3 actually quotes, and a whole-word `keep up` misses it
  'keeping',
  'proud',
  'amazing',
  'incredible',
  'impressive',
  'perfect',
  'nailed',
  'crushing',
  'streak',
  'record',
  'champion',
  'superstar',
  'rockstar',
] as const;

/** Every banned entry a sentence contains: the report list, plus the praise family above. */
export function celebrationBannedHits(text: string): string[] {
  return [...reportBannedHits(text), ...bannedHitsIn(text, CELEBRATION_PRAISE_BANNED, [])];
}

/* ------------------------------------------------------------------ when the card may rise */

/**
 * WHEN THE CARD MAY RISE (§5, and the governing rule: *a parent who opens the app at 3 a.m. to log
 * a bottle never has to dismiss anything first*, docs/GROWTH_PROMPTS.md, 01-REQUIREMENTS.md §1).
 * It is the one sheet in the app that speaks first, and until 2026-09-28 it rose whenever a note
 * was owed: on launch, over a running feed, at 3 a.m. Now every one of these must hold:
 *
 *   · THE DAYTIME, on the phone's own clock: 8 a.m. to 9 p.m., the trial sheets' hours
 *     (`isDaytimeHour`). A card owed at night waits for the morning.
 *   · NO TIMER RUNNING, anywhere in the household. A feed or a nap in progress is the parent's
 *     attention, and §5 says it outright: "never over an active timer action".
 *   · NOTHING ELSE UP: no sheet, popover or gate, the shell's or a screen's own (§5: "or a Quick
 *     Entry in progress"), and no tour, card or tip, which is a thing being taught.
 *   · TODAY IN FRONT, with the app open. A card that rises on a page nobody is looking at is found
 *     later, over whatever the parent came back to do.
 *   · NOT IN NIGHT, the amber theme. Night is for one thing.
 *   · AND A QUIET MOMENT AFTER ALL OF THAT: `CELEBRATION_QUIET_MS` since the last of those stood in
 *     the way — the sheet closed, the timer stopped, the tip ended, Today came to the front. A save
 *     closes its sheet and says so in a toast with Undo, and a card rising in the same breath would
 *     take the Undo away; the trial sheets wait the same beat for the same reason
 *     (`PROMPT_TIMING.afterSaveMs`). It also means the card never meets a parent on the way in: it
 *     waits for them to have arrived.
 *
 * A CARD THAT MAY NOT RISE IS STILL OWED. Nothing is claimed while it waits (the claim is what
 * freezes the numbers and says "shown", so a card claimed in the dark would be a card another
 * device skips as handled), and nothing is dismissed by waiting: it rises at the next moment all of
 * these hold, for as long as its mark is still collectable (`markDue`'s week, `weeklyDue`'s three
 * days).
 */
export interface CelebrationMoment {
  /** The phone's local hour, 0 to 23. */
  hour: number;
  /** A timer is running for any baby in the household. */
  timerRunning: boolean;
  /** Something is over the page: a sheet, a popover, the gate, the shell's or a screen's own. */
  overlay: boolean;
  /** The tour is on, or one of its guides or tips is up. */
  tour: boolean;
  /** Today is the page in front and the app is open. */
  awake: boolean;
  /** Night, the amber theme, is what is painted. */
  night: boolean;
  /**
   * How long it has been, in ms, since any of the above last stood in the way: a sheet closed, a
   * timer stopped, the tour's card went, Today came to the front. 0 while one still does.
   */
  quietMs: number;
}

/** The quiet a card waits for: past the save toast and its Undo, as the trial sheets wait. */
export const CELEBRATION_QUIET_MS = PROMPT_TIMING.afterSaveMs;

export function celebrationMayRise(m: CelebrationMoment): boolean {
  if (!m.awake || m.night) return false;
  if (m.timerRunning || m.overlay || m.tour) return false;
  if (m.quietMs < CELEBRATION_QUIET_MS) return false;
  return isDaytimeHour(m.hour);
}

/**
 * WHETHER THE SHEET IS UP, from one moment to the next. It RISES only when `celebrationMayRise`
 * says so; once up, it STAYS until the parent answers it, whatever starts meanwhile: the gate its
 * own locked cells open over it, a timer another parent starts, nine o'clock. A card that vanished
 * because something else happened would be the app changing its mind in front of the parent.
 *
 * It GOES DOWN, unanswered, the moment Today is not in front or the app is put away, so the parent
 * who left it up at five to nine never comes back at 3 a.m. to find it waiting. It is still owed,
 * and rises again at the next moment it may.
 */
export interface CelebrationShowing {
  /** The sheet was up a moment ago. */
  wasUp: boolean;
  /** A claimed card is waiting to be read: there is something to show. */
  card: boolean;
  /** `celebrationMayRise`, now. */
  may: boolean;
  /** Today is in front and the app is open. */
  awake: boolean;
}

export function celebrationShown(s: CelebrationShowing): boolean {
  if (!s.card || !s.awake) return false;
  return s.wasUp || s.may;
}
