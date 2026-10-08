/**
 * What a Quick Entry sheet opens with (PRODUCT_SPEC.md §5.3).
 *
 * "Logging becomes picking" is the whole design of this app, and the pre-fill is most of it:
 * a bottle opens on the last bottle's amount and kind, growth on the last measurement, pump
 * on the last session's sides, solids on the meal the clock implies. A parent who feeds the
 * same 4 oz of the same formula eight times a day taps Save eight times and types nothing.
 *
 * Every value is a PRE-SELECTION and never a claim. It is the household's own last entry read
 * back, or a time of day read off a clock — nothing is inferred about the baby, nothing is
 * suggested, and every field stays editable. That is what keeps the pre-fill on the right side
 * of the no-recommendation rule while still removing the typing.
 *
 * ONLY THE CLOCK-DERIVED PART LIVES HERE. The rest of §5.3 — the last bottle's kind, the last
 * session's left and right — is read from the DETAIL tables, which the Today projection
 * deliberately does not carry: adding `bottle_details.kind` and the pump sides to every row
 * Today reads would widen a hot query for a value only one sheet wants. Each sheet loads its
 * own last row in WP5.3 and WP5.4. A helper here that returned nulls for those fields would
 * be a seam that lies.
 */
import { wallClock } from '../today/day';

export type Meal = 'BREAKFAST' | 'LUNCH' | 'SNACK' | 'DINNER';

/** Meal boundaries in local minutes-from-midnight, half-open so no instant has two meals. */
const BREAKFAST_FROM = 5 * 60;
const LUNCH_FROM = 10 * 60 + 30;
const LUNCH_TO = 14 * 60;
const DINNER_FROM = 17 * 60;
const DINNER_TO = 21 * 60;

/**
 * The meal a solids sheet opens on, from the household's wall clock.
 *
 * The boundaries are conventional and deliberately coarse; this is a starting pill, not a
 * statement about when a baby should eat. Anything outside the three windows is a snack,
 * including the middle of the night — which is both the honest answer and the one a parent is
 * least likely to have to change at 2 a.m.
 *
 * 05:00–10:30 breakfast · 10:30–14:00 lunch · 17:00–21:00 dinner · everything else a snack.
 */
export function mealForTime(atMs: number, timeZone: string): Meal {
  const { hour, minute } = wallClock(timeZone, atMs);
  return mealForMinutes(hour * 60 + minute);
}

/**
 * The same four windows for a clock time already read off the wall: minutes since local midnight.
 * A set time is stored as `HH:MM` with no instant behind it, and the solids rhythm reads an older,
 * unnamed one back as the meal these windows give it (`schedule/meals.ts`).
 */
export function mealForMinutes(minutesOfDay: number): Meal {
  const mins = ((Math.round(minutesOfDay) % 1440) + 1440) % 1440;
  if (mins >= BREAKFAST_FROM && mins < LUNCH_FROM) return 'BREAKFAST';
  if (mins >= LUNCH_FROM && mins < LUNCH_TO) return 'LUNCH';
  if (mins >= DINNER_FROM && mins < DINNER_TO) return 'DINNER';
  return 'SNACK';
}

/** The pill labels, in the order §6.6 lists them. */
export const MEALS: readonly Meal[] = ['BREAKFAST', 'LUNCH', 'SNACK', 'DINNER'];

export const MEAL_LABEL: Readonly<Record<Meal, string>> = {
  BREAKFAST: 'Breakfast',
  LUNCH: 'Lunch',
  SNACK: 'Snack',
  DINNER: 'Dinner',
};

/**
 * How much of an offered solid was taken (§6.6), stored as the enum and shown as the phrase.
 *
 * Five buckets and no arithmetic: there is no percentage, no running average and nothing that
 * turns "some" into a number, because the moment it became a number something would be
 * tempted to chart it and the app does not interpret feeding.
 */
// the storage enum is `SolidsDetail.taken` in domain-types.ts — the same five words, verbatim
export type Amount = 'NONE' | 'LITTLE' | 'SOME' | 'MOST' | 'ALL';

export const AMOUNTS: readonly Amount[] = ['NONE', 'LITTLE', 'SOME', 'MOST', 'ALL'];

export const AMOUNT_LABEL: Readonly<Record<Amount, string>> = {
  NONE: 'None',
  LITTLE: 'A little',
  SOME: 'Some',
  MOST: 'Most',
  ALL: 'All',
};
