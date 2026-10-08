/**
 * docs/VACCINES.md §11 `window.test.ts`, `window.openEnded.test.ts`, `window.dst.test.ts`:
 * calendar-date arithmetic bit-identical to Postgres `(d + interval '1 month' * m)::date`,
 * every dose of the profile, the fractional month, the month-end clamp, the open-ended
 * window, and the proof that no zone is involved.
 */
import { describe, expect, it } from 'vitest';
import {
  addCalendarMonths,
  addDays,
  addMonthsFractional,
  calendarDaysBetween,
  isIsoDate,
  isoDateIn,
  parseIsoDate,
} from './date';
import { doseById, VACCINE_PROFILE } from './profile';
import { doseWindow, monthsRange } from './window';

const dose = (id: string) => {
  const d = doseById(VACCINE_PROFILE, id);
  if (d === undefined) throw new Error(`no dose ${id}`);
  return d;
};

describe('addMonthsFractional ≡ (d + interval "1 month" * m)::date', () => {
  it('rv_1: 3.5 months is 3 months and 15 days — born 2026-03-04 → 2026-05-04 … 2026-06-19', () => {
    expect(doseWindow('2026-03-04', dose('rv_1'))).toEqual({
      from: '2026-05-04',
      to: '2026-06-19',
    });
  });

  it('a month-end birth date clamps the way Postgres clamps', () => {
    expect(addCalendarMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addCalendarMonths('2024-01-31', 1)).toBe('2024-02-29');
    expect(addCalendarMonths('2026-01-31', 3)).toBe('2026-04-30');
    expect(addCalendarMonths('2026-10-31', 4)).toBe('2027-02-28');
    // the clamp is on the month, and the days of a fraction are added after it
    expect(addMonthsFractional('2026-01-31', 1.5)).toBe('2026-03-15');
  });

  it('hepb_3 6→18 months and dtap_5 48→72 months', () => {
    expect(doseWindow('2026-03-04', dose('hepb_3'))).toEqual({
      from: '2026-09-04',
      to: '2027-09-04',
    });
    expect(doseWindow('2026-03-04', dose('dtap_5'))).toEqual({
      from: '2030-03-04',
      to: '2032-03-04',
    });
  });

  it('every dose of the profile yields two calendar dates in order, or one and null', () => {
    for (const d of VACCINE_PROFILE.doses) {
      const w = doseWindow('2026-01-31', d);
      expect(isIsoDate(w.from), d.id).toBe(true);
      if (w.to === null) expect(d.toMonths).toBeNull();
      else {
        expect(isIsoDate(w.to), d.id).toBe(true);
        expect(w.from <= w.to, d.id).toBe(true);
      }
    }
  });

  it('a fraction is thirty-day months, rounded', () => {
    expect(addMonthsFractional('2026-03-04', 0.5)).toBe('2026-03-19');
    expect(addMonthsFractional('2026-03-04', 2.25)).toBe('2026-05-12');
    expect(addMonthsFractional('2026-03-04', 12)).toBe('2027-03-04');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(calendarDaysBetween('2026-03-04', '2026-05-04')).toBe(61);
  });
});

describe('open-ended windows', () => {
  it('toMonths null yields window_to null — never a sentinel — and the copy says from', () => {
    for (const id of ['flu_annual', 'covid_season']) {
      const w = doseWindow('2026-03-04', dose(id));
      expect(w).toEqual({ from: '2026-09-04', to: null });
      expect(monthsRange(dose(id))).toBe('from 6 months');
    }
    expect(monthsRange(dose('hepb_1'))).toBe('birth–1 month');
    expect(monthsRange(dose('rv_1'))).toBe('2–3.5 months');
    expect(monthsRange(dose('dtap_5'))).toBe('48–72 months');
  });
});

describe('no zone, no clock', () => {
  it('a window is the same for a household in New York, Berlin and UTC', () => {
    // `doseWindow` takes a date and a dose: there is nothing for a zone to change
    const w = doseWindow('2026-03-08', dose('dtap_1')); // the US spring-forward night
    expect(w).toEqual({ from: '2026-05-08', to: '2026-06-08' });
    expect(doseWindow('2026-10-25', dose('dtap_1'))).toEqual({
      from: '2026-12-25',
      to: '2027-01-25',
    });
  });

  it('today is a calendar date in the household’s zone, and only that', () => {
    const ms = Date.parse('2026-03-08T03:30:00.000Z'); // 23:30 the night before in New York
    expect(isoDateIn('America/New_York', ms)).toBe('2026-03-07');
    expect(isoDateIn('Europe/Berlin', ms)).toBe('2026-03-08');
    expect(isoDateIn('UTC', ms)).toBe('2026-03-08');
  });

  it('refuses what is not a calendar date', () => {
    expect(() => parseIsoDate('2026-02-30')).toThrow(RangeError);
    expect(() => parseIsoDate('2026-3-4')).toThrow(RangeError);
    expect(isIsoDate('2026-02-28')).toBe(true);
  });
});
