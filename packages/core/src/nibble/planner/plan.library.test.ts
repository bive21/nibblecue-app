/**
 * The same safety property as `plan.property.test.ts`, run over the REAL library (178 foods and
 * growing): the hand-made fixture proves the rules, this proves the data cannot slip past them.
 * The independent checks are the ones that read only the food's own fields.
 */
import { describe, expect, it } from 'vitest';
import { addDays, monthsBetween } from '../days';
import { FOODS, FOOD_BY_ID } from '../foods';
import { bandFor } from '../stage';
import { NibbleProfile, ALLERGEN_IDS } from '../types';
import { buildPlan, planItems } from './plan';
import { exposuresFrom } from '../history';
import { makeMatcher } from '../catalog';

const TODAY = '2026-10-08';

describe('the real library under the planner', () => {
  it('plans only foods the age, the form and the family allow, for a year of ages', () => {
    for (let months = 4; months <= 24; months += 1) {
      for (const diet of ['omnivore', 'vegetarian', 'vegan'] as const) {
        const birthDate = addDays(TODAY, -Math.round(months * 30.44) - 3);
        const profile = NibbleProfile.parse({
          stage: 'started',
          diet,
          startedOn: addDays(TODAY, -30),
        });
        const plan = buildPlan({
          childId: `c-${months}-${diet}`,
          birthDate,
          today: TODAY,
          days: 21,
          profile,
          foods: FOODS,
          exposures: [],
          noticed: [],
          marks: [],
        });
        for (const it of planItems(plan)) {
          const f = FOOD_BY_ID.get(it.foodId)!;
          const m = monthsBetween(birthDate, it.day);
          expect(f.notBeforeMonths, `${f.id} at ${m}`).toBeLessThanOrEqual(m);
          const forms = f.serving.find(s => s.band === bandFor(m))!.forms;
          expect(forms, `${f.id} as ${it.form}`).toContain(it.form);
          if (diet === 'vegan') {
            expect(f.animal, f.id).toBe('none');
            expect(
              f.allergens.filter(a => ['egg', 'milk', 'fish', 'shellfish'].includes(a)),
              f.id,
            ).toEqual([]);
          }
          if (diet === 'vegetarian')
            expect(['meat', 'fish', 'shellfish'], f.id).not.toContain(f.animal);
        }
        if (months >= 6)
          expect(planItems(plan).length, `${months} months ${diet}`).toBeGreaterThan(0);
      }
    }
  }, 120_000);

  it('introduces every allergen over time for an omnivore family that started at six months', () => {
    const birthDate = addDays(TODAY, -Math.round(6 * 30.44) - 3);
    const plan = buildPlan({
      childId: 'all-allergens',
      birthDate,
      today: TODAY,
      days: 90,
      profile: NibbleProfile.parse({ stage: 'started' }),
      foods: FOODS,
      exposures: [],
      noticed: [],
      marks: [],
    });
    const firsts = new Set(
      planItems(plan)
        .map(i => i.firstAllergen)
        .filter(Boolean),
    );
    expect([...firsts].sort()).toEqual([...ALLERGEN_IDS].sort());
  }, 60_000);

  it('reads a meal typed in CuddleCue back as the library food', () => {
    const match = makeMatcher(FOODS);
    const exposures = exposuresFrom(
      [
        {
          id: '00000000-0000-4000-8000-000000000001',
          childId: 'c',
          startAt: '2026-10-01T09:00:00Z',
          items: [{ name: 'Sweet potatoes' }, { name: 'Grandma soup' }],
        },
      ],
      ({ id, name }) => (id ? FOOD_BY_ID.get(id) : undefined) ?? match(name),
    );
    expect(exposures.map(e => e.foodId)).toEqual(['sweet-potato', null]);
    expect(exposures[1]!.key).toBe('name:grandma soup');
  });
});
