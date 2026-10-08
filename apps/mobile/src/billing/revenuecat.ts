/**
 * THE REAL STORE, THROUGH REVENUECAT (docs/SUBSCRIPTIONS.md §1; the owner, 2026-09-24: "Real
 * subscriptions (RevenueCat and Play Billing). Needed before anyone can pay. -> yes").
 *
 * The same interface the mock answers (`types.ts`), so no screen changed to take real money. What it
 * adds is only what a real store needs:
 *
 * WHO IS BUYING IS THE ACCOUNT. RevenueCat is configured with the Supabase user id as its app user
 * id, which is how the webhook finds the person without a mapping table. It is never run
 * anonymously and never logged out: `logOut` would make an anonymous id, and a purchase made under
 * one belongs to nobody the server knows. A new person signing in on the same phone is `logIn`,
 * which switches cleanly.
 *
 * THE STORE SAYS WHAT HAPPENED; THE SERVER SAYS WHAT THE PLAN IS (CLAUDE.md rule 14). `purchase` and
 * `restore` return outcomes and nothing else. `BillingContext` then has the server read RevenueCat
 * (`sync-subscription`) and reads the account back. The `CustomerInfo` this SDK hands over is used
 * for one thing only: noticing that the store knows about Plus the server has not heard of yet.
 *
 * ONLY THE APP'S OWN BINARY LOADS IT (`revenuecatSdk.ts`). Expo Go does not carry the SDK's native
 * side, and in Expo Go the app keeps the mock store it has always had. This file never touches the
 * SDK itself: it is handed one, which is how its tests hand it a fake.
 *
 * WHAT IS BOUGHT IS WHAT THE PAYWALL DESCRIBED (docs/SUBSCRIPTIONS.md §3c). The monthly plan's
 * second month free is, on Google Play, an offer RevenueCat is told never to choose by itself
 * (`rc-ignore-offer`), so buying the package would buy the base plan. When the shelf described that
 * offer, the purchase names it (`purchaseSubscriptionOption`); otherwise it is the package, as
 * always. On the App Store there is nothing to name: StoreKit applies the introductory offer.
 */
import { BRAND } from '@nibblecue/brand';
import { crumb } from '../app/boot';
import { playRedeemUrl, codeReady } from './redeem';
import {
  hasPlus,
  INTRO_ELIGIBLE,
  outcomeFromError,
  productsFrom,
  type RcCustomerInfo,
  type RcOffering,
  type RcOption,
  type RcPackage,
  type Shelf,
} from './revenuecatMap';
import type { BillingProvider, PurchaseOutcome, RedeemStyle, StoreProduct } from './types';

/** The SDK calls this app makes, and nothing else. The real module is checked against it below. */
export interface RcSdk {
  configure(config: {
    apiKey: string;
    appUserID: string;
    diagnosticsEnabled?: boolean;
    automaticDeviceIdentifierCollectionEnabled?: boolean;
  }): void;
  logIn(appUserID: string): Promise<unknown>;
  getOfferings(): Promise<{ current: RcOffering | null }>;
  purchasePackage(aPackage: RcPackage): Promise<{ customerInfo: RcCustomerInfo }>;
  /** Google Play only: one offer on a base plan, rather than the package's default option. */
  purchaseSubscriptionOption(option: RcOption): Promise<{ customerInfo: RcCustomerInfo }>;
  restorePurchases(): Promise<RcCustomerInfo>;
  getCustomerInfo(): Promise<RcCustomerInfo>;
  presentCodeRedemptionSheet(): Promise<void>;
  checkTrialOrIntroductoryPriceEligibility(
    productIdentifiers: string[],
  ): Promise<Record<string, { status: number }>>;
}

export interface RevenueCatOptions {
  sdk: RcSdk;
  apiKey: string;
  platform: 'ios' | 'android';
  /** The signed-in person's id, asked at call time (`mock.ts`'s `WhoIsBuying` says why). */
  who: () => string | null;
  openUrl: (url: string) => Promise<unknown>;
}

export class RevenueCatBillingProvider implements BillingProvider {
  readonly name = 'store' as const;
  readonly canSell = true;
  readonly figuresAreTargets = false;
  /** Apple takes a code in its own sheet; Google's redeem page opens with the code filled in. */
  readonly redeemStyle: RedeemStyle;

  private configuredAs: string | null = null;
  private identifying: Promise<void> | null = null;
  private shelf: Shelf | null = null;

  constructor(private readonly opts: RevenueCatOptions) {
    this.redeemStyle = opts.platform === 'ios' ? 'sheet' : 'field';
  }

