/**
 * THE PLAN MATRIX: one table decides what NibbleCue's free plan gets and what NibbleCue Plus adds.
 *
 * The shape and the API are CuddleCue's (`can(key, tier)`, `limitFor`, the generated lists, the
 * bill of rights), so every screen carried over from CuddleCue asks the same question the same
 * way. The CONTENTS are NibbleCue's (docs/PRODUCT.md, "Free and NibbleCue Plus").
 *
 * ── THE RULES ────────────────────────────────────────────────────────────────────────────────
 * The free plan is a real app (bpnc-studio SKILL.md rule 4), and in NibbleCue SAFETY IS NEVER
 * SOLD: the food library and how to serve each food, allergen tracking, what was noticed and the
 * emergency card are `fixed`, beside logging, today's plan, light and dark, the data download,
 * account deletion and no ads. `entitlements.test.ts` fails if any of them is sold.
 *
 * NibbleCue Plus is its own subscription with its own price (the owner, 2026-10-08: "this is a
 * different subscription called nibblecue plus, and its different price too").
 *
 * ── ONE FEATURE IS THE HOUSEHOLD'S CUDDLECUE PLUS ─────────────────────────────────────────────
 * `caregivers`: inviting a caregiver or a viewer into the shared family is decided by CuddleCue's
 * server, which requires CuddleCue Plus for any seat that is not a parent (CuddleCue migration
 * 0140, `app.household_has_plus`). NibbleCue cannot sell it without a change to CuddleCue's
 * server, which is the owner's decision (docs/DECISIONS.md), so `plan: 'cuddlecue'` marks it and
 * the provider answers it from the household's CuddleCue plan. A control that offered it on
 * NibbleCue Plus would be refused by the server: the app never offers what the server refuses.
 */

export type FeatureKey =
  // bill of rights: free forever, never sellable
  | 'logging'
  | 'today'
  | 'foodLibrary'
  | 'allergens'
  | 'noticed'
  | 'multiples'
  | 'shopping'
  | 'baseThemes'
  | 'exportData'
  | 'accountDelete'
  | 'noAds'
  // free today, movable on launch data
  | 'customFoods'
  | 'history'
  | 'supplies'
  // NibbleCue Plus
  | 'fullPlan'
  | 'planIdeas'
  | 'caregiverSheet'
  | 'pediatricianSummary'
  | 'milk'
  | 'themes'
  | 'nightTheme'
  // the household's CuddleCue Plus (see the header)
  | 'caregivers'
  // CuddleCue's, switched off in NibbleCue: kept as keys so the screens shared with CuddleCue
  // compile and read "not offered" rather than a guess
  | 'entryPhotos'
  | 'importData'
  | 'exportFormatted'
  | 'suppliesForecast'
  | 'weeklySummary';

export type Feature = {
  label: string;
  /** Its name on the plan lists: a few words, sentence case, no dash, no full stop. */
  short: string;
  free: boolean;
  /** Never sellable; a test enforces it. */
  fixed?: boolean;
  limit?: number;
  limitUnit?: 'days' | 'people' | 'children' | 'widgets' | 'rules' | 'photos';
  why?: string;
  rationale: string;
  /** Switched off: on no plan and on no list. */
  off?: string;
  /** Whose plan decides it: NibbleCue Plus (the default) or the household's CuddleCue Plus. */
  plan?: 'nibblecue' | 'cuddlecue';
};

const OFF_CUDDLECUE =
  "CuddleCue's feature, not part of NibbleCue (2026-10-08). The key stays so the screens shared " +
  'with CuddleCue compile; it is offered on no NibbleCue plan.';

