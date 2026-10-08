import { describe, expect, it } from 'vitest';
import { careCountForAll, careDay, careDayLine, careStripVisible } from './care';

/*
  The strip's cell builder (`careCells`, with its `due` flag) and its tests went on 2026-09-27: it
  lost its last caller on 2026-09-16, and a module's due or missed state on Today is
  `quickAlertFor`'s (`apps/mobile/src/screens/today/nextCard.test.ts` holds that).
*/
describe('the care strip', () => {
  it('renders nothing when a household tracks none of its modules', () => {
    expect(careStripVisible([])).toBe(false);
    expect(careStripVisible(['bath'])).toBe(true);
  });
});

describe('careDay — the day’s own plan against the day’s own log', () => {
  it('adds the reminder times up and the entries beside them', () => {
    const day = careDay([
      { reminders: 3, today: 1 },
      { reminders: 1, today: 1 },
    ]);
    expect(day).toEqual({ target: 4, done: 2 });
    expect(careDayLine(day)).toBe('2 of 4');
  });

  it('leaves an item with no reminders out of both sides: it asked for no plan', () => {
    expect(careDay([{ reminders: 0, today: 5 }])).toEqual({ target: 0, done: 0 });
    expect(careDayLine({ target: 0, done: 0 })).toBeNull();
  });

  it('says what happened rather than correcting it: a fourth application reads 4 of 3', () => {
    const day = careDay([{ reminders: 3, today: 4 }]);
    expect(careDayLine(day)).toBe('4 of 3');
  });

  it('is short enough for a tile line at every count the sheet allows', () => {
    for (let n = 1; n <= 4; n += 1) {
      expect(careDayLine({ target: n, done: 0 })?.length).toBeLessThanOrEqual(12);
    }
  });

  /**
   * TWINS ON "BOTH" (the audit of 2026-09-24): an item's reminders are one baby's plan, and the
   * two babies' entries added against it read "2 of 1". Each baby now carries the plan.
   */
  it('reads several babies against a plan each, never their entries added against one', () => {
    // one vitamin a day, both twins given it
    expect(careDay([{ reminders: 1, today: 2, perChild: [1, 1] }])).toEqual({
      target: 2,
      done: 2,
    });
    // only one of them so far: short, and saying so
    const half = careDay([{ reminders: 1, today: 1, perChild: [1, 0] }]);
    expect(careDayLine(half)).toBe('1 of 2');
    // a baby given a fourth is still what happened
    expect(careDayLine(careDay([{ reminders: 3, today: 0, perChild: [4, 3] }]))).toBe('7 of 6');
    // an empty per-child list is no babies at all: the item's own count stands
    expect(careDay([{ reminders: 2, today: 1, perChild: [] }])).toEqual({ target: 2, done: 1 });
  });

  it('gives one number for several babies only as the count every one of them has reached', () => {
    expect(careCountForAll([1, 1])).toBe(1);
    // Ada had it and Liam has not: never "1 of 1" for the pair
    expect(careCountForAll([1, 0])).toBe(0);
    expect(careCountForAll([3])).toBe(3);
    expect(careCountForAll([])).toBe(0);
    // fed through the old two-field shape, a pair given once each is 1 of 1 — not 2 of 1
    const day = careDay([{ reminders: 1, today: careCountForAll([1, 1]) }]);
    expect(careDayLine(day)).toBe('1 of 1');
  });
});
