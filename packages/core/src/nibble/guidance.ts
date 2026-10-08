/**
 * ── WHICH PUBLISHED CARD A PARENT SEES TODAY ──────────────────────────────────────────────────
 *
 * The cards are published guidance with their sources (`guidance.data.ts`); this only chooses
 * among them, by the baby's age, the family's region and what the day holds (a first allergen, a
 * first finger food). It never chooses by anything it would have to guess about the baby.
 */
import { GUIDANCE_DATA } from './guidance.data';
import { GuidanceCard, type CardTrigger, type Region } from './types';
import { hash } from './planner/plan';
import type { Stage } from './stage';
import type { IsoDay } from './days';

export const GUIDANCE: readonly GuidanceCard[] = GUIDANCE_DATA.map(c => GuidanceCard.parse(c));

export const GUIDANCE_BY_ID: ReadonlyMap<string, GuidanceCard> = new Map(
  GUIDANCE.map(c => [c.id, c]),
);

/** The cards for an age and a region, optionally of one trigger. */
export function cardsFor(months: number, region: Region, trigger?: CardTrigger): GuidanceCard[] {
  return GUIDANCE.filter(
    c =>
      months >= c.fromMonths &&
      months <= c.toMonths &&
      (c.regions.length === 0 || c.regions.includes(region)) &&
      (trigger === undefined || c.trigger === trigger),
  );
}

export interface DayContext {
  months: number;
  region: Region;
  stage: Stage;
  day: IsoDay;
  childId: string;
  /** The plan offers a first allergen today. */
  firstAllergen: boolean;
  /** The plan offers a finger food for the first time (a first `soft_stick` or `finger` day). */
  firstFingerFood: boolean;
  /** Days since the first logged meal, or null before one. */
  daysSinceStart: number | null;
}

/**
 * THE ONE CARD ON TODAY: the one the day calls for (getting ready, a first allergen, a first finger
 * food, the first week, the toddler months), else one of the always cards for this age, the same
 * one all day and a different one tomorrow.
 */
export function cardOfTheDay(ctx: DayContext): GuidanceCard | null {
  const pick = (trigger: CardTrigger): GuidanceCard | null => {
    const list = cardsFor(ctx.months, ctx.region, trigger);
    if (list.length === 0) return null;
    const i = Math.floor(hash(`${ctx.childId}:${ctx.day}:${trigger}`) * list.length);
    return list[Math.min(i, list.length - 1)] ?? null;
  };
  if (ctx.stage === 'getting_ready' || ctx.stage === 'too_young') return pick('getting_ready');
  if (ctx.firstAllergen) return pick('first_allergen') ?? pick('always');
  if (ctx.firstFingerFood) return pick('first_finger_food') ?? pick('always');
  if (ctx.daysSinceStart !== null && ctx.daysSinceStart < 7)
    return pick('first_week') ?? pick('always');
  if (ctx.months >= 12) {
    const toddler = hash(`${ctx.childId}:${ctx.day}:t`) < 0.5 ? pick('toddler') : null;
    if (toddler) return toddler;
  }
  return pick('always');
}
