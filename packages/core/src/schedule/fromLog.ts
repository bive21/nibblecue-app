/**
 * SCHEDULE FROM YOUR LOG — the day a household's own week of entries describes, laid out as this
 * app's own settings for them to take or leave.
 *
 * The owner, 2026-09-23: *"what if after user start using the log for a week straight, the 'smart
 * schedule' option is enabled, where it reads the log and created schedule based on this info"* —
 * and, on the three questions that were put back to them: *"plus, auto offer after a week, leave
 * nights on demand"*.
 *
 * ── THE LINE, WHICH IS THE COACH'S LINE ─────────────────────────────────────────────────────
 *
 * This reads the times a household wrote down and hands the same times back as settings: "your
 * feeds were within 45 minutes of 10:05 on 6 of the last 7 days" becomes a set time at 10:05. It
 * never says when a baby should eat or sleep, never compares one week to anybody else's, never
 * reads an amount, and never writes anything by itself — the app screen shows each proposal next
 * to what the routine says now, and nothing changes until a parent taps it through
 * (`docs/COACH_AND_SEARCH.md` §4). A household that ignores it has missed nothing about their
 * child.
 *
 * ── WHAT IT PRODUCES, ACTIVITY BY ACTIVITY ──────────────────────────────────────────────────
 *
 *   * FEEDING (either kind — one rhythm, as everywhere in this app), PUMPING and SOLIDS, each as
 *     one of three shapes: SET TIMES when the entries come back to the same clock times day after
 *     day; AN INTERVAL when the gaps between them are steady but the clock times drift; or
 *     NOTHING, with the reason, when neither holds. When both would fit, it takes the one that
 *     would have been closer to the household's own entries that week (`fromLogCloser`), which is what
 *     tells a parent's clock routine from a baby who feeds three hours after the last feed.
 *   * THE DAY — the morning wake and the bedtime, from the nights in the sleep log. The day is the
 *     frame everything else sits in: no set time or day interval is proposed outside it.
 *   * NIGHTS ARE LEFT ON DEMAND (the owner's words) — by default. No night is ever started here,
 *     and an interval it creates pauses overnight. But a feeding or pumping rhythm the household
 *     already gave a night interval of its own keeps that night and has it read from the week's own
 *     nights (`FromLogNight`; the owner, 2026-09-29, after a week imported from another tracker:
 *     *"do 7day report create schedule for the night shift too? … pumping became 2h20m same with
 *     feeding, but only for day, not for night"*). What kind of night a rhythm has stays the
 *     household's choice; only its number follows their nights, as the Routine page's line does
 *     (`coach.ts`, the `nightInterval` card).
 *   * NAPS ARE NOT SET HERE. The nap outlook follows each wake-up (`naps.ts`), which is closer
 *     than a clock time can be for a baby whose naps move with the morning.
 *   * NEVER medicine, diapers, bath, tummy time or vaccines — a medicine's times are the parent's
 *     and a prescriber's, and the others are not a daily rhythm a week of entries can describe.
 *
 * ── WHEN ────────────────────────────────────────────────────────────────────────────────────
 *
 * Once the first entry is a week old and at least five of the last seven days have something in
 * them (`ready`). Before that there is nothing to describe, and `daysToGo` says how long.
 *
 * Pure: no clock, no zone, no database, no React. The day boundary, the wall clock and the weekday
 * arrive as functions because `packages/core` never reads a zone.
 */
import { MAX_GAP_MS, SAME_OCCURRENCE_MS, type Beat } from './foresight';
import { nightStretches, type SleepLog } from './naps';
import { isFeeding } from './sessions';
import { hhmmOf, hm } from './time';
import { MIN } from './types';

const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** The week read: the seven complete days before today. Today is never in it — it is not over. */
export const FROM_LOG_DAYS = 7;
/**
 * FIVE OF THE SEVEN. The bar for the offer, for an activity to be read at all, and for one clock
 * time to go into a schedule — the same five days a usual window needs (`patterns/windows.ts`).
 * A time kept on five days of seven is a time the household keeps; one kept on three is a week.
 */
