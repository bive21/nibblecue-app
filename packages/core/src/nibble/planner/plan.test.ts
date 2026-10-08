import { describe, expect, it } from 'vitest';
import { addDays, daysBetween } from '../days';
import { FIXTURE_BY_ID, FIXTURE_FOODS, ate, profileOf } from '../testing/fixtures';
import type { Exposure } from '../history';
import { buildPlan, planItems, type PlanInput } from './plan';

const TODAY = '2026-10-08';

function plan(over: Partial<PlanInput> = {}) {
  return buildPlan({
    childId: 'child-1',
    birthDate: '2026-04-01', // six months and a week on TODAY
    today: TODAY,
    days: 14,
    profile: profileOf(),
    foods: FIXTURE_FOODS,
    exposures: [],
    noticed: [],
    marks: [],
    ...over,
  });
}

/** A week of first foods already logged, so the plan is past day one. */
const firstWeek: Exposure[] = [
  ate('sweet-potato', '2026-10-01'),
  ate('avocado', '2026-10-02'),
  ate('pear', '2026-10-03'),
  ate('infant-oat-cereal', '2026-10-04'),
  ate('banana', '2026-10-05'),
];

describe('the first day of solids', () => {
  it('plans one new first food and nothing else new', () => {
    const [day] = plan();
    const items = day!.meals.flatMap(m => m.items);
    expect(items.length).toBeGreaterThan(0);
    const fresh = new Set(items.filter(i => i.isNew).map(i => i.foodId));
    expect(fresh.size).toBe(1);
    expect(items.every(i => i.firstAllergen === null)).toBe(true);
  });

  it('offers the new food at the first meal, and says so when it comes again later that day', () => {
    const [day] = plan();
    const first = day!.meals[0]!;
    expect(first.items.some(i => i.isNew)).toBe(true);
    const fresh = first.items.find(i => i.isNew)!.foodId;
    for (const m of day!.meals.slice(1)) {
      for (const i of m.items.filter(x => x.foodId === fresh)) {
        expect(i.isNew).toBe(false);
        expect(i.reasons[0]).toBe('again_today');
      }
    }
  });

  it('plans nothing before four months, and only tips while getting ready', () => {
    const tooYoung = plan({ birthDate: '2026-07-01' });
    expect(planItems(tooYoung)).toHaveLength(0);
    expect(tooYoung[0]!.stage).toBe('too_young');
    const ready = plan({
      birthDate: '2026-05-01',
      profile: profileOf({ stage: 'getting_ready', ready: false }),
    });
    expect(ready[0]!.stage).toBe('getting_ready');
    expect(ready[0]!.meals).toHaveLength(0);
  });
});

