/**
 * WHAT REVENUECAT SAYS, IN THE BILLING INTERFACE'S WORDS (`types.ts`; docs/SUBSCRIPTIONS.md §2, §7).
 *
 * Pure, so every rule here runs in node against plain objects shaped like the SDK's. The SDK itself
 * is only ever reached by `revenuecat.ts`, at call time and inside a `try`, because Expo Go does not
 * carry it (tools/expo-go-imports.mjs).
 *
 * THE PRICE IS THE STORE'S STRING (CLAUDE.md rule 13). `priceString`, `pricePerMonthString` and
 * `pricePerYearString` are formatted by Google or Apple in the buyer's own currency and are
 * rendered as they arrive. `price` and `currencyCode` are passed through untouched as `amount` and
 * `currency`, for the one sum the app does — the annual plan's saving, in `saving.ts` — and nothing
 * here divides one price by another. One comparison is made, and it picks words, never a figure:
 * whether an introductory payment is exactly one regular month (below).
 *
 * A TRIAL IS SAID ONLY WHEN THE STORE OFFERS IT TO THIS PERSON (SUBSCRIPTIONS.md §3 rule 1). Google
 * Play lists only the offers a customer may take, so a free phase on the default option is enough.
 * The App Store lists its introductory offer to everybody, so there it counts only when the
 * eligibility check says ELIGIBLE. Unknown is not yes.
 *
 * THE MONTHLY PLAN'S SECOND MONTH FREE IS SAID THE SAME WAY, and bought the way it was said
 * (SUBSCRIPTIONS.md §3c; the owner, 2026-09-28: *"after the first month, they get 1 month free of
 * charge"*). It is one payment of the regular monthly price covering the first two months,
 * because Google Play allows no free phase after a paid one. On Google Play it is an offer for new
 * customers that Google lists only to a customer who may take it; the app finds it by its tag and
 * buys that option (`Shelf.offers`), and for everyone else describes the default option, which is
 * what buying the package buys. On the App Store it is the introductory offer StoreKit applies to
 * any eligible new subscriber, so it is said whenever Apple says ELIGIBLE. No plan status decides
 * it on either store: the store's own eligibility does. The line is the store's own strings and a
 * length read from the store's period, only for one payment covering whole months; a shape it
 * cannot say truly is not said, and on Google Play not sold.
 */
import {
  PACKAGES,
  packageOf,
  planStatusFrom,
  PLUS_ENTITLEMENT,
  tierFor,
  type PlanRowInput,
} from '@nibblecue/core';
import type { AppEnv } from '../env';
import type { BillingPeriod, IntroOffer, PurchaseOutcome, StoreProduct } from './types';

/* --------------------------------------------------------------- which store this build has */

/**
 * THE KEY THIS BUILD REACHES REVENUECAT WITH, or null for no store at all (`BillingContext.tsx`
 * `realStore`). Three things have to hold: the real accounts backend (a mock account is nobody
 * RevenueCat or the server could know), a platform RevenueCat sells on, and that platform's public
 * key. The first Play build may well have only two: the key is the owner's to add in EAS once the
 * RevenueCat project exists (docs/SUBSCRIPTIONS.md §13), and until then the build sells nothing
 * and says so (`unavailable.ts`) rather than configuring the SDK with no key.
 */
export function storeKey(
  env: Pick<AppEnv, 'authProvider' | 'revenueCat'>,
  os: string,
): { platform: 'ios' | 'android'; apiKey: string } | null {
  if (env.authProvider !== 'supabase') return null;
  const platform = os === 'ios' ? 'ios' : os === 'android' ? 'android' : null;
  if (platform === null) return null;
  const apiKey = env.revenueCat[platform];
  return apiKey === null ? null : { platform, apiKey };
}

/* ------------------------------------------------------------------ the SDK, as far as it is read */

