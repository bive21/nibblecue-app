/**
 * THE SCHEDULE'S FINISHED DAYS, COUNTED (the owner, 2026-09-30, of the Schedule tab's progress
 * card: *"Create a way to track the completion vs missed for each daily report. For example
 * yesterday I was at 100% completion, but the day before 80%, etc. Perhaps a simple "history >"
 * button suffice? Think about this."*). The Schedule tab's History page reads this; the card itself
 * still carries today alone.
 *
 * A DAY HERE IS THE DAY THE CARD COUNTED. The engine's own `scheduleDay` for that local day, then
 * `adherence` over its rows: the same rules in the same scope, the same skips, the same household
 * start and the same module switches the Schedule page hands the engine for today, with the day
 * stepped back. Nothing in this file decides a status; it adds up the ones the engine gave.
 *
 * RECOMPUTED, NEVER FROZEN. An entry logged late, or one that reached this phone from the other
 * parent's a day after it was made, counts on the day it happened, as it would have on that day's
 * card: nothing about a past day is stored, so there is nothing to go stale.
 *
 * AGAINST THE ROUTINE AS IT IS NOW. An edit changes a rule in place, so a past day is counted
 * against the rhythm as it stands today; a rule written later (`effectiveFromMs`) has no slot on a
 * day before it, which `scheduleDay` already guarantees for every kind of rule (`slotsBeginAt`). The
 * page says the first half in one line; the second needs no saying.
 *
 * WHOLE LOCAL DAYS. Each day's start is `dayPlus` from today's, never a multiple of 24 hours back.
 * The Sunday the clocks go forward is 23 hours long, and 24 hours back from Monday's midnight is
 * 11 PM on Saturday: Saturday would be counted twice and that Sunday lost. The Sunday they go back
 * is 25, and the same step lands at 1 AM on it, a day begun an hour late (`useSchedule.ts` records
 * the same lesson for the next day).
 *
 * COUNTS AND ONE PERCENTAGE, NEVER A VERDICT (docs/SCHEDULE_LOGIC.md §10). A finished day is
 * arithmetic that has stopped moving, so it may carry a percentage — done over done and missed —
 * where today's, still running, may not ("a percentage of a day that is still running is not a
 * measurement"). A skip is in neither column; a slot from before the household is in no number.
 */
import { MODULE_BY_ID } from '../modules/module-registry';
import { localDayKey } from '../today/day';
import { adherence } from './adherence';
import { isFeeding } from './sessions';
import { dayPlus, dayStartOf, localDaysBetween } from './time';
import { scheduleDay, type ScheduleOptions } from './today';
import {
  DAY,
  MIN,
  missAtOf,
  type EngineContext,
  type Occurrence,
  type Rule,
  type Session,
} from './types';

/** What the engine is handed for every day of the history: today's context, less the day. */
export type HistoryContext = Omit<EngineContext, 'dayStartMs'>;

export interface HistoryOptions extends ScheduleOptions {
  /**
   * HOW FAR BEFORE A DAY ITS SESSIONS REACH, as the Schedule page reads them for today (the app's
   * `lookbackMs`: two days, or a month when a rhythm is counted in days). Each past day is handed
   * the sessions its own day's read would have held, and no older ones. Absent: every session
   * before the day.
   */
  lookbackMs?: number;
  /**
   * THE FIRST DAY COUNTED, in days before today: 1, yesterday, unless a caller counts a long
   * window a week at a time (the app's History page, so no one step holds a phone's thread for
   * long). Days `fromDay` to `fromDay + days - 1` are counted, each exactly as it would be in one
   * call over the whole window.
   */
  fromDay?: number;
}

/** One kind of thing on a finished day. */
export interface HistoryActivity {
  /**
   * `feeding` for the bottle and breastfeed rules together — either kind of feed answers either
   * kind of slot, so they are one routine (`feedEitherKind`) — and the rule's activity otherwise.
   */
  key: string;
  /** Done and late together. */
  done: number;
  missed: number;
  skipped: number;
}

