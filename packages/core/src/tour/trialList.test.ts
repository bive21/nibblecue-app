import { describe, expect, it } from 'vitest';
import { lineTitle } from '../lists';
import { supplyCategory, supplyLabel } from '../supplies';
import { supplyCreateChain } from '../sync/chains';
import {
  isTrialSupply,
  needsTrialLines,
  needsTrialSupply,
  TRIAL_LINES,
  TRIAL_SUPPLY,
} from './trialList';

describe('the sample the shopping card offers (the owner, 2026-09-25)', () => {
  it('is offered only to a household with nothing in its catalog', () => {
    expect(needsTrialSupply([])).toBe(true);
    expect(needsTrialSupply([{ id: 'd' }])).toBe(false);
  });

  /**
   * NAMED FOR WHAT IT IS, in the card's own words, so the parent finds the thing the card is
   * talking about — and on a shelf every household has, so the list line reads as a line.
   */
  it('is called what the card calls it, on the Diapers shelf, and reads plainly on the list', () => {
    expect(supplyLabel(TRIAL_SUPPLY)).toBe('Sample item');
    expect(supplyCategory(TRIAL_SUPPLY.category).label).toBe('Diapers');
    expect(
      lineTitle({
        id: 'l',
        title: supplyLabel(TRIAL_SUPPLY),
        qty: 1,
        note: null,
        store: null,
        checkedAt: null,
        supplyId: 's',
        categoryLabel: supplyCategory(TRIAL_SUPPLY.category).label,
      }),
    ).toBe('Diapers: Sample item');
  });

  it('is a supply the catalog will take: it has a name', () => {
    expect(() =>
      supplyCreateChain({
        intentId: 'i',
        householdId: 'h',
        createdBy: 'u',
        deviceId: null,
        clientEditedAt: '2026-09-25T12:00:00.000Z',
        supplyId: 's',
        item: TRIAL_SUPPLY,
      }),
    ).not.toThrow();
  });

  /**
   * A THING THE APP MADE UP IS NOT A SUGGESTION (CLAUDE.md §2): nothing a baby is fed and nothing
   * from a medicine shelf, so the sample cannot read as advice about either.
   */
  it('makes up nothing a baby is fed or treated with', () => {
    expect(['FORMULA', 'BOTTLES', 'NIPPLES', 'VITAMINS', 'CREAM', 'NURSING']).not.toContain(
      TRIAL_SUPPLY.category,
    );
    for (const text of [TRIAL_SUPPLY.brand, TRIAL_SUPPLY.product, TRIAL_SUPPLY.notes]) {
      expect(text ?? '').not.toMatch(/formula|milk|bottle|vitamin|cream|medicine|drops|food/i);
    }
  });

  /**
   * IT IS THE TOUR'S TO TAKE BACK ONLY WHILE IT IS STILL THE SAMPLE. A sample the parent renamed or
   * filed on another shelf has become a thing this household buys, and the clean-up keeps it.
   */
  it('knows its own sample, and lets go of one the parent has made theirs', () => {
    expect(isTrialSupply(TRIAL_SUPPLY)).toBe(true);
    expect(isTrialSupply({ ...TRIAL_SUPPLY, product: ' Sample item ' })).toBe(true);
    expect(isTrialSupply({ ...TRIAL_SUPPLY, product: 'Swaddlers' })).toBe(false);
    expect(isTrialSupply({ ...TRIAL_SUPPLY, brand: 'Pampers' })).toBe(false);
    expect(isTrialSupply({ ...TRIAL_SUPPLY, category: 'WIPES' })).toBe(false);
  });
});

describe('the sample lines the shopping card puts on an empty list (the owner, 2026-09-28)', () => {
  /**
   * "Make sure you have trial items in case if user didnt fill it in, so they can share it if they
   * want to." A list with nothing still to buy gets them; one with an open line is the household's.
   */
  it('go on a list with nothing still to buy, and never on one with an open line', () => {
    expect(needsTrialLines([])).toBe(true);
    // a basket of ticked lines sends nothing (`shoppingText` sends what is still to buy)
    expect(needsTrialLines([{ checked_at: '2026-09-28T10:00:00.000Z' }])).toBe(true);
    expect(needsTrialLines([{ checked_at: null }])).toBe(false);
    expect(
      needsTrialLines([{ checked_at: '2026-09-28T10:00:00.000Z' }, { checked_at: null }]),
    ).toBe(false);
  });

  it('are two, each named as a sample, and read plainly on the list and in what Share sends', () => {
    expect(TRIAL_LINES).toHaveLength(2);
    expect(new Set(TRIAL_LINES).size).toBe(2);
    for (const title of TRIAL_LINES) {
      expect(title, title).toMatch(/^Sample [a-z]+$/);
      // a one-off: its title is its line, with no shelf in front of it
      expect(
        lineTitle({
          id: 'l',
          title,
          qty: 1,
          note: null,
          store: null,
          checkedAt: null,
          supplyId: null,
          categoryLabel: null,
        }),
      ).toBe(title);
      // and never the sample supply's own line, which Add supplies still has to put on the list
      expect(title).not.toBe(supplyLabel(TRIAL_SUPPLY));
      expect(title).not.toBe('Diapers: Sample item');
    }
  });

  it('make up nothing a baby is fed or treated with, as the sample supply does not', () => {
    for (const title of TRIAL_LINES) {
      expect(title, title).not.toMatch(
        /formula|milk|bottle|nipple|vitamin|cream|medicine|drops|food|nursing/i,
      );
      // and no dash of any kind: they are words the parent may send to someone
      expect(title, title).not.toMatch(/[-‐‑‒–—―]/);
    }
  });
});
