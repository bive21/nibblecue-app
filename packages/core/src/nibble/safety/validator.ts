/**
 * ── THE VALIDATOR: NOTHING REACHES A SCREEN WITHOUT PASSING IT ────────────────────────────────
 *
 * Deterministic and on the phone (spec §8). Given one proposed item (a food in a form, at a meal on
 * a day) and what the plan already holds for that day, it answers with the hard rules the item
 * breaks. Empty means the item may be shown. It never repairs a food into something else; the
 * planner asks for another food instead, and a pinned food that breaks a rule is shown to the
 * parent as not plannable, with the rule's words (spec §6.2: "planner re-validates and reflows").
 *
 * It reads only what it is handed, so the same answer holds on every phone and in every test.
 * `validator.property.test.ts` runs it against thousands of generated profiles and histories.
 */
import type { AllergenState } from '../history';
import { type IsoDay, daysBetween } from '../days';
import { servingFor } from '../catalog';
import type { AgeBand, AllergenId, Food, Form, MealName, NibbleProfile } from '../types';
import { isHighMercuryName, isUnsafeName, type HardRuleId } from './rules';

export interface Violation {
  rule: HardRuleId;
  foodId: string;
}

/** What the day already holds when the item is checked: the items accepted before it. */
export interface DaySoFar {
  items: readonly {
    food: Food;
    meal: MealName;
    /** A food never offered before this day. */
    isNew: boolean;
    /** Allergens this item offers for the first time. */
    newAllergens: readonly AllergenId[];
  }[];
}

export interface ItemContext {
  day: IsoDay;
  months: number;
  band: AgeBand;
  meal: MealName;
  /** The first meal the day's plan holds: the only slot a new allergen may take. */
  firstMeal: MealName;
  profile: NibbleProfile;
  allergens: Readonly<Record<AllergenId, AllergenState>>;
  /** Offered before this day (in the log, before the app, or earlier in the plan). */
  tried: (food: Food) => boolean;
  skipDay: boolean;
  lastNewAllergenDay: IsoDay | null;
  lastNoticedDay: IsoDay | null;
  /** Rice cereal planned in the seven days ending the day before. */
  riceCerealThisWeek: number;
  daySoFar: DaySoFar;
}

/** The allergen states that mean "already part of the baby's food". */
const IN_DIET = new Set(['introduced', 'keeping_going', 'established']);

export const isRiceCereal = (food: Food): boolean =>
  food.category === 'grain' && /rice/.test(food.id) && /cereal/.test(food.id);

/** Does the family's diet or rule exclude this food? (spec §8.7) */
export function excludedByDiet(food: Food, profile: NibbleProfile): boolean {
  const a = food.animal;
  // `animal` names one origin; the allergens name every one a mixed food carries (a pancake is
  // egg AND milk), so a diet rule reads both
  const dairy = a === 'dairy' || food.allergens.includes('milk');
  const egg = a === 'egg' || food.allergens.includes('egg');
  const fish = a === 'fish' || food.allergens.includes('fish');
  const shellfish = a === 'shellfish' || food.allergens.includes('shellfish');
  if (profile.diet === 'vegan' && (dairy || egg || fish || shellfish)) return true;
  if ((profile.diet === 'vegetarian' || profile.diet === 'pescatarian') && a === 'meat')
    return true;
  if (profile.diet === 'vegetarian' && (fish || shellfish)) return true;
  if (profile.rules.some(r => r === 'kosher' || r === 'no_shellfish') && shellfish) return true;
  if (profile.rules.includes('jain') && (egg || fish || shellfish)) return true;
  switch (profile.diet) {
    case 'vegan':
      if (a !== 'none') return true;
      break;
    case 'vegetarian':
      if (a === 'meat' || a === 'fish' || a === 'shellfish') return true;
      break;
    case 'pescatarian':
      if (a === 'meat') return true;
      break;
    case 'omnivore':
      break;
  }
  for (const rule of profile.rules) {
    if (rule === 'halal' && food.meat === 'pork') return true;
    if (rule === 'kosher' && (food.meat === 'pork' || a === 'shellfish')) return true;
    if (rule === 'no_beef' && food.meat === 'beef') return true;
    if (rule === 'no_pork' && food.meat === 'pork') return true;
    if (rule === 'no_shellfish' && a === 'shellfish') return true;
    if (rule === 'jain' && (a === 'meat' || a === 'fish' || a === 'shellfish' || a === 'egg')) {
      return true;
    }
    if (rule === 'jain' && (food.root || a === 'honey')) return true;
  }
  return false;
}

