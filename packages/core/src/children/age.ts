/**
 * The age a child chip shows beside the name (docs/DESIGN_SYSTEM.md §14; the prototype's
 * `ageLabel`). Coarse on purpose: a parent knows the exact age, the chip only has to
 * distinguish the twins. Days under two weeks, weeks under ten, months under two years,
 * then years. Never a decimal, never "0 months".
 *
 * MONTHS AND YEARS ARE CALENDAR MONTHS (2026-09-26), counted with the celebration calendar's own
 * clamp (`addMonthsClamped`), so the age turns over ON the month-day — the day the monthly note is
 * dated and the top bar's avatar wears its party hat. It used to divide the days by 30.44 and 365.25,
 * which runs a day or two behind the calendar: on the day a baby turned three months the chip read
 * "2 months", on a first birthday "11 months", and on a second birthday without a 29 February in
 * between "1 year" — beside a hat saying the opposite. Days and weeks are unchanged.
 */
import { addMonthsClamped } from '../celebrations';

const DAY_MS = 86_400_000;

/** Whole days between an ISO date (yyyy-mm-dd, local) and `now` (unix ms); negative before birth. */
export function daysOld(birthDate: string, now: number): number {
  const [y, m, d] = birthDate.split('-').map(Number);
  if (!y || !m || !d) return 0;
  const born = new Date(y, m - 1, d).getTime();
  return Math.floor((now - born) / DAY_MS);
}

/** The phone's own calendar day containing `now`, `yyyy-mm-dd` — the day `daysOld` counts to. */
const localIso = (now: number): string => {
  const at = new Date(now);
  const p2 = (n: number): string => String(n).padStart(2, '0');
  return `${at.getFullYear()}-${p2(at.getMonth() + 1)}-${p2(at.getDate())}`;
};

/**
 * Whole calendar months from birth to `now`: the last month-day already reached, where a baby born
 * on the 31st turns a month older on the last day of a short month. Zero before the first one.
 */
export function monthsOld(birthDate: string, now: number): number {
  const [y, m, d] = birthDate.split('-').map(Number);
  if (!y || !m || !d) return 0;
  const today = localIso(now);
  const [ty, tm] = today.split('-').map(Number) as [number, number];
  let months = (ty - y) * 12 + (tm - m);
  // this month's month-day may still be ahead: then the last one reached is a month earlier
  if (months > 0 && addMonthsClamped(birthDate, months) > today) months -= 1;
  return Math.max(0, months);
}

export function ageLabel(birthDate: string, now: number): string {
  const days = Math.max(0, daysOld(birthDate, now));
  if (days < 14) return days === 1 ? '1 day' : `${days} days`;
  if (days < 70) {
    const w = Math.floor(days / 7);
    return w === 1 ? '1 week' : `${w} weeks`;
  }
  // seventy days is always past the second month-day, so this never reads "0 months" or "1 month"
  const mo = monthsOld(birthDate, now);
  if (mo < 24) return mo === 1 ? '1 month' : `${mo} months`;
  const yr = Math.floor(mo / 12);
  return yr === 1 ? '1 year' : `${yr} years`;
}

/** The chip's label when a household views all its children at once (multiples). */
export function allChildrenLabel(count: number): string {
  return count > 2 ? `All ${count}` : 'Both';
}