export interface RcPeriod {
  unit: string;
  value: number;
}
/** `Price` on a Google Play pricing phase: the store's own string, and its amount in micros. */
export interface RcPrice {
  formatted: string;
  /** Millionths of `currencyCode`. Compared for equality with another phase's, never shown. */
  amountMicros: number;
  currencyCode: string;
}
/** `PricingPhase` (Google Play), the fields this app reads. */
export interface RcPhase {
  billingPeriod: RcPeriod;
  /** `RECURRENCE_MODE`: 1 repeats until canceled, 2 a set number of times, 3 is charged once. */
  recurrenceMode: number | null;
  /** How many times a phase that repeats a set number of times is charged. */
  billingCycleCount: number | null;
  price: RcPrice;
}
/** `SubscriptionOption` (Google Play): a base plan, or an offer on one. */
export interface RcOption {
  /** The tags set in the Play Console on the offer (and its base plan). */
  tags: string[];
  freePhase: { billingPeriod: RcPeriod } | null;
  /** The first paid phase before the full price: an offer's lower first stretch. */
  introPhase: RcPhase | null;
  /** The phase that repeats until canceled: the base plan's own price. */
  fullPricePhase: { price: RcPrice } | null;
}
/** `PurchasesStoreProduct`, the fields this app reads. */
export interface RcProduct {
  identifier: string;
  /** The SDK's number for `priceString`, in `currencyCode`. For the saving's arithmetic only. */
  price: number;
  currencyCode: string;
  priceString: string;
  pricePerMonthString: string | null;
  /** Twelve periods' worth for a monthly product, formatted by the SDK. */
  pricePerYearString: string | null;
  subscriptionPeriod: string | null;
  /**
   * The App Store's introductory offer. (On Google Play the SDK fills it from the default option,
   * which is read directly there instead.)
   */
  introPrice: {
    price: number;
    priceString: string;
    /** How many times the offer's period is charged: one for "pay up front". */
    cycles: number;
    periodUnit: string;
    periodNumberOfUnits: number;
  } | null;
  /**
   * Google Play: the option that buying the package buys. RevenueCat never picks one tagged
   * `rc-ignore-offer`, which is how the first-subscription offer stays out of it: the app buys
   * that one by name (`Shelf.offers`).
   */
  defaultOption: RcOption | null;
  /** Google Play: every option Google returned for this base plan, the base plan among them. */
  subscriptionOptions: RcOption[] | null;
}
/** `PurchasesPackage`. */
export interface RcPackage {
  identifier: string;
  product: RcProduct;
}
export interface RcOffering {
  availablePackages: RcPackage[];
}
/** `CustomerInfo`: only whether the one entitlement is active. */
export interface RcCustomerInfo {
  entitlements: { active: Record<string, unknown> };
}

/** `INTRO_ELIGIBILITY_STATUS.INTRO_ELIGIBILITY_STATUS_ELIGIBLE`. */
export const INTRO_ELIGIBLE = 2;

/* ------------------------------------------------------------------ the offering, as products */

/**
 * THE PLAY CONSOLE TAG THAT MARKS THE FIRST-SUBSCRIPTION OFFER (docs/SUBSCRIPTIONS.md §3c), the
 * monthly plan's second month free, typed into the console once, beside `rc-ignore-offer`, and
 * never renamed. `pricing.config.json` (`first_subscription_offer.play.tags`) carries the same word
 * for the owner's dashboards, and a test holds the two together. It names who the offer is for,
 * not what it gives, so a later offer for a first subscription can keep it.
 */
export const FIRST_SUBSCRIPTION_TAG = 'first-subscription';

/** `RECURRENCE_MODE`, the two a first stretch can be. */
const RECURS = { times: 2, once: 3 } as const;

function daysOf(unit: string, value: number): number | null {
  if (!Number.isInteger(value) || value <= 0) return null;
  if (unit === 'DAY') return value;
  if (unit === 'WEEK') return value * 7;
  // a month or a year of free time is not a count of days, and saying one would be a guess
  return null;
}

/**
 * HOW LONG A PAID FIRST STRETCH LASTS, in whole months, when it is ONE payment for the whole of it:
 * the only shape the paywall's line says truly. Several payments are a price per period the line
 * does not say, and days or weeks are not months, so both are null, and a null is a line not drawn.
 */
function monthsOfOnePayment(unit: string, value: number, payments: number | null): number | null {
  if (payments !== 1 || !Number.isInteger(value) || value <= 0) return null;
  if (unit === 'YEAR') return value * 12;
  if (unit === 'MONTH') return value;
  return null;
}

/**
 * How many payments a Google Play phase is. A single payment is one; a discounted recurring one is
 * its cycle count. One that repeats until canceled is the price itself, never a first stretch, and
 * an unknown mode is not a yes.
 */
