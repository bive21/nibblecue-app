/**
 * ── WHAT EACH FOOD'S PHOTO SHOWS ──────────────────────────────────────────────────────────────
 *
 * The owner, 2026-10-08: "we need to add images (generated but looks like real images) for each
 * food listed here". Every food gets one photograph in one consistent style, of the food the way
 * it is SERVED to a baby starting solids (the 6 to 8 month serving), because that is what a parent
 * needs to see: how big, how soft, what shape. This file writes the prompt for each food from its
 * own serving text, so the photo and the words on its page cannot disagree; the prompts are kept as
 * `tools/foods/food-image-prompts.csv` (held equal to this by `foodImages.test.ts`), and the photos
 * an image model makes from them are brought into the app by `tools/foods/import-food-images.py`.
 *
 * THE STYLE, ONE FOR EVERY FOOD: a real-looking photograph, from directly above, soft natural window
 * light, the food on a plain white baby plate on a light wooden table, nothing else in frame: no
 * hands, no text, no brands, no utensils unless the serving needs one. Square, so it crops the same
 * in every place the app shows it.
 */
import { servingFor } from './catalog';
import type { AgeBand, Food } from './types';

export const FOOD_IMAGE_STYLE =
  'Realistic food photograph, shot from directly above, soft natural window light, on a plain white ' +
  'baby plate on a light wooden table. Square 1:1. Nothing else in frame: no hands, no people, no ' +
  'text, no logos, no packaging, no cutlery unless the serving needs a spoon. Appetizing, true to ' +
  'life colors, shallow depth of field.';

/** The first age band the food is served in: 6 to 8 months, or later for honey, cow's milk and the like. */
function firstBand(food: Food): AgeBand {
  if (food.notBeforeMonths <= 8) return '6-8';
  if (food.notBeforeMonths <= 11) return '9-11';
  if (food.notBeforeMonths <= 17) return '12-17';
  return '18-24';
}

const AGE: Readonly<Record<AgeBand, string>> = {
  '6-8': 'a baby starting solids',
  '9-11': 'a baby of 9 to 11 months',
  '12-17': 'a toddler of 12 to 17 months',
  '18-24': 'a toddler of 18 to 24 months',
};

const FRESH_HERBS = new Set(['cilantro', 'basil', 'mint', 'dill', 'parsley', 'oregano']);
const MINCED = new Set(['garlic', 'ginger']);

/** What is in the photo: the food as the youngest baby it is planned for is served it. */
export function foodImageSubject(food: Food): string {
  const band = firstBand(food);
  const how = servingFor(food, band).how.trim();
  switch (food.category) {
    case 'herb_spice': {
      const name = food.name.toLowerCase();
      if (food.id === 'honey')
        return `Honey, for a toddler over 12 months: a thin drizzle over plain yogurt in a small white bowl.`;
      if (FRESH_HERBS.has(food.id))
        return `A little finely chopped fresh ${name} in a tiny white bowl, beside a spoonful of mashed sweet potato it is stirred into.`;
      if (MINCED.has(food.id))
        return `A little minced ${name} in a tiny white bowl, beside a spoonful of mashed lentils it is cooked into.`;
      return `A small pinch of ground ${name} in a tiny white bowl, beside a spoonful of mashed sweet potato it is mixed into.`;
    }
    case 'pouch_jar':
      return `${food.name}, its contents spooned into a small white bowl, the plain unbranded container beside it.`;
    case 'drink':
      return `${food.name} in a small clear open cup made for babies.`;
    default:
      return `${food.name}, prepared for ${AGE[band]}: ${how}`;
  }
}

export function foodImagePrompt(food: Food): string {
  return `${foodImageSubject(food)} ${FOOD_IMAGE_STYLE}`;
}

/** The prompt list as CSV text (id, name, prompt), quoted the way spreadsheets read it. */
export function foodImagePromptsCsv(foods: readonly Food[]): string {
  const q = (s: string): string => `"${s.replace(/"/g, '""')}"`;
  return (
    ['id,name,prompt', ...foods.map(f => [f.id, q(f.name), q(foodImagePrompt(f))].join(','))].join(
      '\n',
    ) + '\n'
  );
}