export const FROM_LOG_MIN_DAYS = 5;
/** …and four of the five weekdays, for a pump only ever logged on weekdays (a pump at work). */
const FROM_LOG_WEEKDAY_MIN_DAYS = 4;
/**
 * WITHIN 45 MINUTES. How near an entry has to be to a clock time to count as that time kept —
 * wide enough for a morning that ran late, narrow enough that the next feed cannot count for it.
 */
const FROM_LOG_WITHIN_MIN = 45;
/** Set times this far apart at least, or the two are one time logged twice. */
const FROM_LOG_APART_MIN = 60;
/** More set times than this is an interval, whatever the clock says. */
const FROM_LOG_MAX_TIMES = 8;
/** Gaps before an interval is worth proposing — the coach's six (`COACH_MIN_SAMPLES`). */
const FROM_LOG_MIN_GAPS = 6;
/**
 * STEADY: the middle half of the gaps within a third of the usual gap of each other. A three-hour
 * rhythm may run from about 2h 30m to 3h 30m and still be one rhythm; a day of forty-minute
 * cluster feeds and five-hour stretches is not, and an interval would be wrong for all of it.
 */
const FROM_LOG_STEADY_SHARE = 1 / 3;
/**
 * THE EDGES OF THE DAY. A start up to an hour before the morning wake is the first feed of an
 * early morning, and one up to half an hour after bedtime is the bedtime feed — both are the day.
 * Anything further out is the night, and the night stays on demand.
 */
export const FROM_LOG_EARLY_MIN = 60;
export const FROM_LOG_LATE_MIN = 30;

export type FromLogActivity = 'feeding' | 'pump' | 'solids';
export const FROM_LOG_ACTIVITIES: readonly FromLogActivity[] = ['feeding', 'pump', 'solids'];

export type FromLogShape =
  /** `HH:MM`, in clock order. `weekdays`: Monday to Friday only — pumping, never a feed or a meal. */
  | { kind: 'times'; times: string[]; weekdays: boolean }
  | { kind: 'every'; everyMinutes: number }
  | { kind: 'none'; reason: 'fewEntries' | 'unsteady' };

export interface FromLogRhythm {
  activity: FromLogActivity;
  shape: FromLogShape;
  /** Days of the week (of the five weekdays, for a weekday rhythm) with one of these in the day. */
  days: number;
  /** Out of how many — seven, or five for a weekday rhythm. */
  ofDays: number;
  /** What the shape rests on: the fewest days any one of the times was kept, or the gaps. */
  samples: number;
  /**
   * The week's nights, for feeding and pumping: null for solids, and whenever the nights are too
   * thin to read. Whether a tap writes it is the routine's question (`diff.ts`): only a rhythm
   * that already has a night interval of its own has one to follow.
   */
  night: FromLogNight | null;
}

/**
 * THE GAPS THAT BEGIN IN THE NIGHT, read the way the day's are: the middle of them, to the
 * nearest five minutes, beside how many there were and on how many nights.
 *
 * A gap belongs to the night when it BEGINS there: at or after bedtime, and before the hour ahead
 * of waking, which is the day's own (`FROM_LOG_EARLY_MIN`: the first feed of an early morning is
 * the day's). It is the stretch the night's interval would time from that entry. A night is the
 * one that began on one of the week's seven evenings, so the week's last night is the one that
 * ended this morning. Two entries within 30 minutes are one, as by day, and a stretch past eight
 * hours is a night slept through, not a gap anybody set (`MAX_GAP_MS`).
 *
 * NO STEADINESS BAR, where the day has one. By day the spread decides the SHAPE — set times, an
 * interval or nothing — and an interval would be wrong for a day of cluster feeds. The night's
 * shape is already the household's: they chose an interval for it, and the only question left is
 * its number, which the middle of their own gaps answers however much the nights vary. The same
 * middle the Routine page's night line reads (`coach.ts`).
 */
