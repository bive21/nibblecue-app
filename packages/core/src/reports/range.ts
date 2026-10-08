/**
 * The range a report covers (PRODUCT_SPEC.md §8: `Today | 7 days | 30 days | Custom…`).
 *
 * A range is a run of LOCAL DAYS, never a span of hours, and it is built by walking the
 * household's calendar rather than by subtracting milliseconds. `nowMs - 7 * DAY` is wrong twice
 * a year — the day the clocks move is 23 or 25 hours long — and a report whose week quietly
 * gained an hour is a report whose per-day averages nobody can reconcile against the Today
 * screen. `shiftDay` already knows how to step a calendar day in a zone, so this walks it.
 *
 * The range ENDS at the end of today, not at `nowMs`. "7 days" means seven whole calendar days
 * with today as the last, so the last bar on every chart is today-so-far and the bar before it is
 * a finished day. The bucket list is oldest first, which is chart order and reading order.
 */
import { localDayBounds, shiftDay, type DayBounds } from '../today/day';

export type RangeKey = 'today' | 'threeDays' | 'week' | 'fortnight' | 'month' | 'custom';

/** How many local days each preset covers, today included. */
export const RANGE_DAYS = { today: 1, threeDays: 3, week: 7, fortnight: 14, month: 30 } as const;

/**
 * The presets the chips draw, in order (the owner, 2026-09-16: "you need to be able to toggle
 * to 7 days, 14 days, 30 days").
 *
 * FOURTEEN IS THE INTERESTING ONE and it is why the row is four rather than three. Seven days is
 * this week — a parent already half remembers it. Thirty is a month, which at this age is a
 * different baby at each end. Fourteen is the window where a rhythm is long enough to have a
 * shape and short enough to still be the same baby, and it is the window the descriptive
 * "usual windows" feature uses for the same reason.
 *
 * `custom` is NOT on this list. Its arithmetic is written and tested (`rangeOf('custom', …)`),
 * but its two-date picker is not built, and a chip that silently gives you 30 days instead is
 * worse than no chip. It joins the row when the sheet exists.
 */
export const RANGE_KEYS: readonly RangeKey[] = ['today', 'week', 'fortnight', 'month'];

/**
 * THE CHIPS ON REPORTS ITSELF: 7, 14 and 30 days — the owner's own three (2026-09-16), and
 * `RANGE_KEYS` less Today, because Today is no longer a range on that page (2026-09-26).
 *
 * Reports now opens on a TODAY SO FAR card that is always today, whatever the chips say (the owner:
 * *"make it simple, easy to understand"* — the day so far is what a parent at 3 a.m. and a partner
 * catching up both open the page for). A Today chip under it would draw the same day a second time,
 * so the chips choose how far back everything BELOW the Today card looks. `RANGE_KEYS` keeps Today:
 * the chosen export still offers it, and the pediatrician sheet has its own row (`VISIT_RANGE_KEYS`).
 */
export const REPORTS_RANGE_KEYS: readonly RangeKey[] = ['week', 'fortnight', 'month'];

export const RANGE_LABEL: Record<RangeKey, string> = {
  today: 'Today',
  threeDays: '3 days',
  week: '7 days',
  fortnight: '14 days',
  month: '30 days',
  custom: 'Custom',
};

/**
 * THE PRESETS THE PEDIATRICIAN SHEET OFFERS (the owner, 2026-09-22: *"ask user the report wants to
 * be based on how long 1d 3d 7d 14d"*).
 *
 * A different row from `RANGE_KEYS` because it answers a different question. Reports is a place to
 * look at a rhythm, so it reaches to thirty days; a sheet handed across a desk is about the period
 * the appointment is about, which is days rather than weeks — a sick visit is the last day or
 * three, a well-child visit the last week or two. Thirty days is off this row for the same reason
 * `RANGE_DAYS.month` stays on the other one: at this age a month is a different baby at each end,
 * and a per-day average over one is a number nobody can act on.
 *
 * Three days is the addition. It is the window a parent is asked about at an unplanned visit —
 * "how has she been since Saturday" — and neither existing preset answers it.
 */
export const VISIT_RANGE_KEYS: readonly RangeKey[] = ['today', 'threeDays', 'week', 'fortnight'];

/** The most days a custom range may cover: two years, which is the product's own horizon. */
export const RANGE_MAX_DAYS = 730;

