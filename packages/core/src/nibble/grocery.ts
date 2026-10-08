/**
 * ── THE GROCERY LIST, FROM THE MEAL PLAN ──────────────────────────────────────────────────────
 *
 * What the plan will offer over the days the parent can see, as things to buy: each food once,
 * grouped the way a store is walked, with the first day it is needed, so the list can say "for
 * Tuesday". No amounts: what a baby eats is the baby's to decide (CLAUDE.md §2 rule 3), and a
 * shopper buys a food, not a portion of it. Water is never on it. A food already on the grocery
 * list (by its name, the way the list matches a typed line) is marked rather than offered twice.
 */
import { foodKey } from '../solids/items';
import type { IsoDay } from './days';
import type { Food, FoodCategory } from './types';
import type { PlanDay } from './planner/plan';

export type Aisle = 'produce' | 'grains' | 'protein' | 'dairy' | 'pantry' | 'drinks';
export const AISLES: readonly Aisle[] = [
  'produce',
  'grains',
  'protein',
  'dairy',
  'pantry',
  'drinks',
];

const AISLE_OF: Readonly<Record<FoodCategory, Aisle>> = {
  vegetable: 'produce',
  fruit: 'produce',
  herb_spice: 'produce',
  grain: 'grains',
  meat: 'protein',
  fish: 'protein',
  egg: 'dairy',
  dairy: 'dairy',
  plant_protein: 'pantry',
  nut_seed: 'pantry',
  fat: 'pantry',
  pouch_jar: 'pantry',
  drink: 'drinks',
};

export interface GroceryItem {
  food: Food;
  aisle: Aisle;
  /** The first day in the window the plan offers it. */
  firstDay: IsoDay;
  /** How many meals in the window offer it: a hint for the shopper, never a portion. */
  meals: number;
  /** Already on the grocery list (not yet bought). */
  onList: boolean;
}

/** Foods a store does not sell as such. */
const NOT_BOUGHT = new Set(['water']);

export function planGroceries(
  plan: readonly PlanDay[],
  foodById: (id: string) => Food | undefined,
  onListTitles: readonly string[],
): GroceryItem[] {
  const listed = new Set(onListTitles.map(foodKey));
  const byId = new Map<string, GroceryItem>();
  for (const day of plan) {
    if (day.skip) continue;
    for (const meal of day.meals) {
      for (const item of meal.items) {
        const food = foodById(item.foodId);
        if (!food || NOT_BOUGHT.has(food.id)) continue;
        const had = byId.get(food.id);
        if (had) {
          had.meals += 1;
          continue;
        }
        byId.set(food.id, {
          food,
          aisle: AISLE_OF[food.category],
          firstDay: day.day,
          meals: 1,
          onList: listed.has(foodKey(food.name)),
        });
      }
    }
  }
  return [...byId.values()].sort(
    (a, b) =>
      AISLES.indexOf(a.aisle) - AISLES.indexOf(b.aisle) ||
      a.firstDay.localeCompare(b.firstDay) ||
      a.food.name.localeCompare(b.food.name),
  );
}
