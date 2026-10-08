/**
 * ── THE WORDS THE PLAN USES ───────────────────────────────────────────────────────────────────
 *
 * Every sentence a parent reads about the plan, in one place so `copy.test.ts` can hold all of it
 * to the studio's voice: sentence case, plain, warm, short, US English, no dashes in a sentence,
 * and nothing from `NIBBLE_BANNED` (no verdict on the baby, no condition, no promise). The "why"
 * of an item says what the PLAN is doing (variety, iron, a first taste), never what the baby needs.
 */
import { ALLERGENS } from './allergens';
import type { AllergenStateKind } from './history';
import type { Reason } from './planner/plan';
import type { AllergenId, Form, MealName, Sign } from './types';

export const MEAL_LABEL: Readonly<Record<MealName, string>> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  snack: 'Snack',
  dinner: 'Dinner',
};

export const FORM_LABEL: Readonly<Record<Form, string>> = {
  puree: 'Smooth purée',
  mashed: 'Mashed',
  lumpy: 'Lumpy mash',
  soft_stick: 'Soft sticks',
  finger: 'Small soft pieces',
  minced: 'Minced',
  chopped: 'Chopped',
  family: 'Family food, cut small',
  spread: 'Thinly spread',
  mixed_in: 'Stirred into a food they know',
  drink: 'In an open cup',
};

export const STATE_LABEL: Readonly<Record<AllergenStateKind, string>> = {
  not_started: 'Not offered yet',
  introduced: 'Introduced',
  keeping_going: 'Keeping it going',
  established: 'Part of the week',
  held: 'On hold',
  excluded: 'Not planned',
  ask_first: 'Talk to your pediatrician first',
  not_planned: 'Not planned',
};

/** What was seen, in plain words. Never the name of a condition. */
export const SIGN_LABEL: Readonly<Record<Sign, string>> = {
  rash: 'Rash or red skin',
  hives: 'Hives',
  itchy_mouth: 'Itchy mouth or lips',
  vomiting: 'Vomiting',
  diarrhea: 'Diarrhea',
  mucus_stool: 'Mucus in stool',
  swelling: 'Swelling of face, lips or tongue',
  breathing: 'Trouble breathing or noisy breathing',
  pale_floppy: 'Pale, blue or floppy',
  other: 'Something else',
};

const names = (ids: readonly AllergenId[]): string => {
  const list = ids.map(a => ALLERGENS[a].name.toLowerCase());
  if (list.length <= 1) return list[0] ?? '';
  return `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
};

export interface ReasonInput {
  reason: Reason;
  firstAllergen?: AllergenId | null;
  keepGoing?: readonly AllergenId[];
  note?: string | null;
}

/** One short line per reason. The item shows its first one; the sheet shows them all. */
export function reasonText(r: ReasonInput): string {
  switch (r.reason) {
    case 'pinned':
      return 'You added this.';
    case 'first_allergen':
      return r.firstAllergen
        ? `A first taste of ${ALLERGENS[r.firstAllergen].name.toLowerCase()}: a small amount, at home, early in the day.`
        : 'A first taste: a small amount, at home, early in the day.';
    case 'new_food':
      return 'Something new to try today.';
    case 'keep_going':
      return r.keepGoing && r.keepGoing.length > 0
        ? `Keeps ${names(r.keepGoing)} in the week.`
        : 'Keeps a familiar allergen in the week.';
    case 'iron':
      return 'A good source of iron.';
    case 'vitamin_c':
      return 'Vitamin C helps the body use iron from plant foods.';
    case 'liked':
      return 'This went well before.';
    case 'retry':
      return 'Back in a different form. Many tries is common.';
    case 'familiar':
      return 'A familiar food at this meal.';
    case 'variety':
      return 'For variety across the week.';
    case 'softening':
      return 'Pears, prunes and peaches can help soften stools.';
    case 'suggested':
      return r.note ?? 'An idea for variety.';
    case 'again_today':
      return 'Today’s new food again, for a second taste.';
  }
}

/** The line under a meal on Today when the plan holds a first allergen. */
export const FIRST_ALLERGEN_TIP =
  'Offer it at home, earlier in the day, with nothing else new. Watch for a few hours after.';

/** Said beside the plan, the allergen tracker and what was noticed (spec §14). */
export const NOT_MEDICAL_ADVICE =
  "General guidance, not medical advice. Follow your pediatrician's advice for your baby.";

/** The words beside a held allergen. The app never suggests offering it again (spec §1). */
export const HELD_TEXT =
  'On hold after something you noticed. Talk to your pediatrician before offering it again.';

/** The one sentence on every reaction screen (spec §6.4: "possible reaction", never "allergic"). */
export const NOTICED_TEXT =
  'Possible reactions are worth writing down. Your notes, times and photos are kept for your pediatrician.';

/** Refusal is information, never failure (spec §6.4). */
export const REFUSAL_TEXT =
  'Many babies need 10 to 15 tries before a food is accepted. It will come back in a new form.';