function paymentsOf(phase: RcPhase): number | null {
  if (phase.recurrenceMode === RECURS.once) return 1;
  if (phase.recurrenceMode === RECURS.times) return phase.billingCycleCount;
  return null;
}

/** A price as whole millionths, or null when it is not a real, positive price. */
function micros(amount: number): number | null {
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount * 1_000_000) : null;
}

/**
 * THE PAYWALL'S LINE FOR A FIRST STRETCH. Two months for exactly one regular month's price is the
 * owner's offer, and reads "Second month free" (the owner, 2026-09-28: *"after the first month,
 * they get 1 month free of charge"*). `oneMonthsPrice` is the store's two amounts found equal, on
 * a monthly plan: the one comparison of two prices this app makes, and it picks words, never a
 * figure. Any other stretch the line can say is said as it is: "First 2 months {price}, then
 * {price} a month".
 */
function introLine(
  months: number,
  priceLabel: string,
  thenLabel: string,
  oneMonthsPrice: boolean,
): IntroOffer {
  return months === 2 && oneMonthsPrice
    ? { kind: 'secondMonthFree', thenLabel }
    : { kind: 'firstStretch', priceLabel, months, thenLabel };
}

/** The paid first stretch of a Google Play option, as the paywall's line, or null. */
function playIntro(option: RcOption | null, regular: string, monthly: boolean): IntroOffer | null {
  if (option === null || option.introPhase === null) return null;
  const phase = option.introPhase;
  const { unit, value } = phase.billingPeriod;
  const months = monthsOfOnePayment(unit, value, paymentsOf(phase));
  if (months === null) return null;
  const full = option.fullPricePhase;
  // exactly one regular month: the phase that repeats, in the same currency, to the micro
  const oneMonthsPrice =
    monthly &&
    full !== null &&
    full.price.currencyCode === phase.price.currencyCode &&
    Number.isInteger(full.price.amountMicros) &&
    full.price.amountMicros > 0 &&
    full.price.amountMicros === phase.price.amountMicros;
  // what this option renews at, as Google formatted it: the base plan's price, the product's own
  return introLine(months, phase.price.formatted, full?.price.formatted ?? regular, oneMonthsPrice);
}

/**
 * THE FIRST-SUBSCRIPTION OFFER on a Google Play product: an option tagged `first-subscription`, one
 * first stretch the line can say and then the base plan. Its eligibility is Google's ("new customer
 * acquisition", for someone who never had a subscription), and Google lists such an offer only to a
 * customer who may take it, so being on the shelf is being eligible: the app decides nothing about
 * who. One with a free phase as well is passed over, because a line that said the stretch and not
 * the free days would not be the whole deal. Null when the console has none the line can say, and
 * the base plan is sold as it always was.
 */
function firstSubscriptionOption(product: RcProduct, monthly: boolean): RcOption | null {
  for (const option of product.subscriptionOptions ?? []) {
    if (!option.tags.includes(FIRST_SUBSCRIPTION_TAG) || option.freePhase !== null) continue;
    if (playIntro(option, product.priceString, monthly) !== null) return option;
  }
  return null;
}

/** What the store offers THIS person on a product, and on Google Play which option that is. */
interface Offered {
  introDays: number | null;
  introOffer: IntroOffer | null;
  /** The offer to buy in place of the package, when it is the one described. */
  option: RcOption | null;
}

const NOTHING: Offered = { introDays: null, introOffer: null, option: null };

