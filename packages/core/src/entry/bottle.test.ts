import { describe, expect, it } from 'vitest';
import {
  bottleError,
  bottleValid,
  fromLeftover,
  isRefused,
  leftoverError,
  offeredToStore,
} from './bottle';

describe('bottleError — the one relationship that cannot be true (§6.1)', () => {
  it('rejects taken greater than offered, with the spec’s exact words', () => {
    expect(bottleError({ consumedMl: 120, offeredMl: 90 })).toBe(
      'The bottle cannot hold less than the baby took',
    );
  });

  it('accepts offered equal to taken, the common case', () => {
    expect(bottleError({ consumedMl: 120, offeredMl: 120 })).toBeNull();
  });

  it('accepts offered greater than taken', () => {
    expect(bottleError({ consumedMl: 90, offeredMl: 120 })).toBeNull();
  });

  it('accepts "same as taken", which stores no separate offered', () => {
    expect(bottleError({ consumedMl: 120, offeredMl: null })).toBeNull();
  });

  it('rejects a negative amount on either side', () => {
    expect(bottleError({ consumedMl: -1, offeredMl: null })).toBe('Amount cannot be negative');
    expect(bottleError({ consumedMl: 10, offeredMl: -1 })).toBe('Amount cannot be negative');
  });

  it('rejects NaN rather than letting it through as "not less than"', () => {
    // NaN < x is false, so a naive comparison would call this valid and store NaN
    expect(bottleError({ consumedMl: Number.NaN, offeredMl: 120 })).toBe(
      'Amount cannot be negative',
    );
    expect(bottleError({ consumedMl: 120, offeredMl: Number.NaN })).toBe(
      'Amount cannot be negative',
    );
  });
});

describe('the refused bottle is a real feed (D16)', () => {
  it('saves 0 taken against 4 offered', () => {
    const refused = { consumedMl: 0, offeredMl: 118 };
    expect(bottleValid(refused)).toBe(true);
    expect(isRefused(refused)).toBe(true);
  });

  it('is NOT silently swapped into 118 taken — that would be a feed that never happened', () => {
    const refused = { consumedMl: 0, offeredMl: 118 };
    expect(offeredToStore(refused)).toBe(118);
    expect(refused.consumedMl).toBe(0);
  });

  it('does not call 0 offered and 0 taken a refusal — nothing was offered', () => {
    expect(isRefused({ consumedMl: 0, offeredMl: 0 })).toBe(false);
    expect(isRefused({ consumedMl: 0, offeredMl: null })).toBe(false);
  });

  it('does not call a partial feed a refusal', () => {
    expect(isRefused({ consumedMl: 30, offeredMl: 118 })).toBe(false);
  });
});

describe('offeredToStore', () => {
  it('stores the taken amount when the sheet is on "same as taken"', () => {
    // a populated column beats a column plus a fallback everywhere downstream
    expect(offeredToStore({ consumedMl: 118, offeredMl: null })).toBe(118);
  });

  it('stores what was entered when the two differ', () => {
    expect(offeredToStore({ consumedMl: 90, offeredMl: 118 })).toBe(118);
  });
});

/**
 * THE OWNER'S BOTTLE (2026-09-25): 4 oz of breast milk, `Some left`, 1 oz left — refused with
 * "The bottle cannot hold less than the baby took", because the sheet read the 1 oz as the size
 * of the bottle. The sheet now asks for the bottle and the leftover, in that order.
 */
describe('the bottle and what was left in it', () => {
  const OZ = 29.5735;

  it('saves the owner’s bottle: 4 oz made up, 1 oz left, so 3 oz taken', () => {
    const b = { bottleMl: 4 * OZ, leftoverMl: 1 * OZ };
    expect(leftoverError(b)).toBeNull();
    const a = fromLeftover(b);
    expect(a.consumedMl).toBeCloseTo(3 * OZ, 6);
    expect(a.offeredMl).toBeCloseTo(4 * OZ, 6);
    // and what it stores passes the entry's own rule
    expect(bottleError(a)).toBeNull();
    expect(offeredToStore(a)).toBeCloseTo(4 * OZ, 6);
  });

  it('refuses more left than was in the bottle, in words that say which number is wrong', () => {
    expect(leftoverError({ bottleMl: 30, leftoverMl: 120 })).toBe(
      'More is left than was in the bottle',
    );
  });

  it('keeps a finished bottle as "same as taken"', () => {
    expect(leftoverError({ bottleMl: 120, leftoverMl: null })).toBeNull();
    expect(fromLeftover({ bottleMl: 120, leftoverMl: null })).toEqual({
      consumedMl: 120,
      offeredMl: null,
    });
  });

  it('reads all of it left as a refused bottle, which is a real feed (D16)', () => {
    const a = fromLeftover({ bottleMl: 118, leftoverMl: 118 });
    expect(a).toEqual({ consumedMl: 0, offeredMl: 118 });
    expect(bottleValid(a)).toBe(true);
    expect(isRefused(a)).toBe(true);
  });

  it('reads nothing left as the whole bottle taken', () => {
    expect(fromLeftover({ bottleMl: 118, leftoverMl: 0 })).toEqual({
      consumedMl: 118,
      offeredMl: 118,
    });
  });

  it('rejects a negative or unreadable amount on either number', () => {
    expect(leftoverError({ bottleMl: -1, leftoverMl: null })).toBe('Amount cannot be negative');
    expect(leftoverError({ bottleMl: 90, leftoverMl: -1 })).toBe('Amount cannot be negative');
    expect(leftoverError({ bottleMl: Number.NaN, leftoverMl: 10 })).toBe(
      'Amount cannot be negative',
    );
    expect(leftoverError({ bottleMl: 90, leftoverMl: Number.NaN })).toBe(
      'Amount cannot be negative',
    );
  });

  it('never stores a taken amount above the bottle or below zero for any valid pair', () => {
    for (let bottle = 0; bottle <= 300; bottle += 15) {
      for (let left = 0; left <= bottle; left += 15) {
        const a = fromLeftover({ bottleMl: bottle, leftoverMl: left });
        expect(a.consumedMl).toBeGreaterThanOrEqual(0);
        expect(a.consumedMl).toBeLessThanOrEqual(bottle);
        expect(bottleError(a)).toBeNull();
      }
    }
  });
});
