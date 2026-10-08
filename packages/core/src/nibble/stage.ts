/**
 * ── WHERE A BABY IS ON THE JOURNEY ────────────────────────────────────────────────────────────
 *
 * Spec §8.1's stages, decided by age and by the household's own record (when the first meal was
 * logged), never by a judgement about the baby. A parent can hold the texture stage; the app
 * nudges past nine months and never blocks (hard rule 14 is a nudge, spec §8.2).
 */
import type { AgeBand, MealName, NibbleProfile } from './types';
import { addDays, daysBetween, monthsBetween, type IsoDay } from './days';

export const STAGES = [
  'too_young',
  'getting_ready',
  'first_foods',
  'expanding',
  'family_foods',
  'toddler',
] as const;
export type Stage = (typeof STAGES)[number];

export interface StageInfo {
  label: string;
  /** Meals a day the plan lays out, unless the parent chose a number. */
  meals: readonly MealName[];
  /** Foods per meal the plan aims for. */
  itemsPerMeal: number;
  /** At most this many new foods a week (allergens included). */
  newFoodsPerWeek: number;
}

export const STAGE_INFO: Readonly<Record<Stage, StageInfo>> = {
  too_young: { label: 'Not yet', meals: [], itemsPerMeal: 0, newFoodsPerWeek: 0 },
  getting_ready: { label: 'Getting ready', meals: [], itemsPerMeal: 0, newFoodsPerWeek: 0 },
  first_foods: {
    label: 'First foods',
    meals: ['breakfast', 'dinner'],
    itemsPerMeal: 1,
    newFoodsPerWeek: 5,
  },
  expanding: {
    label: 'Expanding',
    meals: ['breakfast', 'lunch', 'dinner'],
    itemsPerMeal: 2,
    newFoodsPerWeek: 6,
  },
  family_foods: {
    label: 'Family foods',
    meals: ['breakfast', 'lunch', 'dinner'],
    itemsPerMeal: 3,
    newFoodsPerWeek: 6,
  },
  toddler: {
    label: 'Toddler',
    meals: ['breakfast', 'lunch', 'snack', 'dinner'],
    itemsPerMeal: 3,
    newFoodsPerWeek: 4,
  },
};

/** Six weeks of first foods before the plan widens (spec §8.1). */
export const FIRST_FOODS_DAYS = 42;

/** The serving band for an age in months. Under nine months reads the first band. */
export function bandFor(months: number): AgeBand {
  if (months >= 18) return '18-24';
  if (months >= 12) return '12-17';
  if (months >= 9) return '9-11';
  return '6-8';
}

export interface StageInput {
  birthDate: IsoDay;
  day: IsoDay;
  profile: Pick<NibbleProfile, 'stage' | 'startedOn' | 'ready'> &
    Partial<Pick<NibbleProfile, 'startOn'>>;
  /** The first day a meal was logged for this baby, from the household's own record. */
  firstMealDay: IsoDay | null;
}

/**
 * The day solids started: the parent's first-taste date, the first logged meal, or the planned
 * start day once it has come, whichever is earliest; else null.
 */
export function startDay(input: StageInput): IsoDay | null {
  const planned = input.profile.startOn ?? null;
  const candidates = [
    input.profile.startedOn,
    input.firstMealDay,
    planned !== null && planned <= input.day ? planned : null,
  ].filter((d): d is IsoDay => d !== null);
  if (candidates.length === 0) return null;
  return candidates.sort()[0] ?? null;
}

export function stageFor(input: StageInput): Stage {
  const months = monthsBetween(input.birthDate, input.day);
  // hard rule 1: no solids before four months, whatever else is set
  if (months < 4) return 'too_young';
  const started = startDay(input);
  const startedBy = started !== null && started <= input.day;
  // NOT STARTED YET: the plan waits only while the parent has not confirmed the readiness signs.
  // From four months, a baby whose parent says the signs are there gets a first-foods plan from
  // today (AAP and CDC: around six months, never before four, when the baby shows the signs); a
  // parent who says "not yet" sees the signs to watch for, and the plan starts when they say so.
  if (!startedBy) {
    // a planned start day still to come: the plan waits for it
    if ((input.profile.startOn ?? null) !== null) return 'getting_ready';
    if (!input.profile.ready) return 'getting_ready';
  }
  if (months >= 12) return 'toddler';
  if (months >= 9) return 'family_foods';
  if (input.profile.stage === 'eating_many') return 'expanding';
  const from = startedBy ? (started as IsoDay) : input.day;
  return daysBetween(from, input.day) < FIRST_FOODS_DAYS ? 'first_foods' : 'expanding';
}

/** The meals the plan lays out for a stage: the parent's count where they set one. */
export function mealsFor(stage: Stage, mealsPerDay: number | null): MealName[] {
  const base = STAGE_INFO[stage].meals;
  if (base.length === 0) return [];
  if (mealsPerDay === null) return [...base];
  const order: MealName[] = ['breakfast', 'dinner', 'lunch', 'snack'];
  const chosen = order.slice(0, Math.max(1, Math.min(4, mealsPerDay)));
  const day: MealName[] = ['breakfast', 'lunch', 'snack', 'dinner'];
  return day.filter(m => chosen.includes(m));
}

/** The day a baby turns `months` old: when a stage boundary arrives. */
export function dayAtMonths(birthDate: IsoDay, months: number): IsoDay {
  const [y, m, d] = birthDate.split('-').map(Number) as [number, number, number];
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return addDays(target.toISOString().slice(0, 10), 0);
}
