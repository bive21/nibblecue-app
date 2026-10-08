/**
 * What a dose reads as (docs/VACCINES.md §4): the parent's record when there is one — always,
 * whatever it says — else the published window against today's date; and nothing at all for a
 * seasonal, optional or conditional dose the household has not turned on. Eight statuses,
 * exactly one per (child, dose), and `PAST_WINDOW` is a description of a window, never a word
 * about the child.
 */
import { compareIsoDates, type IsoDate } from './date';
import { needsOptIn, type DoseDisplayStatus, type VaccineDose } from './profile';
import type { DoseWindow } from './window';

export type VaccineRecordStatus = 'GIVEN' | 'PLANNED' | 'SKIPPED' | 'DECLINED';

/** The fields of a `vaccine_records` row the status needs. */
export interface RecordLike {
  status: VaccineRecordStatus;
  /** Given or planned date, `yyyy-mm-dd`. */
  occurred_on: IsoDate | null;
}

/** The dose ids a child's household has turned on (`vaccine_tracking_settings.enabled`). */
export type Tracking = ReadonlySet<string>;

export const isTracked = (dose: VaccineDose, tracking: Tracking): boolean =>
  !needsOptIn(dose) || tracking.has(dose.id);

export interface StatusInput {
  dose: VaccineDose;
  record: RecordLike | null;
  window: DoseWindow;
  today: IsoDate;
  tracked: boolean;
}

/**
 * Invariant 1: a record overrides the profile — its status IS the status, whatever its date
 * says. A PLANNED dose reads as `Planned` whether the parent's date is still ahead (the usual
 * case, since a plan is an appointment) or has already passed, and either way it is never
 * re-derived into DUE, UPCOMING or PAST_WINDOW — no window arithmetic can contradict what the
 * parent entered. Then: untracked is NOT_APPLICABLE; then the window against today.
 */
export function doseStatus(input: StatusInput): DoseDisplayStatus {
  if (input.record !== null) return input.record.status;
  if (!input.tracked) return 'NOT_APPLICABLE';
  const { from, to } = input.window;
  if (compareIsoDates(input.today, from) < 0) return 'UPCOMING';
  if (to !== null && compareIsoDates(input.today, to) > 0) return 'PAST_WINDOW';
  return 'DUE';
}

/**
 * A row exists, so the dose is not an open window. PLANNED is a record and still not given:
 * `openVisits` keeps the visit until the dose is GIVEN, SKIPPED or DECLINED (§5.1).
 */
export const isRecorded = (s: DoseDisplayStatus): boolean =>
  s === 'GIVEN' || s === 'SKIPPED' || s === 'DECLINED' || s === 'PLANNED';

/** No row, and the dose is on: a window the parent has not answered yet. */
export const isOpen = (s: DoseDisplayStatus): boolean =>
  s === 'DUE' || s === 'UPCOMING' || s === 'PAST_WINDOW';
