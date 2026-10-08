/**
 * THE PROVIDER FOR A BUILD THAT HAS NO STORE: the app's own binary on the real backend before the
 * owner has set RevenueCat up (no `EXPO_PUBLIC_REVENUECAT_*` key for this platform), or a binary
 * that could not load the SDK. RevenueCat itself is `revenuecat.ts`, and `BillingContext` picks it
 * whenever this build can reach it (docs/SUBSCRIPTIONS.md §1).
 *
 * It answers every call honestly and sells nothing. `canSell` is false, so the subscribe controls
 * are absent rather than present-and-broken, and every screen that could have shown one shows what
 * the store would sell and says plainly that this build cannot reach it.
 *
 * WHAT TURNS IT INTO A STORE is the owner's setup in docs/SUBSCRIPTIONS.md §13: the two
 * subscriptions in the Play Console, the RevenueCat project with its `plus` entitlement, the public
 * key as an EAS variable, and the server's two secrets. The store's word reaches the app through the
 * account, never through the device (CLAUDE.md rule 14).
 */
import type { BillingProvider, PurchaseOutcome, StoreProduct } from './types';

/** Shown wherever the app has to say why nothing can be bought. One sentence, no apology. */
export const NO_STORE_REASON = 'This build cannot reach a store yet.';

export class NoStoreBillingProvider implements BillingProvider {
  readonly name = 'store' as const;
  readonly canSell = false;
  readonly figuresAreTargets = false;

  async products(): Promise<StoreProduct[]> {
    return [];
  }
  async purchase(): Promise<PurchaseOutcome> {
    return { kind: 'unavailable', why: NO_STORE_REASON };
  }
  async restore(): Promise<PurchaseOutcome> {
    return { kind: 'unavailable', why: NO_STORE_REASON };
  }
  manageUrl(): string | null {
    return null;
  }
  /** No store, so nowhere to hand a code: the redeem page says so instead of offering a button. */
  readonly redeemStyle = null;
  async redeem(): Promise<PurchaseOutcome> {
    return { kind: 'unavailable', why: NO_STORE_REASON };
  }
}
