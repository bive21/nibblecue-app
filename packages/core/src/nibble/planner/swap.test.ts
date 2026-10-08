import { describe, expect, it } from 'vitest';
import { ate, FIXTURE_FOODS, profileOf } from '../testing/fixtures';
import type { Exposure } from '../history';
import { buildPlan, type PlanInput } from './plan';
import { swapOptions } from './swap';

const TODAY = '2026-10-08';

const firstWeek: Exposure[] = [
  ate('sweet-potato', '2026-10-01'),
  ate('avocado', '2026-10-02'),
  ate('pear', '2026-10-03'),
  ate('infant-oat-cereal', '2026-10-04'),
  ate('banana', '2026-10-05'),
];

const input = (over: Partial<PlanInput> = {}): PlanInput => ({
  childId: 'child-1',
  birthDate: '2026-04-01',
  today: TODAY,
  days: 14,
  profile: profileOf(),
  foods: FIXTURE_FOODS,
  exposures: firstWeek,
  noticed: [],
  marks: [],
  ...over,
});

describe('swapping a planned food', () => {
  it('offers only foods the planner itself would place there, familiar ones first', () => {
    const plan = buildPlan(input());
    const day = plan[1]!;
    const meal = day.meals[0]!;
    const item = meal.items[0]!;
    const options = swapOptions(input(), day.day, meal.meal, item.foodId);
    expect(options.length).toBeGreaterThan(0);
    for (const o of options) {
      expect(o.food.id).not.toBe(item.foodId);
      expect(o.item.foodId).toBe(o.food.id);
    }
    const tried = new Set(firstWeek.map(e => e.foodId));
    expect(tried.has(options[0]!.food.id)).toBe(true);
  });

  it('never offers a new allergen, a never-serve food or a food the day cannot hold', () => {
    const profile = profileOf({ neverServe: ['pear'] });
    const plan = buildPlan(input({ profile }));
    for (const day of plan.slice(0, 4)) {
      for (const meal of day.meals) {
        for (const item of meal.items) {
          const options = swapOptions(input({ profile }), day.day, meal.meal, item.foodId, 10);
          for (const o of options) {
            expect(o.food.id).not.toBe('pear');
            expect(o.item.firstAllergen).toBeNull();
          }
        }
      }
    }
  });

  it('offers nothing outside the plan window', () => {
    expect(swapOptions(input(), '2026-10-01', 'breakfast', 'pear')).toEqual([]);
    expect(swapOptions(input(), '2026-12-01', 'breakfast', 'pear')).toEqual([]);
  });
});