/** The allergens this food would offer for the first time. */
export function newAllergensOf(
  food: Food,
  allergens: Readonly<Record<AllergenId, AllergenState>>,
): AllergenId[] {
  return food.allergens.filter(a => !IN_DIET.has(allergens[a].kind));
}

export function checkItem(food: Food, form: Form, ctx: ItemContext): Violation[] {
  const v: HardRuleId[] = [];
  const { profile, months } = ctx;

  if (months < 4) v.push('not_before_4_months');
  if (food.notBeforeMonths > months) v.push('not_before_age');
  if (food.animal === 'honey' && months < 12) v.push('no_honey_under_12');
  if ([food.name, ...food.aliases].some(isHighMercuryName)) v.push('no_high_mercury_fish');
  if ([food.name, ...food.aliases].some(isUnsafeName)) v.push('unsafe_food');

  const serving = servingFor(food, ctx.band);
  if (!serving.forms.includes(form)) v.push('choking_form');

  if (profile.neverServe.includes(food.id) || excludedByDiet(food, profile)) v.push('restriction');

  // the same food again later the same day is not new again; a first exposure is offered once
  const others = ctx.daySoFar.items;
  const repeat = others.filter(i => i.food.id === food.id);
  if (repeat.some(i => i.newAllergens.length > 0)) v.push('one_new_allergen_a_day');

  // allergens: held or excluded never; not yet released only as a scheduled first exposure
  const fresh = repeat.length > 0 ? [] : newAllergensOf(food, ctx.allergens);
  for (const a of food.allergens) {
    const kind = ctx.allergens[a].kind;
    if (kind === 'held' || kind === 'excluded') v.push('allergen_held');
    else if (kind === 'ask_first' || kind === 'not_planned') v.push('allergen_not_released');
  }
  if (fresh.length > 1) v.push('one_new_allergen_a_day');

  const isNew = !ctx.tried(food) && repeat.length === 0;
  if (fresh.length === 1) {
    if (others.some(i => i.newAllergens.length > 0)) v.push('one_new_allergen_a_day');
    if (others.some(i => i.isNew)) v.push('one_new_allergen_a_day');
    if (ctx.meal !== ctx.firstMeal || ctx.skipDay) v.push('new_allergen_timing');
    if (ctx.lastNewAllergenDay !== null && daysBetween(ctx.lastNewAllergenDay, ctx.day) < 3) {
      v.push('new_allergen_timing');
    }
    if (ctx.lastNoticedDay !== null && daysBetween(ctx.lastNoticedDay, ctx.day) < 14) {
      v.push('new_allergen_timing');
    }
  } else if (isNew) {
    // a new food without a new allergen: one a day, and never beside a new allergen
    if (others.some(i => i.newAllergens.length > 0)) v.push('one_new_allergen_a_day');
    if (others.some(i => i.isNew && i.newAllergens.length === 0)) v.push('one_new_food_a_day');
  }

  if (isRiceCereal(food)) {
    const today = others.filter(i => isRiceCereal(i.food)).length;
    if (ctx.riceCerealThisWeek + today >= 2) v.push('rotate_grains');
  }

  if (profile.rules.includes('kosher')) {
    const isDairy = (f: Food): boolean => f.animal === 'dairy' || f.allergens.includes('milk');
    const sameMeal = others.filter(i => i.meal === ctx.meal).map(i => i.food);
    if (
      (food.animal === 'meat' && sameMeal.some(isDairy)) ||
      (isDairy(food) && sameMeal.some(f => f.animal === 'meat'))
    ) {
      v.push('kosher_meat_dairy');
    }
  }

  return [...new Set(v)].map(rule => ({ rule, foodId: food.id }));
}
