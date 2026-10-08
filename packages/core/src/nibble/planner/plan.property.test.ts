/**
 * THE SAFETY PROPERTY (spec §15, "Safety test suite"): for thousands of generated profiles,
 * histories, noticed signs, pins and model drafts, no planned day breaks a hard rule.
 *
 * The checks here are written again from the rules' own words, NOT by calling the validator: a
 * bug in `checkItem` must not be able to pass its own test. The generator is a seeded PRNG, so a
 * failure prints a seed that reproduces it exactly.
 */
import { describe, expect, it } from 'vitest';
import { addDays, daysBetween, monthsBetween } from '../days';
import { FIXTURE_BY_ID, FIXTURE_FOODS, ate, profileOf } from '../testing/fixtures';
import {
  ALLERGEN_IDS,
  CULTURAL_RULES,
  type AllergenId,
  type Food,
  type Noticed,
  type PlanMark,
} from '../types';
import type { Exposure } from '../history';
import { buildPlan, type AiDraftItem } from './plan';
import { bandFor } from '../stage';

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TODAY = '2026-10-08';
const RUNS = Number(process.env.SAFETY_RUNS ?? 1500);

function scenario(seed: number) {
  const r = mulberry32(seed);
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(r() * xs.length)] as T;
  const some = <T>(xs: readonly T[], p: number): T[] => xs.filter(() => r() < p);
  const months = 3 + Math.floor(r() * 22);
  const birthDate = addDays(TODAY, -Math.round(months * 30.4 + r() * 25));
  const profile = profileOf({
    stage: pick(['getting_ready', 'started', 'eating_many'] as const),
    ready: r() < 0.85,
    approach: pick(['puree', 'blw', 'mix'] as const),
    diet: pick(['omnivore', 'omnivore', 'vegetarian', 'vegan', 'pescatarian'] as const),
    rules: some(CULTURAL_RULES, 0.12),
    eczema: pick(['none', 'none', 'mild_moderate', 'severe'] as const),
    diagnosed: some(ALLERGEN_IDS, 0.05),
    allergenMode: pick(['early', 'early', 'early', 'pediatrician', 'none'] as const),
    approved: some(ALLERGEN_IDS, 0.3).map(a => ({
      allergen: a,
      from: addDays(TODAY, -5 + Math.floor(r() * 20)),
    })),
    paused: some(ALLERGEN_IDS, 0.08),
    neverServe: some(
      FIXTURE_FOODS.map(f => f.id),
      0.08,
    ),
    mealsPerDay: r() < 0.3 ? 1 + Math.floor(r() * 4) : null,
    holdTexture: r() < 0.2,
  });
  // a history: random foods on random past days, some refused
  const exposures: Exposure[] = [];
  const n = Math.floor(r() * 40);
  for (let i = 0; i < n; i += 1) {
    const f = pick(FIXTURE_FOODS);
    if (f.notBeforeMonths > 6 && r() < 0.9) continue;
    const day = addDays(TODAY, -1 - Math.floor(r() * 60));
    exposures.push(ate(f.id, day, pick(['LOVED', 'LIKED', 'UNSURE', 'DISLIKED', null] as const)));
  }
  exposures.sort((a, b) => a.at.localeCompare(b.at));
  const noticed: Noticed[] =
    r() < 0.25
      ? [
          {
            at: `${addDays(TODAY, -Math.floor(r() * 20))}T10:00:00.000Z`,
            activityId: exposures.length > 0 && r() < 0.5 ? pick(exposures).activityId : null,
            noteId: null,
            foodIds: some(
              FIXTURE_FOODS.map(f => f.id),
              0.1,
            ),
            signs: ['rash'],
            onsetMinutes: null,
            notes: null,
          },
        ]
      : [];
  const marks: PlanMark[] = [];
  for (let i = 0; i < Math.floor(r() * 6); i += 1) {
    marks.push({
      day: addDays(TODAY, Math.floor(r() * 14)),
      meal: pick(['breakfast', 'lunch', 'snack', 'dinner'] as const),
      kind: pick(['pin', 'pin', 'remove', 'skip_day'] as const),
      foodId: pick(FIXTURE_FOODS).id,
    });
  }
  // a food carrying three allergens, pinned or suggested often: the hardest first exposure to get right
  if (r() < 0.4) {
    marks.push({
      day: addDays(TODAY, Math.floor(r() * 14)),
      meal: 'breakfast',
      kind: 'pin',
      foodId: 'pancake',
    });
  }
  const ai: AiDraftItem[] = [];
  if (r() < 0.4)
    ai.push({
      day: addDays(TODAY, Math.floor(r() * 14)),
      meal: 'breakfast',
      foodId: 'pancake',
      note: null,
    });
  for (let i = 0; i < Math.floor(r() * 10); i += 1) {
    ai.push({
      day: addDays(TODAY, Math.floor(r() * 14)),
      meal: pick(['breakfast', 'lunch', 'snack', 'dinner'] as const),
      foodId: pick(FIXTURE_FOODS).id,
      note: 'An idea.',
    });
  }
  return { birthDate, profile, exposures, noticed, marks, ai };
}

