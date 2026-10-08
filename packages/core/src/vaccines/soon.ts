/**
 * SOON — THE ONE WEEK A VACCINE IS DRAWN IN RED (the owner, 2026-09-26: "vaccines should be shown
 * in red only when there is a vaccine coming up 1 week before supposed age to receive the
 * vaccine, and the rest (1 week and before) it should remain a calm color like blue").
 *
 * A dose is SOON when nothing closed it — no GIVEN, SKIPPED or DECLINED record — and the date it
 * is headed for falls between today and `SOON_DAYS` from today, both ends included. That date is
 * the parent's own PLANNED date when there is one (an appointment they booked outranks the
 * published arithmetic, as it does everywhere else — docs/VACCINES.md §4 invariant 1), and
 * otherwise the published window's opening, `window_from`: the "supposed age" of the owner's
 * sentence, computed from the date of birth and nothing else (§3).
 *
 * A CALENDAR CUE BEFORE A DATE, NEVER A VERDICT AFTER IT. This is the whole safety argument, and
 * it is why the predicate is written the way it is (CLAUDE.md §2 rules 1 and 3; VACCINES.md §1):
 *   - the day after the date, the dose is calm again — `days < 0` is never soon, so nothing can
 *     turn red BECAUSE time passed, which is the one thing a color must never say about a child;
 *   - `PAST_WINDOW` is never soon, whatever its dates (checked by status as well as by date, so a
 *     future edit to either cannot make a closed window red);
 *   - an open window that opened days ago (`DUE`) is calm — only its opening day is inside the
 *     week, and that is a date, not a delay;
 *   - nothing counts, ranks or nags: this answers one yes or no for one dose on one day.
 *
 * CALENDAR DAYS IN THE ZONE THE PHONE READS IN, like every vaccine date (§3, §4): `today` is a
 * `yyyy-mm-dd` the caller took from its clock in that zone (`isoDateIn`), and `isSoonAt` does that
 * step for a caller holding an instant — so 11:30 p.m. on the 26th is the 26th, not the UTC 27th.
 */
import { calendarDaysBetween, isoDateIn, type IsoDate } from './date';
import type { DoseDisplayStatus } from './profile';
import type { RecordLike } from './status';
import type { DoseWindow } from './window';

/** How many days ahead a date reads as SOON — the owner's "1 week before", today included. */
export const SOON_DAYS = 7;

/**
 * What the predicate reads: a dose view (`DoseView`), or a parent-added record, which has no
 * published window and is soon only by the date the parent gave it.
 */
export interface SoonSubject {
  status: DoseDisplayStatus;
  record: RecordLike | null;
  window: DoseWindow | null;
}

/** Statuses a record closes: a dose in one of these is never headed anywhere. */
const CLOSED: ReadonlySet<DoseDisplayStatus> = new Set([
  'GIVEN',
  'SKIPPED',
  'DECLINED',
  'NOT_APPLICABLE',
]);

/**
 * The date a dose is headed for: the parent's planned date, else its published window's opening.
 * Null when a record closed the dose, when the dose is not tracked, or when neither date exists
 * (a parent-added plan with no date).
 */
export function soonDate(s: SoonSubject): IsoDate | null {
  if (CLOSED.has(s.status)) return null;
  if (s.status === 'PLANNED') return s.record?.occurred_on ?? s.window?.from ?? null;
  return s.window?.from ?? null;
}

/** Whole calendar days from `today` to the dose's date — negative once it has passed. */
export function daysToSoonDate(s: SoonSubject, today: IsoDate): number | null {
  const date = soonDate(s);
  return date === null ? null : calendarDaysBetween(today, date);
}

/** The owner's week: not closed, and the date is today or one of the next `SOON_DAYS` days. */
export function isSoon(s: SoonSubject, today: IsoDate): boolean {
  // belt and braces: a closed published window is never red, whatever its dates say (§1)
  if (s.status === 'PAST_WINDOW') return false;
  const days = daysToSoonDate(s, today);
  return days !== null && days >= 0 && days <= SOON_DAYS;
}

/** `isSoon` for a caller holding an instant: today is taken in `timeZone` first. */
export function isSoonAt(s: SoonSubject, timeZone: string, nowMs: number): boolean {
  return isSoon(s, isoDateIn(timeZone, nowMs));
}