function offeredOn(product: RcProduct, eligible: boolean, monthly: boolean): Offered {
  if (product.defaultOption !== null || product.subscriptionOptions !== null) {
    // GOOGLE PLAY lists only the offers a customer may take, the first-subscription offer among
    // them: when it is listed it is this customer's, and it is described and bought by name (it
    // carries `rc-ignore-offer`, so buying the package would not buy it). Otherwise the option
    // described is the default one, because that is what buying the package buys: what the
    // paywall says is what the store sheet charges.
    const tagged = firstSubscriptionOption(product, monthly);
    const option = tagged ?? product.defaultOption;
    const free = option?.freePhase?.billingPeriod ?? null;
    return {
      introDays: free === null ? null : daysOf(free.unit, free.value),
      introOffer: playIntro(option, product.priceString, monthly),
      option: tagged,
    };
  }
  // THE APP STORE lists its introductory offer to everybody and applies it at purchase to whoever
  // is eligible, whatever the app shows. So it is said exactly when Apple confirms this person is
  // eligible. Unknown is not yes.
  const intro = product.introPrice;
  if (intro === null || !eligible) return NOTHING;
  if (intro.price === 0) {
    return { ...NOTHING, introDays: daysOf(intro.periodUnit, intro.periodNumberOfUnits) };
  }
  const paid = micros(intro.price);
  const months = monthsOfOnePayment(intro.periodUnit, intro.periodNumberOfUnits, intro.cycles);
  if (paid === null || months === null) return NOTHING;
  // exactly one regular month: Apple's two amounts, in the one storefront's currency
  const oneMonthsPrice = monthly && paid === micros(product.price);
  return {
    ...NOTHING,
    introOffer: introLine(months, intro.priceString, product.priceString, oneMonthsPrice),
  };
}

function periodOf(product: RcProduct, fallback: string): BillingPeriod {
  const iso = product.subscriptionPeriod ?? fallback;
  return iso === 'P1Y' || iso === 'P12M' ? 'YEAR' : 'MONTH';
}

export interface Shelf {
  products: StoreProduct[];
  /** The store's package behind each product id, for `purchasePackage`. */
  packages: ReadonlyMap<string, RcPackage>;
  /**
   * The Google Play offer behind each product whose first-subscription offer the paywall shows, for
   * `purchaseSubscriptionOption`. A product with none here is bought as its package, which buys
   * its default option: again what the paywall showed for it.
   */
  offers: ReadonlyMap<string, RcOption>;
}

/**
 * The current offering as the paywall's products: only the two this app sells, in the config's own
 * order (the annual first, and the one that opens selected), each at the store's own price.
 *
 * @param trialEligible whether the store confirmed this person may take a product's introductory
 *   offer, free or paid; read only where the store lists one to everybody (the App Store)
 */
export function productsFrom(
  offering: RcOffering | null,
  trialEligible: (storeIdentifier: string) => boolean,
): Shelf {
  const packages = new Map<string, RcPackage>();
  const offers = new Map<string, RcOption>();
  const rows: { order: number; product: StoreProduct }[] = [];
  for (const pkg of offering?.availablePackages ?? []) {
    const ours = packageOf(pkg.product.identifier);
    if (ours === null || packages.has(ours.product_id)) continue;
    packages.set(ours.product_id, pkg);
    const period = periodOf(pkg.product, ours.period);
    const offered = offeredOn(
      pkg.product,
      trialEligible(pkg.product.identifier),
      period === 'MONTH',
    );
    if (offered.option !== null) offers.set(ours.product_id, offered.option);
    rows.push({
      order: PACKAGES.indexOf(ours),
      product: {
        id: ours.product_id,
        period,
        priceLabel: pkg.product.priceString,
        // the SDK's own number and currency, untouched, for `annualSaving` alone
        amount: Number.isFinite(pkg.product.price) ? pkg.product.price : null,
        currency: pkg.product.currencyCode === '' ? null : pkg.product.currencyCode,
        // the store's own per-month figure for the annual plan, never one divided out here
        perMonthLabel: period === 'YEAR' ? pkg.product.pricePerMonthString : null,
        // and the store's own twelve months of the monthly one: the figure the annual is shown
        // against, struck through, in the store's own currency and format
        perYearLabel: period === 'MONTH' ? pkg.product.pricePerYearString : null,
        introDays: offered.introDays,
        // strings and a length only: `amount` above stays the regular price, so the saving the
        // annual row shows is regular against regular, and the offer speaks for itself
        introOffer: offered.introOffer,
        preselected: ours.default_selected,
      },
    });
  }
  rows.sort((a, b) => a.order - b.order);
  const products = rows.map(r => r.product);
  // exactly one opens selected, even when the store is missing the one the config picks
  if (products.length > 0 && !products.some(p => p.preselected)) {
    products[0] = { ...products[0]!, preselected: true };
  }
  return { products, packages, offers };
}

/* ------------------------------------------------------------------ what happened */