export const FEATURES: Record<FeatureKey, Feature> = {
  // ── the bill of rights ──────────────────────────────────────────────────────────────────
  logging: {
    label: 'Log every meal and how it went, forever, offline',
    short: 'Unlimited logging',
    free: true,
    fixed: true,
    rationale:
      'The record is the product. A meal logged here is the same entry CuddleCue shows, ' +
      'and a capped record is worth nothing at the pediatrician.',
  },
  today: {
    label: 'Today and tomorrow, planned meal by meal',
    short: "Today's plan",
    free: true,
    fixed: true,
    rationale:
      'The home screen cannot be a paywall. A parent who never pays still knows what to ' +
      'offer today and what is new tomorrow.',
  },
  foodLibrary: {
    label: "Every food, with how to serve it at your baby's age",
    short: 'Food library',
    free: true,
    fixed: true,
    rationale:
      'Safety is never sold. How to cut a grape for a nine-month-old is not a premium ' +
      'feature, and the category\'s "five free searches" is the complaint parents name first.',
  },
  allergens: {
    label: 'Allergen introduction, one at a time, and keeping them going',
    short: 'Allergen tracking',
    free: true,
    fixed: true,
    rationale:
      'Safety is never sold. Which allergen is next, and which waits, is part of feeding ' +
      'a baby safely.',
  },
  noticed: {
    label: 'Write down what you noticed, and the emergency card',
    short: 'Possible reactions',
    free: true,
    fixed: true,
    rationale: 'Safety is never sold. The emergency card works offline on every plan.',
  },
  multiples: {
    label: 'Twins and siblings, each with their own plan',
    short: 'Twins and siblings',
    free: true,
    fixed: true,
    rationale: 'Charging for a second child is the category complaint parents name most often.',
  },
  shopping: {
    label: 'The shopping list you share with CuddleCue',
    short: 'Shopping list',
    free: true,
    fixed: true,
    rationale: 'One list for both apps. A list that locks halfway through a shop is a broken list.',
  },
  baseThemes: {
    label: 'Light and dark',
    short: 'Light and dark',
    free: true,
    fixed: true,
    rationale: 'A platform expectation; an app that charges for dark mode reads as broken.',
  },
  exportData: {
    label: 'Download all your data, any time',
    short: 'Download everything',
    free: true,
    fixed: true,
    rationale: 'A legal duty (GDPR Articles 12 and 20, UK GDPR, CCPA), not a feature.',
  },
  accountDelete: {
    label: 'Delete your account and everything in it',
    short: 'Account deletion',
    free: true,
    fixed: true,
    rationale: 'Required by both stores and by law, and never behind a card.',
  },
  noAds: {
    label: 'No ads, no ad tracking, no data sold',
    short: 'No ads',
    free: true,
    fixed: true,
    rationale: "The studio's promise on every app (bpnc-studio SKILL.md rule 4).",
  },
  // ── free today ──────────────────────────────────────────────────────────────────────────
  customFoods: {
    label: 'Add your own foods',
    short: 'Your own foods',
    free: true,
    rationale: '"Missing foods and no custom entry" is a top complaint about every competitor.',
  },
  history: {
    label: 'Every meal ever logged',
    short: 'Your whole history',
    free: true,
    rationale:
      'The plan learns from the whole record; hiding any of it would make the plan ' +
      'worse, not the paywall better.',
  },
  supplies: {
    label: 'The supplies catalog behind the shopping list',
    short: 'Supplies',
    free: true,
    rationale: 'CuddleCue keeps it free; one list, one rule.',
  },
  // ── NibbleCue Plus ──────────────────────────────────────────────────────────────────────
  fullPlan: {
    label: 'The full 14-day plan, with pins and swaps on any day',
    short: 'The 14-day plan',
    free: false,
    why: 'See two weeks ahead and shape any day',
    rationale:
      'Depth, not access: today and tomorrow are free, and the plan is the same plan. ' +
      'Plus is planning the week, batch cooking and the shop around it.',
  },
  planIdeas: {
    label: "More ideas for variety, suggested by AI and checked by the plan's safety rules",
    short: 'More ideas',
    free: false,
    why: "More variety, with every idea checked by the plan's safety rules",
    rationale:
      'Each call costs the studio money (docs/SERVER.md). The rule planner is complete ' +
      'without it; the model adds variety.',
  },
  caregiverSheet: {
    label: 'A one-page sheet for daycare and grandparents',
    short: 'Caregiver sheet',
    free: false,
    why: 'Give daycare and grandparents the same page',
    rationale:
      'A finished, shareable document is polish. The caregivers themselves see the plan ' +
      'and the never-serve list in the app on every plan.',
  },
  pediatricianSummary: {
    label: 'A summary for your pediatrician: foods, allergens and what you noticed',
    short: 'Pediatrician summary',
    free: false,
    why: 'Take the whole record to the visit',
    rationale:
      'Everything in it is visible free, one screen at a time; the summary lays it out ' +
      'in the order a doctor asks for it.',
  },
  milk: {
    label: 'Milk and drinks, read against what you log in CuddleCue',
    short: 'Milk and drinks',
    free: false,
    why: 'See how milk shifts as meals grow',
    rationale:
      "Arithmetic over CuddleCue's milk log. The guidance itself (milk is the main food " +
      'until one, cups, whole milk after twelve months) is on Today on every plan.',
  },
  themes: {
    label: 'Color schemes',
    short: 'Color schemes',
    free: false,
    why: 'Make it yours with a color scheme',
    rationale: 'Polish, as in CuddleCue. The default scheme is free.',
  },
  nightTheme: {
    label: 'Night: the amber theme for a dark room',
    short: 'Night theme',
    free: false,
    why: 'Keep the room dark at night',
    rationale: 'Purpose-built, as in CuddleCue. Light and dark are free.',
  },
  // ── the household's CuddleCue Plus ──────────────────────────────────────────────────────
  caregivers: {
    label: 'Caregivers and viewers in your family',
    short: 'Caregivers',
    free: false,
    plan: 'cuddlecue',
    why: 'Invite a caregiver or a viewer',
    rationale:
      "Decided by CuddleCue's server, which requires CuddleCue Plus for any seat that " +
      'is not a parent (migration 0140). See the header.',
  },
  // ── CuddleCue's, off here ───────────────────────────────────────────────────────────────
  entryPhotos: {
    label: 'Photos on entries',
    short: 'Entry photos',
    free: false,
    off: OFF_CUDDLECUE,
    rationale: OFF_CUDDLECUE,
  },
  importData: {
    label: 'Import from another app',
    short: 'Import',
    free: false,
    off: OFF_CUDDLECUE,
    rationale: OFF_CUDDLECUE,
  },
  exportFormatted: {
    label: 'Choose what to export',
    short: 'Choose an export',
    free: false,
    off: OFF_CUDDLECUE,
    rationale: OFF_CUDDLECUE,
  },
  suppliesForecast: {
    label: 'Run-out forecasts',
    short: 'Run-out forecasts',
    free: false,
    off: OFF_CUDDLECUE,
    rationale: OFF_CUDDLECUE,
  },
  weeklySummary: {
    label: 'The weekly summary',
    short: 'Weekly summary',
    free: false,
    off: OFF_CUDDLECUE,
    rationale: OFF_CUDDLECUE,
  },
};

