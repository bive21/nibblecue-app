/**
 * A STORE THAT IS NOT A STORE — the same trick `auth/providers/mock.ts` plays, and for the same
 * reason: the whole subscribe flow has to be walkable on a phone today, with no Apple account,
 * no Google account and no RevenueCat project, none of which exist (CLAUDE.md §8).
 *
 * WHAT IT IS HONEST ABOUT. The two prices it reports are the TARGETS from
 * `pricing.config.json`, which that file says in its own header are for the store dashboards.
 * They are not prices anybody will be charged, they are not localized, and a parent looking at
 * this screen is not looking at a real offer. So `figuresAreTargets` is true and every screen
 * that shows a figure from this provider says so in a line the parent can read. A mock price
 * that reads as real is a lie the person cannot detect, which is worse than no price at all.
 *
 * WHAT IT DOES NOT FAKE. It does not decide the tier. A purchase writes an entitlement row into
 * the mock BACKEND — the same object the mock accounts API reads the household out of — and the
 * app then re-reads its account, exactly as it would after any server-side change. The device
 * still never decides (CLAUDE.md rule 14); it is just that the server it asks is one running in
 * the same process. That is the difference between a mock and a cheat, and it is why the flow
 * this exercises is the real one.
 *
 * Nothing here is reachable in a production build: `createBilling` only ever hands it back when
 * the auth provider is the mock, which itself requires the absence of a Supabase URL and key.
 */
import { PACKAGES } from '@nibblecue/core';
import type { MockBackend } from '../auth/providers/mock';
import { codeReady } from './redeem';
import type { BillingProvider, PurchaseOutcome, StoreProduct } from './types';

/** A year, as the mock's stand-in for a store's renewal date. The real one comes from the store. */
const YEAR_MS = 365 * 24 * 60 * 60_000;
const MONTH_MS = 30 * 24 * 60 * 60_000;

/**
 * The target figure as a plain string. `Intl.NumberFormat` and not a template, because even a
 * pretend price should be formatted by the platform rather than by a `$${n}` that would print
 * `$59` where a store prints `$59.00`. Fixed to en-US on purpose: this is a US target from a US
 * config, and pretending it is localized would be the second lie.
 */
const targetLabel = (usd: number): string =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(usd);

/**
 * WHO IS BUYING, asked at call time rather than held.
 *
 * The provider is built once at boot, before anybody has signed in, so it cannot be given a
 * user id in its constructor. It asks for one when a purchase happens, which is also the only
 * moment the answer is meaningful — and it asks the AUTH state rather than taking ids from a
 * screen, because a household id that came from the client is one this app never trusts
 * (CLAUDE.md rule 9). Null means nobody is signed in, and a purchase then fails rather than
 * inventing a row.
 */
export type WhoIsBuying = () => { userId: string; householdId: string } | null;

export class MockBillingProvider implements BillingProvider {
  readonly name = 'mock' as const;
  readonly canSell = true;
  readonly figuresAreTargets = true;

  constructor(
    private readonly backend: MockBackend,
    private readonly who: WhoIsBuying,
  ) {}

  async products(): Promise<StoreProduct[]> {
    return PACKAGES.map(p => {
      const period = p.period === 'P1Y' ? ('YEAR' as const) : ('MONTH' as const);
      return {
        id: p.product_id,
        period,
        priceLabel: targetLabel(p.target_price_usd),
        // the SDK's `price` and `currencyCode`, as the targets have them: for the saving only
        amount: p.target_price_usd,
        currency: 'USD',
        // only where the config carries one; never divided out of the price above
        perMonthLabel:
          p.effective_monthly_usd === null ? null : targetLabel(p.effective_monthly_usd),
        // the stand-in for the SDK's `pricePerYearString`: twelve months, in whole cents so the
        // label is 83.88 and not a float's 83.88000000000001 — the store formats its own
        perYearLabel:
          period === 'MONTH'
            ? targetLabel((Math.round(p.target_price_usd * 100) * 12) / 100)
            : null,
        introDays: p.trial_days,
        // the first-subscription offer is set in each console and read from the store; its target
        // is the dashboards' (pricing.config.json), never this app's to show
        introOffer: null,
        preselected: p.default_selected,
      };
    });
  }

  async purchase(productId: string): Promise<PurchaseOutcome> {
    const pack = PACKAGES.find(p => p.product_id === productId);
    if (pack === undefined) return { kind: 'failed', why: 'unknown product' };
    const buyer = this.who();
    if (buyer === null) return { kind: 'failed', why: 'no account' };
    const { userId: uid, householdId } = buyer;

    // NIBBLECUE PLUS IS ITS OWN ROW (`nibble_entitlements`, CuddleCue migration 0162): buying it
    // leaves the household's CuddleCue plan, and CuddleCue's welcome preview, exactly as they were
    const existing = this.backend.state.nibble_entitlements.find(e => e.user_id === uid);
    if (existing !== undefined && existing.source === 'store') return { kind: 'already' };

    const period = pack.period === 'P1Y' ? YEAR_MS : MONTH_MS;
    const end = new Date(Date.now() + period).toISOString();
    this.backend.state.nibble_entitlements = this.backend.state.nibble_entitlements.filter(
      e => e.user_id !== uid,
    );
    this.backend.state.nibble_entitlements.push({
      user_id: uid,
      household_id: householdId,
      source: 'store',
      status: 'ACTIVE',
      current_period_end: end,
    });
    await this.backend.save();
    return { kind: 'purchased' };
  }

  async restore(): Promise<PurchaseOutcome> {
    const buyer = this.who();
    if (buyer === null) return { kind: 'failed', why: 'no account' };
    const uid = buyer.userId;
    const row = this.backend.state.nibble_entitlements.find(
      e => e.user_id === uid && e.source === 'store',
    );
    // "nothing" rather than a failure: the request worked and found no purchase, which is what
    // a parent who never subscribed should be told, in those words
    return row === undefined ? { kind: 'nothing' } : { kind: 'already' };
  }

  /** There is no store to send anybody to, and a dead link is worse than an absent one. */
  manageUrl(): string | null {
    return null;
  }

  /**
   * A CODE, AS A STORE WOULD TAKE IT — a field, because there is no store sheet to open. The
   * mock stands in for the store's own check with the only one it can make honestly: a code that
   * could not be one is refused, anything else is taken. What it grants is the offer the owner
   * plans (docs/PROMO_CODES.md §2): one month, written as a store row that will NOT renew, into
   * the same backend the account is read from — so the plan says "Plus until" a date, and the
   * device still decides nothing (rule 14).
   */
  readonly redeemStyle = 'field' as const;

  async redeem(code: string | null): Promise<PurchaseOutcome> {
    if (code === null || !codeReady(code)) return { kind: 'failed', why: 'code not recognized' };
    const buyer = this.who();
    if (buyer === null) return { kind: 'failed', why: 'no account' };
    const { userId: uid, householdId } = buyer;
    const existing = this.backend.state.nibble_entitlements.find(e => e.user_id === uid);
    if (existing !== undefined && existing.source === 'store') return { kind: 'already' };

    this.backend.state.nibble_entitlements = this.backend.state.nibble_entitlements.filter(
      e => e.user_id !== uid,
    );
    this.backend.state.nibble_entitlements.push({
      user_id: uid,
      household_id: householdId,
      source: 'store',
      status: 'CANCELLED_AT_PERIOD_END',
      current_period_end: new Date(Date.now() + MONTH_MS).toISOString(),
    });
    await this.backend.save();
    return { kind: 'purchased' };
  }
}