/** `PURCHASES_ERROR_CODE`, the ones that mean something other than "it failed". */
const CODE = {
  cancelled: '1',
  storeProblem: '2',
  notAllowed: '3',
  notAvailable: '5',
  alreadyPurchased: '6',
  receiptInUse: '7',
  network: '10',
  credentials: '11',
  otherSubscriber: '13',
  inProgress: '15',
  pending: '20',
  configuration: '23',
  offline: '35',
} as const;

/** One sentence for a build whose store is set up wrong. The owner reads it, not a parent. */
const STORE_SETUP_REASON = 'The store is not set up for this build yet.';

/**
 * A rejected purchase or restore, as what happened to the REQUEST. Backing out of the store's
 * sheet is `cancelled`, which the screens answer with silence (CLAUDE.md rule 14): it is a normal
 * thing to do, never an error.
 */
export function outcomeFromError(err: unknown): PurchaseOutcome {
  const e = (typeof err === 'object' && err !== null ? err : {}) as {
    code?: unknown;
    userCancelled?: unknown;
  };
  const code = typeof e.code === 'string' ? e.code : String(e.code ?? '');
  if (e.userCancelled === true || code === CODE.cancelled) return { kind: 'cancelled' };
  switch (code) {
    case CODE.pending:
      return { kind: 'pending' };
    case CODE.alreadyPurchased:
      return { kind: 'already' };
    case CODE.configuration:
    case CODE.credentials:
    case CODE.notAvailable:
      return { kind: 'unavailable', why: STORE_SETUP_REASON };
    case CODE.network:
    case CODE.offline:
      return { kind: 'failed', why: 'offline' };
    case CODE.notAllowed:
      return { kind: 'failed', why: 'not allowed on this device' };
    case CODE.receiptInUse:
    case CODE.otherSubscriber:
      return { kind: 'failed', why: 'owned by another account' };
    case CODE.inProgress:
      return { kind: 'pending' };
    case CODE.storeProblem:
      return { kind: 'failed', why: 'store problem' };
    default:
      return { kind: 'failed', why: 'unexpected' };
  }
}

/** Whether the store's own record says this person has Plus now. A hint, never the gate. */
export const hasPlus = (info: RcCustomerInfo | null | undefined): boolean =>
  info?.entitlements.active[PLUS_ENTITLEMENT] !== undefined;

/**
 * WHETHER THE SERVER HAS HEARD. The household's plan is Plus from something that is not the welcome
 * preview, which is what a purchase or a restore turns into once the server has the store's word.
 * Only this ends a purchase as `purchased`. The device never decides (CLAUDE.md rule 14): what it
 * waits for is the account.
 */
export function storePlusArrived(entitlement: PlanRowInput | null, serverNow: number): boolean {
  if (entitlement === null || entitlement.source === 'welcome') return false;
  return tierFor(planStatusFrom(entitlement, serverNow)) === 'PLUS';
}

/**
 * AFTER THE STORE SAID YES, UNTIL THE SERVER SAYS SO TOO. The phone asks the server to read the
 * store (`sync-subscription`) and reads its account. When the account does not show Plus yet, it
 * waits and reads again, and asks the server once more before the last read, which is room for the
 * webhook to land. True as soon as the account shows it. False means "not yet", and the screen says
 * the store is still working on it: the purchase is not lost, and the next account read picks it up.
 */
export interface SettleDeps {
  sync(): Promise<unknown>;
  /** The account as the server has it now: its plan, and the server's clock. */
  read(): Promise<{ entitlement: PlanRowInput | null; serverNow: number } | null>;
  sleep(ms: number): Promise<void>;
}

/** Waits between reads, and before which reads the server is asked again. */
export const SETTLE_STEPS: readonly { waitMs: number; sync: boolean }[] = [
  { waitMs: 0, sync: true },
  { waitMs: 2_000, sync: false },
  { waitMs: 4_000, sync: true },
];

export async function settle(deps: SettleDeps): Promise<boolean> {
  for (const step of SETTLE_STEPS) {
    if (step.waitMs > 0) await deps.sleep(step.waitMs);
    if (step.sync) await deps.sync().catch(() => undefined);
    const now = await deps.read().catch(() => null);
    if (now !== null && storePlusArrived(now.entitlement, now.serverNow)) return true;
  }
  return false;
}
