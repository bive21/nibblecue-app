/**
 * What a household can LEARN from its own log (PRODUCT_SPEC.md §8), as arithmetic.
 *
 * The stat tiles answer "how much". These answer the questions a parent actually asks out loud
 * in the first year — how much of the day is she asleep, how long are the naps, is any of it in
 * one piece at night, where is the milk going, how fast is he growing — and each one is a sum, a
 * count, a quotient or a difference of entries the household typed.
 *
 * THE LINE, AGAIN, BECAUSE THIS FILE IS WHERE IT WOULD BE CROSSED. Every value here is a fact
 * about the log. None of them is compared to a guideline, to another household, or to this
 * household last week, and none carries an adjective. "The longest stretch was 5h 20m" is
 * arithmetic; "the longest stretch improved to 5h 20m" is a verdict, and the difference is the
 * product (CLAUDE.md §2 rules 1 and 3). A trend LINE is allowed — the parent reads the shape
 * themselves — but the app never names its direction. `reportBannedHits` runs over every
 * sentence any of this feeds.
 *
 * SLEEP IS COUNTED BY OVERLAP WITH THE LOCAL DAY, like `todayTotals`, so a night from 23:30 to
 * 06:10 gives 30 minutes to one day and 370 to the next and the two days add up to the night
 * exactly once.
 *
 * THE NIGHT/NAP SPLIT USES THE KIND ON THE ENTRY, and falls back to the household's own waking
 * window (`sleepKindOf`) only where the entry has none. That order matters both ways round: a
 * 2 p.m. sleep the parent marked NIGHT is a night here too, because a night-shift household
 * knows their own day; and an entry from before the window existed — or one a caregiver saved
 * without choosing — is classified against the two times the household set rather than silently
 * counted as a nap, which is what an `else` would have done and what made a 9 p.m. bedtime turn
 * up in the nap column.
 */
import { sleepKindOf, type DayWindow } from '../today/dayWindow';
import { overlapMs, type DayBounds } from '../today/day';
import type { ActiveTimer, TodayActivity } from '../today/rows';
import { countsAsDiaper, countsAsMilk } from '../today/totals';
import type { ReportRange } from './range';
import { inRange, type ReportSeries } from './series';

const MIN = 60_000;
const DAY = 24 * 60 * MIN;

/* ------------------------------------------------------------------ sleep */

export interface SleepInsight {
  /** Minutes of each kind per local day, oldest first — the stacked chart's segments. */
  nightByDay: number[];
  napByDay: number[];
  /**
   * A sleep still running, counted only for the part that has happened. A timer carries no
   * kind, so it cannot join either segment; it is its own, and it is what makes these three
   * add up to `todayTotals`' figure rather than fall short of it by the nap in progress.
   */
  runningByDay: number[];
  /** The longest single sleep that STARTED on each day, in minutes. */
  longestByDay: number[];
  nightMinutes: number;
  napMinutes: number;
  /** Over the days of the range — the headline "she sleeps about this much". */
  perDayMinutes: number;
  nightPerDayMinutes: number;
  napPerDayMinutes: number;
  /** Sessions that STARTED in the range, by the kind the parent chose. */
  naps: number;
  nights: number;
  napsPerDay: number;
  averageNapMinutes: number;
  averageNightMinutes: number;
  /** The single longest sleep in the range, and the day it began. */
  longestMinutes: number;
  longestAtMs: number | null;
  /** The share of the day asleep, 0–1 — a ratio against a day, not against anybody else. */
  dayShare: number;
}

const lengthMinutes = (r: TodayActivity): number =>
  r.endMs !== null && r.endMs > r.startMs ? Math.round((r.endMs - r.startMs) / MIN) : 0;