export interface HistoryDay {
  /** The day's first instant, in the zone the history was read in. */
  dayStartMs: number;
  /** `yyyy-mm-dd`, in the same zone. */
  dayKey: string;
  /** Done and late together: a late slot was done, later than planned. */
  done: number;
  /** Of `done`, how many were late, for a caller that wants to say so. */
  late: number;
  missed: number;
  /** A caregiver's skip: a decision, in neither column (§10). */
  skipped: number;
  /**
   * THE SLOTS A GAP ROW STOOD FOR, in no column, as the progress card has them (`progressOf`:
   * "skipped slots and the slots a GAP stood for are neither"). The engine has laid out no GAP row
   * since 2026-09-16 (`today.test.ts`: "nothing collapses any more"), so this is 0 in practice;
   * it is carried so a day handed one still adds up.
   */
  gaps: number;
  /**
   * SLOTS STILL OPEN ON A DAY THAT IS OVER: yesterday's 11:30 PM feed at ten past midnight, still
   * inside its late window, or a bath rhythm still owed (a cadence collapses onto the day it is
   * read, and never piles up as a column of misses, §5b). Not done, not missed, and not in the
   * percentage: undecided is what they are.
   */
  open: number;
  /** The first day's slots from before the household existed: in no number at all (§10). */
  beforeStart: number;
  /** Every slot the day had — done, missed, skipped, gaps and open — as `adherence` counts it. */
  scheduled: number;
  /**
   * DONE OVER DONE AND MISSED, in whole percent — the engine's `passedPct` over the two columns
   * the row names — or null when neither happened (a day of skips is not 0%).
   *
   * `passedPct` also counts a GAP's slots as passed and not done; the card counts them in neither
   * segment, and this follows the card, so the number always agrees with the two words beside it.
   * With no GAP rows (every day the engine lays out today) the two are the same number.
   */
  pct: number | null;
  /** Per kind, those with something done, missed or skipped, in the module registry's order. */
  activities: HistoryActivity[];
}

/** Feeding sorts where the bottle does: first. */
const FEEDING_KEY = 'feeding';
const orderOf = (key: string): number =>
  key === FEEDING_KEY
    ? MODULE_BY_ID.bottle.sortOrder
    : ((MODULE_BY_ID as Partial<Record<string, { sortOrder: number }>>)[key]?.sortOrder ?? 1000);
const keyOf = (o: Pick<Occurrence, 'rule'>): string =>
  isFeeding(o.rule.activity) ? FEEDING_KEY : o.rule.activity;

/**
 * ONE FINISHED DAY, FROM THE ENGINE'S ROWS. Only rows whose time is on the day count: every rule
 * the engine lays out lands on its own day, but a RELATIVE slot hangs off an event, and an event
 * on another day would otherwise put its slot on this one.
 */
export function historyDay(
  occurrences: readonly Occurrence[],
  dayStartMs: number,
  dayEndMs: number,
  dayKey: string,
): HistoryDay {
  const own = occurrences.filter(o => o.atMs >= dayStartMs && o.atMs < dayEndMs);
  const a = adherence(own);
  const done = a.done + a.late;
  const passed = done + a.missed;
  let pct = passed === 0 ? null : Math.round((done / passed) * 100);
  /*
    A WHOLE NUMBER THAT SAYS THE OPPOSITE OF THE WORDS BESIDE IT IS FALSE: 199 of 200 rounds to
    100 with "1 missed" next to it, and 1 of 201 to 0 with "1 done". Held one off the ends.
  */
  if (pct === 100 && a.missed > 0) pct = 99;
  if (pct === 0 && done > 0) pct = 1;
  const groups = new Map<string, Occurrence[]>();
  for (const o of own) {
    const key = keyOf(o);
    const group = groups.get(key);
    if (group === undefined) groups.set(key, [o]);
    else group.push(o);
  }
  const activities: HistoryActivity[] = [];
  for (const [key, rows] of groups) {
    const g = adherence(rows);
    const kind = { key, done: g.done + g.late, missed: g.missed, skipped: g.skipped };
    if (kind.done + kind.missed + kind.skipped > 0) activities.push(kind);
  }
  activities.sort((x, y) => orderOf(x.key) - orderOf(y.key) || x.key.localeCompare(y.key));
  return {
    dayStartMs,
    dayKey,
    done,
    late: a.late,
    missed: a.missed,
    skipped: a.skipped,
    gaps: a.expectedFromGaps,
    open: Math.max(0, a.scheduled - passed - a.expectedFromGaps - a.skipped),
    beforeStart: a.beforeStart,
    scheduled: a.scheduled,
    pct,
    activities,
  };
}

