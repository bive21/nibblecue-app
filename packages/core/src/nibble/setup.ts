/**
 * ── WHAT MAKES THE SETUP FEEL SMART (docs/research/MARKET_AND_SETUP.md §2) ────────────────────
 *
 * All of it is arithmetic over what the household already has, never a model: the solids CuddleCue
 * already logged pre-answer the first questions; the phone's own region is read, not asked; and
 * what the app says back after setup ("Ada's plan is ready") is read off the real plan the rules
 * built from the answers. The same plan, a moment later, tells a parent when a food comes back
 * after they logged it.
 */
import { allergenOrder } from './allergens';
import { addDays, type IsoDay } from './days';
import type { Exposure } from './history';
import { higherPeanutRisk } from './history';
import { buildPlan, type PlanDay, type PlanInput, type PlanItem } from './planner/plan';
import type { AllergenId, Food, MealName, NibbleProfile, Region } from './types';

/* ── pre-answers from CuddleCue's log ─────────────────────────────────────────────────────── */

export interface LogPreAnswer {
  /** How the log reads: no meals, a few tastes, or plenty. */
  stage: 'getting_ready' | 'started' | 'eating_many';
  /** The first logged meal's day, the first taste. */
  firstDay: IsoDay | null;
  /** Distinct solids meals in the log. */
  meals: number;
  /** Library and custom food ids the log names. */
  foodIds: string[];
}

/** Six weeks of solids, or twenty different foods, reads as "eats lots of foods" (§2.4 Q1). */
const LOTS_DAYS = 42;
const LOTS_FOODS = 20;

export function preAnswerFromLog(exposures: readonly Exposure[], today: IsoDay): LogPreAnswer {
  const past = exposures.filter(e => e.day <= today);
  if (past.length === 0) return { stage: 'getting_ready', firstDay: null, meals: 0, foodIds: [] };
  const firstDay = past.map(e => e.day).sort()[0] ?? null;
  const foodIds = [...new Set(past.map(e => e.foodId).filter((x): x is string => x !== null))];
  const meals = new Set(past.map(e => e.activityId)).size;
  const lots =
    (firstDay !== null && addDays(firstDay, LOTS_DAYS) <= today) || foodIds.length >= LOTS_FOODS;
  return { stage: lots ? 'eating_many' : 'started', firstDay, meals, foodIds };
}

/** The guidance set from the phone's locale: en-GB is the UK, en-CA Canada, en-AU Australia. */
export function regionFromLocale(locale: string | null | undefined): Region {
  const tag = (locale ?? '').replace('_', '-').toUpperCase();
  if (/-(GB|UK)\b/.test(tag)) return 'UK';
  if (/-CA\b/.test(tag)) return 'CA';
  if (/-AU\b/.test(tag)) return 'AU';
  return 'US';
}

/* ── the start-day answer ─────────────────────────────────────────────────────────────────── */

export type StartChoice = 'today' | 'day' | 'signs';

/** §2.4 Q2 Part B's default: today with every sign seen from six months; the six-month day with
 *  some signs before it; otherwise when the signs come. */
export function defaultStartChoice(signsSeen: number, months: number): StartChoice {
  if (signsSeen >= 4 && months >= 6) return 'today';
  if (signsSeen > 0 && months < 6) return 'day';
  return 'signs';
}

/* ── what the app says back: the setup summary ────────────────────────────────────────────── */

export interface SummaryDay {
  day: IsoDay;
  items: (PlanItem & { meal: MealName })[];
}

export interface SetupSummary {
  /** The first day with food on the plan, or null when the plan waits for the signs. */
  startDay: IsoDay | null;
  /** The first seven days with food, from the start day. */
  firstWeek: SummaryDay[];
  /** Each allergen the first two weeks introduce, and the day. */
  allergenStarts: { allergen: AllergenId; day: IsoDay }[];
  /** The family's order of the allergens still to come. */
  order: AllergenId[];
  /** Peanut waits for the pediatrician (severe eczema or an egg allergy, NIAID). */
  peanutWaits: boolean;
  /** Foods the plan counts as tried already. */
  triedCount: number;
}

export function setupSummary(
  plan: readonly PlanDay[],
  profile: NibbleProfile,
  tried: number,
): SetupSummary {
  const withFood = plan.filter(d => !d.skip && d.meals.some(m => m.items.length > 0));
  const firstWeek = withFood.slice(0, 7).map(d => ({
    day: d.day,
    items: d.meals.flatMap(m => m.items.map(i => ({ ...i, meal: m.meal }))),
  }));
  const allergenStarts: { allergen: AllergenId; day: IsoDay }[] = [];
  for (const d of withFood)
    for (const m of d.meals)
      for (const i of m.items)
        if (i.firstAllergen !== null)
          allergenStarts.push({ allergen: i.firstAllergen, day: d.day });
  const started = new Set(allergenStarts.map(a => a.allergen));
  const already = new Set(profile.introducedBefore.map(i => i.allergen));
  const order = allergenOrder(profile.allergenOrder).filter(
    a => !profile.diagnosed.includes(a) && !already.has(a) && !started.has(a),
  );
  return {
    startDay: withFood[0]?.day ?? null,
    firstWeek,
    allergenStarts,
    order: profile.allergenMode === 'none' ? [] : order,
    peanutWaits:
      profile.allergenMode !== 'none' &&
      higherPeanutRisk(profile) &&
      !profile.approved.some(a => a.allergen === 'peanut'),
    triedCount: tried,
  };
}

/* ── after a meal is logged: when each food comes back ────────────────────────────────────── */

export interface NextOffer {
  foodId: string;
  /** The next day the plan offers it, after `after`; null when not in the plan window. */
  day: IsoDay | null;
  item: PlanItem | null;
}

/**
 * The plan as it will be once these foods are in the log: for each, the next day it is offered.
 * The served foods are added as exposures on `day` with the parent's answer, so a refused food
 * comes back on the retry day in a new form, exactly as the planner will lay it out.
 */
export function nextOffers(
  input: PlanInput,
  served: readonly { food: Food; response: Exposure['response'] }[],
  day: IsoDay,
  at: string,
): NextOffer[] {
  const added: Exposure[] = served.map((s, i) => ({
    activityId: `served:${i}`,
    at,
    day,
    foodId: s.food.id,
    key: `id:${s.food.id}`,
    name: s.food.name,
    response: s.response,
    form: null,
    allergens: s.food.allergens,
    meal: null,
  }));
  const plan = buildPlan({ ...input, exposures: [...input.exposures, ...added] });
  return served.map(s => {
    for (const d of plan) {
      if (d.day <= day) continue;
      for (const m of d.meals) {
        const item = m.items.find(i => i.foodId === s.food.id);
        if (item) return { foodId: s.food.id, day: d.day, item };
      }
    }
    return { foodId: s.food.id, day: null, item: null };
  });
}