/**
 * HOW FAR BEFORE A RANGE A REPORT HAS TO READ, so the sleep that began before it is counted for
 * the part that falls inside it (the care audit, H7).
 *
 * Every figure here counts sleep by OVERLAP with each day, but the overlap can only be taken of a
 * row that was read: Reports read `start_at >= range.fromMs`, so a sleep from 8 p.m. to 6 a.m. was
 * missing from "Today" entirely — Today's tile said 6h, Reports said nothing, and the visit summary
 * for "Today" or "3 days" understated the nights. Sixteen hours back reaches any evening's sleep
 * that can still be running into the range's first morning, and nothing it brings in is counted
 * by START: a feed or a diaper from the evening before sits in no bucket, and `inRange` leaves it
 * out of every count. Today reads back for the same reason (`useTodayData`, two days).
 */
export const OVERLAP_READ_BACK_MS = 16 * 60 * MIN;

/** The instant a report's rows are read from: the range's start, less `OVERLAP_READ_BACK_MS`. */
export const overlapReadFromMs = (range: Pick<ReportRange, 'fromMs'>): number =>
  range.fromMs - OVERLAP_READ_BACK_MS;

/**
 * How an entry with no stored kind is classified. It is REQUIRED rather than defaulted, so a new
 * caller cannot quietly inherit "everything unclassified is a nap": the household's window is the
 * only honest answer, and a call site that cannot reach it has a bug worth seeing.
 */
export interface SleepClassification {
  /** The household's zone — the window is a wall clock, so the instant needs one. */
  timeZone: string;
  window: DayWindow;
}

export function sleepInsight(
  rows: readonly TodayActivity[],
  running: readonly ActiveTimer[],
  buckets: readonly DayBounds[],
  range: ReportRange,
  nowMs: number,
  classify: SleepClassification,
): SleepInsight {
  const sleeps = rows.filter(r => r.type === 'sleep');
  const timers = running.filter(t => t.type === 'sleep');
  // resolved ONCE per entry: the same row is walked for every day it overlaps, and a window
  // lookup per day per row would be the same answer computed a hundred times.
  const kindOf = new Map<string, 'NAP' | 'NIGHT'>(
    sleeps.map(s => [
      s.id,
      sleepKindOf(s.sleepKind, classify.timeZone, s.startMs, classify.window),
    ]),
  );
  const isNight = (s: TodayActivity): boolean => kindOf.get(s.id) === 'NIGHT';

  const nightByDay: number[] = [];
  const napByDay: number[] = [];
  const runningByDay: number[] = [];
  const longestByDay: number[] = [];

  for (const day of buckets) {
    let night = 0;
    let nap = 0;
    let longest = 0;
    for (const s of sleeps) {
      const end = s.endMs ?? s.startMs;
      const minutes = Math.round(overlapMs(s.startMs, end, day) / MIN);
      if (isNight(s)) night += minutes;
      else nap += minutes;
      // the LONGEST is about the session, so it belongs to the day it began
      if (s.startMs >= day.startMs && s.startMs < day.endMs) {
        longest = Math.max(longest, lengthMinutes(s));
      }
    }
    let live = 0;
    for (const t of timers) live += Math.round(overlapMs(t.startedAtMs, nowMs, day) / MIN);
    nightByDay.push(night);
    napByDay.push(nap);
    runningByDay.push(live);
    longestByDay.push(longest);
  }

  const started = inRange(sleeps, range);
  const naps = started.filter(s => !isNight(s));
  const nights = started.filter(isNight);
  const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);
  const days = Math.max(1, range.days);
  const nightMinutes = sum(nightByDay);
  const napMinutes = sum(napByDay);
  const total = nightMinutes + napMinutes + sum(runningByDay);
  const longest = started.reduce<TodayActivity | null>(
    (best, s) => (best === null || lengthMinutes(s) > lengthMinutes(best) ? s : best),
    null,
  );

  return {
    nightByDay,
    napByDay,
    runningByDay,
    longestByDay,
    nightMinutes,
    napMinutes,
    perDayMinutes: total / days,
    nightPerDayMinutes: nightMinutes / days,
    napPerDayMinutes: napMinutes / days,
    naps: naps.length,
    nights: nights.length,
    napsPerDay: naps.length / days,
    averageNapMinutes: naps.length > 0 ? sum(naps.map(lengthMinutes)) / naps.length : 0,
    averageNightMinutes: nights.length > 0 ? sum(nights.map(lengthMinutes)) / nights.length : 0,
    longestMinutes: longest === null ? 0 : lengthMinutes(longest),
    longestAtMs: longest?.startMs ?? null,
    dayShare: Math.min(1, total / days / (24 * 60)),
  };
}

