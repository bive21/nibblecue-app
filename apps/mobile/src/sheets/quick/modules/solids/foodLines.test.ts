/**
 * The solids sheet's food lines as data (foodLines.ts): which unit a line starts in, what a
 * suggestion fills, what the one answer at the top does to every food, and what cannot be saved.
 */
import { itemsOf, summarizeFoods, type MealEntry, type SolidsItem } from '@nibblecue/core';
import { describe, expect, it } from 'vitest';
import {
  addFood,
  defaultUnit,
  emptyLine,
  itemsFromLines,
  lineProblem,
  linesFromItems,
  linesReady,
  mealResponse,
  namedLines,
  responsesDiffer,
  sameForAll,
  sameLines,
  setAllResponses,
  tooManyFoods,
  unitShown,
  withAmount,
  withName,
  type FoodLine,
} from './foodLines';

const item = (name: string, over: Partial<SolidsItem> = {}): SolidsItem => ({
  name,
  amount: null,
  unit: null,
  response: null,
  ...over,
});
const meals: MealEntry[] = [
  { id: 'm1', childId: 'ada', atMs: 1, items: [item('Oatmeal', { amount: 2, unit: 'TBSP' })] },
  { id: 'm2', childId: 'ada', atMs: 2, items: [item('Banana', { amount: 1, unit: 'PIECE' })] },
];
const foods = summarizeFoods(meals);
const line = (over: Partial<FoodLine> = {}): FoodLine => ({ ...emptyLine('PIECE'), ...over });

describe('a new line', () => {
  it('starts in the unit the household used last, pieces before anything is known', () => {
    expect(defaultUnit(foods)).toBe('PIECE'); // banana, most recent, was in pieces
    expect(defaultUnit(summarizeFoods(meals.slice(0, 1)))).toBe('TBSP');
    expect(defaultUnit([])).toBe('PIECE');
  });

  it('takes a known food’s own unit — unless the parent already chose one', () => {
    expect(withName(line(), 'oatmeal', foods).unit).toBe('TBSP');
    expect(withName(line({ unit: 'G', unitChosen: true }), 'Oatmeal', foods).unit).toBe('G');
    // an unknown food keeps the line's own unit
    expect(withName(line({ unit: 'TSP', baseUnit: 'TSP' }), 'Kiwi', foods).unit).toBe('TSP');
  });

  /**
   * A UNIT PICKED UP ON THE WAY IS PUT BACK (the audit of 2026-09-24, M1). The name is read on
   * every keystroke, so "Peach" passes through "Pea"; the line took peas' grams there and kept
   * them, and Peach 2 was saved as 2 g.
   */
  it('gives the unit back when the name stops being a known food, keystroke by keystroke', () => {
    const history = summarizeFoods([
      { id: 'p', childId: 'ada', atMs: 1, items: [item('Pea', { amount: 30, unit: 'G' })] },
      { id: 'r', childId: 'ada', atMs: 2, items: [item('Rice', { amount: 2, unit: 'TBSP' })] },
    ]);
    let l = line();
    for (const typed of ['P', 'Pe', 'Pea']) l = withName(l, typed, history);
    expect(l.unit).toBe('G');
    for (const typed of ['Peac', 'Peach']) l = withName(l, typed, history);
    expect(l.unit).toBe('PIECE');
    // saved with the amount beside it, it is what the parent counted, not peas' grams
    const saved = itemsFromLines([withAmount(l, '2', history)]);
    expect(saved).toEqual([item('Peach', { amount: 2, unit: 'PIECE' })]);
    // the same for rice → rice cereal
    let r = line();
    for (const typed of ['Rice', 'Rice c', 'Rice cereal']) r = withName(r, typed, history);
    expect(r.unit).toBe('PIECE');
    // a unit the parent chose is theirs, whatever they type after it
    const chosen = withName({ ...line(), unit: 'OZ', unitChosen: true }, 'Pea', history);
    expect(chosen.unit).toBe('OZ');
  });

  it('opens a saved food with no amount in its own unit, and settles it when an amount is typed', () => {
    const opened = linesFromItems([item('Oatmeal')], 'PIECE', foods);
    expect(opened[0]?.unit).toBe('TBSP');
    // a line opened before the household's foods arrived is settled by its first amount
    const early = linesFromItems([item('Oatmeal')], 'PIECE');
    expect(early[0]?.unit).toBe('PIECE');
    expect(unitShown(early[0] ?? line(), foods)).toBe('TBSP');
    const typed = withAmount(early[0] ?? line(), '2', foods);
    expect(typed.unit).toBe('TBSP');
    expect(itemsFromLines([typed])).toEqual([item('Oatmeal', { amount: 2, unit: 'TBSP' })]);
    // a second amount, or a chosen unit, is never moved
    expect(withAmount({ ...typed, unit: 'G' }, '3', foods).unit).toBe('G');
    expect(withAmount({ ...line({ name: 'Oatmeal' }), unitChosen: true }, '1', foods).unit).toBe(
      'PIECE',
    );
  });
});

