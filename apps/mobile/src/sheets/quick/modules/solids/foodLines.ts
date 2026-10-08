/**
 * THE SOLIDS SHEET'S FOOD LINES, as data (the owner, 2026-09-24; docs/SOLIDS.md §2): one line
 * per food — a name and an amount — a plus for the next, and then how it went.
 *
 * Kept out of the component so every rule here is a node test: which unit a line starts in,
 * what tapping a suggestion does, what "Loved it" at the top does to three foods, and what the
 * sheet refuses to save. The component is layout.
 */
import {
  FOODS_PER_MEAL_MAX,
  amountFieldText,
  foodKey,
  foodNameTooLong,
  itemsForSave,
  parseFoodAmount,
  sharedResponse,
  tidyFoodName,
  type FoodResponse,
  type FoodSummary,
  type FoodUnit,
  type SolidsItem,
} from '@nibblecue/core';

export interface FoodLine {
  /** A key for the list, never stored. */
  id: string;
  name: string;
  /** What is in the amount field, as typed — read with `parseFoodAmount` only when saved. */
  amountText: string;
  unit: FoodUnit;
  /** The parent picked this unit themselves, so recognising the food must not change it. */
  unitChosen: boolean;
  /**
   * The unit the line started in, before any food was recognised on it — what it goes back to
   * when the name stops being a food the household knows. Absent on a line from before it
   * existed, which then keeps whatever unit it has.
   */
  baseUnit?: FoodUnit;
  response: FoodResponse | null;
}

let seq = 0;
const nextId = (): string => `food-${String(++seq)}`;

/**
 * A blank line, in the unit the household used last — and, when the meal already has one answer
 * for every food, with that answer (`response`), so a food added after "Loved it" is one of the
 * foods it was said of rather than the one that silently unset it (the audit of 2026-09-24, M2).
 */
export function emptyLine(unit: FoodUnit, response: FoodResponse | null = null): FoodLine {
  return {
    id: nextId(),
    name: '',
    amountText: '',
    unit,
    baseUnit: unit,
    unitChosen: false,
    response,
  };
}

/** The unit the household last counted this food in, or null for a food it has not logged. */
function knownUnit(name: string, foods: readonly FoodSummary[]): FoodUnit | null {
  const key = foodKey(name);
  if (key === '') return null;
  return foods.find(f => f.key === key)?.lastUnit ?? null;
}

/**
 * WHICH UNIT A NEW LINE STARTS IN: the one the household used most recently, because a family
 * that counts spoons counts spoons for everything. Pieces before anything is known — the owner's
 * own example was "strawberry 5, banana 1".
 */
export function defaultUnit(foods: readonly FoodSummary[]): FoodUnit {
  return foods.find(f => f.lastUnit !== null)?.lastUnit ?? 'PIECE';
}

/**
 * An existing meal's foods as lines — the editor opens on these. Always at least one line.
 *
 * A food saved with no amount has no unit, so its line opens in the food's OWN unit when the
 * household has counted it before (`foods`), not in pieces whatever it was (M1). An amount opens
 * as the parent typed it — 1/8, not 0.125 (`amountFieldText`, M4).
 */
export function linesFromItems(
  items: readonly SolidsItem[],
  fallback: FoodUnit,
  foods: readonly FoodSummary[] = [],
): FoodLine[] {
  if (items.length === 0) return [emptyLine(fallback)];
  return items.map(i => ({
    id: nextId(),
    name: i.name,
    amountText: i.amount === null ? '' : amountFieldText(i.amount),
    unit: i.unit ?? knownUnit(i.name, foods) ?? fallback,
    baseUnit: fallback,
    unitChosen: i.unit !== null,
    response: i.response,
  }));
}

/**
 * A NAME TYPED OR PICKED. When it is a food the household has logged before, the line takes that
 * food's last unit — the second time a parent types "oatmeal" it is already in tablespoons —
 * unless they have already chosen one for this line.
 *
 * AND WHEN IT STOPS BEING THAT FOOD, the unit goes back to the line's own (the audit of
 * 2026-09-24, M1). This runs on every keystroke, so "Peach" passes through "Pea": the line took
 * peas' grams there and kept them, and Peach 2 was saved as 2 g — as were Rice → Rice cereal,
 * Egg → Eggplant, Banana → Banana bread.
 */
export function withName(line: FoodLine, name: string, foods: readonly FoodSummary[]): FoodLine {
  if (line.unitChosen) return { ...line, name };
  const unit = knownUnit(name, foods) ?? line.baseUnit ?? line.unit;
  return { ...line, name, unit };
}

/**
 * AN AMOUNT TYPED. The first amount on a line whose unit nobody chose settles the unit on the
 * food's own, if the household has counted it before — a line opened before the household's
 * foods had loaded was still in pieces (M1). The text is kept exactly as typed.
 */
export function withAmount(
  line: FoodLine,
  amountText: string,
  foods: readonly FoodSummary[],
): FoodLine {
  if (line.unitChosen || line.amountText.trim() !== '') return { ...line, amountText };
  return { ...line, amountText, unit: knownUnit(line.name, foods) ?? line.unit };
}