/* ------------------------------------------------------------------ milk */

export interface MilkFlowInsight {
  /** ml taken by the baby, per local day — bottles only; a breastfeed has no volume. */
  takenByDay: number[];
  /** ml pumped, per local day. The household's, not one baby's. */
  pumpedByDay: number[];
  takenMl: number;
  pumpedMl: number;
  /**
   * Pumped minus taken over the range. Positive means more was pumped than was given by
   * bottle in the same days; it is a DIFFERENCE, not a surplus, a shortfall or a supply.
   * What actually reached the stash is the stash ledger's own answer (`stash/balance.ts`).
   */
  netMl: number;
  /** Feeds of both kinds — a breastfeed is a feed even though it carries no millilitres. */
  feeds: number;
  feedsPerDay: number;
  breastfeeds: number;
  bottles: number;
  /** Of the feeds in the range, the share that were at the breast, 0–1. */
  breastShare: number;
}

export function milkFlow(
  rows: readonly TodayActivity[],
  series: ReportSeries,
  range: ReportRange,
): MilkFlowInsight {
  const scoped = inRange(rows, range);
  // a bottle of water is logged and kept, and is neither milk nor a feed (`countsAsMilk`): the
  // bottles here are the ones `series.milkMl` is made of, so "bottles a day" and "taken a day"
  // on the visit summary describe the same bottles
  const bottles = scoped.filter(countsAsMilk);
  const breastfeeds = scoped.filter(r => r.type === 'breastfeed');
  const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);
  const takenMl = sum(series.milkMl);
  const pumpedMl = sum(series.pumpedMl);
  const feeds = bottles.length + breastfeeds.length;
  const days = Math.max(1, range.days);
  return {
    takenByDay: series.milkMl,
    pumpedByDay: series.pumpedMl,
    takenMl,
    pumpedMl,
    netMl: pumpedMl - takenMl,
    feeds,
    feedsPerDay: feeds / days,
    breastfeeds: breastfeeds.length,
    bottles: bottles.length,
    breastShare: feeds > 0 ? breastfeeds.length / feeds : 0,
  };
}

/* ------------------------------------------------------------------ growth */

export type GrowthMetric = 'weight' | 'length' | 'head';

/** Canonical units, as stored: grams and millimetres. Converted at the edge, as always. */
export const GROWTH_UNIT: Record<GrowthMetric, 'g' | 'mm'> = {
  weight: 'g',
  length: 'mm',
  head: 'mm',
};

export interface GrowthPoint {
  /**
   * The entry this measurement came from, so a list of them can open the one with the typo in
   * it. A point is a row a parent wrote, not a datum: correcting it has to be one tap from
   * wherever it is drawn (CLAUDE.md §7, "never add a gate that stops a parent correcting").
   */
  id: string;
  atMs: number;
  value: number;
}

export interface GrowthInsight {
  metric: GrowthMetric;
  /** Every measurement of this metric, oldest first. */
  points: GrowthPoint[];
  first: GrowthPoint;
  last: GrowthPoint;
  /** last − first, canonical. */
  delta: number;
  /** Whole days between the two. */
  spanDays: number;
  /**
   * The same difference expressed over 30 days — "how fast", which is what a parent means.
   * Null until there are two measurements at least a day apart: a rate from two weigh-ins an
   * hour apart is arithmetic on noise, and printing it would be the app inventing a number.
   */
  perMonth: number | null;
}