describe('a suggestion tapped', () => {
  it('fills a blank last line, or starts a new one', () => {
    const banana = foods.find(f => f.key === 'banana');
    if (banana === undefined) throw new Error('fixture');
    const one = addFood([line()], banana, 'PIECE', foods);
    expect(one.map(l => l.name)).toEqual(['Banana']);
    const two = addFood([line({ name: 'Pear' })], banana, 'PIECE', foods);
    expect(two.map(l => l.name)).toEqual(['Pear', 'Banana']);
    // a blank line with an amount typed is not blank
    const kept = addFood([line({ amountText: '3' })], banana, 'PIECE', foods);
    expect(kept).toHaveLength(2);
  });
});

describe('how it went', () => {
  const three = [
    line({ name: 'Strawberry' }),
    line({ name: 'Banana' }),
    line(), // blank: not asked about, not saved
  ];

  it('one answer at the top sets every food', () => {
    const loved = setAllResponses(three, 'LOVED');
    expect(mealResponse(loved)).toBe('LOVED');
    expect(responsesDiffer(loved)).toBe(false);
    expect(itemsFromLines(loved).map(i => i.response)).toEqual(['LOVED', 'LOVED']);
  });

  it('shows no shared answer once the foods went differently', () => {
    const mixed = [
      line({ name: 'Strawberry', response: 'LOVED' }),
      line({ name: 'Banana', response: 'DISLIKED' }),
    ];
    expect(mealResponse(mixed)).toBeNull();
    expect(responsesDiffer(mixed)).toBe(true);
  });

  /**
   * A FOOD ADDED AFTER THE ANSWER IS ONE OF THE FOODS IT WAS SAID OF (the audit of 2026-09-24,
   * M2). The new line came with no answer, so the top chip silently unset and the meal was saved
   * as "Banana, loved it · Pear" — unless a blank line happened to be there already.
   */
  it('carries the meal’s one answer onto a food added after it', () => {
    const loved = setAllResponses([line({ name: 'Banana' })], 'LOVED');
    const shared = mealResponse(loved);
    expect(shared).toBe('LOVED');
    // "Add another food", then the name
    const added = [...loved, emptyLine('PIECE', shared)];
    const named = added.map((l, i) => (i === 1 ? withName(l, 'Pear', foods) : l));
    expect(mealResponse(named)).toBe('LOVED');
    expect(itemsFromLines(named).map(i => i.response)).toEqual(['LOVED', 'LOVED']);
    // a suggestion tapped does the same, as a new line or into the blank one
    const banana = foods.find(f => f.key === 'banana');
    if (banana === undefined) throw new Error('fixture');
    const fromChip = addFood(
      setAllResponses([line({ name: 'Pear' })], 'LIKED'),
      banana,
      'PIECE',
      foods,
      'LIKED',
    );
    expect(mealResponse(fromChip)).toBe('LIKED');
    const intoBlank = addFood(
      [line({ name: 'Pear', response: 'LIKED' }), line()],
      banana,
      'PIECE',
      foods,
      'LIKED',
    );
    expect(intoBlank.map(l => l.response)).toEqual(['LIKED', 'LIKED']);
    // and with no answer yet, a new food has none
    expect(emptyLine('PIECE').response).toBeNull();
  });

  /**
   * "SAME FOR ALL" MEANS ONE ANSWER (M3). It only hid the per-food rows, and the different
   * answers under them went on being saved while the top row showed none chosen.
   */
  it('clears answers that differ when the meal goes back to one, and keeps ones that agree', () => {
    const mixed = [
      line({ name: 'Strawberry', response: 'LOVED' }),
      line({ name: 'Banana', response: 'DISLIKED' }),
    ];
    const one = sameForAll(mixed);
    expect(mealResponse(one)).toBeNull();
    expect(itemsFromLines(one).map(i => i.response)).toEqual([null, null]);
    const agreeing = setAllResponses(mixed, 'LIKED');
    expect(sameForAll(agreeing).map(l => l.response)).toEqual(['LIKED', 'LIKED']);
  });
});

