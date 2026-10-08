/**
 * The real store, through RevenueCat, against a fake SDK (`revenuecat.ts`, `revenuecatMap.ts`;
 * docs/SUBSCRIPTIONS.md §1–§3c, §7–§8). What the paywall is shown, the monthly plan's second month
 * free included, what each answer from the store becomes, who RevenueCat is told is buying, and
 * how long a purchase waits for the server. The server half, from the webhook to the household's
 * plan, is supabase/functions/_shared/revenuecat.test.ts and
 * packages/db/src/integration/store-events.test.ts.
 */
import { BRAND } from '@nibblecue/brand';
import { PLUS_ENTITLEMENT, type PlanRowInput } from '@nibblecue/core';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readEnv } from '../env';
import { BILLING } from './copy';
import { RevenueCatBillingProvider, type RcSdk } from './revenuecat';
import { annualSaving } from './saving';
import {
  FIRST_SUBSCRIPTION_TAG,
  INTRO_ELIGIBLE,
  SETTLE_STEPS,
  outcomeFromError,
  productsFrom,
  settle,
  storeKey,
  storePlusArrived,
  type RcCustomerInfo,
  type RcOption,
  type RcPackage,
  type RcPeriod,
  type RcPhase,
  type RcPrice,
  type RcProduct,
  type Shelf,
} from './revenuecatMap';

const ADA = 'aaaaaaaa-0000-4000-8000-00000000000a';
const BEN = 'bbbbbbbb-0000-4000-8000-00000000000b';

const product = (identifier: string, over: Partial<RcProduct> = {}): RcProduct => ({
  identifier,
  price: 9.99,
  currencyCode: 'USD',
  priceString: '$9.99',
  pricePerMonthString: null,
  pricePerYearString: null,
  subscriptionPeriod: 'P1M',
  introPrice: null,
  defaultOption: null,
  subscriptionOptions: null,
  ...over,
});
const pkg = (identifier: string, p: RcProduct): RcPackage => ({ identifier, product: p });

/** A Google Play subscription option: a base plan, or an offer on one. */
const option = (over: Partial<RcOption> = {}): RcOption => ({
  tags: [],
  freePhase: null,
  introPhase: null,
  fullPricePhase: null,
  ...over,
});
/** A Google Play price: the store's own string and its amount in micros, in euros unless said. */
const eur = (formatted: string, amountMicros: number, currencyCode = 'EUR'): RcPrice => ({
  formatted,
  amountMicros,
  currencyCode,
});
const MONTHLY_PRICE = eur('6,99 €', 6_990_000);
const YEARLY_PRICE = eur('59,00 €', 59_000_000);
const MONTH: RcPeriod = { unit: 'MONTH', value: 1 };
const TWO_MONTHS: RcPeriod = { unit: 'MONTH', value: 2 };
/** A first stretch Google charges once: the console's "single payment". */
const once = (price: RcPrice, billingPeriod: RcPeriod = TWO_MONTHS): RcPhase => ({
  billingPeriod,
  recurrenceMode: 3,
  billingCycleCount: null,
  price,
});
/** A price charged `count` periods running: the console's "discounted recurring payment". */
const times = (price: RcPrice, count: number, billingPeriod: RcPeriod = MONTH): RcPhase => ({
  billingPeriod,
  recurrenceMode: 2,
  billingCycleCount: count,
  price,
});
/** The phase that repeats until canceled: a base plan's own price. */
const full = (price: RcPrice) => ({ price });

/** As Google Play reports the two plans: a base plan in the id, and a free phase it offers this person. */
const PLAY_ANNUAL = pkg(
  '$rc_annual',
  product('nibble_plus_annual:annual-autorenew', {
    price: 59,
    currencyCode: 'EUR',
    priceString: '59,00 €',
    pricePerMonthString: '4,92 €',
    pricePerYearString: '59,00 €',
    subscriptionPeriod: 'P1Y',
    defaultOption: option({
      freePhase: { billingPeriod: { unit: 'DAY', value: 14 } },
      fullPricePhase: full(YEARLY_PRICE),
    }),
  }),
);
const PLAY_MONTHLY = pkg(
  '$rc_monthly',
  product('nibble_plus_monthly:monthly-autorenew', {
    price: 6.99,
    currencyCode: 'EUR',
    priceString: '6,99 €',
    pricePerMonthString: '6,99 €',
    pricePerYearString: '83,88 €',
    defaultOption: option({
      freePhase: { billingPeriod: { unit: 'WEEK', value: 2 } },
      fullPricePhase: full(MONTHLY_PRICE),
    }),
  }),
);

const plusInfo = (on: boolean): RcCustomerInfo => ({
  entitlements: { active: on ? { [PLUS_ENTITLEMENT]: { identifier: PLUS_ENTITLEMENT } } : {} },
});