/** Where each gated capability is enforced. Every one shows its lock before it is tapped. */
export const GATES: { surface: string; feature: FeatureKey }[] = [
  { surface: 'plan.beyond_tomorrow', feature: 'fullPlan' },
  { surface: 'plan.pin_beyond_tomorrow', feature: 'fullPlan' },
  { surface: 'plan.ideas', feature: 'planIdeas' },
  { surface: 'more.caregiver_sheet', feature: 'caregiverSheet' },
  { surface: 'more.pediatrician_summary', feature: 'pediatricianSummary' },
  { surface: 'more.milk', feature: 'milk' },
  { surface: 'appearance.night', feature: 'nightTheme' },
  { surface: 'appearance.scheme', feature: 'themes' },
  { surface: 'appearance.skin', feature: 'themes' },
  { surface: 'appearance.shape', feature: 'themes' },
  { surface: 'appearance.log_swipe', feature: 'themes' },
  { surface: 'family.invite_over_limit', feature: 'caregivers' },
];

/** Whose plan answers a feature: NibbleCue Plus unless the table says the household's CuddleCue Plus. */
export const planOf = (key: FeatureKey): 'nibblecue' | 'cuddlecue' =>
  FEATURES[key]?.plan ?? 'nibblecue';

/**
 * Plan state. WELCOME is the reverse trial every new account starts in — see
 * docs/AUTH_AND_TRIAL.md. It is Plus for `trial.welcomeDays` days with no card, and it
 * ends by falling back to FREE, never by locking the app.
 */