export interface FromLogNight {
  everyMinutes: number;
  gaps: number;
  /** Of the week's seven nights, how many had a gap in them. */
  nights: number;
}

export interface FromLogClock {
  /** `HH:MM`, or null when the nights do not say it steadily enough. */
  at: string | null;
  /** How many of the seven days it came within 45 minutes of that. */
  days: number;
}

export interface FromLogPlan {
  /** The first entry is a week old and five of the last seven days have entries. */
  ready: boolean;
  /** Days of the last seven with any entry at all. */
  daysLogged: number;
  /** Days until it is ready, at the least; 0 when it is. */
  daysToGo: number;
  /** Entries in the week, of every kind — the number the page says it was built from. */
  entries: number;
  wake: FromLogClock;
  bed: FromLogClock;
  rhythms: FromLogRhythm[];
}

export interface FromLogInput {
  nowMs: number;
  /**
   * The week's starts OF EVERY KIND — sleeps, diapers and medicines as well as feeds — already
   * scoped to one child plus the household and to this viewer. `entries` counts these.
   */
  beats: readonly Beat[];
  /**
   * The same child's sleeps, from the evening before the week began, read for where the nights
   * begin and end. They are also among the beats, so they are not counted again.
   */
  sleeps: readonly SleepLog[];
  /** The household's first entry of any kind, ever; null with none. */
  firstEntryMs: number | null;
  /** The household's own wake and bed times — the day, until the nights say otherwise. */
  window: { wake: string; bed: string };
  /** Module ids that are on. Empty means "everything", as elsewhere in this codebase. */
  enabled: ReadonlySet<string>;
  /** Local midnight for an instant, in the household's own zone. */
  dayStartOf: (ms: number) => number;
  /** Minutes since local midnight for an instant. */
  wallMinutes: (ms: number) => number;
  /** 0 = Sunday, in the household's own zone. */
  weekday: (ms: number) => number;
}

/* ------------------------------------------------------------------ arithmetic */

function quantile(xs: readonly number[], q: number): number {
  const s = [...xs].sort((a, b) => a - b);
  if (s.length === 0) return 0;
  const at = (s.length - 1) * q;
  const lo = Math.floor(at);
  const hi = Math.ceil(at);
  return (s[lo] ?? 0) + ((s[hi] ?? 0) - (s[lo] ?? 0)) * (at - lo);
}
const median = (xs: readonly number[]): number => quantile(xs, 0.5);
const mean = (xs: readonly number[]): number =>
  xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;
/** To the nearest five minutes: a time a parent would type. */
const nearest5 = (minutes: number): number => Math.round(minutes / 5) * 5;
const clockAt = (minutes: number): string => hhmmOf(((nearest5(minutes) % 1440) + 1440) % 1440);

/** The seven complete local days before today, oldest first, as their first instants. */
export function fromLogWeek(nowMs: number, dayStartOf: (ms: number) => number): number[] {
  const today = dayStartOf(nowMs);
  const out: number[] = [];
  // noon of each day, so a day an hour short or long around a clock change still lands inside it
  for (let i = FROM_LOG_DAYS; i >= 1; i -= 1) out.push(dayStartOf(today - i * DAY + 12 * HOUR));
  return out;
}

/** Two entries within half an hour are one — a top-up, a second side, both parents logging it. */
function occurrences(beats: readonly Beat[], match: (activity: string) => boolean): number[] {
  const starts = beats
    .filter(b => match(b.activity))
    .map(b => b.startMs)
    .sort((a, b) => a - b);
  const out: number[] = [];
  for (const s of starts) {
    const prev = out[out.length - 1];
    if (prev === undefined || s - prev >= SAME_OCCURRENCE_MS) out.push(s);
  }
  return out;
}

/* ------------------------------------------------------------------ set times */

interface TimesFit {
  /** Minutes past midnight, in clock order. */
  centers: number[];
  /** Per center, how many days it was kept on. */
  kept: number[];
}