describe('the offering, as the paywall shows it', () => {
  it('is the two plans, annual first and selected, at the store’s own strings', () => {
    const { products, packages } = productsFrom(
      { availablePackages: [PLAY_MONTHLY, PLAY_ANNUAL] },
      () => false,
    );
    expect(products).toEqual([
      {
        id: 'nibble_plus_annual',
        period: 'YEAR',
        priceLabel: '59,00 €',
        amount: 59,
        currency: 'EUR',
        perMonthLabel: '4,92 €', // the store's figure, never one divided out here
        perYearLabel: null, // a yearly price is already a year
        introDays: 14,
        introOffer: null, // no introductory offer in this console
        preselected: true,
      },
      {
        id: 'nibble_plus_monthly',
        period: 'MONTH',
        priceLabel: '6,99 €',
        amount: 6.99,
        currency: 'EUR',
        perMonthLabel: null, // a monthly price is already a month
        perYearLabel: '83,88 €', // the store's own twelve months, struck beside the annual
        introDays: 14,
        introOffer: null,
        preselected: false,
      },
    ]);
    expect(packages.get('nibble_plus_annual')).toBe(PLAY_ANNUAL);
  });

  it('hands the saving the SDK’s own numbers, and the store’s own string to strike', () => {
    const { products } = productsFrom(
      { availablePackages: [PLAY_MONTHLY, PLAY_ANNUAL] },
      () => false,
    );
    // 12 × 6.99 = 83.88; 59 / 83.88 leaves 29.66% — floored, never rounded up to 30
    expect(annualSaving(products)).toEqual({
      monthlyId: 'nibble_plus_monthly',
      annualId: 'nibble_plus_annual',
      wasLabel: '83,88 €',
      percent: 29,
    });
    // the store gave no figure to strike: nothing is said, and nothing is formatted here instead
    const bare = pkg(
      '$rc_monthly',
      product('nibble_plus_monthly:monthly-autorenew', { price: 6.99, currencyCode: 'EUR' }),
    );
    expect(
      annualSaving(productsFrom({ availablePackages: [bare, PLAY_ANNUAL] }, () => false).products),
    ).toBeNull();
  });

  it('leaves out a product this app does not sell, and a second copy of one it does', () => {
    const { products } = productsFrom(
      {
        availablePackages: [
          pkg('$rc_lifetime', product('something_else')),
          PLAY_MONTHLY,
          pkg('$rc_monthly_again', product('nibble_plus_monthly')),
        ],
      },
      () => false,
    );
    expect(products.map(p => p.id)).toEqual(['nibble_plus_monthly']);
    // exactly one opens selected, even when the store is missing the one the config picks
    expect(products[0]?.preselected).toBe(true);
  });

  it('says a trial only when the store offers it to this person', () => {
    // Play: no free phase on the default option means this person is not offered one
    const noTrial = pkg(
      '$rc_annual',
      product('nibble_plus_annual:annual-autorenew', { subscriptionPeriod: 'P1Y' }),
    );
    expect(
      productsFrom({ availablePackages: [noTrial] }, () => true).products[0]?.introDays,
    ).toBeNull();

    // App Store: the intro offer is listed to everybody, so it counts only when Apple says ELIGIBLE
    const apple = pkg(
      '$rc_annual',
      product('nibble_plus_annual', {
        subscriptionPeriod: 'P1Y',
        introPrice: {
          price: 0,
          priceString: '$0.00',
          cycles: 1,
          periodUnit: 'WEEK',
          periodNumberOfUnits: 2,
        },
      }),
    );
    expect(productsFrom({ availablePackages: [apple] }, () => true).products[0]?.introDays).toBe(
      14,
    );
    expect(
      productsFrom({ availablePackages: [apple] }, () => false).products[0]?.introDays,
    ).toBeNull();
    // a free trial is a trial, never an introductory price
    expect(
      productsFrom({ availablePackages: [apple] }, () => true).products[0]?.introOffer,
    ).toBeNull();

    // a paid introductory price is not a free trial, and a free month is not a count of days
    const paidIntro = pkg(
      '$rc_annual',
      product('nibble_plus_annual', {
        introPrice: {
          price: 0.99,
          priceString: '$0.99',
          cycles: 1,
          periodUnit: 'WEEK',
          periodNumberOfUnits: 1,
        },
      }),
    );
    const freeMonth = pkg(
      '$rc_annual',
      product('nibble_plus_annual', {
        introPrice: {
          price: 0,
          priceString: '$0.00',
          cycles: 1,
          periodUnit: 'MONTH',
          periodNumberOfUnits: 1,
        },
      }),
    );
    expect(
      productsFrom({ availablePackages: [paidIntro] }, () => true).products[0]?.introDays,
    ).toBeNull();
    expect(
      productsFrom({ availablePackages: [freeMonth] }, () => true).products[0]?.introDays,
    ).toBeNull();
  });

  it('is nothing at all when the store has no current offering', () => {
    expect(productsFrom(null, () => true).products).toEqual([]);
  });
});

/* ------------------------------------------- the monthly plan's second month free (§3c) */