/** The unit a line shows: its own once chosen or counted, else the food's own when it is known. */
export function unitShown(line: FoodLine, foods: readonly FoodSummary[]): FoodUnit {
  if (line.unitChosen || line.amountText.trim() !== '') return line.unit;
  return knownUnit(line.name, foods) ?? line.unit;
}

/**
 * A suggestion tapped: it fills the last line if that is still blank, or starts a new one — with
 * the meal's one answer, when it has one (`response`, M2).
 */
export function addFood(
  lines: readonly FoodLine[],
  food: FoodSummary,
  fallback: FoodUnit,
  foods: readonly FoodSummary[],
  response: FoodResponse | null = null,
): FoodLine[] {
  const last = lines[lines.length - 1];
  if (last !== undefined && tidyFoodName(last.name) === '' && last.amountText.trim() === '') {
    const filled = withName(last, food.name, foods);
    return [...lines.slice(0, -1), { ...filled, response: filled.response ?? response }];
  }
  if (lines.length >= FOODS_PER_MEAL_MAX) return [...lines];
  return [...lines, withName(emptyLine(fallback, response), food.name, foods)];
}

/** The lines that name a food — the only ones that are saved or asked about. */
export const namedLines = (lines: readonly FoodLine[]): FoodLine[] =>
  lines.filter(l => tidyFoodName(l.name) !== '');

/** "How did it go?" at the top: one answer for every food, or none. */
export function setAllResponses(
  lines: readonly FoodLine[],
  response: FoodResponse | null,
): FoodLine[] {
  return lines.map(l => ({ ...l, response }));
}

/**
 * BACK TO ONE ANSWER FOR THE MEAL ("Same for all"). Foods that went differently have no one
 * answer, so theirs are cleared and the question is asked once again — the top row shows nothing
 * chosen, and nothing is saved that it does not show. It only hid the per-food rows, and the
 * mixed answers went on being saved under a row that showed none (the audit of 2026-09-24, M3).
 * Answers that all agree are kept.
 */
export function sameForAll(lines: readonly FoodLine[]): FoodLine[] {
  return responsesDiffer(lines) ? setAllResponses(lines, null) : [...lines];
}

/** The answer the top row shows: the one every named food shares, else none. */
export function mealResponse(lines: readonly FoodLine[]): FoodResponse | null {
  return sharedResponse(namedLines(lines).map(toItem));
}

/** Whether the foods went differently — the sheet opens the per-food rows when they did. */
export function responsesDiffer(lines: readonly FoodLine[]): boolean {
  const named = namedLines(lines);
  return new Set(named.map(l => l.response)).size > 1;
}

export type LineProblem = 'amount' | 'name' | 'long';

/**
 * WHAT STOPS A SAVE, per line, and nothing else: an amount the sheet cannot read, an amount with
 * no food beside it, or a name longer than a saved name may be. A blank line is not a problem — it
 * is simply not saved.
 *
 * Only an older meal's text can be too long (its one field took 200 characters, and it is read
 * whole). Saving it would cut it at sixty where the parent cannot see, so the line says so and the
 * parent chooses what to keep — the rest fits in the meal's note.
 */
export function lineProblem(line: FoodLine): LineProblem | null {
  const amount = parseFoodAmount(line.amountText);
  if (amount === undefined) return 'amount';
  if (amount !== null && tidyFoodName(line.name) === '') return 'name';
  if (foodNameTooLong(line.name)) return 'long';
  return null;
}

/** More foods than a meal may hold — again only an older meal's text, split on its commas. */
export const tooManyFoods = (lines: readonly FoodLine[]): boolean =>
  namedLines(lines).length > FOODS_PER_MEAL_MAX;

export const linesReady = (lines: readonly FoodLine[]): boolean =>
  lines.every(l => lineProblem(l) === null) && !tooManyFoods(lines);

/**
 * THE SAME FOODS AS TYPED — names, amounts, units and answers, whatever the lines' ids. The editor
 * asks it of the lines a meal opened with: an older meal whose foods were not touched can still
 * have its time or its note corrected, even when one of its lines could not be saved as it stands.
 */
export function sameLines(a: readonly FoodLine[], b: readonly FoodLine[]): boolean {
  const view = (lines: readonly FoodLine[]) =>
    JSON.stringify(lines.map(l => [l.name, l.amountText, l.unit, l.response]));
  return view(a) === view(b);
}

function toItem(line: FoodLine): SolidsItem {
  const amount = parseFoodAmount(line.amountText) ?? null;
  return {
    name: tidyFoodName(line.name),
    amount,
    // a unit with no amount says nothing, so it is not kept
    unit: amount === null ? null : line.unit,
    response: line.response,
  };
}

/** The list to save. Call only when `linesReady` — `itemsForSave` refuses anything else. */
export function itemsFromLines(lines: readonly FoodLine[]): SolidsItem[] {
  return itemsForSave(namedLines(lines).map(toItem));
}