/**
 * HOW LONG AFTER A DAY ENDS ONE OF ITS SLOTS CAN STILL BE ANSWERED OR STILL BE OPEN: a whole day,
 * or the longest any rule waits before calling a slot missed (`missAtOf`) — or before calling a
 * paused night's wake slot missed, which keeps its whole interval (`pauseWakeAt`, `interval.ts`) —
 * whichever is longest.
 */
function settleMs(rules: readonly Rule[]): number {
  let longest = DAY;
  for (const r of rules) longest = Math.max(longest, missAtOf(r), (r.everyMinutes ?? 0) * MIN);
  return longest;
}

/** The first index in a list sorted by start whose start is at or after (or, `strict`, after) `ms`. */
function indexFrom(sorted: readonly Session[], ms: number, strict: boolean): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    const s = sorted[mid]!.startMs;
    if (strict ? s > ms : s >= ms) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

/**
 * THE SESSIONS ONE DAY IS HANDED: every one from the start of the day before it up to the moment it
 * is judged by, and from further back, as far as its own read reached (`fromMs`), only the last of
 * each kind, and every timer still running.
 *
 * Nothing older than the day before can answer one of the day's slots. What reaches the day from
 * further back is where a chain stands (an interval counts on from the last session before the day)
 * and when a rhythm counted in days was last done, and the last of each kind — its type, child,
 * care item and sleep — is both of those, for any rule, since a rule reads a union of kinds. So the
 * engine lays out exactly the day it would from the whole read (`history.test.ts` holds the two
 * equal), walking a few days of rows rather than the month a bath rhythm's read reaches back.
 */
function sessionsForDay(
  sorted: readonly Session[],
  fromMs: number,
  wholeFromMs: number,
  toMs: number,
): Session[] {
  const lo = indexFrom(sorted, fromMs, false);
  const mid = Math.max(lo, indexFrom(sorted, wholeFromMs, false));
  const hi = Math.max(mid, indexFrom(sorted, toMs, true));
  const seen = new Set<string>();
  const older: Session[] = [];
  for (let i = mid - 1; i >= lo; i--) {
    const s = sorted[i]!;
    const kind = `${s.type}|${s.childId ?? ''}|${s.careItemId ?? ''}|${s.sleepKind ?? ''}`;
    if (s.running === true || !seen.has(kind)) older.push(s);
    seen.add(kind);
  }
  return older.reverse().concat(sorted.slice(mid, hi));
}

/**
 * THE FIRST DAY THAT MAY BE LISTED: the household's first — a day before it existed is not the
 * household's to count — or, when the phone does not know when that was, the day of the earliest
 * rule, since no day before it can hold a slot. Null when there is nothing to go on.
 */
function firstListedDay(
  rules: readonly Rule[],
  ctx: Pick<HistoryContext, 'timeZone' | 'trackingFromMs'>,
): number | null {
  const began = ctx.trackingFromMs;
  if (began !== undefined && Number.isFinite(began)) return dayStartOf(ctx.timeZone, began);
  const earliest = rules.reduce<number | null>(
    (min, r) =>
      Number.isFinite(r.effectiveFromMs) && (min === null || r.effectiveFromMs < min)
        ? r.effectiveFromMs
        : min,
    null,
  );
  return earliest === null ? null : dayStartOf(ctx.timeZone, earliest);
}