/** The monthly base plan on Google Play: nothing but its own price. */
const MONTHLY_BASE = option({ fullPricePhase: full(MONTHLY_PRICE) });
/**
 * THE FIRST-SUBSCRIPTION OFFER as the Play Console carries it: eligibility "new customer
 * acquisition", so Google lists it only to a customer who may take it; `rc-ignore-offer`, so
 * RevenueCat never makes it the default; our tag. One payment of the monthly price for two months.
 */
const SECOND_MONTH_FREE = option({
  tags: ['rc-ignore-offer', FIRST_SUBSCRIPTION_TAG],
  introPhase: once(MONTHLY_PRICE),
  fullPricePhase: full(MONTHLY_PRICE),
});
/** The monthly plan as Google Play lists it, with whatever offers Google lists this customer. */
const monthlyWith = (...offers: RcOption[]): RcPackage =>
  pkg(
    '$rc_monthly',
    product('nibble_plus_monthly:monthly-autorenew', {
      price: 6.99,
      currencyCode: 'EUR',
      priceString: '6,99 €',
      pricePerMonthString: '6,99 €',
      pricePerYearString: '83,88 €',
      defaultOption: MONTHLY_BASE,
      subscriptionOptions: [MONTHLY_BASE, ...offers],
    }),
  );
const ANNUAL_BASE = option({ fullPricePhase: full(YEARLY_PRICE) });
const PLAY_ANNUAL_PLAIN = pkg(
  '$rc_annual',
  product('nibble_plus_annual:annual-autorenew', {
    price: 59,
    currencyCode: 'EUR',
    priceString: '59,00 €',
    pricePerMonthString: '4,92 €',
    pricePerYearString: '59,00 €',
    subscriptionPeriod: 'P1Y',
    defaultOption: ANNUAL_BASE,
    subscriptionOptions: [ANNUAL_BASE],
  }),
);
const shelfOf = (monthly: RcPackage) =>
  productsFrom({ availablePackages: [PLAY_ANNUAL_PLAIN, monthly] }, () => false);
const monthlyOf = (shelf: Shelf) => shelf.products.find(p => p.id === 'nibble_plus_monthly');

