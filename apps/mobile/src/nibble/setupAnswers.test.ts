import { NibbleProfile } from '@nibblecue/core/nibble';
import { describe, expect, it } from 'vitest';
import { allergensIn, initialAnswers, profileFromAnswers, stepsFor } from './setupAnswers';

const TODAY = '2026-10-08';
const noLog = { stage: 'getting_ready' as const, firstDay: null, meals: 0, foodIds: [] };

describe('the food setup', () => {
  it('asks nothing under four months, and never asks a not-started family about foods eaten', () => {
    expect(stepsFor(null, 3)).toEqual(['too_young']);
    const notYet = stepsFor('not_yet', 5);
    expect(notYet).toContain('start');
    expect(notYet).not.toContain('tried');
    expect(stepsFor('lots', 9)).toEqual([
      'intro',
      'where',
      'texture',
      'family',
      'tried',
      'allergens',
    ]);
    expect(stepsFor('started', 7)).toContain('approach');
  });

  it('opens on what CuddleCue already logged', () => {
    const a = initialAnswers({
      profile: null,
      log: {
        stage: 'started',
        firstDay: '2026-10-01',
        meals: 3,
        foodIds: ['avocado', 'plain-yogurt'],
      },
      months: 7,
      today: TODAY,
      region: 'UK',
    });
    expect(a.where).toBe('started');
    expect(a.firstTaste).toBe('2026-10-01');
    expect(a.tried).toEqual(['avocado', 'plain-yogurt']);
    expect(a.introduced).toContain('milk');
    expect(a.region).toBe('UK');
  });

  it('makes a not-yet profile that waits for the chosen day, or for the signs', () => {
    const base = initialAnswers({
      profile: null,
      log: noLog,
      months: 5,
      today: TODAY,
      region: 'US',
    });
    const onDay = profileFromAnswers(
      { ...base, where: 'not_yet', start: 'day', startOn: '2026-11-01' },
      null,
      TODAY,
    );
    expect(onDay).toMatchObject({ stage: 'getting_ready', startOn: '2026-11-01', startedOn: null });
    const signs = profileFromAnswers({ ...base, where: 'not_yet', start: 'signs' }, null, TODAY);
    expect(signs).toMatchObject({ startOn: null, ready: false });
    const today = profileFromAnswers({ ...base, where: 'not_yet', start: 'today' }, null, TODAY);
    expect(today.startOn).toBe(TODAY);
  });

  it('maps a family already eating lots by texture, and keeps what setup does not ask', () => {
    const base = NibbleProfile.parse({ stage: 'started', neverServe: ['kale'], mealsPerDay: 3 });
    const a = initialAnswers({ profile: base, log: noLog, months: 10, today: TODAY, region: 'US' });
    const p = profileFromAnswers(
      { ...a, where: 'lots', texture: 'smooth', tried: ['banana'] },
      base,
      TODAY,
    );
    expect(p).toMatchObject({
      stage: 'eating_many',
      approach: 'puree',
      holdTexture: true,
      triedBefore: ['banana'],
    });
    expect(p.neverServe).toEqual(['kale']);
    expect(p.mealsPerDay).toBe(3);
  });

  it('reads allergens out of foods', () => {
    expect(allergensIn(['pancake'])).toEqual(expect.arrayContaining(['egg', 'milk', 'wheat']));
  });
});
