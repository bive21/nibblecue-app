/**
 * Which record dates a status may carry (docs/VACCINES.md §4, §6).
 *
 * The four record statuses do not mean the same thing about time. `GIVEN` transcribes
 * something that already happened, so its date cannot be in the future — a dose given next
 * Tuesday is not a fact anybody can have yet. `PLANNED` is an appointment the parent has
 * decided on, so its date usually IS in the future, and until now the date picker refused
 * exactly that (the owner, 2026-09-18, testing on an Android phone: "planned meaning it will
 * happen in the future, but this is blocked in the calendar"). `SKIPPED` and `DECLINED` carry
 * no date at all — `fieldsFor` stores null for both — so the question never arises for them.
 *
 * This is a rule about a calendar date and nothing else. It does not say a date is right,
 * wrong or anything in between, it is not guidance, and it never moves a date the parent
 * already stored: a `PLANNED` date that has since passed stays exactly as they left it
 * (§4 invariant 1). The one place it rewrites anything is `clampRecordDate`, which the sheets
 * use while the parent is still editing, before a row exists.
 */
import { compareIsoDates, type IsoDate } from './date';
import type { VaccineRecordStatus } from './status';

/** `PLANNED` is the one status whose date may be ahead of today. */
export const allowsFutureDate = (status: VaccineRecordStatus): boolean => status === 'PLANNED';

/** The latest date this status may carry, or null when the status sets no limit at all. */
export const latestRecordDate = (status: VaccineRecordStatus, today: IsoDate): IsoDate | null =>
  allowsFutureDate(status) ? null : today;

/** True when this status may carry this date — never a judgment about the date itself. */
export function isRecordDateAllowed(
  status: VaccineRecordStatus,
  date: IsoDate,
  today: IsoDate,
): boolean {
  const latest = latestRecordDate(status, today);
  return latest === null || compareIsoDates(date, latest) <= 0;
}

/**
 * The date an in-progress sheet keeps when the parent changes the status under it: their own
 * date wherever the new status may carry it, else today.
 *
 * Switching `Planned — May 19` to `Given` is the case this exists for. Saving it unchanged
 * would record a dose as given on a day that has not happened; refusing to save would leave
 * the parent with an error over a date they never typed for this status. Moving the date back
 * to today is the cheapest of the three, and it is visible rather than silent — the sheet's
 * date chips redraw with `Today` selected.
 */
export const clampRecordDate = (
  status: VaccineRecordStatus,
  date: IsoDate,
  today: IsoDate,
): IsoDate => (isRecordDateAllowed(status, date, today) ? date : today);