export type Tier = 'FREE' | 'PLUS';
export type PlanStatus =
  | 'WELCOME' // new account, reverse trial, no card
  | 'TRIAL' // store trial, card on file
  | 'ACTIVE'
  | 'CANCELLED_AT_PERIOD_END' // still entitled until the period ends
  | 'GRACE' // billing retry; still entitled
  | 'ON_HOLD' // store says not entitled, recoverable
  | 'EXPIRED'
  | 'FREE';

const ENTITLED: PlanStatus[] = ['WELCOME', 'TRIAL', 'ACTIVE', 'CANCELLED_AT_PERIOD_END', 'GRACE'];

/** Tier from status. The ONLY place a status name turns into an entitlement. */
export const tierFor = (s: PlanStatus): Tier => (ENTITLED.includes(s) ? 'PLUS' : 'FREE');

/** THE only gating API. No component may read a tier name, a product id or a status. */
export function can(key: FeatureKey, tier: Tier): boolean {
  const f = FEATURES[key];
  if (!f) return true; // unknown key fails open: never lock a user out by typo
  if (f.fixed || f.free) return true;
  return tier === 'PLUS';
}

/** The cap Free is held to for a counted capability (history days, caregivers, widgets,
 *  photos). Returns null when the capability is not counted or the tier is PLUS. */
export function limitFor(key: FeatureKey, tier: Tier): number | null {
  const f = FEATURES[key];
  if (!f || tier === 'PLUS' || f.free || f.fixed) return null;
  return f.limit ?? null;
}

/** Generated, never hand-maintained: what Plus adds and what every plan keeps, as keys in the
 *  table's order — so a list can carry a feature's `short` name and its sentence side by side.
 *  A switched-off feature (`off`) is on neither list: it is not sold and not kept. */
export const plusFeatures = () =>
  (Object.keys(FEATURES) as FeatureKey[]).filter(
    k =>
      !FEATURES[k].free &&
      !FEATURES[k].fixed &&
      FEATURES[k].off === undefined &&
      planOf(k) === 'nibblecue',
  );

export const freeFeatures = () =>
  (Object.keys(FEATURES) as FeatureKey[]).filter(
    k => (FEATURES[k].free || FEATURES[k].fixed) && FEATURES[k].off === undefined,
  );

/** The same two lists as sentences: the paywall's benefit list and the compare screen. */
export const plusBenefits = () => plusFeatures().map(k => FEATURES[k].why ?? FEATURES[k].label);

export const freeKeeps = () => freeFeatures().map(k => FEATURES[k].label);

/** The features switched off for now, generated — for the tests and the pricing generator. */
export const offFeatures = () =>
  (Object.keys(FEATURES) as FeatureKey[]).filter(k => FEATURES[k].off !== undefined);

/** The bill of rights, generated. Used by the test that stops it being quietly eroded. */
export const billOfRights = () =>
  (Object.keys(FEATURES) as FeatureKey[]).filter(k => FEATURES[k].fixed);
