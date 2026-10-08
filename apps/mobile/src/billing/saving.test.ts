/**
 * The annual plan's saving against twelve months of the monthly one (`saving.ts`; the owner,
 * 2026-09-26: *"do the 6.99x12 price = $83.88 (scribbled) $59.00, then save x% off"*). The rule is
 * the store's numbers or nothing: the struck figure is the store's own string, the percentage is
 * floored, and anything missing, mixed or not a real saving says nothing at all.
 */
import { PACKAGES } from '@nibblecue/core';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { annualSaving } from './saving';
import type { StoreProduct } from './types';

const monthly = (over: Partial<StoreProduct> = {}): StoreProduct => ({
  id: 'plus_monthly',
  period: 'MONTH',
  priceLabel: '$6.99',
  amount: 6.99,
  currency: 'USD',
  perMonthLabel: null,
  perYearLabel: '$83.88',
  introDays: null,
  introOffer: null,
  preselected: false,
  ...over,
});
const annual = (over: Partial<StoreProduct> = {}): StoreProduct => ({
  id: 'plus_annual',
  period: 'YEAR',
  priceLabel: '$59.00',
  amount: 59,
  currency: 'USD',
  perMonthLabel: '$4.92',
  perYearLabel: null,
  introDays: null,
  introOffer: null,
  preselected: true,
  ...over,
});

describe('the saving, when there is one', () => {
  it('is twelve months at the monthly price, struck, and the whole percent saved, floored', () => {
    // 83.88 − 59.00 = 24.88, which is 29.66% of 83.88: "Save 29%", never 30
    expect(annualSaving([annual(), monthly()])).toEqual({
      monthlyId: 'plus_monthly',
      annualId: 'plus_annual',
      wasLabel: '$83.88',
      percent: 29,
    });
  });

  it('does not care which order the shelf is in', () => {
    expect(annualSaving([monthly(), annual()])?.percent).toBe(29);
  });

  it('strikes the store’s own string, in the store’s own format, and formats nothing itself', () => {
    const euro = annualSaving([
      annual({ priceLabel: '59,00 €', amount: 59, currency: 'EUR' }),
      monthly({ priceLabel: '6,99 €', amount: 6.99, currency: 'EUR', perYearLabel: '83,88 €' }),
    ]);
    expect(euro?.wasLabel).toBe('83,88 €');
    // a currency with no minor unit, and a figure with a grouping separator the app never builds
    const yen = annualSaving([
      annual({ priceLabel: '¥7,800', amount: 7800, currency: 'JPY' }),
      monthly({ priceLabel: '¥900', amount: 900, currency: 'JPY', perYearLabel: '¥10,800' }),
    ]);
    // 10 800 − 7 800 = 3 000, 27.77…% → 27
    expect(yen).toEqual({
      monthlyId: 'plus_monthly',
      annualId: 'plus_annual',
      wasLabel: '¥10,800',
      percent: 27,
    });
  });

  it('floors an exact percentage to itself, not one below through a float', () => {
    // 5 × 12 = 60 and 48 is 80% of it: in floats 1 − 48/60 is 0.19999999999999996
    expect(
      annualSaving([annual({ amount: 48 }), monthly({ amount: 5, perYearLabel: '$60.00' })])
        ?.percent,
    ).toBe(20);
    // 12 × 6.99 in floats is 83.88000000000001; whole millionths keep it 83.88
    expect(annualSaving([annual({ amount: 41.94 }), monthly({ amount: 6.99 })])?.percent).toBe(50);
  });

  it('compares the regular prices when the monthly plan gives its second month free (SUBSCRIPTIONS.md §3c)', () => {
    // the offer is said once, in its own line under the monthly price; the struck figure and the
    // percent stay the regular yearly price against twelve regular months, so neither moves with it
    const plain = annualSaving([annual(), monthly()]);
    expect(plain?.percent).toBe(29);
    const free = { kind: 'secondMonthFree', thenLabel: '$6.99' } as const;
    expect(annualSaving([annual(), monthly({ introOffer: free })])).toEqual(plain);
    // and no other introductory offer, on either plan, makes the annual look better or worse
    const stretch = {
      kind: 'firstStretch',
      priceLabel: '$0.99',
      months: 1,
      thenLabel: '$6.99',
    } as const;
    expect(
      annualSaving([annual({ introOffer: stretch }), monthly({ introOffer: stretch })]),
    ).toEqual(plain);
  });

  it('matches the target the owner priced, from the config the store consoles are set from', () => {
    // pricing.config.json says 29.7% off; the screen says the floor of it
    const config = JSON.parse(
      readFileSync(
        join(
          __dirname,
          '..',
          '..',
          '..',
          '..',
          'packages',
          'core',
          'src',
          'plan',
          'pricing.config.json',
        ),
        'utf8',
      ),
    ) as { packages: { period: string; discount_vs_monthly_pct?: number }[] };
    const stated = config.packages.find(p => p.period === 'P1Y')?.discount_vs_monthly_pct;
    const year = PACKAGES.find(p => p.period === 'P1Y');
    const month = PACKAGES.find(p => p.period === 'P1M');
    if (stated === undefined || year === undefined || month === undefined)
      throw new Error('the config lost a plan');
    const got = annualSaving([
      annual({ amount: year.target_price_usd }),
      monthly({ amount: month.target_price_usd }),
    ]);
    expect(got?.percent).toBe(Math.floor(stated));
  });
});