/**
 * EACH DAY'S ENTRIES TO THE NEAREST TIME WITHIN 45 MINUTES — one entry per time per day, the
 * nearest, so three feeds around ten o'clock one morning keep ten o'clock once and not three times.
 */
function assign(
  perDay: readonly (readonly number[])[],
  centers: readonly number[],
): { minutes: number[][]; kept: number[] } {
  const minutes = centers.map(() => [] as number[]);
  const kept = centers.map(() => 0);
  for (const day of perDay) {
    const best = new Map<number, number>();
    for (const m of day) {
      let j = -1;
      let d = Infinity;
      centers.forEach((c, i) => {
        if (Math.abs(m - c) < d) {
          d = Math.abs(m - c);
          j = i;
        }
      });
      if (j < 0 || d > FROM_LOG_WITHIN_MIN) continue;
      const held = best.get(j);
      const c = centers[j] ?? 0;
      if (held === undefined || Math.abs(m - c) < Math.abs(held - c)) best.set(j, m);
    }
    for (const [j, m] of best) {
      minutes[j]?.push(m);
      kept[j] = (kept[j] ?? 0) + 1;
    }
  }
  return { minutes, kept };
}

/**
 * `k` CLOCK TIMES THAT THE WEEK KEEPS COMING BACK TO, or null. Seeded at the quantiles of every
 * entry, then each time moved to the middle of the entries it keeps until nothing moves — a
 * one-dimensional k-medians, which is all "the times you usually feed" means.
 */
function fitTimes(
  perDay: readonly (readonly number[])[],
  k: number,
  needDays: number,
): TimesFit | null {
  const pooled = perDay.flat().sort((a, b) => a - b);
  if (k < 1 || pooled.length < k) return null;
  let centers = Array.from(
    { length: k },
    (_, i) => pooled[Math.min(pooled.length - 1, Math.floor(((i + 0.5) / k) * pooled.length))] ?? 0,
  );
  for (let round = 0; round < 30; round += 1) {
    const { minutes } = assign(perDay, centers);
    const next = centers.map((c, j) => {
      const mine = minutes[j] ?? [];
      return mine.length > 0 ? median(mine) : c;
    });
    const moved = next.some((c, j) => Math.abs(c - (centers[j] ?? 0)) >= 0.5);
    centers = next;
    if (!moved) break;
  }
  const order = centers.map((_, j) => j).sort((a, b) => (centers[a] ?? 0) - (centers[b] ?? 0));
  const sorted = order.map(j => centers[j] ?? 0);
  for (let j = 1; j < sorted.length; j += 1) {
    if ((sorted[j] ?? 0) - (sorted[j - 1] ?? 0) < FROM_LOG_APART_MIN) return null;
  }
  const { kept } = assign(perDay, sorted);
  if (kept.some(n => n < needDays)) return null;
  return { centers: sorted, kept };
}

/* ------------------------------------------------------------------ the interval */

interface EveryFit {
  everyMinutes: number;
  gaps: number;
}

/** The gaps inside each day — never across a night, which is on demand and not a gap anybody set. */
function dayGaps(perDay: readonly (readonly number[])[]): number[] {
  const gaps: number[] = [];
  for (const day of perDay) {
    for (let i = 1; i < day.length; i += 1) {
      const g = (day[i] ?? 0) - (day[i - 1] ?? 0);
      if (g * MIN >= SAME_OCCURRENCE_MS && g * MIN <= MAX_GAP_MS) gaps.push(g);
    }
  }
  return gaps;
}

function fitEvery(perDay: readonly (readonly number[])[]): EveryFit | null {
  const gaps = dayGaps(perDay);
  if (gaps.length < FROM_LOG_MIN_GAPS) return null;
  const middle = median(gaps);
  if (quantile(gaps, 0.75) - quantile(gaps, 0.25) > middle * FROM_LOG_STEADY_SHARE) return null;
  return { everyMinutes: Math.max(5, nearest5(middle)), gaps: gaps.length };
}

