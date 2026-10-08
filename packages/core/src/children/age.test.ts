import { describe, expect, it } from 'vitest';
import { addMonthsClamped, monthDayOn } from '../celebrations';
import { ageLabel, allChildrenLabel, daysOld, monthsOld } from './age';

const at = (iso: string) => new Date(`${iso}T12:00:00`).getTime();

describe('ageLabel', () => {
  it('counts days under two weeks', () => {
    expect(ageLabel('2026-09-13', at('2026-09-14'))).toBe('1 day');
    expect(ageLabel('2026-09-01', at('2026-09-14'))).toBe('13 days');
    expect(ageLabel('2026-09-14', at('2026-09-14'))).toBe('0 days');
  });
  it('counts weeks under ten', () => {
    expect(ageLabel('2026-08-31', at('2026-09-14'))).toBe('2 weeks');
    expect(ageLabel('2026-07-10', at('2026-09-14'))).toBe('9 weeks');
  });
  it('counts months under two years', () => {
    expect(ageLabel('2026-07-01', at('2026-09-14'))).toBe('2 months');
    expect(ageLabel('2025-01-20', at('2026-09-14'))).toBe('19 months');
  });
  it('counts years after that', () => {
    expect(ageLabel('2024-09-01', at('2026-09-14'))).toBe('2 years');
  });
  it('never goes negative for a date in the future (a typo, or a due date)', () => {
    expect(ageLabel('2026-12-01', at('2026-09-14'))).toBe('0 days');
    expect(daysOld('2026-12-01', at('2026-09-14'))).toBeLessThan(0);
  });
  it('labels the all-children view by count', () => {
    expect(allChildrenLabel(2)).toBe('Both');
    expect(allChildrenLabel(3)).toBe('All 3');
  });
});

/**
 * THE AGE TURNS OVER ON THE MONTH-DAY (2026-09-26): calendar months, by the celebration
 * calendar's own clamp, so the chip never reads a month behind the party hat beside it. It used
 * to divide by 30.44 and 365.25, which read "2 months" on the three-month day and "11 months" on a
 * first birthday.
 */
describe('months and years are calendar months', () => {
  it('turns over on the month-day itself, not a day or two after', () => {
    expect(ageLabel('2026-01-15', at('2026-04-14'))).toBe('2 months');
    expect(ageLabel('2026-01-15', at('2026-04-15'))).toBe('3 months');
    expect(ageLabel('2025-09-26', at('2026-09-25'))).toBe('11 months');
    expect(ageLabel('2025-09-26', at('2026-09-26'))).toBe('12 months');
    expect(ageLabel('2024-09-26', at('2026-09-25'))).toBe('23 months');
    // a second birthday with no 29 February between: 730 days, and still two years
    expect(ageLabel('2024-09-26', at('2026-09-26'))).toBe('2 years');
    expect(ageLabel('2023-09-26', at('2026-09-26'))).toBe('3 years');
  });

  it('agrees with every month-day the celebration calendar dates', () => {
    const birth = '2026-01-31';
    for (let n = 3; n <= 24; n += 1) {
      const day = addMonthsClamped(birth, n);
      // the hat's month-days end on the first birthday; the age keeps turning over on the same day
      expect(monthDayOn(birth, day)).toBe(n <= 12 ? n : null);
      expect(monthsOld(birth, at(day))).toBe(n);
      expect(ageLabel(birth, at(day))).toBe(n < 24 ? `${n} months` : '2 years');
    }
  });

  it('clamps a baby born on the 31st to the last day of a short month', () => {
    expect(monthsOld('2026-01-31', at('2026-02-27'))).toBe(0);
    expect(monthsOld('2026-01-31', at('2026-02-28'))).toBe(1);
    expect(monthsOld('2026-01-31', at('2026-04-29'))).toBe(2);
    expect(monthsOld('2026-01-31', at('2026-04-30'))).toBe(3);
  });

  it('is zero before birth and for a date that does not parse', () => {
    expect(monthsOld('2026-12-01', at('2026-09-14'))).toBe(0);
    expect(monthsOld('', at('2026-09-14'))).toBe(0);
  });
});
