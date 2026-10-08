/**
 * The route tables (docs/MOBILE.md §3): one root native stack whose screens depend on the auth
 * phase, and the five-tab navigator behind `Tabs`. `Tabs` takes `NavigatorScreenParams` so a
 * deep link can name the tab it lands on (`navigate('Tabs', { screen: 'Schedule' })`, §3.1)
 * without a tab having been mounted first. Every other route is parameterless on purpose: a
 * sheet or a pushed page reads what it needs from context (the household, the child, the
 * plan), never from a param a link could forge (CLAUDE.md §2 "never trust a household id from
 * the client").
 */
import type { NavigatorScreenParams } from '@react-navigation/native';

/**
 * NIBBLECUE'S ROUTES (2026-10-08). The account, family and auth routes are CuddleCue's own, with
 * their params unchanged; the food routes are NibbleCue's (docs/PRODUCT.md). A param names a food,
 * a meal or a day, never a household or a person: the screen reads those from the account.
 */
export type TabParams = {
  Today: undefined;
  /** The 14-day plan. Its route is `PlanTab` because the root's `Plan` is the subscription page. */
  PlanTab: { day?: string } | undefined;
  Foods: { filter?: 'first' | 'allergens' | 'iron' | 'untried' | 'tried' } | undefined;
  /** CuddleCue's shopping list: one list for both apps. */
  Shopping: undefined;
  More: undefined;
};

export type RootParams = {
  Auth: { mode?: 'signin' | 'create'; at?: number } | undefined;
  Verify: undefined;
  ResetPassword: undefined;
  NewPassword: undefined;
  /** In no household, having been in one (`core/accounts/standing.ts`). */
  Ended: undefined;
  /** A new parent's first family: the baby, then the food setup. */
  Onboarding: undefined;
  JoinCode: undefined;
  Joined: undefined;
  Tabs: NavigatorScreenParams<TabParams> | undefined;
  /** `confirmLeave` opens Family with its leave confirmation up (CuddleCue migration 0143). */
  Family: { confirmLeave?: number } | undefined;
  Supplies: undefined;
  DeleteAccount: undefined;
  Account: undefined;
  /** NibbleCue Plus: what the free plan keeps and what Plus adds (the subscription page). */
  Plan: undefined;
  SignOut: undefined;
  /** One food: how to serve it at this age, its allergens, this baby's history with it. */
  Food: { foodId: string };
  /** Add a food of your own (spec §6.3), with its allergens and choking risk asked for. */
  AddFood: { name?: string } | undefined;
  /** The allergen tracker. */
  Allergens: undefined;
  /** Write down something noticed; a meal or foods may come with it. */
  Noticed: { activityId?: string; foodIds?: string[] } | undefined;
  /** Everything noticed, newest first. */
  NoticedHistory: undefined;
  /** The emergency card: the region's number, one tap, works offline. */
  Emergency: { then?: 'noticed' } | undefined;
  /** Milk and drinks, read against CuddleCue's milk log. */
  Milk: undefined;
  /** The caregiver and daycare sheet (NibbleCue Plus). */
  Caregiver: undefined;
  /** The pediatrician summary (NibbleCue Plus). */
  Summary: undefined;
  /** The baby's food setup: first time for a child (`setup`), or an edit from More. */
  FoodProfile: { setup?: boolean } | undefined;
};