describe('the monthly plan’s second month free (docs/SUBSCRIPTIONS.md §3c)', () => {
  it('on Google Play, is the tagged offer: two months for one monthly payment, said and sold', () => {
    const shelf = shelfOf(monthlyWith(SECOND_MONTH_FREE));
    expect(monthlyOf(shelf)?.introOffer).toEqual({
      kind: 'secondMonthFree',
      thenLabel: '6,99 €', // what the offer renews at, as Google formatted it
    });
    // the line under the price, the one figure the store's own string
    expect(BILLING.secondMonthFree('6,99 €', BILLING.perMonth)).toBe(
      'Second month free, then 6,99 € a month',
    );
    // and what the purchase will be: that offer by name, not the package's default
    expect(shelf.offers.get('nibble_plus_monthly')).toBe(SECOND_MONTH_FREE);
    // the yearly plan carries no offer, and is bought as its package
    expect(shelf.products.find(p => p.id === 'nibble_plus_annual')?.introOffer).toBeNull();
    expect(shelf.offers.has('nibble_plus_annual')).toBe(false);
  });

  it('on Google Play, needs no plan to decide who: Google lists it only to a customer who may take it', () => {
    // someone who had a subscription before is not listed the offer, and the base plan is sold,
    // exactly as before the offer existed; the preview has nothing to do with it
    const none = shelfOf(monthlyWith());
    expect(monthlyOf(none)?.introOffer).toBeNull();
    expect(none.offers.size).toBe(0);
    // and the mapper is handed the store's offering and its eligibility, and no plan at all
    expect(productsFrom.length).toBe(2);
  });

  it('on Google Play, says "Second month free" only when the one payment is exactly one regular month', () => {
    const tagged = (introPhase: RcPhase, over: Partial<RcOption> = {}) =>
      option({
        tags: [FIRST_SUBSCRIPTION_TAG],
        introPhase,
        fullPricePhase: full(MONTHLY_PRICE),
        ...over,
      });
    const cases: [string, RcOption, string | null][] = [
      ['one payment of the monthly price for two months', tagged(once(MONTHLY_PRICE)), 'free'],
      ['two months for less than a month', tagged(once(eur('4,99 €', 4_990_000))), '2'],
      ['a different amount by a single micro', tagged(once(eur('6,99 €', 6_990_001))), '2'],
      ['the same figure in another currency', tagged(once(eur('6,99 $', 6_990_000, 'USD'))), '2'],
      ['one month for less', tagged(once(eur('0,99 €', 990_000), MONTH)), '1'],
      [
        'three months for one payment',
        tagged(once(MONTHLY_PRICE, { unit: 'MONTH', value: 3 })),
        '3',
      ],
      // several payments are a price a month the line does not say, and it is not sold
      ['two discounted payments', tagged(times(eur('3,49 €', 3_490_000), 2)), null],
      [
        'weeks, which are not months',
        tagged(once(MONTHLY_PRICE, { unit: 'WEEK', value: 8 })),
        null,
      ],
      ['a mode Google did not say', tagged({ ...once(MONTHLY_PRICE), recurrenceMode: null }), null],
      [
        'free days as well: half the deal is not said',
        tagged(once(MONTHLY_PRICE), { freePhase: { billingPeriod: { unit: 'DAY', value: 7 } } }),
        null,
      ],
      [
        'an offer without our tag',
        option({ tags: ['rc-ignore-offer'], introPhase: once(MONTHLY_PRICE) }),
        null,
      ],
    ];
    for (const [what, offer, said] of cases) {
      const shelf = shelfOf(monthlyWith(offer));
      const intro = monthlyOf(shelf)?.introOffer ?? null;
      const got =
        intro === null ? null : intro.kind === 'secondMonthFree' ? 'free' : String(intro.months);
      expect(got, what).toBe(said);
      // sold exactly when said
      expect(shelf.offers.has('nibble_plus_monthly'), what).toBe(said !== null);
    }
    // a stretch that is not one month's price is said with its own price and length
    const less = monthlyOf(shelfOf(monthlyWith(tagged(once(eur('4,99 €', 4_990_000))))));
    expect(less?.introOffer).toEqual({
      kind: 'firstStretch',
      priceLabel: '4,99 €',
      months: 2,
      thenLabel: '6,99 €',
    });
    expect(BILLING.introOffer(2, '4,99 €', '6,99 €', BILLING.perMonth)).toBe(
      'First 2 months 4,99 €, then 6,99 € a month',
    );
  });

  it('on Google Play, is never "Second month free" on the yearly plan, whatever its amounts', () => {
    const yearly = option({
      tags: [FIRST_SUBSCRIPTION_TAG],
      introPhase: once(YEARLY_PRICE),
      fullPricePhase: full(YEARLY_PRICE),
    });
    const shelf = productsFrom(
      {
        availablePackages: [
          pkg(
            '$rc_annual',
            product('nibble_plus_annual:annual-autorenew', {
              price: 59,
              priceString: '59,00 €',
              subscriptionPeriod: 'P1Y',
              defaultOption: ANNUAL_BASE,
              subscriptionOptions: [ANNUAL_BASE, yearly],
            }),
          ),
        ],
      },
      () => false,
    );
    expect(shelf.products[0]?.introOffer).toEqual({
      kind: 'firstStretch',
      priceLabel: '59,00 €',
      months: 2,
      thenLabel: '59,00 €',
    });
  });

  it('on Google Play, says the default option’s own terms, because buying the package buys it', () => {
    // a console that left `rc-ignore-offer` off: RevenueCat may make the offer the default, and
    // then the package IS the offer. The paywall says what the sheet will charge
    const untagged = option({
      introPhase: once(MONTHLY_PRICE),
      fullPricePhase: full(MONTHLY_PRICE),
    });
    const shelf = productsFrom(
      {
        availablePackages: [
          pkg(
            '$rc_monthly',
            product('nibble_plus_monthly:monthly-autorenew', {
              price: 6.99,
              priceString: '6,99 €',
              defaultOption: untagged,
              subscriptionOptions: [MONTHLY_BASE, untagged],
            }),
          ),
        ],
      },
      () => false,
    );
    expect(shelf.products[0]?.introOffer).toEqual({ kind: 'secondMonthFree', thenLabel: '6,99 €' });
    // bought as the package, which is that default
    expect(shelf.offers.size).toBe(0);
  });

  it('on the App Store, is the introductory offer, said whenever Apple says eligible', () => {
    const apple = (introPrice: RcProduct['introPrice']) =>
      pkg(
        '$rc_monthly',
        product('nibble_plus_monthly', {
          price: 6.99,
          priceString: '$6.99',
          subscriptionPeriod: 'P1M',
          introPrice,
        }),
      );
    const upFront = apple({
      price: 6.99,
      priceString: '$6.99',
      cycles: 1,
      periodUnit: 'MONTH',
      periodNumberOfUnits: 2,
    });
    // StoreKit applies it to any eligible new subscriber, whatever the app shows: so it is said
    // for everyone Apple says may take it, and bought as the package, as always
    const eligible = productsFrom({ availablePackages: [upFront] }, () => true);
    expect(eligible.products[0]?.introOffer).toEqual({
      kind: 'secondMonthFree',
      thenLabel: '$6.99',
    });
    expect(eligible.products[0]?.introDays).toBeNull();
    expect(eligible.offers.size).toBe(0);
    // unknown, or used up, is not yes
    expect(
      productsFrom({ availablePackages: [upFront] }, () => false).products[0]?.introOffer,
    ).toBeNull();

    const said = (introPrice: RcProduct['introPrice']) =>
      productsFrom({ availablePackages: [apple(introPrice)] }, () => true).products[0]
        ?.introOffer ?? null;
    // two months up front for less than a month is said with its price
    expect(
      said({
        price: 4.99,
        priceString: '$4.99',
        cycles: 1,
        periodUnit: 'MONTH',
        periodNumberOfUnits: 2,
      }),
    ).toEqual({ kind: 'firstStretch', priceLabel: '$4.99', months: 2, thenLabel: '$6.99' });
    // two payments of a month ("pay as you go") are not one payment, and not said
    expect(
      said({
        price: 6.99,
        priceString: '$6.99',
        cycles: 2,
        periodUnit: 'MONTH',
        periodNumberOfUnits: 1,
      }),
    ).toBeNull();
    // a price that is not a price is not said either
    expect(
      said({
        price: Number.NaN,
        priceString: '',
        cycles: 1,
        periodUnit: 'MONTH',
        periodNumberOfUnits: 2,
      }),
    ).toBeNull();
  });

  it('keeps a free trial exactly as it was, on either store', () => {
    // Play: a free phase on the default option
    const trial = productsFrom({ availablePackages: [PLAY_ANNUAL] }, () => false);
    expect(trial.products[0]?.introDays).toBe(14);
    expect(trial.products[0]?.introOffer).toBeNull();
    expect(trial.offers.size).toBe(0);
  });

  it('leaves the saving honest: the regular prices against each other, whatever the offer', () => {
    const offered = shelfOf(monthlyWith(SECOND_MONTH_FREE));
    // the monthly row's own figures are the regular ones: the SDK's price, not the offer's
    expect(monthlyOf(offered)).toMatchObject({ priceLabel: '6,99 €', amount: 6.99 });
    // 12 × 6.99 = 83.88 against 59: 29%, with the offer on the shelf or not
    expect(annualSaving(offered.products)).toEqual({
      monthlyId: 'nibble_plus_monthly',
      annualId: 'nibble_plus_annual',
      wasLabel: '83,88 €',
      percent: 29,
    });
    expect(annualSaving(offered.products)).toEqual(annualSaving(shelfOf(monthlyWith()).products));
  });
});

