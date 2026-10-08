/**
 * ── WHAT A PLANNED FOOD CAN BE SWAPPED FOR ────────────────────────────────────────────────────
 *
 * A swap is two marks the parent makes: the planned food taken off that meal, the chosen one
 * pinned to it. So an option is offered only if the planner itself, given those two marks, puts
 * the food in that meal and refuses nothing. That keeps the safety rules in one place: the same
 * validator that checks every planned item checks every swap, and an option that would break a
 * rule is never shown.
 *
 * Familiar foods first (tried, and liked), then foods of the same kind; never a new allergen,
 * never something the parent said never to serve.
 */
import { addDays, daysBetween, type IsoDay } from '../days';
import { keyForFood } from '../history';
import type { Food, MealName, PlanMark } from '../types';
import { buildPlan, hash, type PlanInput, type PlanItem } from './plan';

export interface SwapOption {
  food: Food;
  item: PlanItem;
}

export function swapOptions(
  input: PlanInput,
  day: IsoDay,
  meal: MealName,
  foodId: string,
  max = 5,
): SwapOption[] {
  const offset = daysBetween(input.today, day);
  if (offset < 0 || offset >= input.days) return [];
  const statuses = new Map<string, { times: number; liked: number; refused: number }>();
  for (const e of input.exposures) {
    const s = statuses.get(e.key) ?? { times: 0, liked: 0, refused: 0 };
    s.times += 1;
    if (e.response === 'LOVED' || e.response === 'LIKED') s.liked += 1;
    if (e.response === 'DISLIKED') s.refused += 1;
    statuses.set(e.key, s);
  }
  const current = input.foods.find(f => f.id === foodId);
  const base = buildPlan({ ...input, days: offset + 1 });
  const planned = new Set(
    base[offset]?.meals.find(m => m.meal === meal)?.items.map(i => i.foodId) ?? [],
  );

  const candidates = input.foods
    .filter(f => f.id !== foodId && !planned.has(f.id))
    .filter(f => !input.profile.neverServe.includes(f.id))
    // a swap is a familiar food or a plain one: a first allergen is the plan's to place, never a swap's
    .filter(f => {
      const tried = statuses.has(keyForFood(f));
      return tried || f.allergens.length === 0;
    })
    .map(f => {
      const s = statuses.get(keyForFood(f));
      const score =
        (s ? 4 + Math.min(s.liked, 3) - Math.min(s.refused, 3) : 0) +
        (current && f.category === current.category ? 2 : 0) +
        hash(`${input.childId}:${day}:${meal}:${f.id}`);
      return { f, score };
    })
    .sort((a, b) => b.score - a.score)
    .map(x => x.f);

  const out: SwapOption[] = [];
  const marks: PlanMark[] = [...input.marks, { day, meal, kind: 'remove', foodId }];
  for (const food of candidates) {
    if (out.length >= max) break;
    const plan = buildPlan({
      ...input,
      days: offset + 1,
      marks: [...marks, { day, meal, kind: 'pin', foodId: food.id }],
    });
    const target = plan[offset];
    if (!target || target.skip) break;
    if (target.refused.some(v => v.foodId === food.id)) continue;
    const item = target.meals.find(m => m.meal === meal)?.items.find(i => i.foodId === food.id);
    if (item === undefined) continue;
    out.push({ food, item });
  }
  return out;
}

/** Tomorrow, for the food page's "Add to tomorrow's plan". */
export const tomorrowOf = (today: IsoDay): IsoDay => addDays(today, 1);