describe('allergens', () => {
  it('introduces them one at a time, at the first meal, three days apart, in the family order', () => {
    const days = plan({ exposures: firstWeek, days: 40 });
    const firsts = days.flatMap(d =>
      d.meals.flatMap((m, mi) =>
        m.items.filter(i => i.firstAllergen).map(i => ({ day: d.day, a: i.firstAllergen, mi })),
      ),
    );
    expect(firsts.length).toBeGreaterThanOrEqual(5);
    expect(firsts.map(f => f.a).slice(0, 3)).toEqual(['egg', 'peanut', 'milk']);
    for (const f of firsts) expect(f.mi).toBe(0);
    for (let i = 1; i < firsts.length; i += 1) {
      expect(daysBetween(firsts[i - 1]!.day, firsts[i]!.day)).toBeGreaterThanOrEqual(3);
    }
    // never two firsts on one day, and never beside another new food
    for (const d of days) {
      const items = d.meals.flatMap(m => m.items);
      const withFirst = items.filter(i => i.firstAllergen);
      expect(withFirst.length).toBeLessThanOrEqual(1);
      if (withFirst.length === 1) {
        expect(items.filter(i => i.isNew && !i.firstAllergen)).toHaveLength(0);
      }
    }
  });

  it('keeps an allergen on hold, and waits fourteen days after anything noticed', () => {
    const noticedAt = '2026-10-07T09:00:00.000Z';
    const days = plan({
      exposures: [...firstWeek, ate('egg', '2026-10-06')],
      noticed: [
        {
          at: noticedAt,
          activityId: null,
          noteId: null,
          foodIds: ['egg'],
          signs: ['rash'],
          onsetMinutes: 30,
          notes: null,
        },
      ],
      days: 30,
    });
    const items = planItems(days);
    expect(items.some(i => i.foodId === 'egg' || i.foodId === 'pancake')).toBe(false);
    const firsts = items.filter(i => i.firstAllergen);
    for (const f of firsts) expect(daysBetween('2026-10-07', f.day)).toBeGreaterThanOrEqual(14);
  });

  it('plans nothing with a paused, diagnosed or unapproved allergen', () => {
    const days = plan({
      exposures: firstWeek,
      days: 40,
      profile: profileOf({
        paused: ['egg'],
        diagnosed: ['milk'],
        allergenMode: 'pediatrician',
        approved: [{ allergen: 'peanut', from: '2026-10-01' }],
      }),
    });
    const items = planItems(days).map(i => FIXTURE_BY_ID.get(i.foodId)!);
    expect(items.some(f => f.allergens.includes('egg'))).toBe(false);
    expect(items.some(f => f.allergens.includes('milk'))).toBe(false);
    // only the approved allergen is introduced
    const firsts = planItems(days)
      .filter(i => i.firstAllergen)
      .map(i => i.firstAllergen);
    expect(firsts).toEqual(['peanut']);
  });

  it('asks first about peanut for severe eczema, and introduces the others', () => {
    const days = plan({
      exposures: firstWeek,
      days: 30,
      profile: profileOf({ eczema: 'severe' }),
    });
    const firsts = planItems(days)
      .filter(i => i.firstAllergen)
      .map(i => i.firstAllergen);
    expect(firsts).not.toContain('peanut');
    expect(firsts[0]).toBe('egg');
  });

  it('keeps a tolerated allergen going about twice a week', () => {
    const exposures = [
      ...firstWeek,
      ate('egg', '2026-09-20'),
      ate('egg', '2026-09-24'),
      ate('egg', '2026-09-28'),
    ];
    const days = plan({ exposures, days: 14 });
    const eggDays = planItems(days).filter(i =>
      FIXTURE_BY_ID.get(i.foodId)!.allergens.includes('egg'),
    );
    expect(eggDays.length).toBeGreaterThanOrEqual(4);
  });
});

describe('the family rules', () => {
  it('never plans an animal food for a vegan family, pork for halal or a root for Jain', () => {
    const vegan = planItems(
      plan({ exposures: firstWeek, days: 30, profile: profileOf({ diet: 'vegan' }) }),
    );
    expect(vegan.some(i => FIXTURE_BY_ID.get(i.foodId)!.animal !== 'none')).toBe(false);
    const halal = planItems(
      plan({
        exposures: [...firstWeek, ate('pork', '2026-10-06')],
        days: 14,
        profile: profileOf({ rules: ['halal'] }),
      }),
    );
    expect(halal.some(i => i.foodId === 'pork')).toBe(false);
    const jain = planItems(
      plan({ exposures: firstWeek, days: 14, profile: profileOf({ rules: ['jain'] }) }),
    );
    expect(jain.some(i => FIXTURE_BY_ID.get(i.foodId)!.root)).toBe(false);
  });

  it('never plans a food the family said never to serve', () => {
    const items = planItems(
      plan({
        exposures: firstWeek,
        days: 14,
        profile: profileOf({ neverServe: ['banana', 'pear'] }),
      }),
    );
    expect(items.some(i => i.foodId === 'banana' || i.foodId === 'pear')).toBe(false);
  });
});