  /**
   * RevenueCat as this person: configured the first time, switched with `logIn` after that. Never
   * `logOut` (the header says why). Called eagerly after sign-in, not only on the paywall, because
   * the SDK finishes a purchase the store has not settled the next time it runs. On Android that
   * includes acknowledging it, which Google requires within three days or the payment is refunded.
   */
  async identify(userId: string): Promise<void> {
    while (this.identifying !== null) await this.identifying.catch(() => undefined);
    if (this.configuredAs === userId) return;
    const run = (async () => {
      if (this.configuredAs === null) {
        this.opts.sdk.configure({
          apiKey: this.opts.apiKey,
          appUserID: userId,
          // nothing about the device beyond what a purchase needs (no ad SDK, no attribution)
          automaticDeviceIdentifierCollectionEnabled: false,
          diagnosticsEnabled: false,
        });
      } else {
        await this.opts.sdk.logIn(userId);
      }
      this.configuredAs = userId;
      // another person's products may carry another person's trial eligibility
      this.shelf = null;
    })();
    this.identifying = run;
    try {
      await run;
    } finally {
      this.identifying = null;
    }
  }

  /** Configured as whoever is signed in now, or false when nobody is. */
  private async ready(): Promise<boolean> {
    const uid = this.opts.who();
    if (uid === null) return false;
    await this.identify(uid);
    return true;
  }

  private async load(): Promise<Shelf> {
    if (this.shelf !== null) return this.shelf;
    const offerings = await this.opts.sdk.getOfferings();
    const offering = offerings.current;
    let eligible: Record<string, { status: number }> = {};
    if (this.opts.platform === 'ios' && offering !== null) {
      // the App Store shows its introductory offer to everybody, so it is said only when Apple
      // confirms it: a free trial and the second month free alike
      eligible = await this.opts.sdk
        .checkTrialOrIntroductoryPriceEligibility(
          offering.availablePackages.map(p => p.product.identifier),
        )
        .catch(() => ({}));
    }
    const shelf = productsFrom(offering, id => eligible[id]?.status === INTRO_ELIGIBLE);
    // an empty shelf is not kept: the next visit asks again rather than showing nothing forever
    if (shelf.products.length > 0) this.shelf = shelf;
    return shelf;
  }

  async products(): Promise<StoreProduct[]> {
    try {
      if (!(await this.ready())) return [];
      return (await this.load()).products;
    } catch (err) {
      crumb(`billing: products unavailable — ${err instanceof Error ? err.message : String(err)}`);
      return [];
    }
  }

  async purchase(productId: string): Promise<PurchaseOutcome> {
    try {
      if (!(await this.ready())) return { kind: 'failed', why: 'no account' };
      const shelf = await this.load();
      const pkg = shelf.packages.get(productId);
      if (pkg === undefined) return { kind: 'failed', why: 'unknown product' };
      // the Google Play offer the paywall described, when it described one; else the package,
      // whose default option is what the paywall described instead
      const offer = shelf.offers.get(productId);
      const { customerInfo } =
        offer === undefined
          ? await this.opts.sdk.purchasePackage(pkg)
          : await this.opts.sdk.purchaseSubscriptionOption(offer);
      // the store took the money. Whether the household has Plus is the server's answer, read
      // back by BillingContext; this is only what happened to the request
      return hasPlus(customerInfo) ? { kind: 'purchased' } : { kind: 'pending' };
    } catch (err) {
      return outcomeFromError(err);
    }
  }

  async restore(): Promise<PurchaseOutcome> {
    try {
      if (!(await this.ready())) return { kind: 'failed', why: 'no account' };
      const info = await this.opts.sdk.restorePurchases();
      return hasPlus(info) ? { kind: 'already' } : { kind: 'nothing' };
    } catch (err) {
      return outcomeFromError(err);
    }
  }

  /**
   * Whether the store's own record shows Plus for the signed-in person. Read only to notice Plus the
   * server has not heard of yet (a sync that never reached it). It never unlocks anything itself.
   */
  async storeSaysPlus(): Promise<boolean> {
    try {
      if (!(await this.ready())) return false;
      return hasPlus(await this.opts.sdk.getCustomerInfo());
    } catch {
      return false;
    }
  }

  /** The platform's own subscriptions page, where canceling is one tap and never asks why. */
  manageUrl(): string | null {
    return this.opts.platform === 'android'
      ? `https://play.google.com/store/account/subscriptions?package=${BRAND.androidApplicationId}`
      : 'https://apps.apple.com/account/subscriptions';
  }

  /**
   * THE CODE GOES TO THE STORE (docs/PROMO_CODES.md). Apple asks for it in its own sheet. Google's
   * redeem page opens with it filled in, and the parent confirms there. Either way the store checks
   * it and the time arrives the way a purchase does, through the server. So what this can honestly
   * say is that the store has it now, which is `pending` ("the store is still working on it") and
   * never `purchased`.
   */
  async redeem(code: string | null): Promise<PurchaseOutcome> {
    try {
      if (this.redeemStyle === 'sheet') {
        if (!(await this.ready())) return { kind: 'failed', why: 'no account' };
        await this.opts.sdk.presentCodeRedemptionSheet();
        return { kind: 'pending' };
      }
      if (code === null || !codeReady(code)) return { kind: 'failed', why: 'code not recognized' };
      await this.opts.openUrl(playRedeemUrl(code));
      return { kind: 'pending' };
    } catch (err) {
      return outcomeFromError(err);
    }
  }
}