const valueOf = (r: TodayActivity, metric: GrowthMetric): number | null => {
  const v = metric === 'weight' ? r.weightG : metric === 'length' ? r.lengthMm : r.headMm;
  return typeof v === 'number' && v > 0 ? v : null;
};

/**
 * One metric's history, from every growth entry the caller loaded. It deliberately does NOT
 * take a range: a household weighs a baby every few weeks, so a 7-day window would usually
 * hold one point or none, and a card that says "not enough data" on a household that has been
 * measuring for months would be the screen's fault rather than theirs.
 */
export function growthInsight(
  rows: readonly TodayActivity[],
  metric: GrowthMetric,
): GrowthInsight | null {
  const points: GrowthPoint[] = [];
  for (const r of rows) {
    if (r.type !== 'growth') continue;
    const value = valueOf(r, metric);
    if (value !== null) points.push({ id: r.id, atMs: r.startMs, value });
  }
  points.sort((a, b) => a.atMs - b.atMs);
  const first = points[0];
  const last = points[points.length - 1];
  if (first === undefined || last === undefined) return null;
  const spanDays = Math.round((last.atMs - first.atMs) / DAY);
  return {
    metric,
    points,
    first,
    last,
    delta: last.value - first.value,
    spanDays,
    perMonth:
      points.length >= 2 && spanDays >= 1
        ? ((last.value - first.value) / (last.atMs - first.atMs)) * 30 * DAY
        : null,
  };
}

/* -------------------------------------------------------------- temperature */

/** One reading, exactly as it was taken. */
export interface TempReading {
  /** The entry, so the row can be opened and corrected where it is drawn. */
  id: string;
  atMs: number;
  /** Canonical: hundredths of a degree Celsius, converted at the edge like every other unit. */
  cHundredths: number;
  /** Axillary · Forehead · Ear · Rectal, as the caregiver chose it; null on an entry without one. */
  method: string | null;
  /**
   * Minutes since the PREVIOUS reading, or null for the first. It is the one piece of
   * arithmetic a list of temperatures wants — "twenty minutes later" and "nine days later" are
   * different facts about the same two numbers — and it is subtraction, not a verdict.
   */
  sinceLastMinutes: number | null;
}

export interface TemperatureLog {
  /** Every reading, oldest first. */
  readings: TempReading[];
  count: number;
  firstAtMs: number | null;
  lastAtMs: number | null;
  /** Whole days from the first reading to the last. */
  spanDays: number;
  /** How many were taken each way, most first; ties alphabetical, so the order is stable. */
  byMethod: { method: string; count: number }[];
}

/**
 * Every temperature the caller loaded, in order, with its method and the gap before it.
 *
 * THERE IS NO AVERAGE HERE, AND THERE WILL NOT BE ONE. `visitSheet.ts` settled this for the
 * page a clinician reads and the reasoning is the same on every other surface: four
 * temperatures taken for four different reasons average to a number nobody can use, and the
 * moment the app reduces a sick afternoon to one figure it has started interpreting it. Nor is
 * there a maximum, a minimum or a count of readings over any threshold — a threshold is the
 * clinical judgment CLAUDE.md rules 1 and 3 forbid, and picking one silently is worse than
 * printing it. What this returns is the readings, when they happened, and how far apart.
 *
 * Like `growthInsight` it takes no range. Temperature is taken because something is happening,
 * so the entries arrive in clusters weeks apart, and a seven-day window would usually hold
 * nothing at all on a household that took six readings last month.
 */
