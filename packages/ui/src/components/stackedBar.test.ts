import { describe, expect, it } from 'vitest';
import { barShares, MIN_SHARE } from './stackedBar';

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe('a stacked bar’s shares', () => {
  it('are the plain proportions when every segment is big enough', () => {
    expect(barShares([25, 25, 50])).toEqual([0.25, 0.25, 0.5]);
    expect(sum(barShares([25, 25, 50]))).toBeCloseTo(1, 10);
  });

  /**
   * THE SMALLEST SEGMENT IS STILL A SHAPE. The stash's counter holds 1.5 oz of 184.5 — eight
   * tenths of a percent, which across a phone's width is under three points and reads as the gap
   * beside it. The floor is paid for by the largest segment, so the bar still adds to one and
   * its last rounded end stays inside the track.
   */
  it('lifts a sliver to the floor and charges the biggest segment for it', () => {
    const shares = barShares([1.5, 9, 26, 148]);
    expect(shares[0]).toBe(MIN_SHARE);
    expect(sum(shares)).toBeCloseTo(1, 10);
    // and the order is still the order given: the bar reads warm to cool
    expect(shares[1]).toBeLessThan(shares[2]!);
    expect(shares[2]).toBeLessThan(shares[3]!);
  });

  it('never lifts a segment that is not there at all', () => {
    const shares = barShares([0, 10, 0, 90]);
    expect(shares[0]).toBe(0);
    expect(shares[2]).toBe(0);
    expect(sum(shares)).toBeCloseTo(1, 10);
  });

  it('draws nothing for an empty stash, rather than a full bar of one color', () => {
    expect(barShares([])).toEqual([]);
    expect(barShares([0, 0])).toEqual([0, 0]);
  });

  it('treats a nonsense value as nothing rather than as infinity', () => {
    const shares = barShares([Number.NaN, 10, -5, 30]);
    expect(shares[0]).toBe(0);
    expect(shares[2]).toBe(0);
    expect(sum(shares)).toBeCloseTo(1, 10);
  });
});
