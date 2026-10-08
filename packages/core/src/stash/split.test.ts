import { describe, expect, it } from 'vitest';
import { ozToMl } from '../domain/domain-types';
import { mlToVolume, volumeStep, volumeText, volumeToMl, type VolumeUnit } from '../entry/units';
import {
  checkSplitParts,
  combinedPumpedAt,
  evenSplit,
  feedSplit,
  MAX_SPLIT_PARTS,
  maxSplitParts,
  setSplitPart,
  splitPartBounds,
  splitPartTag,
  splitSession,
  splitStepMl,
} from './split';

const total = (parts: readonly number[]): number => parts.reduce((a, b) => a + b, 0);
/** What each container reads as, in the parent's unit: the one writer's words. */
const read = (parts: readonly number[], unit: VolumeUnit = 'oz'): string[] =>
  parts.map(ml => volumeText(ml, unit));

describe('splitting a session conserves the total exactly (acceptance test 11)', () => {
  it('6 oz as 4 + 2 is 118 + 59 = 177 ml, which is ozToMl(6): no rounding loss, no third part', () => {
    const parts = splitSession(ozToMl(6), ozToMl(4));
    expect(parts).toEqual([118, 59]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(ozToMl(6));
    expect(ozToMl(6)).toBe(177);
    // the naive way — two independent conversions — is what the rule prevents
    expect(ozToMl(4) + ozToMl(2)).toBe(177);
  });
  it('keep as one is one part, and a first part equal to the total is also one (11.2, 11.5)', () => {
    expect(splitSession(177, null)).toEqual([177]);
    expect(splitSession(177, 177)).toEqual([177]);
    expect(splitSession(177, 0)).toEqual([177]);
  });
  it('refuses a part outside the session and a session of nothing', () => {
    expect(() => splitSession(177, 200)).toThrow(RangeError);
    expect(() => splitSession(177, -1)).toThrow(RangeError);
    expect(() => splitSession(0, null)).toThrow(RangeError);
    expect(() => splitSession(100.5, null)).toThrow(RangeError);
  });
});

/**
 * THE OWNER, 2026-09-29: *"if user pumps, and the result is 9oz, we have the option to keep in
 * stash but split into 2, what if user wants to split into 3 different bottles, with 2 left in
 * counter (4hours), and 1 in the fridge?"* The arithmetic half: how the session is shared out,
 * what a stepper may do to it, and what the write will take.
 */
describe('splitting a session into several containers (MILK_STASH §2)', () => {
  it('the owner’s 9 oz in three is 3 oz each, and adds up to the session exactly', () => {
    const parts = evenSplit(ozToMl(9), 3, 'oz');
    expect(parts).toEqual([89, 89, 88]);
    expect(read(parts)).toEqual(['3 oz', '3 oz', '3 oz']);
    expect(total(parts)).toBe(ozToMl(9));
  });

  it('rounds each container to the unit’s step, a quarter ounce or five milliliters', () => {
    // 10 oz is 40 quarters: 13 each and one over, and the quarter over goes to the last
    expect(read(evenSplit(ozToMl(10), 3, 'oz'))).toEqual(['3.25 oz', '3.25 oz', '3.5 oz']);
    // 40 quarters in six: four containers get the one more, never one container four more
    expect(read(evenSplit(ozToMl(10), 6, 'oz'))).toEqual([
      '1.5 oz',
      '1.5 oz',
      '1.75 oz',
      '1.75 oz',
      '1.75 oz',
      '1.75 oz',
    ]);
    // milliliters on their own grid, with no ounce anywhere near them
    expect(evenSplit(250, 3, 'ml')).toEqual([80, 85, 85]);
    for (const [ml, n, unit] of [
      [ozToMl(10), 6, 'oz'],
      [ozToMl(7.75), 4, 'oz'],
      [250, 3, 'ml'],
      [415, 6, 'ml'],
    ] as const) {
      const parts = evenSplit(ml, n, unit);
      expect(total(parts), `${ml} ml in ${n}`).toBe(ml);
      // every container but the last is ON the grid: converted once, from a whole number of steps
      for (const p of parts.slice(0, -1)) {
        expect(volumeToMl(mlToVolume(p, unit), unit), `${p} ml`).toBe(p);
      }
      // and no two differ by more than a step as they read
      const steps = parts.map(p => Math.round(mlToVolume(p, unit) / volumeStep(unit)));
      expect(Math.max(...steps) - Math.min(...steps), `${ml} ml in ${n}`).toBeLessThanOrEqual(1);
    }
  });

  it('two containers are what the split in two always gave: the odd quarter in the second', () => {
    expect(evenSplit(ozToMl(6), 2, 'oz')).toEqual([89, 88]);
    expect(read(evenSplit(ozToMl(5.25), 2, 'oz'))).toEqual(['2.5 oz', '2.75 oz']);
    // and one container is the whole session, untouched
    expect(evenSplit(ozToMl(9), 1, 'oz')).toEqual([ozToMl(9)]);
  });

  it('the remainder in ml goes to the last container, so a session off the grid still adds up', () => {
    // 177 ml read in milliliters is 35 fives and 2 ml over
    expect(evenSplit(177, 2, 'ml')).toEqual([85, 92]);
    // 100 ml read in ounces: 3.5 oz on the grid, 100 ml in the containers
    const parts = evenSplit(100, 2, 'oz');
    expect(total(parts)).toBe(100);
    expect(parts.every(p => Number.isInteger(p) && p > 0)).toBe(true);
  });

  it('caps the count at six, and never at more containers than the session has steps', () => {
    expect(MAX_SPLIT_PARTS).toBe(6);
    expect(maxSplitParts(ozToMl(9), 'oz')).toBe(6);
    expect(maxSplitParts(2000, 'ml')).toBe(6);
    // 1 oz is four quarters: four containers, not five
    expect(maxSplitParts(ozToMl(1), 'oz')).toBe(4);
    expect(read(evenSplit(ozToMl(1), 4, 'oz'))).toEqual([
      '0.25 oz',
      '0.25 oz',
      '0.25 oz',
      '0.25 oz',
    ]);
    expect(maxSplitParts(10, 'ml')).toBe(2);
    // a quarter ounce is one container, and so is no session at all
    expect(maxSplitParts(ozToMl(0.25), 'oz')).toBe(1);
    expect(maxSplitParts(0, 'oz')).toBe(1);
    expect(() => evenSplit(ozToMl(9), 7, 'oz')).toThrow(RangeError);
    expect(() => evenSplit(ozToMl(1), 5, 'oz')).toThrow(RangeError);
    expect(() => evenSplit(ozToMl(9), 0, 'oz')).toThrow(RangeError);
    expect(() => evenSplit(0, 1, 'oz')).toThrow(RangeError);
  });

  it('one container set, the last one takes the difference, and the total never moves', () => {
    const three = evenSplit(ozToMl(9), 3, 'oz');
    const four = setSplitPart(three, 0, ozToMl(4), 'oz');
    expect(read(four)).toEqual(['4 oz', '3 oz', '2 oz']);
    expect(four).toEqual([118, 89, 59]);
    expect(total(four)).toBe(ozToMl(9));
    // the second container too, and the first stays where the parent put it
    const less = setSplitPart(four, 1, ozToMl(1), 'oz');
    expect(read(less)).toEqual(['4 oz', '1 oz', '4 oz']);
    expect(total(less)).toBe(ozToMl(9));
    // 11.1, through the new path: 6 oz as 4 + 2 is still 118 + 59
    expect(setSplitPart(evenSplit(ozToMl(6), 2, 'oz'), 0, ozToMl(4), 'oz')).toEqual([118, 59]);
  });

  it('keeps every container at a step or more: a stepper cannot empty the last one or itself', () => {
    const three = evenSplit(ozToMl(9), 3, 'oz');
    expect(splitStepMl('oz')).toBe(7);
    expect(splitStepMl('ml')).toBe(5);
    const bounds = splitPartBounds(three, 0, 'oz');
    // from a quarter, up to what leaves the last container its own quarter
    expect(bounds).toEqual({ minMl: 7, maxMl: 170, min: 0.25, max: 5.75 });
    expect(read(setSplitPart(three, 0, ozToMl(9), 'oz'))).toEqual(['5.75 oz', '3 oz', '0.25 oz']);
    expect(read(setSplitPart(three, 0, 0, 'oz'))).toEqual(['0.25 oz', '3 oz', '5.75 oz']);
    // the stepper's top is on the grid and never converts past the most the container may hold
    for (const [ml, n, unit] of [
      [ozToMl(9), 3, 'oz'],
      [ozToMl(7.75), 5, 'oz'],
      [415, 4, 'ml'],
    ] as const) {
      const parts = evenSplit(ml, n, unit);
      for (let i = 0; i < n - 1; i += 1) {
        const b = splitPartBounds(parts, i, unit);
        expect(volumeToMl(b.max, unit), `${ml} ml, container ${i}`).toBeLessThanOrEqual(b.maxMl);
        expect(Number.isInteger(b.max / volumeStep(unit)), `${b.max} on the grid`).toBe(true);
        const top = setSplitPart(parts, i, volumeToMl(b.max, unit), unit);
        expect(top[n - 1], `${ml} ml, container ${i}`).toBeGreaterThanOrEqual(splitStepMl(unit));
        expect(total(top)).toBe(ml);
      }
    }
    // a session too small to move keeps what it has, and the stepper opens on it
    expect(splitPartBounds(evenSplit(13, 2, 'oz'), 0, 'oz')).toEqual({
      minMl: 7,
      maxMl: 7,
      min: 0.25,
      max: 0.25,
    });
  });

  it('the last container is never set on its own: it holds the rest', () => {
    const three = evenSplit(ozToMl(9), 3, 'oz');
    expect(() => setSplitPart(three, 2, ozToMl(1), 'oz')).toThrow(RangeError);
    expect(() => splitPartBounds(three, 2, 'oz')).toThrow(RangeError);
    expect(() => splitPartBounds([ozToMl(9)], 0, 'oz')).toThrow(RangeError);
  });

  it('the write takes a split only if it adds up to the stored part exactly', () => {
    expect(() => checkSplitParts(266, [89, 89, 88])).not.toThrow();
    expect(() => checkSplitParts(266, [266])).not.toThrow();
    // a millilitre short, or over: the household total would move by something else
    expect(() => checkSplitParts(266, [89, 89, 87])).toThrow(RangeError);
    expect(() => checkSplitParts(266, [89, 89, 89])).toThrow(RangeError);
    // a container of nothing, a part of a milliliter, and none at all
    expect(() => checkSplitParts(266, [0, 177, 89])).toThrow(RangeError);
    expect(() => checkSplitParts(266, [88.5, 88.5, 89])).toThrow(RangeError);
    expect(() => checkSplitParts(266, [])).toThrow(RangeError);
    // and no more than six, whatever they add up to
    expect(() => checkSplitParts(70, [10, 10, 10, 10, 10, 10, 10])).toThrow(RangeError);
    expect(() => checkSplitParts(60, [10, 10, 10, 10, 10, 10])).not.toThrow();
  });

  it('letters its containers a to f, the first two as the split in two always did', () => {
    expect([0, 1, 2, 3, 4, 5].map(splitPartTag)).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
    expect(() => splitPartTag(6)).toThrow(RangeError);
    expect(() => splitPartTag(-1)).toThrow(RangeError);
  });
});

describe('feed some now (§6d)', () => {
  it('zero feeds nothing and stores it all; the total feeds it all and stores nothing', () => {
    expect(feedSplit(148, 0)).toEqual({ feedMl: 0, storeMl: 148 });
    expect(feedSplit(148, 148)).toEqual({ feedMl: 148, storeMl: 0 });
    expect(feedSplit(148, 74)).toEqual({ feedMl: 74, storeMl: 74 });
    expect(() => feedSplit(148, 149)).toThrow(RangeError);
  });
});

describe('combining sessions (§6e)', () => {
  it('keeps the EARLIER pumped_at, whichever order the two arrive in', () => {
    const early = '2026-06-12T08:00:00.000Z';
    const late = '2026-06-12T11:00:00.000Z';
    expect(combinedPumpedAt(early, late)).toBe(early);
    expect(combinedPumpedAt(late, early)).toBe(early);
  });
});