describe('what the store said, as what happened to the request', () => {
  it('backing out is cancelled, which the screens answer with silence', () => {
    expect(outcomeFromError({ code: '1', userCancelled: true })).toEqual({ kind: 'cancelled' });
    expect(outcomeFromError({ code: '1' })).toEqual({ kind: 'cancelled' });
    expect(outcomeFromError({ code: '2', userCancelled: true })).toEqual({ kind: 'cancelled' });
  });

  it('a payment the store has not settled is pending; one already bought is already', () => {
    expect(outcomeFromError({ code: '20' })).toEqual({ kind: 'pending' });
    expect(outcomeFromError({ code: '6' })).toEqual({ kind: 'already' });
  });

  it('a store set up wrong is unavailable; everything else failed, and nothing was charged', () => {
    expect(outcomeFromError({ code: '23' }).kind).toBe('unavailable');
    expect(outcomeFromError({ code: '11' }).kind).toBe('unavailable');
    expect(outcomeFromError({ code: '10' })).toEqual({ kind: 'failed', why: 'offline' });
    expect(outcomeFromError(new Error('boom'))).toEqual({ kind: 'failed', why: 'unexpected' });
    expect(outcomeFromError(null)).toEqual({ kind: 'failed', why: 'unexpected' });
  });
});

describe('whether the server has heard', () => {
  const at = Date.parse('2026-10-01T12:00:00Z');
  const row = (over: Partial<PlanRowInput>): PlanRowInput => ({
    status: 'ACTIVE',
    source: 'store',
    current_period_end: '2026-11-01T12:00:00Z',
    ...over,
  });

  it('is Plus from something other than the welcome preview', () => {
    expect(storePlusArrived(row({}), at)).toBe(true);
    expect(storePlusArrived(row({ source: 'promo' }), at)).toBe(true);
    expect(storePlusArrived(row({ status: 'CANCELLED_AT_PERIOD_END' }), at)).toBe(true);
    // the welcome is Plus too, and exactly what a purchase has not arrived as yet
    expect(storePlusArrived(row({ source: 'welcome' }), at)).toBe(false);
    expect(storePlusArrived(row({ status: 'EXPIRED' }), at)).toBe(false);
    expect(storePlusArrived(null, at)).toBe(false);
  });

  it('waits a few seconds for the account to show it, asking the server twice, then says "not yet"', async () => {
    const log: string[] = [];
    let reads = 0;
    const deps = (arriveOnRead: number | null) => ({
      sync: async () => {
        log.push('sync');
        throw new Error('offline'); // a sync that fails is not the end of it
      },
      read: async () => {
        reads += 1;
        log.push(`read${reads}`);
        return {
          entitlement:
            arriveOnRead !== null && reads >= arriveOnRead ? row({}) : row({ source: 'welcome' }),
          serverNow: at,
        };
      },
      sleep: async (ms: number) => {
        log.push(`wait${ms}`);
      },
    });

    expect(await settle(deps(1))).toBe(true);
    expect(log).toEqual(['sync', 'read1']);

    log.length = 0;
    reads = 0;
    expect(await settle(deps(3))).toBe(true);
    expect(log).toEqual(['sync', 'read1', 'wait2000', 'read2', 'wait4000', 'sync', 'read3']);

    log.length = 0;
    reads = 0;
    expect(await settle(deps(null))).toBe(false);
    expect(reads).toBe(SETTLE_STEPS.length);
  });
});

