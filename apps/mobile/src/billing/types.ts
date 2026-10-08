/**
 * THE ONE INTERFACE THE WHOLE SUBSCRIBE FLOW IS WRITTEN AGAINST — the same shape the accounts
 * flow uses for auth (`auth/providers/types.ts`), and for the same reason: no screen may know
 * which billing backend it got, and swapping the mock for a real store must be a provider
 * change rather than a rewrite of every screen that mentions the plan.
 *
 * TWO RULES FROM THE BRIEF SHAPE EVERY TYPE HERE, and neither is a preference.
 *
 * CLAUDE.md rule 13 — "Do not hardcode a price. Prices come from the store SDK at runtime."
 * So a product carries `priceLabel`, a STRING THE STORE ALREADY FORMATTED, and the app renders
 * it without parsing it. Every figure a parent reads is one the store formatted: the price, the
 * per-month equivalent, and the twelve-months-at-the-monthly-price figure the annual plan is shown
 * against.
 *
 * ONE SUM IS THE APP'S OWN, and it is a percentage, never an amount (the owner, 2026-09-26: *"don't
 * just show the price 59.00, think what we can do better to entice user to click. perhaps do the
 * 6.99x12 price = $83.88 (scribbled) $59.00, then save x% off"*). Until that day this file held no
 * amount at all, so that nothing could compute "save 29%" and be wrong in a currency nobody tested.
 * The saving is now said, and the risk is held by where it is computed rather than by not holding a
 * number: `amount` is the store SDK's own number for `priceLabel`, `currency` is the store's code
 * for it, and the ONLY reader of either is `annualSaving` (`saving.ts`) — a pure function, tested,
 * that answers nothing unless both plans are there, in one currency, and the saving is real. It
 * does not format anything: the struck-through figure is the store's own string (`perYearLabel`).
 *
 * CLAUDE.md rule 14 — "The store owns entitlement. The device never decides." So `purchase`
 * and `restore` return what happened to the REQUEST, never a tier and never a plan status.
 * Whether this household is now Plus is answered by re-reading the account, the same way it is
 * answered after any other server-side change. A provider that returned `tier: 'PLUS'` would
 * be a device deciding, which is the thing the rule exists to stop.
 *
 * `cancelled` IS NOT A FAILURE. A parent who opens the store sheet and backs out has done a
 * normal thing, and an app that shows them an error for it is the dark pattern rule 14's
 * second half forbids. It is its own outcome and the screens say nothing at all.
 */

export type BillingProviderName = 'mock' | 'store';

export type BillingPeriod = 'MONTH' | 'YEAR';

export interface StoreProduct {
  /**
   * The store's product identifier. Opaque here, and never constructed: it is a subscription
   * product id, which CLAUDE.md §2 forbids any script in this repository from rewriting.
   */
  id: string;
  period: BillingPeriod;
  /**
   * What the store says this costs, already formatted in the buyer's own currency. Rendered
   * verbatim. Never parsed: the number behind it is `amount`, straight from the SDK.
   */
  priceLabel: string;
  /**
   * The store SDK's own number for `priceLabel`, in `currency` (RevenueCat's `price`). Read by
   * `annualSaving` (`saving.ts`) and nothing else, for the one percentage the app computes; never
   * formatted by the app and never shown. Null when the store did not give one, which hides the
   * saving rather than guessing it.
   */
  amount: number | null;
  /** The ISO 4217 code the store priced this in (RevenueCat's `currencyCode`), or null. */
  currency: string | null;
  /**
   * A per-month equivalent, as its own formatted string, when the store supplies one. Null
   * otherwise — and null is the honest answer, because dividing `priceLabel` would mean
   * parsing a localized currency string, which is the bug this field exists to avoid.
   */
  perMonthLabel: string | null;
  /**
   * TWELVE MONTHS OF THIS PRODUCT, formatted by the store SDK (RevenueCat's `pricePerYearString`),
   * for a MONTHLY product only: the figure the annual plan is drawn beside, struck through. The
   * store formats it for the same reason it formats `priceLabel` — its currency, its separators,
   * its symbol — so the two figures a parent compares are written the same way. Null for a yearly
   * product, or when the store did not give one.
   */
  perYearLabel: string | null;
  /** An introductory free period in days, when the store offers one on this product. */
  introDays: number | null;
  /**
   * THE STORE'S INTRODUCTORY OFFER on this product, when it offers one to this person
   * (docs/SUBSCRIPTIONS.md §3c): on the monthly plan, the second month free for a first
   * subscription (the owner, 2026-09-28: *"after the first month, they get 1 month free of
   * charge"*). Null when there is none, or when the store's offer has a shape the paywall's one
   * line cannot say truly. It carries strings and a length and no amount, so the annual saving
   * (`saving.ts`) goes on comparing the regular prices and nothing else.
   */
  introOffer: IntroOffer | null;
  /** Which product opens selected. Exactly one product in a list may set it. */
  preselected: boolean;
}

