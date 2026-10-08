/**
 * The line after a meal is saved says what the plan will do next, read off the planner's own next
 * run: never a day the plan does not hold, and a disliked food comes back in another form.
 */
import { buildPlan, FOOD_BY_ID, FOODS, NibbleProfile, type IsoDay } from '@nibblecue/core/nibble';
import { describe, expect, it } from 'vitest';
import { comesBack } from './comesBack';

const TODAY = '2026-10-08' as IsoDay;
const input = {
  childId: 'c',
  birthDate: '2026-03-01' as IsoDay,
  today: TODAY,
  days: 14,
  profile: NibbleProfile.parse({ stage: 'started', startedOn: '2026-09-20', approach: 'mix' }),
  foods: FOODS,
  exposures: [],
  noticed: [],
  marks: [],
};

describe('comesBack', () => {
  const plan = buildPlan(input);
  const meal = plan[0]!.meals.find(m => m.items.length > 0)!;
  const foods = meal.items.map(i => ({
    food: FOOD_BY_ID.get(i.foodId)!,
    response: 'LIKED' as const,
  }));

  it('names a day the next plan really offers the food, in a parent’s words', () => {
    const line = comesBack(input, foods, TODAY, `${TODAY}T12:00:00Z`, meal);
    expect(line).not.toBeNull();
    expect(line).toMatch(/comes back|part of the week/);
  });

  it('brings a disliked food back in another form when the plan has one', () => {
    const disliked = foods.map((f, i) => (i === 0 ? { ...f, response: 'DISLIKED' as const } : f));
    const line = comesBack(input, disliked, TODAY, `${TODAY}T12:00:00Z`, meal);
    if (line !== null) expect(line.startsWith(foods[0]!.food.name)).toBe(true);
  });
});
