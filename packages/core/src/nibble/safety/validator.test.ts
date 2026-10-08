import { describe, expect, it } from 'vitest';
import { allergenStates } from '../history';
import { FIXTURE_BY_ID, ate, profileOf } from '../testing/fixtures';
import type { Exposure } from '../history';
import type { NibbleProfile, Form, MealName } from '../types';
import { HARD_RULES } from './rules';
import { SOURCE_BY_ID } from '../sources';
import { checkItem, type DaySoFar, type ItemContext } from './validator';

const DAY = '2026-10-08';
const f = (id: string) => FIXTURE_BY_ID.get(id)!;

function ctx(
  over: Partial<ItemContext> & { exposures?: Exposure[]; profile?: NibbleProfile } = {},
): ItemContext {
  const profile = over.profile ?? profileOf();
  const exposures = over.exposures ?? [ate('pear', '2026-10-01'), ate('avocado', '2026-10-02')];
  const tried = new Set(exposures.map(e => e.foodId));
  return {
    day: DAY,
    months: 7,
    band: '6-8',
    meal: 'breakfast',
    firstMeal: 'breakfast',
    profile,
    allergens: allergenStates({
      profile,
      exposures,
      noticed: [],
      foodById: id => FIXTURE_BY_ID.get(id),
      today: '2026-10-07',
    }),
    tried: food => tried.has(food.id),
    skipDay: false,
    lastNewAllergenDay: null,
    lastNoticedDay: null,
    riceCerealThisWeek: 0,
    daySoFar: { items: [] },
    ...over,
  };
}

const rules = (id: string, form: Form, c: ItemContext) =>
  checkItem(f(id), form, c).map(v => v.rule);
const soFar = (
  items: { id: string; meal?: MealName; isNew?: boolean; newAllergens?: string[] }[],
): DaySoFar => ({
  items: items.map(i => ({
    food: f(i.id),
    meal: i.meal ?? 'breakfast',
    isNew: i.isNew ?? false,
    newAllergens: (i.newAllergens ?? []) as never,
  })),
});

describe('each hard rule', () => {
  it('cites only sources the app can show', () => {
    for (const r of HARD_RULES)
      for (const s of r.sources) expect(SOURCE_BY_ID.has(s), `${r.id} → ${s}`).toBe(true);
  });

  it('refuses everything before four months', () => {
    expect(rules('pear', 'puree', ctx({ months: 3 }))).toContain('not_before_4_months');
  });

  it('refuses honey and cow’s milk to drink before twelve months', () => {
    expect(rules('honey', 'mashed', ctx())).toEqual(
      expect.arrayContaining(['not_before_age', 'no_honey_under_12']),
    );
    expect(rules('cows-milk-drink', 'drink', ctx())).toContain('not_before_age');
    expect(rules('honey', 'family', ctx({ months: 13, band: '12-17' }))).toEqual([]);
  });

  it('refuses a high choking risk food in a form its age does not allow', () => {
    expect(rules('grapes', 'finger', ctx())).toContain('choking_form');
    expect(rules('grapes', 'mashed', ctx())).not.toContain('choking_form');
  });

  it('refuses what the family never serves, and what its diet excludes', () => {
    expect(rules('pear', 'puree', ctx({ profile: profileOf({ neverServe: ['pear'] }) }))).toContain(
      'restriction',
    );
    expect(rules('beef', 'puree', ctx({ profile: profileOf({ diet: 'vegetarian' }) }))).toContain(
      'restriction',
    );
    expect(rules('pork', 'puree', ctx({ profile: profileOf({ rules: ['halal'] }) }))).toContain(
      'restriction',
    );
    expect(rules('carrot', 'puree', ctx({ profile: profileOf({ rules: ['jain'] }) }))).toContain(
      'restriction',
    );
  });

  it('refuses a held, diagnosed or unreleased allergen', () => {
    expect(rules('egg', 'mixed_in', ctx({ profile: profileOf({ paused: ['egg'] }) }))).toContain(
      'allergen_held',
    );
    expect(rules('egg', 'mixed_in', ctx({ profile: profileOf({ diagnosed: ['egg'] }) }))).toContain(
      'allergen_held',
    );
    expect(
      rules('egg', 'mixed_in', ctx({ profile: profileOf({ allergenMode: 'none' }) })),
    ).toContain('allergen_not_released');
    expect(
      rules('peanut-butter', 'mixed_in', ctx({ profile: profileOf({ eczema: 'severe' }) })),
    ).toContain('allergen_not_released');
  });

  it('offers a new allergen only alone, first thing, three days after the last and fourteen after a sign', () => {
    expect(rules('egg', 'mixed_in', ctx())).toEqual([]);
    expect(rules('pancake', 'mixed_in', ctx())).toContain('one_new_allergen_a_day');
    expect(rules('egg', 'mixed_in', ctx({ meal: 'dinner' }))).toContain('new_allergen_timing');
    expect(rules('egg', 'mixed_in', ctx({ lastNewAllergenDay: '2026-10-06' }))).toContain(
      'new_allergen_timing',
    );
    expect(rules('egg', 'mixed_in', ctx({ lastNoticedDay: '2026-09-30' }))).toContain(
      'new_allergen_timing',
    );
    expect(
      rules('egg', 'mixed_in', ctx({ daySoFar: soFar([{ id: 'mango', isNew: true }]) })),
    ).toContain('one_new_allergen_a_day');
    expect(
      rules('egg', 'mixed_in', ctx({ daySoFar: soFar([{ id: 'tofu', newAllergens: ['soy'] }]) })),
    ).toContain('one_new_allergen_a_day');
  });

  it('allows one new food a day, and the same food again later that day', () => {
    expect(
      rules('mango', 'puree', ctx({ daySoFar: soFar([{ id: 'broccoli', isNew: true }]) })),
    ).toContain('one_new_food_a_day');
    expect(
      rules(
        'mango',
        'puree',
        ctx({ meal: 'dinner', daySoFar: soFar([{ id: 'mango', isNew: true }]) }),
      ),
    ).toEqual([]);
    // but a first exposure to an allergen happens once
    expect(
      rules(
        'egg',
        'mixed_in',
        ctx({
          meal: 'dinner',
          daySoFar: soFar([{ id: 'egg', isNew: true, newAllergens: ['egg'] }]),
        }),
      ),
    ).toContain('one_new_allergen_a_day');
  });

  it('keeps rice cereal to twice a week', () => {
    const c = ctx({ exposures: [ate('infant-rice-cereal', '2026-10-01')], riceCerealThisWeek: 2 });
    expect(rules('infant-rice-cereal', 'puree', c)).toContain('rotate_grains');
  });

  it('keeps meat and dairy apart for a kosher kitchen', () => {
    const exposures = [
      ate('beef', '2026-10-01'),
      ate('plain-yogurt', '2026-10-02'),
      ate('plain-yogurt', '2026-10-03'),
      ate('plain-yogurt', '2026-10-04'),
    ];
    const c = ctx({
      exposures,
      profile: profileOf({ rules: ['kosher'] }),
      daySoFar: soFar([{ id: 'beef' }]),
    });
    expect(rules('plain-yogurt', 'puree', c)).toContain('kosher_meat_dairy');
  });
});
