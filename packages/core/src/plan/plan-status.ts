import { tierFor, type PlanStatus } from './entitlements';

/**
 * The store's state, as the RevenueCat webhook writes it to subscription_entitlements
 * (docs/SUBSCRIPTIONS.md §4). The database enum `entitlement_status` and
 * `EntitlementStatus` in domain-types.ts carry the same seven values.
 */
export type StoreStatus =
  | 'TRIAL'
  | 'ACTIVE'
  | 'GRACE_PERIOD'
  | 'BILLING_ISSUE'
  | 'CANCELLED_AT_PERIOD_END'
  | 'EXPIRED'
  | 'REVOKED';

/** The columns of a subscription_entitlements row that decide the plan. Structural, so the
 *  generated database row type satisfies it without core importing the database package. */
export interface PlanRowInput {
  status: StoreStatus;
  /**
   * 'welcome' is the 14-day preview (docs/SUBSCRIPTIONS.md §3b); 'store' and 'promo' are real
   * entitlements. The column is text under a check constraint, so the generated row type is
   * `string`; anything that is not the preview is treated as a store row.
   */
  source: string;
  /** ISO timestamp; the store's date, never derived from "now + 30 days". */
  current_period_end: string | null;
}

const ended = (iso: string | null, now: number): boolean => iso !== null && Date.parse(iso) <= now;

/**
 * The one derivation from a store row to the app's plan status (docs/AUTH_AND_TRIAL.md §4,
 * docs/SUBSCRIPTIONS.md §4 and §6). `tierFor(planStatusFrom(row, now))` is the whole gate;
 * no screen reads a status name. The row is the server's; `now` is injected so a test — and
 * never a device clock — decides where a period end falls (a client clock moved forward must
 * not extend anything, which is why the server computes this and the client only caches it).
 *
 * | row                                             | plan status              |
 * |-------------------------------------------------|--------------------------|
 * | none                                            | FREE                     |
 * | welcome, ACTIVE, period end in the future       | WELCOME                  |
 * | welcome, otherwise                              | FREE (the preview ended) |
 * | promo (a granted Plus), ACTIVE, end ahead or none | ACTIVE                 |
 * | promo, ACTIVE, end passed                       | FREE (the grant ended)   |
 * | TRIAL                                           | TRIAL                    |
 * | ACTIVE                                          | ACTIVE                   |
 * | GRACE_PERIOD                                    | GRACE (still Plus)       |
 * | BILLING_ISSUE, period end in the future         | GRACE (still Plus)       |
 * | BILLING_ISSUE, period end passed                | ON_HOLD                  |
 * | CANCELLED_AT_PERIOD_END, period end in the future | CANCELLED_AT_PERIOD_END (still Plus — acceptance test 8) |
 * | CANCELLED_AT_PERIOD_END, period end passed      | ON_HOLD (until the store's EXPIRATION arrives) |
 * | EXPIRED, REVOKED                                | EXPIRED                  |
 */
export function planStatusFrom(row: PlanRowInput | null, now: number): PlanStatus {
  if (!row) return 'FREE';
  if (row.source === 'welcome') {
    // The preview is ACTIVE with a hard expiry (0006 makes the expiry a fact of the row).
    // It ends by becoming FREE, never by locking anything.
    return row.status === 'ACTIVE' && !ended(row.current_period_end, now) ? 'WELCOME' : 'FREE';
  }
  if (row.source === 'promo' && row.status === 'ACTIVE') {
    // A GRANTED Plus (the admin console's, migration 0119) is ACTIVE with the end date the console
    // asked for, and no store ever sends its EXPIRATION: nothing rewrites the status when the date
    // passes. So the date ends it here, as the preview's does, and it ends to FREE — it was a
    // gift, not a subscription that lapsed. Found 2026-09-27: until then a month's grant never
    // ended. A grant with no end date runs until it is revoked.
    return ended(row.current_period_end, now) ? 'FREE' : 'ACTIVE';
  }
  switch (row.status) {
    case 'TRIAL':
      return 'TRIAL';
    case 'ACTIVE':
      return 'ACTIVE';
    case 'GRACE_PERIOD':
      return 'GRACE';
    case 'BILLING_ISSUE':
      // full access until the paid period ends (SUBSCRIPTIONS.md §4), recoverable after
      return ended(row.current_period_end, now) ? 'ON_HOLD' : 'GRACE';
    case 'CANCELLED_AT_PERIOD_END':
      // entitled until the store's period end — the date from the payload, never from the
      // cancellation moment (acceptance test 8); afterwards recoverable, not expired, until
      // the store says EXPIRATION
      return ended(row.current_period_end, now) ? 'ON_HOLD' : 'CANCELLED_AT_PERIOD_END';
    case 'EXPIRED':
    case 'REVOKED':
      // a refund or revocation ends access now; the neutral copy and support link the
      // status deserves (SUBSCRIPTIONS.md §4) come from the row, not from the plan status
      return 'EXPIRED';
  }
}

/**
 * WHETHER A ROW GIVES THE HOUSEHOLD PLUS AT `now`, by the one derivation above. It is also the
 * first thing `app.household_plan` ranks a household's rows by (migration 0134), so the server
 * hands the phone the row that gives Plus when there is one, and otherwise the one that ended
 * last — never a preview that ended months before a paid year did.
 */
export function rowGrantsPlus(row: PlanRowInput, now: number): boolean {
  return tierFor(planStatusFrom(row, now)) === 'PLUS';
}