/**
 * THE LAST `days` FINISHED DAYS, NEWEST FIRST, STARTING WITH YESTERDAY — today is the card's.
 * Days before the household began are not listed, so the list can be shorter than asked.
 *
 * THE CLOCK EACH DAY IS JUDGED BY IS THE REAL ONE, up to the moment nothing of the day can still
 * change. A slot is missed only once nothing can answer it (`missAtOf`), so yesterday's 11:30 PM
 * feed at ten past midnight is still open here exactly as it is on the card — and faking "now" as
 * the day's end would have painted it open for good, the last slots of every day undecided. But a
 * day that ended long ago is settled by the day after it (`settleMs`): every status on it is what
 * the real clock gives, and the engine's walk stops there rather than stepping on through every
 * slot between that day and this one. With the sessions each day is handed (`sessionsForDay`),
 * that is what keeps a month, or the two years a household can scroll back through, as cheap per
 * day as yesterday.
 *
 * TWO KINDS OF RULE READ A PAST DAY AS THAT DAY READ IT, rather than as today would: a rhythm
 * counted in days, which asks when it was last done (`cadence.ts`), and a slot set off another
 * event (a RELATIVE rule, which no sheet of the app writes any more). The real clock would answer
 * with the last of all, a bath given this morning; the bounded one answers with the last up to the
 * day after, which is what that day's card said. A bath owed on a past day is then open, in no
 * column, where this morning's bath would have left the day with no bath slot at all; a bath given
 * on the day counts the same either way, and one skipped on the day stays the skip it was, where a
 * later bath would have taken the day's slot, and the skip with it, away.
 */
export function scheduleHistory(
  rules: readonly Rule[],
  sessions: readonly Session[],
  ctx: HistoryContext,
  days: number,
  opts: HistoryOptions = {},
): HistoryDay[] {
  const { timeZone, nowMs } = ctx;
  const floor = firstListedDay(rules, ctx);
  if (floor === null || days <= 0) return [];
  const today = dayStartOf(timeZone, nowMs);
  const settle = settleMs(rules);
  const sorted = [...sessions].sort((a, b) => a.startMs - b.startMs);
  const { lookbackMs, fromDay = 1, ...scheduleOpts } = opts;
  const first = Math.max(1, Math.floor(fromDay));
  const out: HistoryDay[] = [];
  for (let k = first; k < first + days; k++) {
    const dayStartMs = dayPlus(timeZone, today, -k);
    if (dayStartMs < floor) break;
    const dayEndMs = dayPlus(timeZone, dayStartMs, 1);
    const judgeMs = Math.min(nowMs, dayEndMs + settle);
    const fromMs =
      lookbackMs === undefined ? Number.NEGATIVE_INFINITY : dayStartMs - Math.max(0, lookbackMs);
    const day = scheduleDay(
      rules,
      sessionsForDay(sorted, fromMs, dayPlus(timeZone, dayStartMs, -1), judgeMs),
      { ...ctx, nowMs: judgeMs, dayStartMs },
      scheduleOpts,
    );
    out.push(historyDay(day.occurrences, dayStartMs, dayEndMs, localDayKey(timeZone, dayStartMs)));
  }
  return out;
}

/**
 * HOW MANY FINISHED DAYS THERE ARE TO LIST: from the first day that may be listed to yesterday,
 * both counted. What a page asks before it offers more of them, or draws what a plan holds back.
 */
export function historyDaysAvailable(
  rules: readonly Rule[],
  ctx: Pick<HistoryContext, 'nowMs' | 'timeZone' | 'trackingFromMs'>,
): number {
  const floor = firstListedDay(rules, ctx);
  return floor === null ? 0 : Math.max(0, localDaysBetween(ctx.timeZone, floor, ctx.nowMs));
}

/** The window's line: how many days, and what was done, missed and skipped across them. */
export function historyTotals(days: readonly HistoryDay[]): {
  days: number;
  done: number;
  missed: number;
  skipped: number;
} {
  let done = 0;
  let missed = 0;
  let skipped = 0;
  for (const d of days) {
    done += d.done;
    missed += d.missed;
    skipped += d.skipped;
  }
  return { days: days.length, done, missed, skipped };
}

/** The key a day's feeding kind carries, for a caller putting its own word to it. */
export const HISTORY_FEEDING_KEY = FEEDING_KEY;