/* ------------------------------------------------------------------ the provider, on a fake SDK */

interface FakeSdk extends RcSdk {
  calls: string[];
}

function fakeSdk(over: Partial<RcSdk> = {}): FakeSdk {
  const calls: string[] = [];
  const sdk: FakeSdk = {
    calls,
    configure: config => {
      calls.push(
        `configure:${config.appUserID}:${String(config.automaticDeviceIdentifierCollectionEnabled)}`,
      );
    },
    logIn: async id => {
      calls.push(`logIn:${id}`);
      return {};
    },
    getOfferings: async () => {
      calls.push('getOfferings');
      return { current: { availablePackages: [PLAY_ANNUAL, PLAY_MONTHLY] } };
    },
    purchasePackage: async p => {
      calls.push(`purchase:${p.product.identifier}`);
      return { customerInfo: plusInfo(true) };
    },
    purchaseSubscriptionOption: async o => {
      calls.push(`purchaseOffer:${o.tags.join(',')}`);
      return { customerInfo: plusInfo(true) };
    },
    restorePurchases: async () => {
      calls.push('restore');
      return plusInfo(true);
    },
    getCustomerInfo: async () => plusInfo(false),
    presentCodeRedemptionSheet: async () => {
      calls.push('codeSheet');
    },
    checkTrialOrIntroductoryPriceEligibility: async ids => {
      calls.push('eligibility');
      return Object.fromEntries(ids.map(id => [id, { status: INTRO_ELIGIBLE }]));
    },
    ...over,
  };
  return sdk;
}

function provider(
  sdk: RcSdk,
  opts: { platform?: 'ios' | 'android'; who?: () => string | null } = {},
) {
  const opened: string[] = [];
  const p = new RevenueCatBillingProvider({
    sdk,
    apiKey: 'goog_test',
    platform: opts.platform ?? 'android',
    who: opts.who ?? (() => ADA),
    openUrl: async url => {
      opened.push(url);
    },
  });
  return { p, opened };
}

describe('who RevenueCat is told is buying', () => {
  it('is the account: configured once, switched with logIn, never anonymous and never logged out', async () => {
    const sdk = fakeSdk();
    const { p } = provider(sdk);
    await Promise.all([p.identify(ADA), p.identify(ADA)]);
    await p.identify(ADA);
    await p.identify(BEN);
    // nothing about the device beyond what a purchase needs
    expect(sdk.calls).toEqual([`configure:${ADA}:false`, `logIn:${BEN}`]);
    expect(sdk).not.toHaveProperty('logOut');
  });

  it('with nobody signed in, sells nothing and asks the store nothing', async () => {
    const sdk = fakeSdk();
    const { p } = provider(sdk, { who: () => null });
    expect(await p.products()).toEqual([]);
    expect(await p.purchase('nibble_plus_annual')).toEqual({ kind: 'failed', why: 'no account' });
    expect(sdk.calls).toEqual([]);
  });
});

