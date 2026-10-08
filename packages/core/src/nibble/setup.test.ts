import { describe, expect, it } from 'vitest';
import { addDays } from './days';
import { buildPlan, type PlanInput } from './planner/plan';
import {
  defaultStartChoice,
  nextOffers,
  preAnswerFromLog,
  regionFromLocale,
  setupSummary,
} from './setup';
import { ate, FIXTURE_BY_ID, FIXTURE_FOODS, profileOf } from './testing/fixtures';

const TODAY = '2026-10-08';

describe('pre-answers from the log', () => {
  it('reads no meals as not started, a few as just started, six weeks or twenty foods as lots', () => {
    expect(preAnswerFromLog([], TODAY).stage).toBe('getting_ready');
    const few = [ate('avocado', '2026-10-01'), ate('banana', '2026-10-03')];
    expect(preAnswerFromLog(few, TODAY)).toMatchObject({
      stage: 'started',
      firstDay: '2026-10-01',
      meals: 2,
    });
    expect(preAnswerFromLog(few, TODAY).foodIds.sort()).toEqual(['avocado', 'banana']);
    const old = [ate('avocado', addDays(TODAY, -50))];
    expect(preAnswerFromLog(old, TODAY).stage).toBe('eating_many');
  });

  it('reads the region from the phone, US when it cannot tell', () => {
    expect(regionFromLocale('en-GB')).toBe('UK');
    expect(regionFromLocale('en_CA')).toBe('CA');
    expect(regionFromLocale('en-AU')).toBe('AU');
    expect(regionFromLocale('en-US')).toBe('US');
    expect(regionFromLocale(undefined)).toBe('US');
  });

  it('defaults the start day the way the research says', () => {
    expect(defaultStartChoice(4, 7)).toBe('today');
    expect(defaultStartChoice(2, 5)).toBe('day');
    expect(defaultStartChoice(0, 7)).toBe('signs');
  });
});

const input = (over: Partial<PlanInput> = {}): PlanInput => ({
  childId: 'c',
  birthDate: '2026-03-01',
  today: TODAY,
  days: 14,
  profile: profileOf(),
  foods: FIXTURE_FOODS,
  exposures: [],
  noticed: [],
  marks: [],
  ...over,
});

describe('the setup summary', () => {
  it('reads the first week, the allergen starts and what waits, off the real plan', () => {
    const profile = profileOf({ triedBefore: ['sweet-potato', 'avocado', 'banana'] });
    const plan = buildPlan(input({ profile }));
    const s = setupSummary(plan, profile, 3);
    expect(s.startDay).toBe(TODAY);
    expect(s.firstWeek).toHaveLength(7);
    expect(s.allergenStarts.length).toBeGreaterThan(0);
    for (const a of s.allergenStarts) expect(s.order).not.toContain(a.allergen);
    expect(s.peanutWaits).toBe(false);
    const severe = profileOf({ eczema: 'severe' });
    expect(setupSummary(buildPlan(input({ profile: severe })), severe, 0).peanutWaits).toBe(true);
  });

  it('starts on the planned day, and says nothing about a start when the plan waits', () => {
    const later = profileOf({ stage: 'getting_ready', startOn: '2026-10-11' });
    expect(setupSummary(buildPlan(input({ profile: later })), later, 0).startDay).toBe(
      '2026-10-11',
    );
    const waits = profileOf({ stage: 'getting_ready', ready: false });
    expect(setupSummary(buildPlan(input({ profile: waits })), waits, 0).startDay).toBeNull();
  });
});

describe('when a logged food comes back', () => {
  it('names the next day each food is offered, a refused one on its retry day', () => {
    const base = input({
      exposures: [ate('sweet-potato', '2026-10-01'), ate('avocado', '2026-10-02')],
    });
    const loved = nextOffers(
      base,
      [{ food: FIXTURE_BY_ID.get('avocado')!, response: 'LOVED' }],
      TODAY,
      `${TODAY}T08:00:00.000Z`,
    );
    expect(loved[0]?.day === null || loved[0]!.day > TODAY).toBe(true);
    const refused = nextOffers(
      base,
      [{ food: FIXTURE_BY_ID.get('sweet-potato')!, response: 'DISLIKED' }],
      TODAY,
      `${TODAY}T08:00:00.000Z`,
    );
    if (refused[0]?.day) expect(refused[0].day > TODAY).toBe(true);
  });
});
