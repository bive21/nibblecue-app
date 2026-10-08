import { describe, expect, it } from 'vitest';
import { aloneIn, CLOSED_HOUSEHOLD_DAYS } from './leave';

describe('leaving a household nobody else is in (0143)', () => {
  it('keeps a closed household for thirty days, the number the confirmation says', () => {
    expect(CLOSED_HOUSEHOLD_DAYS).toBe(30);
  });

  it('is alone only when the live roster is the person asking', () => {
    expect(aloneIn([{ is_self: true }])).toBe(true);
    // somebody else is here now: the household stays open, and the control is not offered
    expect(aloneIn([{ is_self: true }, { is_self: false }])).toBe(false);
    // a roster somebody else's phone read, with this person not in it
    expect(aloneIn([{ is_self: false }])).toBe(false);
    // not read yet, or not readable: nothing is offered on it
    expect(aloneIn([])).toBe(false);
  });
});