/**
 * AN INTRODUCTORY OFFER, as the paywall's one line under the price. Every figure is the store's
 * own string (CLAUDE.md rule 13): the paywall draws them as they arrive and computes nothing.
 *
 *  'secondMonthFree' one payment of exactly the regular monthly price covering the first two
 *                    months: "Second month free, then {then} a month". Whether the payment is
 *                    exactly one month's price is the store's two amounts, compared by the mapper
 *                    (`revenuecatMap.ts`); no amount rides here.
 *  'firstStretch'    any other single payment covering whole months: "First {stretch} {price},
 *                    then {then} {period}".
 */
export type IntroOffer =
  | {
      kind: 'secondMonthFree';
      /** The price it renews at, as the store formatted it: the product's regular price. */
      thenLabel: string;
    }
  | {
      kind: 'firstStretch';
      /** What the store charges for the whole first stretch, in one payment, as it formatted it. */
      priceLabel: string;
      /** How long that stretch lasts, in whole months, read from the store's period. */
      months: number;
      /** The price it renews at afterwards, as the store formatted it. */
      thenLabel: string;
    };

/**
 * What happened to the REQUEST. Never what the household's plan now is — that is the server's
 * answer, read back through the account.
 */
export type PurchaseOutcome =
  | { kind: 'purchased' }
  /** The parent backed out. A normal thing, not an error, and never shown as one. */
  | { kind: 'cancelled' }
  /** Deferred — Ask to Buy, or a payment the store has not settled yet. */
  | { kind: 'pending' }
  /** Already entitled; the store had nothing to do. Restore answers this most often. */
  | { kind: 'already' }
  /** Nothing to restore. Distinct from a failure: the request worked and found none. */
  | { kind: 'nothing' }
  /** This build cannot reach a store at all. */
  | { kind: 'unavailable'; why: string }
  | { kind: 'failed'; why: string };

/**
 * HOW THIS BUILD HANDS A CODE TO THE STORE (docs/PROMO_CODES.md).
 *
 * The code is the STORE's — an App Store offer code or a Google Play promo code, made in the
 * store's console — and so is every decision about it: the store checks it, the store grants the
 * time, and the plan changes when the server hears so (rule 14). The app never checks a code of
 * its own. One that unlocked Plus without the store would be an unlock outside in-app purchase,
 * which App Review guideline 3.1.1 forbids, so there is no such code and no list of them.
 *
 *  'sheet' — the store asks for the code in its own sheet (Apple's offer-code redemption sheet);
 *            the page is a button.
 *  'field' — the page takes the code and hands it over (Google Play's redeem page, which opens
 *            with the code filled in).
 */
export type RedeemStyle = 'sheet' | 'field';

export interface BillingProvider {
  readonly name: BillingProviderName;
  /**
   * Whether this build can sell anything. False makes every subscribe control disappear rather
   * than render disabled: a button that cannot work is worse than no button.
   */
  readonly canSell: boolean;
  /** Empty when there is no store to ask. Never throws. */
  products(): Promise<StoreProduct[]>;
  purchase(productId: string): Promise<PurchaseOutcome>;
  /**
   * Required by both stores on any screen that sells a subscription, and required again
   * wherever a parent might arrive on a new device.
   */
  restore(): Promise<PurchaseOutcome>;
  /**
   * Where the platform manages subscriptions, or null when there is nowhere to send them.
   * Cancellation is never obstructed (rule 14), so this is a plain link out and the app never
   * asks why, never offers a discount to stay, and never puts a step in front of it.
   */
  manageUrl(): string | null;
  /**
   * How a code is redeemed on this build, or null when there is no store to hand one to — the
   * page then says so rather than offering a button that cannot work.
   */
  readonly redeemStyle: RedeemStyle | null;
  /**
   * Hands a code to the store. `code` is null for 'sheet', where the store asks for it itself.
   * Answers what happened to the REQUEST, like `purchase`: whether the household now has Plus is
   * the server's to say, read back through the account.
   */
  redeem(code: string | null): Promise<PurchaseOutcome>;
  /**
   * True when the numbers this provider reports are TARGETS rather than prices anybody will be
   * charged. The screens say so on the screen when it is set, because a mock price that reads
   * as real is a lie the parent cannot detect.
   */
  readonly figuresAreTargets: boolean;
}
