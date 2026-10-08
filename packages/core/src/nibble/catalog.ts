/**
 * ── FOODS: MATCHING A NAME, A PARENT'S OWN FOOD, SERVING BY AGE ──────────────────────────────
 *
 * A custom food a parent adds becomes a `Food` too, with the
 * cautious defaults a library entry would never need: medium choking risk with the general cutting
 * rule, offered from six months in soft forms. Matching a typed name to a food uses CuddleCue's own
 * `foodKey`, so "Strawberries" logged in CuddleCue and "strawberry" in the library are one food.
 */
import { foodKey } from '../solids/items';
import {
  AGE_BANDS,
  Food,
  type AllergenId,
  type CustomFood,
  type Form,
  type Serving,
} from './types';

/** The prefix a custom food's id carries, so it can never collide with a library id. */
export const CUSTOM_PREFIX = 'custom-';

/** Every key a food answers to: its name and each alias, folded the way the log folds them. */
export function keysOf(food: Pick<Food, 'name' | 'aliases'>): string[] {
  return [food.name, ...food.aliases].map(foodKey).filter(k => k !== '');
}

/**
 * A food by what a parent typed. Exact key matches only: "pea" is not "peanut", and a typo stays
 * the parent's own food, as CuddleCue's log keeps it (docs/SOLIDS.md §4).
 */
export function makeMatcher(foods: readonly Food[]): (name: string) => Food | undefined {
  const byKey = new Map<string, Food>();
  for (const f of foods) for (const k of keysOf(f)) if (!byKey.has(k)) byKey.set(k, f);
  return name => byKey.get(foodKey(name));
}

const SOFT_FORMS: Readonly<Record<string, Form[]>> = {
  '6-8': ['puree', 'mashed', 'soft_stick'],
  '9-11': ['mashed', 'lumpy', 'soft_stick', 'finger', 'minced'],
  '12-17': ['minced', 'chopped', 'finger', 'family'],
  '18-24': ['chopped', 'finger', 'family'],
};

/**
 * A parent's food as a library `Food`. The allergens are the parent's to tick when they add it
 * (prompted, spec §6.3), and the serving advice is the general rule, because the app knows
 * nothing about the food beyond its name.
 */
export function customFoodToFood(id: string, c: CustomFood): Food {
  const serving: Serving[] = AGE_BANDS.map(band => ({
    band,
    forms: SOFT_FORMS[band] ?? [],
    how: 'Cook until soft enough to squash between your fingers, and cut into pieces your baby can hold or smaller than half an inch.',
  }));
  return Food.parse({
    id: id.startsWith(CUSTOM_PREFIX) ? id : `${CUSTOM_PREFIX}${id}`,
    name: c.name,
    aliases: [],
    category: c.category,
    allergens: c.allergens,
    notBeforeMonths: c.notBeforeMonths,
    chokingRisk: c.chokingRisk,
    ironRich: c.ironRich,
    nutrients: { iron: c.ironRich ? 2 : 0, protein: 0, fat: 0, fiber: 0, calcium: 0 },
    serving,
    chokingNote:
      c.chokingRisk === 'low'
        ? null
        : 'Serve soft and cut small. Stay with your baby, seated upright, while they eat.',
    ideas: [],
    sources: ['aap-choking'],
  });
}

/** Every food that contains an allergen. */
export function foodsContaining(foods: readonly Food[], allergen: AllergenId): Food[] {
  return foods.filter(f => f.allergens.includes(allergen));
}

/** The serving entry for a band. Every library food has all four. */
export function servingFor(food: Food, band: Serving['band']): Serving {
  return food.serving.find(s => s.band === band) ?? { band, forms: [], how: '' };
}