/**
 * THE NIGHT'S GAPS (`FromLogNight`). `starts` are the occurrences in clock order, today's early
 * hours included; `nightOf` is the week's night an instant begins a night gap in, or undefined for
 * an instant in the day or outside the week. Six gaps, as by day, on five of the seven nights: a
 * night read from two nights is two nights.
 */
function fitNight(
  starts: readonly number[],
  nightOf: (ms: number) => number | undefined,
): FromLogNight | null {
  const gaps: number[] = [];
  const nights = new Set<number>();
  for (let i = 1; i < starts.length; i += 1) {
    const from = starts[i - 1] ?? 0;
    const night = nightOf(from);
    if (night === undefined) continue;
    const gap = (starts[i] ?? 0) - from;
    if (gap < SAME_OCCURRENCE_MS || gap > MAX_GAP_MS) continue;
    gaps.push(gap / MIN);
    nights.add(night);
  }
  if (gaps.length < FROM_LOG_MIN_GAPS || nights.size < FROM_LOG_MIN_DAYS) return null;
  return {
    everyMinutes: Math.max(5, nearest5(median(gaps))),
    gaps: gaps.length,
    nights: nights.size,
  };
}

/**
 * WHICH SHAPE WAS CLOSER TO THE WEEK ITSELF. Every entry after a day's first, measured from where
 * each shape would have put it: the nearest set time, or the last entry plus the interval. A
 * parent's clock routine is close to its set times and far from "three hours after the last one"
 * whenever a morning ran late; a baby who feeds three hours after the last feed is the other way
 * round. The first entry of each day is left out of both — it follows the night, which neither
 * shape claims to know.
 */
export function fromLogCloser(
  perDay: readonly (readonly number[])[],
  centers: readonly number[],
  everyMinutes: number,
): 'times' | 'every' {
  const byTimes: number[] = [];
  const byEvery: number[] = [];
  for (const day of perDay) {
    for (let i = 1; i < day.length; i += 1) {
      const m = day[i] ?? 0;
      byTimes.push(Math.min(...centers.map(c => Math.abs(m - c))));
      byEvery.push(Math.abs(m - ((day[i - 1] ?? 0) + everyMinutes)));
    }
  }
  // a tie goes to set times: it is the shape a parent asked for when they asked for a schedule
  return mean(byTimes) <= mean(byEvery) ? 'times' : 'every';
}

/* ------------------------------------------------------------------ the day */

/**
 * ONE CLOCK TIME THE NIGHTS KEEP, from one reading per day: the middle, then the middle of the
 * readings within 45 minutes of it, kept only when five of the seven days are that close.
 */
function steadyClock(readings: readonly number[]): FromLogClock {
  if (readings.length === 0) return { at: null, days: 0 };
  const first = median(readings);
  const near = readings.filter(m => Math.abs(m - first) <= FROM_LOG_WITHIN_MIN);
  const center = near.length > 0 ? median(near) : first;
  const days = readings.filter(m => Math.abs(m - center) <= FROM_LOG_WITHIN_MIN).length;
  return days >= FROM_LOG_MIN_DAYS ? { at: clockAt(center), days } : { at: null, days };
}

/* ------------------------------------------------------------------ the plan */

