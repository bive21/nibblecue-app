/**
 * The words of the solids sheet's food lines (docs/SOLIDS.md §2).
 *
 * THE QUESTION IS "HOW DID IT GO?" — the owner asked for the baby's response to a food without
 * borrowing another app's word for it (2026-09-24: "call it something else"). The four answers
 * are the parent's read of liking, never a symptom and never the app's: anything noticed about
 * the baby goes in the meal's own words, stored verbatim (CLAUDE.md §2).
 */
import { FOOD_NAME_MAX, FOODS_PER_MEAL_MAX, type FoodResponse } from '@nibblecue/core';

/**
 * "HOW DID IT GO?" IN ONE ROW (the owner, 2026-09-27, and not for the first time: *"make it in one
 * row … loved it (heart emoji), liked it (thumbs up emoji), Not Sure (Shrug emoji), and Nope"*).
 * Four equal tiles, a face over a short word, so all four fit across the narrowest phone instead
 * of wrapping "Didn't like it" onto a second line. The word is the tile's own; the entry keeps the
 * record's words (`RESPONSE_LABEL`: "Banana, didn't like it"), and a screen reader hears those.
 * 👎 rather than ❌ for Nope: the other half of 👍, where a cross reads as an error.
 */
export const RESPONSE_TILE: Readonly<Record<FoodResponse, { face: string; word: string }>> = {
  LOVED: { face: '❤️', word: 'Loved it' },
  LIKED: { face: '👍', word: 'Liked it' },
  UNSURE: { face: '🤷', word: 'Not sure' },
  DISLIKED: { face: '👎', word: 'Nope' },
};

/** The meal's note, named by its label wherever a line points the parent to it. */
const NOTICED = 'Anything you noticed';

export const FOOD_LINES = {
  header: 'What they ate',
  nameColumn: 'Food',
  amountColumn: 'How much',
  namePlaceholder: 'e.g. Banana',
  amountPlaceholder: '–',
  nameA11y: (n: number): string => `Food ${String(n)}`,
  amountA11y: (name: string): string => (name === '' ? 'Amount' : `How much ${name}`),
  unitA11y: (unit: string): string => `Unit, ${unit}. Change`,
  removeA11y: (name: string): string => (name === '' ? 'Remove this line' : `Remove ${name}`),
  add: 'Add another food',
  recent: 'Recent',
  suggestA11y: (name: string): string => `Add ${name}`,
  firstTime: 'First time',
  amountProblem: 'Use a number, like 2 or 1/2',
  nameProblem: 'Add what it was, or clear the amount',
  // only an older meal's text can be this long; the note below takes the rest
  longProblem: `Shorten to ${String(FOOD_NAME_MAX)} characters, or move the rest to ${NOTICED}`,
  tooMany: `${String(FOODS_PER_MEAL_MAX)} foods at most. Remove one to save`,
  question: 'How did it go?',
  eachFood: 'Rate each food',
  sameForAll: 'Same for all',
  noticed: NOTICED,
  noticedPlaceholder: 'In your own words',
  /**
   * THE PROMISE UNDER THE SHEET. It was `HINTS.solids` — "Reactions are recorded exactly as you
   * write them" — and the owner asked for that word to go (2026-09-24: "call it something
   * else"). The promise it made stays whole: kept verbatim, and no allergy assessment.
   */
  hint: 'How it went and what you noticed are kept exactly as you write them, with no allergy assessment.',
} as const;
