import { describe, expect, it } from 'vitest';
import { cardOfTheDay, cardsFor, GUIDANCE } from './guidance';

const base = {
  region: 'US' as const,
  day: '2026-10-08',
  childId: 'c1',
  firstAllergen: false,
  firstFingerFood: false,
  daysSinceStart: 30,
};

describe('the card of the day', () => {
  it('speaks to the day: getting ready, a first allergen, a first finger food', () => {
    expect(cardOfTheDay({ ...base, months: 5, stage: 'getting_ready' })?.trigger).toBe(
      'getting_ready',
    );
    expect(
      cardOfTheDay({ ...base, months: 7, stage: 'expanding', firstAllergen: true })?.trigger,
    ).toBe('first_allergen');
    expect(
      cardOfTheDay({ ...base, months: 8, stage: 'expanding', firstFingerFood: true })?.trigger,
    ).toBe('first_finger_food');
  });

  it('is the same card all day, and only cards for this age and region', () => {
    const a = cardOfTheDay({ ...base, months: 8, stage: 'expanding' });
    const b = cardOfTheDay({ ...base, months: 8, stage: 'expanding' });
    expect(a).toEqual(b);
    for (const c of cardsFor(8, 'US')) {
      expect(c.fromMonths).toBeLessThanOrEqual(8);
      expect(c.toMonths).toBeGreaterThanOrEqual(8);
      expect(c.regions.length === 0 || c.regions.includes('US')).toBe(true);
    }
  });

  it('has a card for every age from four months to two years', () => {
    for (let m = 4; m <= 24; m += 1) {
      expect(cardsFor(m, 'US').length, `${m} months`).toBeGreaterThan(0);
    }
    expect(GUIDANCE.length).toBeGreaterThanOrEqual(20);
  });
});