export function scheduleFromLog(input: FromLogInput): FromLogPlan {
  const week = fromLogWeek(input.nowMs, input.dayStartOf);
  const index = new Map(week.map((d, i) => [d, i]));
  const dayOf = (ms: number): number | undefined => index.get(input.dayStartOf(ms));
  const weekStart = week[0] ?? input.dayStartOf(input.nowMs);
  const todayStart = input.dayStartOf(input.nowMs);
  const inWeek = (ms: number) => ms >= weekStart && ms < todayStart;

  const beats = input.beats.filter(b => inWeek(b.startMs));
  const sleeps = input.sleeps.filter(s => inWeek(s.startMs));

  /* ── when ─────────────────────────────────────────────────────────────────────────────── */
  const logged = new Set<number>();
  for (const b of beats) logged.add(dayOf(b.startMs) ?? -1);
  for (const s of sleeps) logged.add(dayOf(s.startMs) ?? -1);
  logged.delete(-1);
  const daysLogged = logged.size;
  const sinceFirst =
    input.firstEntryMs === null
      ? 0
      : Math.round((todayStart - input.dayStartOf(input.firstEntryMs)) / DAY);
  const ready = sinceFirst >= FROM_LOG_DAYS && daysLogged >= FROM_LOG_MIN_DAYS;
  const daysToGo = ready
    ? 0
    : Math.max(1, FROM_LOG_DAYS - sinceFirst, FROM_LOG_MIN_DAYS - daysLogged);

  /* ── the day: when the nights begin and end ───────────────────────────────────────────── */
  const bedByDay = new Map<number, number>();
  const wakeByDay = new Map<number, number>();
  for (const night of nightStretches(input.sleeps, input.nowMs, input.dayStartOf)) {
    // an evening is the day the night began on — a 12:30 a.m. bedtime still belongs to the day before
    const evening = dayOf(night.startMs - 4 * HOUR);
    const startMinute = input.wallMinutes(night.startMs);
    if (evening !== undefined && (startMinute >= 15 * 60 || startMinute < 3 * 60)) {
      // after midnight reads as 24:30, so a median across midnight is not the middle of the day
      const reading = startMinute < 3 * 60 ? startMinute + 1440 : startMinute;
      const held = bedByDay.get(evening);
      if (held === undefined || reading < held) bedByDay.set(evening, reading);
    }
    if (night.endMs !== null && night.endMs <= input.nowMs) {
      const morning = dayOf(night.endMs);
      const endMinute = input.wallMinutes(night.endMs);
      if (morning !== undefined && endMinute >= 3 * 60 && endMinute < 12 * 60) {
        const held = wakeByDay.get(morning);
        if (held === undefined || endMinute > held) wakeByDay.set(morning, endMinute);
      }
    }
  }
  const sleepOn = input.enabled.size === 0 || input.enabled.has('sleep');
  const wake = sleepOn ? steadyClock([...wakeByDay.values()]) : { at: null, days: 0 };
  const bed = sleepOn ? steadyClock([...bedByDay.values()]) : { at: null, days: 0 };
  const dayWake = hm(wake.at ?? input.window.wake);
  const dayBed = hm(bed.at ?? input.window.bed);
  const inDay = (minute: number): boolean =>
    dayBed > dayWake
      ? minute >= dayWake - FROM_LOG_EARLY_MIN && minute < dayBed + FROM_LOG_LATE_MIN
      : // a day that ends after midnight keeps its evening and leaves the small hours to the night
        minute >= dayWake - FROM_LOG_EARLY_MIN;
  /*
    WHERE A NIGHT GAP BEGINS: from bedtime to the hour before waking, the day's own early margin
    left to the day. The bedtime feed up to half an hour after bed is the day's last ENTRY, and the
    stretch after it is still the night's first GAP, which is the one the night's interval times.
  */
  const nightEnd = dayWake - FROM_LOG_EARLY_MIN;
  const inNight = (minute: number): boolean =>
    dayBed > dayWake
      ? minute >= dayBed || minute < nightEnd
      : minute >= dayBed && minute < nightEnd;
  // the evening a night began on: twelve hours back from any instant of it is that day
  const nightOf = (ms: number): number | undefined =>
    inNight(input.wallMinutes(ms)) ? dayOf(ms - 12 * HOUR) : undefined;
  // today's small hours end the week's last night, so the night reads past the week's end
  const nightBeats = input.beats.filter(b => b.startMs >= weekStart && b.startMs <= input.nowMs);

  /* ── the rhythms ──────────────────────────────────────────────────────────────────────── */
  const on = (a: FromLogActivity): boolean =>
    input.enabled.size === 0 ||
    (a === 'feeding'
      ? input.enabled.has('bottle') || input.enabled.has('breastfeed')
      : input.enabled.has(a));
  const weekdayIdx = week
    .map((d, i) => ({ i, dow: input.weekday(d + 12 * HOUR) }))
    .filter(x => x.dow >= 1 && x.dow <= 5)
    .map(x => x.i);

  const rhythms: FromLogRhythm[] = [];
  for (const activity of FROM_LOG_ACTIVITIES) {
    if (!on(activity)) continue;
    const match = activity === 'feeding' ? isFeeding : (a: string): boolean => a === activity;
    // solids are meals, and a meal has no night
    const night = activity === 'solids' ? null : fitNight(occurrences(nightBeats, match), nightOf);
    const perDay: number[][] = week.map(() => []);
    for (const at of occurrences(beats, match)) {
      const d = dayOf(at);
      const minute = input.wallMinutes(at);
      if (d !== undefined && inDay(minute)) perDay[d]?.push(minute);
    }
    const withEntries = perDay.map((day, i) => (day.length > 0 ? i : -1)).filter(i => i >= 0);
    const weekendDays = withEntries.filter(i => !weekdayIdx.includes(i)).length;
    /*
      ONLY EVER ON WEEKDAYS — a pump at ten, one and four at work and none at the weekend — is set
      times for Monday to Friday. Written daily they would ring through every Saturday.

      PUMPING ONLY (the review of 2026-09-23). A pump at work is a parent's week; a feed or a meal
      is the baby's day, and a baby eats on Saturday whether or not anybody wrote it down. A week
      of feeds with nothing at the weekend is a log that missed two days, and a schedule that fell
      silent every weekend would be the wrong thing to hand back for it — those are read as daily.
    */
    const weekdays =
      activity === 'pump' &&
      weekendDays === 0 &&
      withEntries.length >= FROM_LOG_WEEKDAY_MIN_DAYS &&
      weekdayIdx.length === 5;
    const days = weekdays ? weekdayIdx.map(i => perDay[i] ?? []) : perDay;
    const need = weekdays ? FROM_LOG_WEEKDAY_MIN_DAYS : FROM_LOG_MIN_DAYS;
    const ofDays = weekdays ? weekdayIdx.length : FROM_LOG_DAYS;
    const count = withEntries.length;
    if (count < need) {
      rhythms.push({
        activity,
        shape: { kind: 'none', reason: 'fewEntries' },
        days: count,
        ofDays,
        samples: 0,
        night,
      });
      continue;
    }

    const counts = days.filter(d => d.length > 0).map(d => d.length);
    const k = Math.min(FROM_LOG_MAX_TIMES, Math.max(1, Math.round(median(counts))));
    const times = fitTimes(days, k, need) ?? (k > 1 ? fitTimes(days, k - 1, need) : null);
    // an interval runs every day, so a weekday rhythm is set times or nothing; solids are meals
    const every = weekdays || activity === 'solids' ? null : fitEvery(days);

    const pick =
      times !== null && every !== null
        ? fromLogCloser(days, times.centers, every.everyMinutes)
        : times !== null
          ? 'times'
          : every !== null
            ? 'every'
            : null;
    if (pick === 'times' && times !== null) {
      rhythms.push({
        activity,
        // sorted AFTER rounding: a time at 23:58 rounds to 00:00, which comes first on a clock
        shape: { kind: 'times', times: times.centers.map(clockAt).sort(), weekdays },
        days: count,
        ofDays,
        samples: Math.min(...times.kept),
        night,
      });
    } else if (pick === 'every' && every !== null) {
      rhythms.push({
        activity,
        shape: { kind: 'every', everyMinutes: every.everyMinutes },
        days: count,
        ofDays,
        samples: every.gaps,
        night,
      });
    } else {
      rhythms.push({
        activity,
        shape: { kind: 'none', reason: 'unsteady' },
        days: count,
        ofDays,
        samples: 0,
        night,
      });
    }
  }

  return {
    ready,
    daysLogged,
    daysToGo,
    // the beats are every kind, sleeps included — the sleep log is read again for its ends only
    entries: beats.length,
    wake,
    bed,
    rhythms,
  };
}