export interface ReportRange {
  key: RangeKey;
  /** The first instant of the first local day in the range. */
  fromMs: number;
  /** The first instant AFTER the last local day — exclusive, like `DayBounds`. */
  toMs: number;
  /** How many local days the range covers. Never below 1. */
  days: number;
}

/**
 * The preset range ending with today, or a custom one clamped to whole local days.
 *
 * A custom range is given as any two instants; it is widened to the local days that contain
 * them and ordered, so picking the 3rd and then the 1st is the same range as the other way
 * round. Nothing here rejects a range in the future: a household that picks one gets empty
 * buckets, which is the truth, rather than an error about a date.
 */
export function rangeOf(
  key: RangeKey,
  timeZone: string,
  nowMs: number,
  custom?: { fromMs: number; toMs: number },
): ReportRange {
  const today = localDayBounds(timeZone, nowMs);
  if (key !== 'custom') {
    const days = RANGE_DAYS[key];
    return { key, fromMs: shiftDay(timeZone, nowMs, -(days - 1)).startMs, toMs: today.endMs, days };
  }
  const a = custom?.fromMs ?? nowMs;
  const b = custom?.toMs ?? nowMs;
  const first = localDayBounds(timeZone, Math.min(a, b));
  const last = localDayBounds(timeZone, Math.max(a, b));
  const days = Math.min(RANGE_MAX_DAYS, countDays(timeZone, first.startMs, last.startMs));
  // the clamp moves the START, never the end: a two-year window ending today is what a person
  // asking for "everything" means, and truncating the recent end would be the wrong half
  const fromMs = shiftDay(timeZone, last.startMs, -(days - 1)).startMs;
  return { key, fromMs, toMs: last.endMs, days };
}

/** Whole local days from one day's start to another's, inclusive of both. */
function countDays(timeZone: string, fromStartMs: number, toStartMs: number): number {
  let days = 1;
  let cursor = toStartMs;
  while (cursor > fromStartMs && days < RANGE_MAX_DAYS) {
    cursor = shiftDay(timeZone, cursor, -1).startMs;
    days += 1;
  }
  return days;
}

/** One `DayBounds` per local day in the range, oldest first — chart order. */
export function dayBuckets(range: ReportRange, timeZone: string): DayBounds[] {
  const out: DayBounds[] = [];
  let cursor = range.fromMs;
  for (let i = 0; i < range.days; i += 1) {
    const day = localDayBounds(timeZone, cursor);
    out.push(day);
    // step from the day's own noon: adding 24 hours would land on 23:00 the same day when the
    // clocks go back, and `shiftDay` from a boundary instant is the shape every other walk uses
    cursor = shiftDay(timeZone, day.startMs + 12 * 3_600_000, 1).startMs;
  }
  return out;
}

/**
 * THE OLDEST INSTANT A PLAN'S HISTORY WINDOW REACHES, or `null` when it reaches everything.
 *
 * The same arithmetic `clampToHistory` does, pulled out so the TIMELINE can use it too. It has to
 * be the same: Reports saying "the last 7 days" while the timeline one tap away scrolls to the
 * baby's birthday is the app catching itself in a promise it did not keep, and it is the kind of
 * thing a parent notices while deciding whether to pay.
 *
 * WHOLE LOCAL DAYS, from the start of the day `days - 1` back, so "7 days" means seven headings
 * and not "168 hours ago", which would cut today's oldest entries off at breakfast.
 */
export function historyFloorMs(
  nowMs: number,
  timeZone: string,
  historyDays: number | null,
): number | null {
  if (historyDays === null) return null;
  const today = shiftDay(timeZone, nowMs, 0).startMs;
  return shiftDay(timeZone, today, -(historyDays - 1)).startMs;
}

/**
 * The range a FREE household actually gets to see, so a chart never draws days the plan does not
 * include. It is a narrowing of the window, never a refusal: the chips stay tappable and the
 * locked card beside them says what the rest would show (CLAUDE.md §4 — "every gate shows what
 * is behind it").
 */
export function clampToHistory(
  range: ReportRange,
  timeZone: string,
  historyDays: number | null,
): ReportRange {
  if (historyDays === null || range.days <= historyDays) return range;
  const lastStart = shiftDay(timeZone, range.toMs - 1, 0).startMs;
  return {
    ...range,
    days: historyDays,
    fromMs: shiftDay(timeZone, lastStart, -(historyDays - 1)).startMs,
  };
}