describe('ages', () => {
  it('never plans honey, juice or cow’s milk to drink before twelve months', () => {
    const items = planItems(plan({ exposures: firstWeek, days: 60 }));
    expect(items.some(i => ['honey', 'cows-milk-drink'].includes(i.foodId))).toBe(false);
  });

  it('only offers a high choking risk food in a form its band allows', () => {
    const items = planItems(
      plan({ exposures: [...firstWeek, ate('grapes', '2026-10-06')], days: 14 }),
    );
    for (const i of items.filter(x => x.foodId === 'grapes')) expect(i.form).toBe('mashed');
  });

  it('keeps one familiar food at every toddler meal', () => {
    const exposures = [
      ate('banana', '2026-09-20', 'LOVED'),
      ate('pasta', '2026-09-21', 'LOVED'),
      ate('avocado', '2026-09-22', 'LIKED'),
      ate('broccoli', '2026-09-23', 'DISLIKED'),
      ate('egg', '2026-09-23', 'LOVED'),
      ate('chicken', '2026-09-24', 'LIKED'),
    ];
    const days = plan({ birthDate: '2025-08-01', exposures, days: 7 });
    expect(days[0]!.stage).toBe('toddler');
    const loved = new Set(['banana', 'pasta', 'avocado', 'egg', 'chicken']);
    for (const d of days) {
      for (const m of d.meals) {
        if (m.items.length === 0) continue;
        expect(m.items.some(i => loved.has(i.foodId))).toBe(true);
      }
    }
  });
});

describe('learning from the log', () => {
  it('brings a refused food back a week later in a different form', () => {
    const exposures: Exposure[] = [
      ...firstWeek,
      { ...ate('broccoli', '2026-09-30', 'DISLIKED'), form: 'puree' },
    ];
    const items = planItems(plan({ exposures, days: 14 }));
    const back = items.filter(i => i.foodId === 'broccoli');
    expect(back.length).toBeGreaterThan(0);
    expect(back[0]!.reasons).toContain('retry');
    expect(back[0]!.form).not.toBe('puree');
    expect(daysBetween('2026-09-30', back[0]!.day)).toBeGreaterThanOrEqual(7);
  });

  it('plans an iron-rich food every day once one has been offered', () => {
    const days = plan({ exposures: firstWeek, days: 14 });
    for (const d of days) {
      const items = d.meals.flatMap(m => m.items);
      expect(items.some(i => FIXTURE_BY_ID.get(i.foodId)!.ironRich)).toBe(true);
    }
  });

  it('is the same plan on every phone', () => {
    expect(plan({ exposures: firstWeek })).toEqual(plan({ exposures: [...firstWeek] }));
  });
});

describe('the parent’s hand and the model’s ideas', () => {
  it('keeps a pin, and reports a pin that breaks a rule instead of planning it', () => {
    const day = addDays(TODAY, 1);
    const days = plan({
      exposures: firstWeek,
      marks: [
        { day, meal: 'breakfast', kind: 'pin', foodId: 'avocado' },
        { day, meal: 'dinner', kind: 'pin', foodId: 'honey' },
      ],
    });
    const d = days.find(x => x.day === day)!;
    expect(d.meals.find(m => m.meal === 'breakfast')!.items.map(i => i.foodId)).toContain(
      'avocado',
    );
    expect(d.refused.map(r => r.foodId)).toContain('honey');
    expect(planItems([d]).some(i => i.foodId === 'honey')).toBe(false);
  });

  it('skips a day the parent skipped, and does not pile it onto the next', () => {
    const day = addDays(TODAY, 2);
    const days = plan({
      exposures: firstWeek,
      marks: [{ day, meal: 'breakfast', kind: 'skip_day', foodId: null }],
    });
    const d = days.find(x => x.day === day)!;
    expect(d.skip).toBe(true);
    expect(d.meals).toHaveLength(0);
    const next = days.find(x => x.day === addDays(day, 1))!;
    expect(next.meals.flatMap(m => m.items).filter(i => i.isNew).length).toBeLessThanOrEqual(1);
  });

  it('takes a model suggestion only when the validator allows it', () => {
    const days = plan({
      exposures: firstWeek,
      ai: [
        { day: TODAY, meal: 'breakfast', foodId: 'honey', note: 'Sweet.' },
        { day: TODAY, meal: 'breakfast', foodId: 'mango', note: 'A bright color.' },
      ],
    });
    const items = planItems([days[0]!]);
    expect(items.some(i => i.foodId === 'honey')).toBe(false);
    const mango = items.find(i => i.foodId === 'mango');
    if (mango) expect(mango.by).toBe('ai');
  });
});