/** The allergens of the foods a noticed sign followed. */
function noticedAllergens(n: Noticed, exposures: readonly Exposure[]): Set<AllergenId> {
  const out = new Set<AllergenId>();
  for (const id of n.foodIds) FIXTURE_BY_ID.get(id)?.allergens.forEach(a => out.add(a));
  for (const e of exposures)
    if (e.activityId === n.activityId) e.allergens.forEach(a => out.add(a));
  return out;
}

const dietRefuses = (f: Food, s: ReturnType<typeof scenario>): boolean => {
  const p = s.profile;
  const milk = f.animal === 'dairy' || f.allergens.includes('milk');
  const egg = f.animal === 'egg' || f.allergens.includes('egg');
  const sea =
    ['fish', 'shellfish'].includes(f.animal) ||
    f.allergens.some(a => a === 'fish' || a === 'shellfish');
  if (p.diet === 'vegan' && (f.animal !== 'none' || milk || egg || sea)) return true;
  if (p.diet === 'vegetarian' && sea) return true;
  if (p.rules.includes('jain') && (egg || sea)) return true;
  if (p.diet === 'vegetarian' && ['meat', 'fish', 'shellfish'].includes(f.animal)) return true;
  if (p.diet === 'pescatarian' && f.animal === 'meat') return true;
  if (
    (p.rules.includes('halal') || p.rules.includes('no_pork') || p.rules.includes('kosher')) &&
    f.meat === 'pork'
  )
    return true;
  if (p.rules.includes('no_beef') && f.meat === 'beef') return true;
  if ((p.rules.includes('no_shellfish') || p.rules.includes('kosher')) && f.animal === 'shellfish')
    return true;
  if (
    p.rules.includes('jain') &&
    (f.root || ['meat', 'fish', 'shellfish', 'egg', 'honey'].includes(f.animal))
  )
    return true;
  return false;
};