describe('buying and restoring', () => {
  it('buys the package the paywall showed, as the person signed in', async () => {
    const sdk = fakeSdk();
    const { p } = provider(sdk);
    expect((await p.products()).map(x => x.id)).toEqual([
      'nibble_plus_annual',
      'nibble_plus_monthly',
    ]);
    expect(await p.purchase('nibble_plus_annual')).toEqual({ kind: 'purchased' });
    expect(sdk.calls).toEqual([
      `configure:${ADA}:false`,
      'getOfferings',
      'purchase:nibble_plus_annual:annual-autorenew',
    ]);
  });

  it('a purchase the store took but has not turned into Plus yet is pending, not purchased', async () => {
    const { p } = provider(
      fakeSdk({ purchasePackage: async () => ({ customerInfo: plusInfo(false) }) }),
    );
    expect(await p.purchase('nibble_plus_monthly')).toEqual({ kind: 'pending' });
  });

  it('backing out of the store’s sheet is cancelled', async () => {
    const { p } = provider(
      fakeSdk({
        purchasePackage: async () => {
          throw { code: '1', userCancelled: true, message: 'Purchase was cancelled.' };
        },
      }),
    );
    expect(await p.purchase('nibble_plus_monthly')).toEqual({ kind: 'cancelled' });
  });

  it('a product that is not on the shelf is refused before the store is asked', async () => {
    const sdk = fakeSdk();
    const { p } = provider(sdk);
    expect(await p.purchase('something_else')).toEqual({ kind: 'failed', why: 'unknown product' });
    expect(sdk.calls.some(c => c.startsWith('purchase:'))).toBe(false);
  });

  it('restore finds Plus, or says there was nothing, and never throws', async () => {
    expect(await provider(fakeSdk()).p.restore()).toEqual({ kind: 'already' });
    expect(
      await provider(fakeSdk({ restorePurchases: async () => plusInfo(false) })).p.restore(),
    ).toEqual({ kind: 'nothing' });
    expect(
      await provider(
        fakeSdk({
          restorePurchases: async () => {
            throw { code: '10' };
          },
        }),
      ).p.restore(),
    ).toEqual({ kind: 'failed', why: 'offline' });
  });

  it('an offering that cannot be read is an empty paywall, never a crash, and is asked again', async () => {
    let fail = true;
    const sdk = fakeSdk({
      getOfferings: async () => {
        if (fail) throw new Error('offline');
        return { current: { availablePackages: [PLAY_MONTHLY] } };
      },
    });
    const { p } = provider(sdk);
    expect(await p.products()).toEqual([]);
    fail = false;
    expect((await p.products()).map(x => x.id)).toEqual(['nibble_plus_monthly']);
  });

  it('on the App Store, a trial is shown only where Apple says this person may take it', async () => {
    const apple = pkg(
      '$rc_annual',
      product('nibble_plus_annual', {
        subscriptionPeriod: 'P1Y',
        introPrice: {
          price: 0,
          priceString: '$0.00',
          cycles: 1,
          periodUnit: 'DAY',
          periodNumberOfUnits: 14,
        },
      }),
    );
    const offer = async () => ({ current: { availablePackages: [apple] } });
    const eligible = provider(fakeSdk({ getOfferings: offer }), { platform: 'ios' });
    expect((await eligible.p.products())[0]?.introDays).toBe(14);
    const used = provider(
      fakeSdk({
        getOfferings: offer,
        checkTrialOrIntroductoryPriceEligibility: async ids =>
          Object.fromEntries(ids.map(id => [id, { status: 1 }])),
      }),
      { platform: 'ios' },
    );
    expect((await used.p.products())[0]?.introDays).toBeNull();
  });
});

describe('buying the second month free (docs/SUBSCRIPTIONS.md §3c)', () => {
  /** A fake store whose monthly plan carries the offer, as Google lists it to a new customer. */
  const withOffer = (...offers: RcOption[]) => {
    const sdk = fakeSdk();
    sdk.getOfferings = async () => {
      sdk.calls.push('getOfferings');
      return { current: { availablePackages: [PLAY_ANNUAL_PLAIN, monthlyWith(...offers)] } };
    };
    return sdk;
  };
  const bought = (sdk: FakeSdk) => sdk.calls.filter(c => c.startsWith('purchase'));

  it('buys the tagged offer by name when the paywall showed it, and only on that plan', async () => {
    const sdk = withOffer(SECOND_MONTH_FREE);
    const { p } = provider(sdk);
    const shown = await p.products();
    expect(shown.find(x => x.id === 'nibble_plus_monthly')?.introOffer?.kind).toBe(
      'secondMonthFree',
    );
    expect(await p.purchase('nibble_plus_monthly')).toEqual({ kind: 'purchased' });
    expect(await p.purchase('nibble_plus_annual')).toEqual({ kind: 'purchased' });
    expect(bought(sdk)).toEqual([
      'purchaseOffer:rc-ignore-offer,first-subscription',
      'purchase:nibble_plus_annual:annual-autorenew',
    ]);
  });

  it('sells the base plan, as it always has, to a customer Google does not list it to', async () => {
    const sdk = withOffer();
    const { p } = provider(sdk);
    expect((await p.products()).every(x => x.introOffer === null)).toBe(true);
    await p.purchase('nibble_plus_monthly');
    expect(bought(sdk)).toEqual(['purchase:nibble_plus_monthly:monthly-autorenew']);
  });

  it('backing out of the offer’s sheet is cancelled, as for any purchase', async () => {
    const sdk = withOffer(SECOND_MONTH_FREE);
    sdk.purchaseSubscriptionOption = async () => {
      throw { code: '1', userCancelled: true };
    };
    const { p } = provider(sdk);
    await p.products();
    expect(await p.purchase('nibble_plus_monthly')).toEqual({ kind: 'cancelled' });
  });
});

describe('managing and redeeming', () => {
  it('manages in the platform’s own subscriptions page, for this app', () => {
    expect(provider(fakeSdk()).p.manageUrl()).toBe(
      `https://play.google.com/store/account/subscriptions?package=${BRAND.androidApplicationId}`,
    );
    expect(provider(fakeSdk(), { platform: 'ios' }).p.manageUrl()).toBe(
      'https://apps.apple.com/account/subscriptions',
    );
  });

  it('on Android, opens Google’s redeem page with the code filled in, and waits on the store', async () => {
    const { p, opened } = provider(fakeSdk());
    expect(p.redeemStyle).toBe('field');
    expect(await p.redeem(' ABCD-1234 ')).toEqual({ kind: 'pending' });
    expect(opened).toEqual(['https://play.google.com/redeem?code=ABCD-1234']);
    // something that cannot be a code never leaves the app
    expect(await p.redeem('not a code!')).toEqual({ kind: 'failed', why: 'code not recognized' });
    expect(opened).toHaveLength(1);
  });

  it('on iOS, hands over to Apple’s own code sheet', async () => {
    const sdk = fakeSdk();
    const { p } = provider(sdk, { platform: 'ios' });
    expect(p.redeemStyle).toBe('sheet');
    expect(await p.redeem(null)).toEqual({ kind: 'pending' });
    expect(sdk.calls).toContain('codeSheet');
  });

  it('reads whether the store knows of Plus, and only reads', async () => {
    expect(await provider(fakeSdk()).p.storeSaysPlus()).toBe(false);
    expect(
      await provider(fakeSdk({ getCustomerInfo: async () => plusInfo(true) })).p.storeSaysPlus(),
    ).toBe(true);
    expect(
      await provider(
        fakeSdk({
          getCustomerInfo: async () => {
            throw new Error('offline');
          },
        }),
      ).p.storeSaysPlus(),
    ).toBe(false);
  });
});

