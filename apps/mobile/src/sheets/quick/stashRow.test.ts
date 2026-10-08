import { describe, expect, it } from 'vitest';
import { stashRowDetail, STASH_EMPTY } from './stashRow';
import { volumeLabel } from './volume';

const NY = 'America/New_York';

describe('volumeLabel', () => {
  it('reads in the household’s unit with the canonical ml behind it', () => {
    // 120 ml is 4.06 oz: the nearest quarter, as every surface reads it (2026-09-26)
    expect(volumeLabel(120, 'oz')).toBe('4 oz');
    expect(volumeLabel(118, 'oz')).toBe('4 oz');
    expect(volumeLabel(120, 'ml')).toBe('120 mL');
    expect(volumeLabel(1250, 'ml')).toBe('1.25 L');
  });

  /**
   * A QUARTER OUNCE READS AS ITSELF (2026-09-26): 5.25 oz is stored as 155 ml, and says "5.25 oz",
   * not the "5.2 oz" nobody typed — while every amount that could be written before reads as it did.
   */
  it('reads a quarter ounce as the quarter it was entered as, and changes nothing else', () => {
    expect(volumeLabel(155, 'oz')).toBe('5.25 oz');
    expect(volumeLabel(22, 'oz')).toBe('0.75 oz');
    for (let q = 0; q <= 40 * 4; q += 1) {
      const oz = q / 4;
      expect(volumeLabel(Math.round(oz * 29.5735295625), 'oz'), String(oz)).toBe(`${oz} oz`);
    }
    // an ml reader's 110 ml, and a day's total, read on the same grid — the nearest quarter
    // (2026-09-26: one writer, so 7 + 7.25 oz is "14.25 oz" everywhere, never "14.3 oz")
    expect(volumeLabel(110, 'oz')).toBe('3.75 oz');
    expect(volumeLabel(310, 'oz')).toBe('10.5 oz');
    expect(volumeLabel(207 + 214, 'oz')).toBe('14.25 oz');
    expect(volumeLabel(0, 'oz')).toBe('0 oz');
    expect(volumeLabel(155, 'ml')).toBe('155 mL');
  });
});

describe('stashRowDetail — the §6.1 row, verbatim in shape', () => {
  it('names the first container a draw would take: amount, state, date, place', () => {
    expect(
      stashRowDetail(
        {
          amountMl: 118,
          status: 'STORED',
          pumpedAt: '2026-08-20T14:00:00Z',
          firstFrozenAt: '2026-08-22T14:00:00Z',
          locationName: 'Deep freezer',
        },
        'oz',
        NY,
      ),
    ).toBe('Oldest first · 4 oz frozen Aug 22 · Deep freezer');
  });

  it('says fridge for milk that was never frozen, dated by when it was pumped', () => {
    expect(
      stashRowDetail(
        {
          amountMl: 90,
          status: 'STORED',
          pumpedAt: '2026-09-14T02:00:00Z',
          firstFrozenAt: null,
          locationName: null,
        },
        'ml',
        NY,
      ),
    ).toBe('Oldest first · 90 mL fridge Sep 13');
  });

  it('says thawing for a container on the counter', () => {
    expect(
      stashRowDetail(
        {
          amountMl: 150,
          status: 'THAWING',
          pumpedAt: '2026-08-01T00:00:00Z',
          firstFrozenAt: '2026-08-02T00:00:00Z',
          locationName: 'Fridge',
        },
        'ml',
        NY,
      ),
    ).toContain('150 mL thawing Aug 1');
  });

  it('quotes no storage window: guidance comes from the versioned files, not from a row', () => {
    const line = stashRowDetail(
      {
        amountMl: 1,
        status: 'STORED',
        pumpedAt: '2026-09-01T00:00:00Z',
        firstFrozenAt: null,
        locationName: null,
      },
      'oz',
      NY,
    );
    for (const banned of ['use by', 'expires', 'safe', 'hours', 'days', 'months']) {
      expect(line.toLowerCase()).not.toContain(banned);
    }
    expect(STASH_EMPTY.toLowerCase()).not.toContain('error');
  });
});