export function temperatureLog(rows: readonly TodayActivity[]): TemperatureLog {
  const ordered = rows
    .filter(r => r.type === 'temp' && typeof r.tempCHundredths === 'number')
    .slice()
    .sort((a, b) => a.startMs - b.startMs);

  const readings: TempReading[] = [];
  let previousMs: number | null = null;
  const counts = new Map<string, number>();
  for (const r of ordered) {
    const method = typeof r.tempMethod === 'string' && r.tempMethod !== '' ? r.tempMethod : null;
    readings.push({
      id: r.id,
      atMs: r.startMs,
      cHundredths: r.tempCHundredths as number,
      method,
      // two readings written with the same timestamp give 0, which is true and is not null
      sinceLastMinutes: previousMs === null ? null : Math.round((r.startMs - previousMs) / MIN),
    });
    previousMs = r.startMs;
    if (method !== null) counts.set(method, (counts.get(method) ?? 0) + 1);
  }

  const first = readings[0];
  const last = readings[readings.length - 1];
  return {
    readings,
    count: readings.length,
    firstAtMs: first?.atMs ?? null,
    lastAtMs: last?.atMs ?? null,
    spanDays:
      first === undefined || last === undefined ? 0 : Math.round((last.atMs - first.atMs) / DAY),
    byMethod: [...counts.entries()]
      .map(([method, count]) => ({ method, count }))
      .sort((a, b) => b.count - a.count || (a.method < b.method ? -1 : 1)),
  };
}

/* ------------------------------------------------------------------ diapers */

export interface DiaperInsight {
  wet: number;
  dirty: number;
  /** BOTH counts toward each of the two above, and once here. */
  total: number;
  perDay: number;
  wetByDay: number[];
  dirtyByDay: number[];
  /**
   * Diaper entries in the range whose "Rash noted" switch was on — a COUNT OF TICKS, nothing more.
   *
   * Counted over every diaper entry including DRY, unlike `total`: a rash the parent noticed at a
   * dry check is a rash they noticed, and the DRY exclusion exists to keep the wet/dirty rhythm
   * honest, not to drop an entry's other fields.
   */
  rash: number;
  /**
   * WHEN, and not only how many (the owner, 2026-09-20: "where is this information being
   * reported to? Make sure it is seen when generating report and in report module").
   *
   * The count alone answers a question nobody asks. "Has there been any rash?" is a question
   * about DAYS — the clinician's version of it and the parent's version are the same question —
   * and the visit sheet has carried the dates since 2026-09-19 while the card a household opens
   * every day carried a bare number. These are the entries' own start instants, sorted, so the
   * screen can group them into its own local days and the count and the dates can never
   * disagree. Still only a list of ticks: no severity, no site, no duration, no order by how
   * much of it there is (CLAUDE.md §2 rules 1–3).
   */
  rashAtMs: number[];
}

export function diaperInsight(
  rows: readonly TodayActivity[],
  buckets: readonly DayBounds[],
  range: ReportRange,
): DiaperInsight {
  const wetByDay: number[] = [];
  const dirtyByDay: number[] = [];
  const diapers = rows.filter(countsAsDiaper);
  for (const day of buckets) {
    let wet = 0;
    let dirty = 0;
    for (const r of diapers) {
      if (r.startMs < day.startMs || r.startMs >= day.endMs) continue;
      if (r.diaperKind === 'WET' || r.diaperKind === 'BOTH') wet += 1;
      if (r.diaperKind === 'DIRTY' || r.diaperKind === 'BOTH') dirty += 1;
    }
    wetByDay.push(wet);
    dirtyByDay.push(dirty);
  }
  const total = inRange(diapers, range).length;
  const rashRows = inRange(
    rows.filter(r => r.type === 'diaper' && r.diaperRash === true),
    range,
  );
  return {
    wet: wetByDay.reduce((a, b) => a + b, 0),
    dirty: dirtyByDay.reduce((a, b) => a + b, 0),
    total,
    perDay: total / Math.max(1, range.days),
    wetByDay,
    dirtyByDay,
    // over ALL diaper rows, `diapers` having already dropped DRY for the wet/dirty arithmetic
    rash: rashRows.length,
    rashAtMs: rashRows.map(r => r.startMs).sort((a, b) => a - b),
  };
}