describe('no generated plan ever breaks a hard rule', () => {
  it(`holds for ${RUNS} generated families`, () => {
    for (let seed = 1; seed <= RUNS; seed += 1) {
      const s = scenario(seed);
      const plan = buildPlan({
        childId: `child-${seed}`,
        birthDate: s.birthDate,
        today: TODAY,
        days: 14,
        profile: s.profile,
        foods: FIXTURE_FOODS,
        exposures: s.exposures,
        noticed: s.noticed,
        marks: s.marks,
        ai: s.ai,
      });
      const fail = (msg: string) => expect.fail(`seed ${seed}: ${msg}`);

      const heldByNotice = new Set<AllergenId>();
      for (const n of s.noticed) noticedAllergens(n, s.exposures).forEach(a => heldByNotice.add(a));
      const noticedDays = s.noticed.map(n => n.at.slice(0, 10));
      const firstAllergenDays: string[] = [];
      const riceDays: string[] = s.exposures
        .filter(e => e.foodId === 'infant-rice-cereal')
        .map(e => e.day);
      // allergens in the record before the plan starts
      const inRecord = new Set<AllergenId>(s.exposures.flatMap(e => e.allergens));
      const firstsInRecord = new Map<AllergenId, string>();
      for (const e of s.exposures) {
        for (const a of e.allergens) if (!firstsInRecord.has(a)) firstsInRecord.set(a, e.day);
      }
      let lastFirst: string | null = [...firstsInRecord.values()].sort().pop() ?? null;

      // every allergen the baby has met: the record, and the plan's own earlier days
      const known = new Set<AllergenId>(inRecord);
      for (const d of plan) {
        const months = monthsBetween(s.birthDate, d.day);
        {
          const metToday = new Set<AllergenId>();
          for (const m of d.meals) {
            for (const i of m.items) {
              const f = FIXTURE_BY_ID.get(i.foodId)!;
              const fresh = f.allergens.filter(a => !known.has(a) && !metToday.has(a));
              if (fresh.length > 1)
                fail(`${d.day}: ${f.id} introduces ${fresh.join(' and ')} at once`);
              if (fresh.length === 1 && i.firstAllergen !== fresh[0]) {
                fail(`${d.day}: ${f.id} introduces ${fresh[0]} without saying so`);
              }
              fresh.forEach(a => metToday.add(a));
            }
          }
          if (metToday.size > 1)
            fail(`${d.day}: ${[...metToday].join(', ')} introduced on one day`);
          metToday.forEach(a => known.add(a));
        }
        const items = d.meals.flatMap(m => m.items.map(i => ({ ...i, meal: m.meal })));
        if (months < 4 && items.length > 0) fail(`solids at ${months} months`);
        if (d.skip && items.length > 0) fail('items on a skipped day');
        const firsts = items.filter(i => i.firstAllergen !== null);
        if (firsts.length > 1) fail(`${d.day}: two new allergens`);
        const newFoods = items.filter(i => i.isNew && i.firstAllergen === null);
        if (new Set(newFoods.map(i => i.foodId)).size > 1) fail(`${d.day}: two new foods`);
        if (firsts.length === 1 && newFoods.length > 0)
          fail(`${d.day}: new allergen beside a new food`);
        for (const i of items) {
          const f = FIXTURE_BY_ID.get(i.foodId);
          if (!f) return fail(`unknown food ${i.foodId}`);
          if (f.notBeforeMonths > months) fail(`${f.id} at ${months} months`);
          if (f.animal === 'honey' && months < 12) fail('honey under 12 months');
          const band = bandFor(months);
          const forms = f.serving.find(x => x.band === band)?.forms ?? [];
          if (!forms.includes(i.form)) fail(`${f.id} as ${i.form} in band ${band}`);
          if (s.profile.neverServe.includes(f.id)) fail(`${f.id} is never served`);
          if (dietRefuses(f, s)) fail(`${f.id} breaks the family's diet`);
          for (const a of f.allergens) {
            if (s.profile.diagnosed.includes(a)) fail(`diagnosed ${a} planned`);
            if (s.profile.paused.includes(a)) fail(`paused ${a} planned`);
            if (heldByNotice.has(a)) fail(`${a} planned after a noticed sign`);
            if (s.profile.allergenMode === 'none' && !inRecord.has(a) && i.firstAllergen === a) {
              fail(`${a} introduced with allergens off`);
            }
          }
        }
        if (firsts.length === 1) {
          const i = firsts[0]!;
          if (i.meal !== d.meals[0]!.meal) fail(`${d.day}: new allergen not at the first meal`);
          if (lastFirst !== null && daysBetween(lastFirst, d.day) < 3)
            fail(`${d.day}: allergens under 3 days apart`);
          for (const nd of noticedDays) {
            if (nd <= d.day && daysBetween(nd, d.day) < 14)
              fail(`${d.day}: new allergen within 14 days of a sign`);
          }
          if (s.profile.allergenMode === 'pediatrician') {
            const ok = s.profile.approved.some(
              a => a.allergen === i.firstAllergen && a.from <= addDays(d.day, -1),
            );
            if (!ok) fail(`${d.day}: ${i.firstAllergen} not approved`);
          }
          if (
            i.firstAllergen === 'peanut' &&
            (s.profile.eczema === 'severe' || s.profile.diagnosed.includes('egg')) &&
            !s.profile.approved.some(a => a.allergen === 'peanut')
          ) {
            fail('peanut introduced without the talk-to-your-doctor step');
          }
          lastFirst = d.day;
          firstAllergenDays.push(d.day);
        }
        for (const i of items) if (i.foodId === 'infant-rice-cereal') riceDays.push(d.day);
        const weekRice = riceDays.filter(x => x <= d.day && daysBetween(x, d.day) <= 6).length;
        if (weekRice > 2) fail(`${d.day}: rice cereal ${weekRice} times in a week`);
        if (s.profile.rules.includes('kosher')) {
          for (const m of d.meals) {
            const animals = m.items.map(i => FIXTURE_BY_ID.get(i.foodId)!.animal);
            if (animals.includes('meat') && animals.includes('dairy'))
              fail(`${d.day}: meat with dairy`);
          }
        }
      }
    }
    // about 10 ms a plan; the default five seconds is for unit tests
  }, 180_000);
});
