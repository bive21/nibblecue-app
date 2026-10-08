import { describe, expect, it } from 'vitest';
import { zonedToUtc } from '../today/day';
import { AMOUNT_LABEL, AMOUNTS, MEAL_LABEL, MEALS, mealForTime } from './remembered';

const TZ = 'America/Los_Angeles';
const at = (h: number, m = 0): number => zonedToUtc(TZ, 2026, 9, 14, h, m);

describe('mealForTime', () => {
  const cases: Array<[number, number, string]> = [
    [7, 30, 'BREAKFAST'],
    [5, 0, 'BREAKFAST'],
    [10, 29, 'BREAKFAST'],
    [10, 30, 'LUNCH'],
    [12, 0, 'LUNCH'],
    [13, 59, 'LUNCH'],
    [14, 0, 'SNACK'],
    [16, 0, 'SNACK'],
    [17, 0, 'DINNER'],
    [18, 30, 'DINNER'],
    [20, 59, 'DINNER'],
    [21, 0, 'SNACK'],
    [23, 30, 'SNACK'],
    [2, 0, 'SNACK'],
    [4, 59, 'SNACK'],
  ];

  for (const [h, m, expected] of cases) {
    it(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')} opens on ${expected}`, () => {
      expect(mealForTime(at(h, m), TZ)).toBe(expected);
    });
  }

  it('leaves no minute of the day without a meal, and gives none of them two', () => {
    for (let mins = 0; mins < 24 * 60; mins++) {
      const got = mealForTime(at(Math.floor(mins / 60), mins % 60), TZ);
      expect(MEALS).toContain(got);
    }
  });

  it('reads the HOUSEHOLD clock, so one instant can be two different meals', () => {
    // 18:30 in Los Angeles is 13:30 the next day in Auckland
    const dinnerTime = at(18, 30);
    expect(mealForTime(dinnerTime, TZ)).toBe('DINNER');
    expect(mealForTime(dinnerTime, 'Pacific/Auckland')).toBe('LUNCH');
  });
});

describe('the pills', () => {
  it('labels every meal and every amount', () => {
    for (const m of MEALS) expect(MEAL_LABEL[m]).toBeTruthy();
    for (const a of AMOUNTS) expect(AMOUNT_LABEL[a]).toBeTruthy();
  });

  it('offers five amounts and never a number (§6.6)', () => {
    expect(AMOUNTS).toHaveLength(5);
    for (const a of AMOUNTS) expect(AMOUNT_LABEL[a]).not.toMatch(/\d|%/);
  });

  it('carries no assessment in any label', () => {
    const all = [...Object.values(MEAL_LABEL), ...Object.values(AMOUNT_LABEL)]
      .join(' ')
      .toLowerCase();
    for (const banned of ['poor', 'good', 'enough', 'should', 'target', 'low', 'refused']) {
      expect(all).not.toContain(banned);
    }
  });
});
