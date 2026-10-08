/**
 * A small, hand-made food list and profile builders for the planner's and validator's tests, so
 * they hold the rules themselves rather than the library's current contents. `plan.library.test.ts`
 * runs the same checks over the real library.
 */
import type { Exposure } from '../history';
import { keyForFood } from '../history';
import { AGE_BANDS, Food, NibbleProfile, type FoodInput, type Form } from '../types';

const ALL_SOFT: Readonly<Record<string, Form[]>> = {
  '6-8': ['puree', 'mashed', 'soft_stick', 'mixed_in'],
  '9-11': ['mashed', 'lumpy', 'soft_stick', 'finger', 'minced', 'mixed_in'],
  '12-17': ['minced', 'chopped', 'finger', 'family', 'mixed_in'],
  '18-24': ['chopped', 'finger', 'family', 'mixed_in'],
};

export function food(id: string, extra: Partial<FoodInput> = {}): Food {
  return Food.parse({
    id,
    name: id.replace(/-/g, ' ').replace(/^./, c => c.toUpperCase()),
    category: 'vegetable',
    notBeforeMonths: 6,
    chokingRisk: 'low',
    nutrients: { iron: 0, protein: 0, fat: 0, fiber: 0, calcium: 0 },
    serving: AGE_BANDS.map(band => ({ band, forms: ALL_SOFT[band], how: 'Soft.' })),
    sources: ['aap-starting-solids'],
    ...extra,
  });
}

const iron = { iron: 3, protein: 2, fat: 1, fiber: 0, calcium: 0 };

export const FIXTURE_FOODS: readonly Food[] = [
  food('avocado', { category: 'fruit', firstFood: true }),
  food('sweet-potato', { firstFood: true, root: true, vitaminC: true }),
  food('banana', { category: 'fruit', firstFood: true, firming: true }),
  food('pear', { category: 'fruit', firstFood: true, softening: true, vitaminC: true }),
  food('broccoli', { vitaminC: true }),
  food('carrot', { root: true }),
  food('zucchini'),
  food('mango', { category: 'fruit', vitaminC: true }),
  food('prune', { category: 'fruit', softening: true }),
  food('beef', {
    category: 'meat',
    animal: 'meat',
    meat: 'beef',
    ironRich: true,
    nutrients: iron,
    chokingRisk: 'medium',
    chokingNote: 'Shred finely.',
  }),
  food('chicken', {
    category: 'meat',
    animal: 'meat',
    meat: 'poultry',
    ironRich: true,
    nutrients: iron,
    chokingRisk: 'medium',
    chokingNote: 'Shred finely.',
  }),
  food('pork', { category: 'meat', animal: 'meat', meat: 'pork', ironRich: true, nutrients: iron }),
  food('lentils', { category: 'plant_protein', ironRich: true, nutrients: iron }),
  food('infant-oat-cereal', {
    category: 'grain',
    ironRich: true,
    nutrients: iron,
    firstFood: true,
  }),
  food('infant-rice-cereal', { category: 'grain', ironRich: true, nutrients: iron, firming: true }),
  food('egg', {
    category: 'egg',
    animal: 'egg',
    allergens: ['egg'],
    ironRich: true,
    nutrients: iron,
  }),
  food('peanut-butter', {
    category: 'nut_seed',
    allergens: ['peanut'],
    chokingRisk: 'high',
    chokingNote: 'Thin it; never a spoonful or a chunk.',
    serving: AGE_BANDS.map(band => ({ band, forms: ['mixed_in', 'spread'], how: 'Thinned.' })),
  }),
  food('plain-yogurt', { category: 'dairy', animal: 'dairy', allergens: ['milk'] }),
  food('pasta', { category: 'grain', allergens: ['wheat'] }),
  food('pancake', { category: 'grain', allergens: ['wheat', 'egg', 'milk'] }),
  food('tofu', { category: 'plant_protein', allergens: ['soy'], ironRich: true, nutrients: iron }),
  food('tahini', { category: 'nut_seed', allergens: ['sesame'] }),
  food('cashew-butter', {
    category: 'nut_seed',
    allergens: ['cashew'],
    chokingRisk: 'high',
    chokingNote: 'Thin it.',
    serving: AGE_BANDS.map(band => ({ band, forms: ['mixed_in', 'spread'], how: 'Thinned.' })),
  }),
  food('salmon', {
    category: 'fish',
    animal: 'fish',
    allergens: ['fish'],
    chokingRisk: 'medium',
    chokingNote: 'Check for bones.',
  }),
  food('shrimp', {
    category: 'fish',
    animal: 'shellfish',
    allergens: ['shellfish'],
    chokingRisk: 'medium',
    chokingNote: 'Chop finely.',
  }),
  food('honey', { category: 'herb_spice', animal: 'honey', notBeforeMonths: 12 }),
  food('cows-milk-drink', {
    category: 'drink',
    animal: 'dairy',
    allergens: ['milk'],
    notBeforeMonths: 12,
    serving: AGE_BANDS.map(band => ({ band, forms: ['drink'], how: 'Open cup.' })),
  }),
  food('grapes', {
    category: 'fruit',
    chokingRisk: 'high',
    chokingNote: 'Quarter lengthwise.',
    serving: [
      { band: '6-8', forms: ['mashed'], how: 'Quartered and squashed.' },
      { band: '9-11', forms: ['finger'], how: 'Quartered lengthwise.' },
      { band: '12-17', forms: ['finger'], how: 'Quartered lengthwise.' },
      { band: '18-24', forms: ['finger', 'chopped'], how: 'Quartered lengthwise.' },
    ],
  }),
];

export const FIXTURE_BY_ID = new Map(FIXTURE_FOODS.map(f => [f.id, f]));

export const profileOf = (p: Partial<NibbleProfile> = {}): NibbleProfile =>
  NibbleProfile.parse({ stage: 'started', ...p });

let seq = 0;
/** A logged exposure of a fixture food on a day, as `exposuresFrom` would read it. */
export function ate(
  foodId: string,
  day: string,
  response: Exposure['response'] = 'LIKED',
  at = '12:00',
): Exposure {
  const f = FIXTURE_BY_ID.get(foodId);
  if (!f) throw new Error(`no fixture food ${foodId}`);
  seq += 1;
  return {
    activityId: `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`,
    at: `${day}T${at}:00.000Z`,
    day,
    foodId: f.id,
    key: keyForFood(f),
    name: f.name,
    response,
    form: null,
    allergens: f.allergens,
    meal: null,
  };
}
