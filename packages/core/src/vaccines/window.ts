/**
 * The published window of one dose for one child (docs/VACCINES.md §3): two calendar dates,
 * the second null when the profile says the dose has no end (`flu_annual`, `covid_season`).
 * Never a sentinel date, and never anything but `birth_date` — corrected age is a growth
 * matter (§3.1).
 */
import { addMonthsFractional, type IsoDate } from './date';
import type { VaccineDose } from './profile';

export interface DoseWindow {
  from: IsoDate;
  to: IsoDate | null;
}

export function doseWindow(birthDate: IsoDate, dose: VaccineDose): DoseWindow {
  return {
    from: addMonthsFractional(birthDate, dose.fromMonths),
    to: dose.toMonths === null ? null : addMonthsFractional(birthDate, dose.toMonths),
  };
}

/** `2–3 months`, `2–3.5 months`, `birth–1 month`, `from 6 months`. */
export function monthsRange(dose: Pick<VaccineDose, 'fromMonths' | 'toMonths'>): string {
  const n = (m: number): string => (Number.isInteger(m) ? String(m) : String(m));
  if (dose.toMonths === null) return `from ${n(dose.fromMonths)} months`;
  const from = dose.fromMonths === 0 ? 'birth' : n(dose.fromMonths);
  const unit = dose.toMonths === 1 ? 'month' : 'months';
  return `${from}–${n(dose.toMonths)} ${unit}`;
}