describe('the saving says nothing rather than something wrong', () => {
  it('without both plans on the shelf', () => {
    expect(annualSaving([])).toBeNull();
    expect(annualSaving([annual()])).toBeNull();
    expect(annualSaving([monthly()])).toBeNull();
  });

  it('without an amount for either, or with one that is not a price', () => {
    expect(annualSaving([annual({ amount: null }), monthly()])).toBeNull();
    expect(annualSaving([annual(), monthly({ amount: null })])).toBeNull();
    expect(annualSaving([annual({ amount: 0 }), monthly()])).toBeNull();
    expect(annualSaving([annual(), monthly({ amount: -6.99 })])).toBeNull();
    expect(annualSaving([annual({ amount: Number.NaN }), monthly()])).toBeNull();
    expect(annualSaving([annual(), monthly({ amount: Number.POSITIVE_INFINITY })])).toBeNull();
  });

  it('without the store’s own figure to strike', () => {
    expect(annualSaving([annual(), monthly({ perYearLabel: null })])).toBeNull();
    expect(annualSaving([annual(), monthly({ perYearLabel: '  ' })])).toBeNull();
  });

  it('across two currencies, or with one it does not know', () => {
    expect(annualSaving([annual({ currency: 'EUR' }), monthly()])).toBeNull();
    expect(annualSaving([annual({ currency: null }), monthly()])).toBeNull();
    expect(annualSaving([annual(), monthly({ currency: null })])).toBeNull();
    // the same code in another case is the same currency
    expect(annualSaving([annual({ currency: 'usd' }), monthly()])?.percent).toBe(29);
  });

  it('when the annual plan saves nothing, costs more, or saves less than one whole percent', () => {
    // exactly twelve months
    expect(annualSaving([annual({ amount: 83.88 }), monthly()])).toBeNull();
    // more than twelve months
    expect(annualSaving([annual({ amount: 99 }), monthly()])).toBeNull();
    // 83.50 of 83.88 is 0.45% off: a real cent, not a saving worth a line
    expect(annualSaving([annual({ amount: 83.5 }), monthly()])).toBeNull();
    // and one whole percent is the least it says
    expect(annualSaving([annual({ amount: 83.04 }), monthly()])?.percent).toBe(1);
  });
});

describe('the rule lives in one place', () => {
  const read = (f: string) => readFileSync(join(__dirname, f), 'utf8');

  it('is the only reader of `amount` in the billing code the screens draw', () => {
    // the panel asks the function; it does no sum of its own, and parses no price string
    const panel = read('SubscribePanel.tsx');
    expect(panel).toContain('annualSaving(billing.products)');
    expect(panel).not.toMatch(/\.amount\b/);
    expect(panel).not.toMatch(/parseFloat|parseInt|Number\(/);
    expect(panel).not.toMatch(/Intl\.NumberFormat/);
  });
});
