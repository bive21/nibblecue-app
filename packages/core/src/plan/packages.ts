/**
 * The two subscription packages, read from `pricing.config.json`.
 *
 * WHAT THIS IS FOR, AND WHAT IT IS NOT. `pricing.config.json` says in its own header that its
 * numbers are TARGETS for the store dashboards, and CLAUDE.md rule 13 says a price shown to a
 * parent comes from the store SDK at runtime. Nothing here contradicts either: what this module
 * exports is the shape of the offer — how many packages there are, which period each covers,
 * which one opens selected, and the product ids the stores will carry — plus the target figures,
 * clearly named as targets, for the one caller allowed to use them: the mock store that exists
 * so the subscribe flow can be walked on a phone with no store account.
 *
 * THE PRODUCT IDS ARE READ, NEVER WRITTEN. CLAUDE.md §2 forbids any script in this repository
 * from rewriting a subscription product id. This module reads them out of the config and hands
 * them on unchanged; nothing downstream constructs one.
 *
 * `trial` is an ISO-8601 duration in the config because that is what both store consoles take.
 * Only the whole-days form is understood, because that is the only form the config uses and a
 * parser that accepted more would be accepting values nobody has checked. NO PACKAGE CARRIES ONE
 * AT LAUNCH (the owner, 2026-09-27: "no store trial"): the 14-day welcome is the server's, and a
 * store trial added later for new customers is a `trial` line in the config and an offer in each
 * console. The real paywall says "N days free first" only when the store offers it
 * (`billing/revenuecatMap.ts`); the mock follows this config, so it now says nothing of the kind.
 *
 * READ THROUGH `pricing.generated.ts`, the config's `packages` copied verbatim by
 * `tools/gen-app-slices.mjs`: an imported JSON file is bundled whole, and the rest of this one is
 * the store dashboards' mirror of the plan matrix (2026-09-26).
 */
import { PRICING_PACKAGES } from './pricing.generated';

export interface SubscriptionPackage {
  /** `annual` / `monthly` — the app's own name for the package, not the store's. */
  key: string;
  /** The store's identifier, read from the config and never constructed. */
  product_id: string;
  /** ISO-8601 period, exactly as both store consoles express it. */
  period: string;
  /** The TARGET price for the store dashboards. Never shown as a real price. */
  target_price_usd: number;
  /** The config's own per-month equivalent, where it states one. Never divided out here. */
  effective_monthly_usd: number | null;
  /** Whole days of introductory free period the console will be set to offer. */
  trial_days: number | null;
  /** Exactly one package sets this. */
  default_selected: boolean;
}

/** `P14D` → 14. Anything else is null rather than a guess. */
export function trialDays(iso: string | null | undefined): number | null {
  if (typeof iso !== 'string') return null;
  const m = /^P(\d+)D$/.exec(iso.trim());
  return m?.[1] === undefined ? null : Number.parseInt(m[1], 10);
}

interface RawPackage {
  key: string;
  product_id: string;
  period: string;
  target_price_usd: number;
  effective_monthly_usd?: number;
  trial?: string;
  default_selected?: boolean;
}

/**
 * Frozen, and in the config's own order — the annual package is first there because it is the
 * one that opens selected, and a screen that reordered them would be making a commercial
 * decision in a `map`.
 */
export const PACKAGES: readonly SubscriptionPackage[] = Object.freeze(
  (PRICING_PACKAGES as RawPackage[]).map(p =>
    Object.freeze({
      key: p.key,
      product_id: p.product_id,
      period: p.period,
      target_price_usd: p.target_price_usd,
      effective_monthly_usd: p.effective_monthly_usd ?? null,
      trial_days: trialDays(p.trial),
      default_selected: p.default_selected === true,
    }),
  ),
);

/**
 * The one RevenueCat entitlement both packages grant (`plus`), read from the config like the
 * product ids and never typed. The webhook applies an event only for a product that grants it, and
 * the app reads a purchase's outcome by it; one name in two places would be one typo from a
 * purchase that takes the money and grants nothing.
 */
export const PLUS_ENTITLEMENT: string = (() => {
  const names = new Set((PRICING_PACKAGES as { entitlement?: string }[]).map(p => p.entitlement));
  const [name] = names;
  if (names.size !== 1 || typeof name !== 'string' || name === '') {
    throw new Error('pricing.config.json: every package must grant the same one entitlement');
  }
  return name;
})();

/**
 * The product id inside a store's identifier for it. RevenueCat names a Google Play subscription
 * `<subscription id>:<base plan id>` — `plus_monthly:monthly-autorenew` — and an App Store one by
 * the id alone; both are `plus_monthly` to everything that is not a store console
 * (docs/SUBSCRIPTIONS.md §2). Read, never constructed: nothing here makes an id.
 */
export function productIdOf(storeIdentifier: string): string {
  const colon = storeIdentifier.indexOf(':');
  return colon === -1 ? storeIdentifier : storeIdentifier.slice(0, colon);
}

/** The package a store identifier is, or null for a product this app does not sell. */
export function packageOf(storeIdentifier: string): SubscriptionPackage | null {
  const id = productIdOf(storeIdentifier);
  return PACKAGES.find(p => p.product_id === id) ?? null;
}
