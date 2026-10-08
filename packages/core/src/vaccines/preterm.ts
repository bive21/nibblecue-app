/**
 * Preterm babies (docs/VACCINES.md §3.1): the published schedule is read chronologically, so
 * every window is computed from `birth_date` and nothing else. Where a child was born two
 * weeks or more before the due date, the screen shows one neutral line naming the corrected
 * age as a growth matter — never a shifted window, never a recommendation.
 */
import { addDays, compareIsoDates, calendarDaysBetween, type IsoDate } from './date';
import { VACCINE_COPY } from './copy';

/** `3 mo 1 w` from the due date to today; `0 w` before the due date. */
export function correctedAgeLabel(dueDate: IsoDate, today: IsoDate): string {
  const days = Math.max(0, calendarDaysBetween(dueDate, today));
  const months = Math.floor(days / 30.4375);
  const weeks = Math.floor((days - months * 30.4375) / 7);
  return months === 0 ? `${weeks} w` : `${months} mo ${weeks} w`;
}

/** The one informational line, or null for a term baby. */
export function correctedAgeLine(
  birthDate: IsoDate,
  dueDate: IsoDate | null,
  today: IsoDate,
): string | null {
  if (dueDate === null) return null;
  if (compareIsoDates(dueDate, addDays(birthDate, 14)) <= 0) return null;
  return VACCINE_COPY.correctedAge(correctedAgeLabel(dueDate, today));
}