describe('what is saved', () => {
  it('saves named lines only, with the amount read and the unit only beside an amount', () => {
    const lines = [
      line({ name: ' Strawberry ', amountText: '5' }),
      line({ name: 'Banana', amountText: '1/2', unit: 'PIECE' }),
      line({ name: 'Yogurt', unit: 'TBSP' }),
      line(),
    ];
    expect(namedLines(lines)).toHaveLength(3);
    expect(itemsFromLines(lines)).toEqual([
      item('Strawberry', { amount: 5, unit: 'PIECE' }),
      item('Banana', { amount: 0.5, unit: 'PIECE' }),
      item('Yogurt'),
    ]);
  });

  it('refuses an amount it cannot read, or an amount with no food beside it', () => {
    expect(lineProblem(line({ name: 'Pear', amountText: 'lots' }))).toBe('amount');
    expect(lineProblem(line({ amountText: '2' }))).toBe('name');
    expect(lineProblem(line())).toBeNull();
    expect(lineProblem(line({ name: 'Pear', amountText: '0' }))).toBeNull();
    expect(linesReady([line({ name: 'Pear' }), line({ amountText: 'x' })])).toBe(false);
    expect(linesReady([line({ name: 'Pear' }), line()])).toBe(true);
  });

  /**
   * A FRACTION OPENS AS THE FRACTION (the audit of 2026-09-24, M4): an eighth of a teaspoon was
   * stored as 0.13 and the editor showed "0.13"; it is stored whole and opens as "1/8".
   */
  it('opens a typed fraction as the fraction, and saves it back unchanged', () => {
    const lines = [line({ name: 'Cereal', amountText: '1/8', unit: 'TSP', unitChosen: true })];
    const saved = itemsFromLines(lines);
    expect(saved).toEqual([item('Cereal', { amount: 0.125, unit: 'TSP' })]);
    const opened = linesFromItems(saved, 'PIECE');
    expect(opened[0]?.amountText).toBe('1/8');
    expect(itemsFromLines(opened)).toEqual(saved);
  });

  it('opens an existing meal as its lines, and saves them back unchanged', () => {
    const items = [
      item('Strawberry', { amount: 5, unit: 'PIECE', response: 'LOVED' }),
      item('Egg', { response: 'UNSURE' }),
    ];
    const lines = linesFromItems(items, 'TBSP');
    expect(lines.map(l => [l.name, l.amountText, l.unit, l.unitChosen])).toEqual([
      ['Strawberry', '5', 'PIECE', true],
      ['Egg', '', 'TBSP', false],
    ]);
    expect(itemsFromLines(lines)).toEqual(items);
    expect(linesFromItems([], 'G').map(l => l.unit)).toEqual(['G']);
  });
});

/**
 * AN OLDER MEAL IS NEVER CUT WHERE THE PARENT CANNOT SEE IT. Its one field took 200 characters and
 * it is read whole, so a line can be longer than a saved name may be, and a meal typed with many
 * commas can split into more foods than a list holds. Saving either as it stands would drop words;
 * the line says so instead, and the editor still saves the meal's time and note while its foods
 * are as they opened (`sameLines`).
 */
describe('an older meal read back as lines', () => {
  const sentence = 'Homemade oatmeal with mashed banana and a little bit of cinnamon on top';

  it('asks for a line too long to save to be shortened, rather than cutting it', () => {
    const opened = linesFromItems(itemsOf({ items: null, food: `${sentence}, pear` }), 'PIECE');
    expect(opened.map(l => l.name)).toEqual([sentence, 'pear']);
    expect(lineProblem(opened[0] ?? line())).toBe('long');
    expect(linesReady(opened)).toBe(false);
    // shortened by the parent, it saves as they left it
    const shortened = opened.map((l, i) => (i === 0 ? { ...l, name: 'Oatmeal' } : l));
    expect(linesReady(shortened)).toBe(true);
    expect(itemsFromLines(shortened).map(i => i.name)).toEqual(['Oatmeal', 'pear']);
  });

  it('holds a meal to twenty foods, and says so rather than dropping the rest', () => {
    const food = Array.from({ length: 21 }, (_, i) => `food ${String(i + 1)}`).join(', ');
    const opened = linesFromItems(itemsOf({ items: null, food }), 'PIECE');
    expect(opened).toHaveLength(21);
    expect(tooManyFoods(opened)).toBe(true);
    expect(linesReady(opened)).toBe(false);
    expect(tooManyFoods(opened.slice(1))).toBe(false);
    expect(linesReady(opened.slice(1))).toBe(true);
    // a blank line is not a food
    expect(tooManyFoods([...opened.slice(1), line()])).toBe(false);
  });

  it('knows the lines are as they opened, whatever their ids', () => {
    const items = itemsOf({ items: null, food: `${sentence}, pear` });
    const opened = linesFromItems(items, 'PIECE');
    const again = linesFromItems(items, 'PIECE');
    expect(again[0]?.id).not.toBe(opened[0]?.id);
    expect(sameLines(again, opened)).toBe(true);
    // one answer at the top is a change to the foods; taking it back is not
    const loved = setAllResponses(opened, 'LOVED');
    expect(sameLines(loved, opened)).toBe(false);
    expect(sameLines(setAllResponses(loved, null), opened)).toBe(true);
  });
});