describe('which store a build has', () => {
  /** A store build's environment, as `readEnv` makes it from the EAS production variables. */
  const production = (extra: Record<string, string> = {}) =>
    readEnv({
      EXPO_PUBLIC_ENV: 'production',
      EXPO_PUBLIC_AUTH_PROVIDER: 'supabase',
      EXPO_PUBLIC_SUPABASE_URL: 'https://example.invalid',
      EXPO_PUBLIC_SUPABASE_ANON_KEY: 'public-anon-key',
      ...extra,
    });

  it('has none on a store build made before RevenueCat exists, and says so instead of failing', () => {
    // the first Play build may carry no key (docs/SUBSCRIPTIONS.md §13): no store, not a crash
    expect(storeKey(production(), 'android')).toBeNull();
    expect(
      storeKey(production({ EXPO_PUBLIC_REVENUECAT_ANDROID_KEY: '   ' }), 'android'),
    ).toBeNull();
    const context = readFileSync(join(__dirname, 'BillingContext.tsx'), 'utf8');
    expect(context).toMatch(
      /realStore\(env, \(\) => person\.current\) \?\? new NoStoreBillingProvider\(\)/,
    );
  });

  it('uses the platform’s own key once the owner has set it', () => {
    const env = production({ EXPO_PUBLIC_REVENUECAT_ANDROID_KEY: 'goog_public' });
    expect(storeKey(env, 'android')).toEqual({ platform: 'android', apiKey: 'goog_public' });
    // the Android key never answers for another platform
    expect(storeKey(env, 'ios')).toBeNull();
    expect(storeKey(env, 'web')).toBeNull();
  });

  it('never reaches RevenueCat from the test backend, key or not', () => {
    const mock = readEnv({ EXPO_PUBLIC_REVENUECAT_ANDROID_KEY: 'goog_public' });
    expect(mock.authProvider).toBe('mock');
    expect(storeKey(mock, 'android')).toBeNull();
  });
});

describe('who the second month free is for (docs/SUBSCRIPTIONS.md §3c)', () => {
  /**
   * A TRIPWIRE, NOT A RENDER TEST, as billing.test.ts reads its screens: node cannot mount the
   * provider. Who may take the offer is the store's to say (Google lists it only to a customer who
   * may take it; Apple's eligibility check), so billing reads no plan to decide it, and no status.
   */
  const context = readFileSync(join(__dirname, 'BillingContext.tsx'), 'utf8');

  it('is the store’s answer: billing reads no plan and no status to decide it', () => {
    expect(context).not.toMatch(/usePlan|previewEnded|afterPreview/);
    expect(context).not.toMatch(/\.status\b|'WELCOME'|'FREE'|source === 'welcome'/);
  });
});

describe('the first-subscription offer in the pricing config', () => {
  const ROOT = join(__dirname, '..', '..', '..', '..');
  /*
    CuddleCue's two dashboard checks (the Play tag and the owner's 2026-09-28 "one month free"
    decision, read from `first_subscription_offer`) are not here: NibbleCue Plus is its own
    subscription (the owner, 2026-10-08), its config has no first-subscription offer yet, and
    `assets/pricing.config.json` was CuddleCue's. The mapper above still reads the offer if the
    stores ever list one; what stays pinned is that the app never reads the config's offer.
  */
  it('is never read by the app: its figure reaches no screen and no bundle', () => {
    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap(name => {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) return walk(path);
        return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
      });
    // code, not the comments that point the reader at the config
    const code = (f: string) =>
      readFileSync(f, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|\s)\/\/.*$/gm, '$1');
    const readers = walk(join(ROOT, 'apps', 'mobile', 'src')).filter(f =>
      /first_subscription_offer|\bprice_usd\b/.test(code(f)),
    );
    expect(readers).toEqual([]);
    // the slice of the config the app bundles is the packages and the preview's length, only
    const slice = readFileSync(join(ROOT, 'packages/core/src/plan/pricing.generated.ts'), 'utf8');
    expect(slice).not.toMatch(/first_subscription|second-month-free/);
  });
});
