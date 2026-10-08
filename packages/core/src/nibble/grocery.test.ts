import { describe, expect, it } from 'vitest';
import { FOOD_BY_ID } from './foods';
import { planGroceries } from './grocery';
import type { PlanDay, PlanItem } from './planner/plan';

const item = (foodId: string): PlanItem => ({
  foodId,
  form: 'mashed',
  isNew: false,
  firstAllergen: null,
  keepGoing: [],
  reasons: ['variety'],
  by: 'rules',
  note: null,
});
const day = (d: string, foods: string[][], skip = false): PlanDay => ({
  day: d,
  months: 7,
  stage: 'first_foods',
  band: '6-8',
  skip,
  meals: foods.map((ids, i) => ({ meal: i === 0 ? 'breakfast' : 'dinner', items: ids.map(item) })),
  refused: [],
});

describe('the grocery list from the plan', () => {
  const plan = [
    day('2026-10-08', [['avocado'], ['sweet-potato', 'beef']]),
    day('2026-10-09', [['avocado'], ['infant-oat-cereal']]),
    day('2026-10-10', [['egg']], true),
  ];
  const list = planGroceries(plan, id => FOOD_BY_ID.get(id), ['Sweet Potato']);

  it('lists each food once, by aisle, with the first day it is needed and no amounts', () => {
    expect(list.map(g => g.food.id)).toEqual([
      'avocado',
      'sweet-potato',
      'infant-oat-cereal',
      'beef',
    ]);
    expect(list.find(g => g.food.id === 'avocado')).toMatchObject({
      aisle: 'produce',
      firstDay: '2026-10-08',
      meals: 2,
    });
    for (const g of list)
      expect(Object.keys(g).sort()).toEqual(['aisle', 'firstDay', 'food', 'meals', 'onList']);
  });

  it('marks what is already on the list, by name, and skips skipped days', () => {
    expect(list.find(g => g.food.id === 'sweet-potato')?.onList).toBe(true);
    expect(list.find(g => g.food.id === 'avocado')?.onList).toBe(false);
    expect(list.some(g => g.food.id === 'egg')).toBe(false);
  });
});
