/**
 * ONE ACCOUNT, SEVERAL FAMILIES: WHICH ONE IS ON SCREEN (migration 0153; docs/plans/SWITCHER.md).
 *
 * The account read lists every family the person is in. The phone shows ONE of them at a time —
 * the family on screen — and every surface of the app was written against "the account's first
 * household" (`memberships[0]`, read in some hundred places). So rather than teach every one of
 * those reads about a second family, the account the app sees is FOCUSED: the family on screen is
 * put first, and the account's babies, modules and plan are that family's. A switch is a new
 * focus, and the whole tree below the account remounts on it (`household/HouseholdKey.tsx`).
 *
 * Pure and generic over the account's shape, so the rule is tested in node and the app keeps its
 * own types. Nothing here decides who may be where: the server does (0153).
 */

/** The most families one account may be in: 0153's `household_limit`, a parity test holds both. */
export const MAX_HOUSEHOLDS = 5;

interface InHousehold {
  household_id: string;
}

export interface Focusable<P> {
  memberships: readonly InHousehold[];
  children: readonly InHousehold[];
  modules: readonly InHousehold[];
  entitlement: P | null;
  /**
   * EVERY FAMILY'S PLAN, from the one `my_household_plans()` call: absent in an account cached by
   * a build from before the switcher, which then keeps the `entitlement` it was read with.
   */
  plans?: Readonly<Record<string, P | null>> | undefined;
}

/**
 * The family to show: the one asked for while the account is still in it, else the first the
 * server lists (the order it has always shown), else none.
 */
export function householdOnScreen(
  memberships: readonly InHousehold[],
  wanted: string | null | undefined,
): string | null {
  if (wanted != null && memberships.some(m => m.household_id === wanted)) return wanted;
  return memberships[0]?.household_id ?? null;
}

/**
 * The account as the app sees it with `wanted` on screen: that family first and every other one
 * after it in the server's order, and only that family's babies and modules. With one family, or
 * none, it is the account unchanged — a phone in one family sees exactly what it saw before.
 */
export function focusAccount<P, T extends Focusable<P>>(
  account: T,
  wanted: string | null | undefined,
): T {
  const on = householdOnScreen(account.memberships, wanted);
  if (on === null) return account;
  const first = account.memberships.filter(m => m.household_id === on);
  const rest = account.memberships.filter(m => m.household_id !== on);
  const plans = account.plans;
  return {
    ...account,
    memberships: [...first, ...rest],
    children: account.children.filter(c => c.household_id === on),
    modules: account.modules.filter(m => m.household_id === on),
    entitlement: plans === undefined ? account.entitlement : (plans[on] ?? null),
  };
}

/** Whether the account is in more than one family: the one thing that shows the switcher. */
export const hasSeveralHouseholds = (
  account: { memberships: readonly InHousehold[] } | null,
): boolean => (account?.memberships.length ?? 0) > 1;

/** Whether another family may still be joined, by the count alone (the server decides the rest). */
export const canJoinAnother = (account: { memberships: readonly InHousehold[] } | null): boolean =>
  (account?.memberships.length ?? 0) < MAX_HOUSEHOLDS;

/** A seat as the rule below reads it: which family, and the role in it. */
interface Seat extends InHousehold {
  role: string;
}

/**
 * WHETHER FAMILY OFFERS "START YOUR OWN FAMILY" (the owner, 2026-10-08), and why not when it does
 * not. The rule 0153 set for a join and 0154 for setup, read off the account the phone holds:
 *
 *   `parent_elsewhere`  a parent (OWNER or PARENT) somewhere already: one family of your own
 *   `limit`             in `MAX_HOUSEHOLDS` families already
 *   `offered`           neither: a caregiver's or a viewer's seats only, below the limit
 *
 * The server counts again at Finish (`admin_elsewhere`, `household_limit`), so a stale account can
 * only ever hide the row. Not offered, the row is not drawn at all: a control that can only be
 * refused is one that teaches the app is broken (CLAUDE.md).
 */
export type OwnFamilyVerdict = 'offered' | 'parent_elsewhere' | 'limit';

export function ownFamilyVerdict(
  account: { memberships: readonly Seat[] } | null,
): OwnFamilyVerdict {
  const seats = account?.memberships ?? [];
  if (seats.some(m => m.role === 'OWNER' || m.role === 'PARENT')) return 'parent_elsewhere';
  if (seats.length >= MAX_HOUSEHOLDS) return 'limit';
  return 'offered';
}

/** Whether "Start your own family" is offered: `ownFamilyVerdict` is `offered`. */
export const canStartOwnFamily = (account: { memberships: readonly Seat[] } | null): boolean =>
  ownFamilyVerdict(account) === 'offered';
