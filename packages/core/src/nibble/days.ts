/**
 * Calendar days as `yyyy-mm-dd` strings, the unit the plan is made of. Pure string arithmetic in
 * UTC so the same input gives the same day on every phone; the caller decides which local day
 * "today" is (the household's zone, CuddleCue's `time/` helpers on the phone).
 */
const DAY_MS = 86_400_000;

export type IsoDay = string;

const toMs = (day: IsoDay): number => Date.parse(`${day}T00:00:00Z`);

export function addDays(day: IsoDay, n: number): IsoDay {
  return new Date(toMs(day) + n * DAY_MS).toISOString().slice(0, 10);
}

/** Whole days from `a` to `b` (positive when `b` is later). */
export function daysBetween(a: IsoDay, b: IsoDay): number {
  return Math.round((toMs(b) - toMs(a)) / DAY_MS);
}

/**
 * How a moment becomes a calendar day: a fixed offset in minutes (tests, and a phone that knows
 * only that), or the caller's own function (the app's household zone, `time/useDayKey.ts`).
 */
export type DayOf = number | ((atMs: number) => IsoDay);

/** The local calendar day of a moment, by an offset in minutes or the caller's own function. */
export function dayOf(atMs: number, zone: DayOf = 0): IsoDay {
  if (typeof zone === 'function') return zone(atMs);
  return new Date(atMs + zone * 60_000).toISOString().slice(0, 10);
}

export const isIsoDay = (s: string): boolean =>
  /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(toMs(s));

/** Whole calendar months from a birth day to a day, the way a parent counts them. */
export function monthsBetween(birth: IsoDay, day: IsoDay): number {
  const [by, bm, bd] = birth.split('-').map(Number) as [number, number, number];
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  let months = (y - by) * 12 + (m - bm);
  if (d < bd) {
    // the month-day is not reached yet, unless the birth day does not exist this month (31st)
    const lastOfMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
    if (!(bd > lastOfMonth && d === lastOfMonth)) months -= 1;
  }
  return Math.max(0, months);
}

/** Monday-based day of week, 0 = Monday. */
export function weekday(day: IsoDay): number {
  return (new Date(toMs(day)).getUTCDay() + 6) % 7;
}
