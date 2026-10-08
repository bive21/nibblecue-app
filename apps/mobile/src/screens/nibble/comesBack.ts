import { type FoodResponse } from '@nibblecue/core';
import {
  ALLERGENS,
  FORM_LABEL,
  nextOffers,
  type Food,
  type PlanInput,
  type PlanMeal,
} from '@nibblecue/core/nibble';
import { SERVE } from './copy';
import { dayLabel } from './dates';

/**
 * What the plan does next with what was just served (docs/research/MARKET_AND_SETUP.md §3.4), read
 * off the planner's next run with this meal in the log, never guessed: a first allergen joins the
 * week, a food someone did not like comes back on its retry day in another form, and any other
 * food comes back on the day the plan offers it again. One line, for the meal's first new thing,
 * else its first food. Null when the plan does not offer it again in its window.
 */
export function comesBack(
  input: PlanInput,
  foods: readonly { food: Food; response: FoodResponse | null }[],
  day: string,
  at: string,
  meal: PlanMeal,
): string | null {
  const allergen = meal.items.find(i => i.firstAllergen !== null)?.firstAllergen ?? null;
  const disliked = foods.find(f => f.response === 'DISLIKED');
  if (allergen !== null && !disliked) return SERVE.allergenInWeek(ALLERGENS[allergen].name);
  const pick =
    disliked ??
    foods.find(f => meal.items.some(i => i.foodId === f.food.id && i.isNew)) ??
    foods[0];
  if (pick === undefined) return null;
  const [offer] = nextOffers(input, [pick], day as PlanInput['today'], at);
  if (offer === undefined || offer.day === null || offer.item === null) return null;
  const first = meal.items.find(i => i.foodId === pick.food.id);
  return first && offer.item.form !== first.form
    ? SERVE.comesBackAs(
        pick.food.name,
        dayLabel(offer.day),
        FORM_LABEL[offer.item.form].toLowerCase(),
      )
    : SERVE.comesBack(pick.food.name, dayLabel(offer.day));
}
