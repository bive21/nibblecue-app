/**
 * The plan-ideas request carries no name, no date of birth and no note, only tokens the server's
 * own check accepts (cuddlecue-app `nibblePlanIdeas.ts` TOKEN), and what comes back is held to
 * the days asked and the ids offered before the planner, and its validator, see any of it.
 */
import {
  allergenStates,
  buildPlan,
  FOODS,
  foodStatuses,
  NibbleProfile,
} from '@nibblecue/core/nibble';
import { describe, expect, it } from 'vitest';
import { memoryStore } from '../prefs';
import {
  ideaCandidates,
  ideasFor,
  ideasFrom,
  ideasRequest,
  keepIdeas,
  loadIdeas,
  type IdeasInput,
} from './planIdeas';

const TOKEN = /^[A-Za-z0-9][A-Za-z0-9_:-]{0,63}$/;
const TODAY = '2026-10-08';
const HOUSEHOLD = 'aaaaaaaa-0000-4000-8000-000000000001';
const CHILD = 'cccccccc-0000-4000-8000-0000000000e1';

function input(): IdeasInput {
  const profile = NibbleProfile.parse({
    stage: 'started',
    startedOn: '2026-09-20',
    neverServe: ['pear'],
  });
  const plan = buildPlan({
    childId: CHILD,
    birthDate: '2026-03-01',
    today: TODAY,
    days: 14,
    profile,
    foods: FOODS,
    exposures: [],
    noticed: [],
    marks: [],
  });
  return {
    householdId: HOUSEHOLD,
    childId: CHILD,
    months: 7,
    stage: plan[0]!.stage,
    profile,
    foods: FOODS,
    statuses: foodStatuses([]),
    allergens: allergenStates({
      profile,
      exposures: [],
      noticed: [],
      foodById: () => undefined,
      today: TODAY,
    }),
    plan,
  };
}

function strings(v: unknown, out: string[] = []): string[] {
  if (typeof v === 'string') out.push(v);
  else if (Array.isArray(v)) v.forEach(x => strings(x, out));
  else if (v && typeof v === 'object') Object.values(v).forEach(x => strings(x, out));
  return out;
}

describe('the plan ideas request', () => {
  it('holds tokens and ids only, at most seven days, and never a refused food or a first allergen', () => {
    const req = ideasRequest(input())!;
    expect(req['household_id']).toBe(HOUSEHOLD);
    expect((req['days'] as unknown[]).length).toBeLessThanOrEqual(7);
    for (const s of strings(req['summary'])) expect(TOKEN.test(s), s).toBe(true);
    const candidates = (req['summary'] as { candidates: string[] }).candidates;
    expect(candidates).not.toContain('pear');
    const byId = new Map(FOODS.map(f => [f.id, f]));
    for (const id of candidates) expect(byId.get(id)?.allergens ?? []).toEqual([]);
    expect(ideaCandidates(input()).every(f => f.notBeforeMonths <= 7)).toBe(true);
  });

  it('keeps only the days asked and the ids offered from an answer', () => {
    const req = ideasRequest(input())!;
    const day = (req['days'] as { day: string }[])[0]!.day;
    const offered = (req['summary'] as { candidates: string[] }).candidates[0]!;
    const items = ideasFrom(
      {
        days: [
          {
            day,
            meals: [
              {
                meal: 'breakfast',
                items: [
                  { foodId: offered, reason: 'More iron this week' },
                  { foodId: 'honey', reason: 'Sweet' },
                ],
              },
            ],
          },
          {
            day: '2030-01-01',
            meals: [{ meal: 'breakfast', items: [{ foodId: offered, reason: 'x' }] }],
          },
        ],
      },
      req,
    );
    expect(items.map(i => [i.day, i.foodId])).toEqual([[day, offered]]);
  });

  it('is kept per baby on this phone, and past days are dropped when read back', async () => {
    const store = memoryStore();
    await keepIdeas(store, CHILD, [
      { day: '2026-10-01', meal: 'breakfast', foodId: 'banana', note: null },
      { day: TODAY, meal: 'dinner', foodId: 'avocado', note: null },
    ]);
    expect(ideasFor(CHILD)).toHaveLength(2);
    const other = 'cccccccc-0000-4000-8000-0000000000e2';
    await store.set(
      `nibble_ideas:${other}`,
      await store.get(`nibble_ideas:${CHILD}`).then(v => v ?? '[]'),
    );
    await loadIdeas(store, other, TODAY);
    expect(ideasFor(other).map(i => i.foodId)).toEqual(['avocado']);
  });
});
