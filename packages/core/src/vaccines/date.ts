/**
 * Calendar dates, as `yyyy-mm-dd` strings (docs/VACCINES.md §3): a window is date arithmetic
 * on `children.birth_date` and a number of months — no timestamp, no zone, no clock — which is
 * why DST can never move it. `addMonthsFractional` is bit-identical to Postgres
 * `(d + interval '1 month' * m)::date`: whole months first, clamped to the target month's last
 * day (Jan 31 + 1 month = Feb 28), then the fraction as thirty-day months.
 */
import { localDayKey } from '../today/day';

export type IsoDate = string;

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseIsoDate(s: string): { y: number; m: number; d: number } {
  const m = ISO.exec(s);
  if (m === null) throw new RangeError(`not a calendar date: ${s}`);
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > daysInMonth(y, mo))
    throw new RangeError(`not a calendar date: ${s}`);
  return { y, m: mo, d };
}

export const isIsoDate = (s: string): boolean => {
  try {
    parseIsoDate(s);
    return true;
  } catch {
    return false;
  }
};

const pad = (n: number): string => String(n).padStart(2, '0');

const isoDate = (y: number, m: number, d: number): IsoDate => `${y}-${pad(m)}-${pad(d)}`;

function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Whole months, Postgres style: the day is clamped to the target month's length. */
export function addCalendarMonths(date: IsoDate, months: number): IsoDate {
  const { y, m, d } = parseIsoDate(date);
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = total - ny * 12 + 1;
  return isoDate(ny, nm, Math.min(d, daysInMonth(ny, nm)));
}

export function addDays(date: IsoDate, days: number): IsoDate {
  const { y, m, d } = parseIsoDate(date);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return isoDate(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/**
 * `interval '1 month' * 3.5` is `3 mons 15 days`: the whole months are calendar months and
 * the remainder is thirty-day months, rounded to whole days as Postgres rounds it.
 */
export function addMonthsFractional(date: IsoDate, months: number): IsoDate {
  const whole = Math.trunc(months);
  const frac = months - whole;
  const base = addCalendarMonths(date, whole);
  const days = Math.round(frac * 30);
  return days === 0 ? base : addDays(base, days);
}

/** ISO dates compare as strings. */
export const compareIsoDates = (a: IsoDate, b: IsoDate): number => (a < b ? -1 : a > b ? 1 : 0);

/** `b − a` in whole days. */
export function calendarDaysBetween(a: IsoDate, b: IsoDate): number {
  const pa = parseIsoDate(a);
  const pb = parseIsoDate(b);
  return Math.round((Date.UTC(pb.y, pb.m - 1, pb.d) - Date.UTC(pa.y, pa.m - 1, pa.d)) / 86_400_000);
}

/**
 * Today as a calendar date in a named zone, from an instant.
 *
 * THE SAME ANSWER AS `localDayKey`, AND READ THE SAME WAY (2026-10-08, speed). This built a fresh
 * `Intl.DateTimeFormat` on every call, and it is asked per vaccine row, per stash container (the
 * use-soon warnings) and twice per community post: on Android each one is a trip across JNI into
 * ICU (`today/day.ts` has the trace). `localDayKey` reads the zone's offset once a quarter hour
 * and does the rest in arithmetic; `date.test.ts` holds the two to the formatter this replaced,
 * across DST and the date line. A zone `Intl` does not know still throws, as it did.
 */
export function isoDateIn(timeZone: string, ms: number): IsoDate {
  return localDayKey(timeZone, ms);
}
