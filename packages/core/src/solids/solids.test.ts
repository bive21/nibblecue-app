/**
 * Solids as a list of foods (docs/SOLIDS.md): the shape a meal is saved in, how an older meal's
 * text is read into it, how two spellings of one food become one food, and the history and
 * report built on top — every one of them arithmetic over the household's own meals.
 */
import { describe, expect, it } from 'vitest';
import { BANNED } from '../schedule/foresight.banned';
import {
  FOOD_RESPONSES,
  RESPONSE_LABEL,
  UNIT_CHOICE_LABEL,
  amountFieldText,
  amountLabel,
  foodKey,
  formatFoodAmount,
  foodListText,
  foodNameTooLong,
  itemLabel,
  itemsForSave,
  itemsOf,
  mealLine,
  parseFoodAmount,
  parseItems,
  sharedResponse,
  splitLegacyFood,
  tidyFoodName,
  type SolidsItem,
} from './items';
import {
  firstTimes,
  foodReport,
  isFirstTime,
  responseCounts,
  suggestFoods,
  summarizeFoods,
  type MealEntry,
} from './history';

const DAY = 86_400_000;
const T0 = Date.parse('2026-09-01T12:00:00Z');

const item = (name: string, over: Partial<SolidsItem> = {}): SolidsItem => ({
  name,
  amount: null,
  unit: null,
  response: null,
  ...over,
});
const meal = (
  id: string,
  day: number,
  items: SolidsItem[],
  over: Partial<MealEntry> = {},
): MealEntry => ({ id, childId: 'ada', atMs: T0 + day * DAY, items, ...over });

describe('one food, however it was typed', () => {
  it('tidies a name and nothing more', () => {
    expect(tidyFoodName('  sweet   potato \n')).toBe('sweet potato');
    expect(tidyFoodName('x'.repeat(90))).toHaveLength(60);
  });

  /**
   * AN EMOJI IS NEVER CUT IN HALF. `.slice(0, 60)` counts UTF-16 units, so a name with an emoji
   * across the sixtieth unit ended in half a character — and Postgres refuses the JSON that
   * carries one, failing the whole push (found by the server-side tests of migration 0114).
   */
  it('counts characters the way the server does, and never splits one', () => {
    const long = `${'a'.repeat(59)}🍓🍌`;
    const clipped = tidyFoodName(long);
    expect(Array.from(clipped)).toHaveLength(60);
    expect(clipped.endsWith('🍓')).toBe(true);
    // no lone surrogate survives, anywhere a name travels
    expect(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(clipped)).toBe(false);
    // and sixty characters with emoji in them are sixty, not more
    const emoji = '🍓'.repeat(60);
    expect(() => itemsForSave([item(emoji)])).not.toThrow();
    expect(() => itemsForSave([item(`${emoji}x`)])).not.toThrow(); // tidied to sixty first
    // four sixty-emoji foods join to 246 characters; the text beside the list keeps 200 whole ones
    const joined = foodListText(['🍓', '🍌', '🥑', '🍐'].map(e => item(e.repeat(60)))) ?? '';
    expect(Array.from(joined)).toHaveLength(200);
    expect(
      /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(joined),
    ).toBe(false);
  });

  /**
   * THE OWNER'S OWN CASE: "strawberry and banana" typed as one line could never be found again.
   * Now each food is its own line, and a line typed a second way still lands on the same food.
   */
  it('is one food across case, spacing, accents and a plain plural', () => {
    const one = ['Strawberry', 'strawberries', ' STRAWBERRY ', 'Strawberry.'];
    expect(new Set(one.map(foodKey))).toEqual(new Set(['strawberry']));
    expect(foodKey('Peaches')).toBe('peach');
    expect(foodKey('peas')).toBe('pea');
    expect(foodKey('Sweet potatoes')).toBe('sweet potato');
    expect(foodKey('Purée de pomme')).toBe('puree de pomme');
    expect(foodKey('Avocados')).toBe('avocado');
  });

  it('leaves alone the words that only look plural', () => {
    for (const w of ['hummus', 'couscous', 'asparagus', 'swiss', 'rice', 'oat']) {
      expect(foodKey(w)).toBe(w);
    }
    // a typo stays a different word: suggestions, not guessing, keep the spellings together
    expect(foodKey('straberry')).not.toBe(foodKey('strawberry'));
    // "and" is part of a name, not a separator
    expect(foodKey('Mac and cheese')).toBe('mac and cheese');
  });

  /**
   * THE PAIRS THE AUDIT OF 2026-09-24 FOUND COUNTED AS TWO FOODS. Each split a food's count in
   * two and marked the second spelling "First time". The key is never shown, so it only has to
   * put both spellings in one place.
   */
  it('keeps a singular and its plural together, whatever the word ends in', () => {
    const pairs: [string, string][] = [
      ['Cookie', 'Cookies'],
      ['Veggie', 'Veggies'],
      ['Smoothie', 'Smoothies'],
      ['Brownie', 'Brownies'],
      ['Kiwi', 'Kiwis'],
      ['Zucchini', 'Zucchinis'],
      ['Quiche', 'Quiches'],
      ['Mousse', 'Mousses'],
      ['Brie', 'Bries'],
      ['Pie', 'Pies'],
      ['Fry', 'Fries'],
      ['Strawberry', 'Strawberries'],
      ['Peach', 'Peaches'],
      ['Potato', 'Potatoes'],
      ['Mango', 'Mangoes'],
      ['Mango', 'Mangos'],
      ['Grape', 'Grapes'],
      ['Cheese', 'Cheeses'],
      ['Egg', 'Eggs'],
      ['Pea', 'Peas'],
      ['Oat', 'Oats'],
      ['Chocolate chip cookie', 'Chocolate chip cookies'],
    ];
    for (const [one, many] of pairs) expect(foodKey(many), `${one}/${many}`).toBe(foodKey(one));
    // and nothing that was one food becomes two different ones
    expect(foodKey('Pear')).not.toBe(foodKey('Peach'));
    expect(foodKey('Pea')).not.toBe(foodKey('Pear'));
    expect(foodKey('Cookie')).not.toBe(foodKey('Cook'));
  });

  /**
   * A NAME OF SYMBOLS ALONE — the emoji a parent types for a banana — used to key as nothing,
   * and a food with no key was skipped by every count: in the log, and nowhere in Reports, the
   * visit summary, the first times or the suggestions.
   */
  it('keys a name with no letters as the name itself, so it is counted like any other', () => {
    expect(foodKey('🍌')).toBe('🍌');
    expect(foodKey(' 🍌 ')).toBe('🍌');
    // the variation selector a keyboard may add is the same picture
    expect(foodKey('🍌️')).toBe(foodKey('🍌'));
    expect(foodKey('🍓')).not.toBe(foodKey('🍌'));
    // a name with letters keeps the letters' key: the picture beside a word is decoration
    expect(foodKey('🍌 banana')).toBe(foodKey('Banana'));
    expect(foodKey('')).toBe('');
    expect(foodKey('   ')).toBe('');
    const meals: MealEntry[] = [
      meal('e1', 0, [item('🍌')]),
      meal('e2', 3, [item('🍌'), item('Pear')]),
    ];
    const summary = summarizeFoods(meals);
    expect(summary.find(f => f.name === '🍌')).toMatchObject({ key: '🍌', times: 2 });
    expect(firstTimes(meals).get('🍌')).toBe(T0);
    expect(isFirstTime('🍌', meals, T0 + 10 * DAY)).toBe(false);
    expect(foodReport(meals, T0, T0 + 7 * DAY).firsts.map(f => f.name)).toEqual(['🍌', 'Pear']);
  });
});

describe('the list a meal is saved with', () => {
  it('drops empty lines, tidies names and refuses what the server would refuse', () => {
    expect(
      itemsForSave([item('  banana '), item(''), item('Oatmeal', { amount: 2, unit: 'TBSP' })]),
    ).toEqual([item('banana'), item('Oatmeal', { amount: 2, unit: 'TBSP' })]);
    expect(() => itemsForSave([item('Pear', { amount: 20_000 })])).toThrow();
  });

  it('keeps the names readable for anything that still reads `food`', () => {
    expect(foodListText([item('Strawberry'), item('banana')])).toBe('Strawberry, banana');
    expect(foodListText([])).toBeNull();
    // and reading that text back gives the same names
    expect(splitLegacyFood('Strawberry, banana')).toEqual(['Strawberry', 'banana']);
  });
});

describe('reading a meal back', () => {
  it('parses the stored list, forgiving what a later version might add', () => {
    const stored = JSON.stringify([
      { name: 'Banana', amount: 1, unit: 'PIECE', response: 'LOVED' },
      { name: 'Kale', amount: -3, unit: 'CUP', response: 'MEH', extra: true },
      { name: '   ' },
      'nonsense',
    ]);
    expect(parseItems(stored)).toEqual([
      item('Banana', { amount: 1, unit: 'PIECE', response: 'LOVED' }),
      item('Kale'),
    ]);
    expect(parseItems('{not json')).toBeNull();
    expect(parseItems(null)).toBeNull();
    expect(parseItems('{"name":"x"}')).toBeNull();
  });

  /**
   * A MEAL FROM BEFORE THE LIST is read, never rewritten: its text split on the separators
   * nobody puts inside a food's name, so "sweet potato, pear" is two foods and "mac and
   * cheese" is one.
   */
  it('reads an older meal’s text as its list, without touching it', () => {
    expect(itemsOf({ items: null, food: 'Sweet potato, pear; oats\nbanana + yogurt' })).toEqual(
      ['Sweet potato', 'pear', 'oats', 'banana', 'yogurt'].map(n => item(n)),
    );
    expect(itemsOf({ items: null, food: 'Mac and cheese' })).toEqual([item('Mac and cheese')]);
    expect(itemsOf({ items: null, food: 'Fish & rice' })).toEqual([item('Fish & rice')]);
    expect(itemsOf({ items: null, food: null })).toEqual([]);
    // a list wins over the text beside it
    expect(itemsOf({ items: '[{"name":"Egg"}]', food: 'Egg' })).toEqual([item('Egg')]);
  });

  /**
   * THE OLD FIELD TOOK 200 CHARACTERS, so a part of an older meal's text can be a sentence. It is
   * read whole — the log, the Foods card and the visit summary print what the parent wrote — and
   * it is marked too long to SAVE as a name, so a sheet asks before it is ever cut.
   */
  it('reads a long part of an older meal whole, and knows it is too long to save as a name', () => {
    const sentence = 'Oatmeal with mashed banana and a little cinnamon, warmed through first';
    const [first, second] = splitLegacyFood(sentence);
    expect(first).toBe('Oatmeal with mashed banana and a little cinnamon');
    expect(second).toBe('warmed through first');
    const whole = 'Homemade oatmeal with mashed banana and a little bit of cinnamon on top';
    expect(itemsOf({ items: null, food: `${whole}; pear` })).toEqual([item(whole), item('pear')]);
    expect(foodNameTooLong(whole)).toBe(true);
    expect(foodNameTooLong('pear')).toBe(false);
    expect(foodNameTooLong(`  ${'a'.repeat(60)}  `)).toBe(false); // the spaces round it do not count
    expect(foodNameTooLong('🍓'.repeat(60))).toBe(false); // sixty characters, not 120 units
    // saving it would cut it — which is why the sheets ask first
    expect(tidyFoodName(whole)).toHaveLength(60);
  });
});

describe('how a meal reads', () => {
  it('says each amount in the unit it was counted in', () => {
    expect(amountLabel(5, 'PIECE')).toBe('5 pcs');
    expect(amountLabel(1, 'PIECE')).toBe('1 pc');
    expect(amountLabel(0.5, 'TBSP')).toBe('0.5 tbsp');
    expect(amountLabel(3, null)).toBe('3');
    expect(amountLabel(null, 'G')).toBe('');
    expect(itemLabel(item('Strawberry', { amount: 5, unit: 'PIECE' }))).toBe('Strawberry 5 pcs');
  });

  it('says a shared response once, and each one when they differ', () => {
    const same = [
      item('Strawberry', { amount: 5, unit: 'PIECE', response: 'LOVED' }),
      item('Banana', { amount: 1, unit: 'PIECE', response: 'LOVED' }),
    ];
    expect(sharedResponse(same)).toBe('LOVED');
    expect(mealLine(same)).toBe('Strawberry 5 pcs · Banana 1 pc · Loved it');
    const mixed = [
      item('Strawberry', { response: 'LOVED' }),
      item('Banana', { response: 'DISLIKED' }),
      item('Pear'),
    ];
    expect(sharedResponse(mixed)).toBeNull();
    expect(mealLine(mixed)).toBe("Strawberry, loved it · Banana, didn't like it · Pear");
    expect(mealLine([])).toBe('');
  });

  it('reads what a parent types in the amount field, and says when it cannot', () => {
    expect(parseFoodAmount('5')).toBe(5);
    expect(parseFoodAmount('0.5')).toBe(0.5);
    expect(parseFoodAmount('0,5')).toBe(0.5);
    expect(parseFoodAmount('.5')).toBe(0.5);
    expect(parseFoodAmount('1/2')).toBe(0.5);
    expect(parseFoodAmount('1 1/2')).toBe(1.5);
    expect(parseFoodAmount('1/3')).toBe(0.3333);
    expect(parseFoodAmount(' ')).toBeNull();
    expect(parseFoodAmount('0')).toBe(0);
    for (const bad of ['abc', '-1', '1/0', '20000', '5 pcs']) {
      expect(parseFoodAmount(bad), bad).toBeUndefined();
    }
  });

  /**
   * A FRACTION COMES BACK AS THE FRACTION IT WAS (the audit of 2026-09-24). Kept to two places,
   * 1/8 tsp was stored as 0.13 and shown as "0.13 tsp", and 1/16 as 0.06 — nearly a quarter less
   * than measured. Four places keep the amount; the fraction is what a parent reads.
   */
  it('keeps a typed fraction exact, and shows it back as that fraction', () => {
    expect(parseFoodAmount('1/8')).toBe(0.125);
    expect(parseFoodAmount('1/16')).toBe(0.0625);
    expect(parseFoodAmount('2/3')).toBe(0.6667);
    const shown: [string, string][] = [
      ['1/8', '1/8'],
      ['1/16', '1/16'],
      ['1/3', '1/3'],
      ['2/3', '2/3'],
      ['1/6', '1/6'],
      ['3/8', '3/8'],
      ['1 1/8', '1 1/8'],
      ['2 1/3', '2 1/3'],
      ['4/8', '0.5'], // two places say a half exactly, and always have
      ['1 1/2', '1.5'],
      ['0.25', '0.25'],
      ['5', '5'],
    ];
    for (const [typed, read] of shown) {
      const n = parseFoodAmount(typed);
      if (typeof n !== 'number') throw new Error(typed);
      expect(formatFoodAmount(n), typed).toBe(read);
      // and the field an edited meal opens with reads back to the same stored amount
      expect(parseFoodAmount(amountFieldText(n)), typed).toBe(n);
    }
    expect(amountLabel(0.125, 'TSP')).toBe('1/8 tsp');
    expect(itemLabel(item('Cereal', { amount: 0.3333, unit: 'TBSP' }))).toBe('Cereal 1/3 tbsp');
    // a meal saved before this still reads as it was stored
    expect(formatFoodAmount(0.13)).toBe('0.13');
    // a sum of thirds is still a third, not 1.33
    expect(formatFoodAmount(0.3333 * 4)).toBe('1 1/3');
    // an odd decimal is read to two places, and edited as it is stored
    expect(formatFoodAmount(1.2345)).toBe('1.23');
    expect(amountFieldText(1.2345)).toBe('1.2345');
  });
});

describe('every food, tracked back', () => {
  const meals: MealEntry[] = [
    meal('m1', 0, [item('Strawberry', { amount: 3, unit: 'PIECE', response: 'LIKED' })]),
    meal('m2', 2, [
      item('strawberries', { amount: 5, unit: 'PIECE', response: 'LOVED' }),
      item('Banana', { amount: 1, unit: 'PIECE', response: 'LOVED' }),
    ]),
    meal('m3', 5, [
      item('Strawberry', { amount: 1, unit: 'TBSP', response: 'DISLIKED' }),
      item('Strawberry'),
      item('Egg', { response: 'UNSURE' }),
    ]),
  ];

  it('counts each food once per meal, with its latest spelling and every response', () => {
    const foods = summarizeFoods(meals);
    expect(foods.map(f => f.key)).toEqual(['strawberry', 'egg', 'banana']);
    const strawberry = foods[0];
    if (strawberry === undefined) throw new Error('fixture');
    expect(strawberry.times).toBe(3);
    expect(strawberry.name).toBe('Strawberry');
    expect(strawberry.firstMs).toBe(T0);
    expect(strawberry.responses).toEqual({ LOVED: 1, LIKED: 1, UNSURE: 0, DISLIKED: 1 });
    expect(strawberry.lastResponse).toBe('DISLIKED');
    // pieces and a tablespoon are never added together
    expect(strawberry.amountByUnit).toEqual({ PIECE: 8, TBSP: 1 });
    expect(strawberry.lastUnit).toBe('TBSP');
    expect(responseCounts(strawberry.responses)).toBe("loved 1 · liked 1 · didn't like 1");
  });

  it('knows a first time, and does not lose it when that first meal is corrected', () => {
    expect(firstTimes(meals).get('egg')).toBe(T0 + 5 * DAY);
    expect(isFirstTime('eggs', meals, T0 + 6 * DAY)).toBe(false);
    expect(isFirstTime('Egg', meals, T0 + 4 * DAY)).toBe(true);
    expect(isFirstTime('Avocado', meals, T0 + 6 * DAY)).toBe(true);
    // editing m1, the first strawberry ever, must still call it the first
    expect(isFirstTime('Strawberry', meals, T0, 'm1')).toBe(true);
    expect(isFirstTime('   ', meals, T0)).toBe(false);
  });

  it('suggests the household’s own foods: recent first, then by what is typed', () => {
    const foods = summarizeFoods(meals);
    expect(suggestFoods(foods, '', new Set(), 5).map(f => f.name)).toEqual([
      'Strawberry',
      'Egg',
      'Banana',
    ]);
    expect(suggestFoods(foods, 'ba', new Set(), 5).map(f => f.name)).toEqual(['Banana']);
    expect(suggestFoods(foods, 'na', new Set(), 5).map(f => f.name)).toEqual(['Banana']);
    expect(suggestFoods(foods, '', new Set(['strawberry']), 5).map(f => f.name)).toEqual([
      'Egg',
      'Banana',
    ]);
    // a food already typed in full is not offered back to itself
    expect(suggestFoods(foods, 'Egg', new Set(), 5)).toEqual([]);
  });

  it('never offers back a sentence from an older meal as a food to save', () => {
    const sentence = 'Homemade oatmeal with mashed banana and a little bit of cinnamon on top';
    const foods = summarizeFoods([...meals, meal('old', 6, [item(sentence)])]);
    // still a food of the household's, counted and shown…
    expect(foods.some(f => f.name === sentence)).toBe(true);
    // …but not a suggestion, which would only be refused when saved
    expect(suggestFoods(foods, '', new Set(), 10).map(f => f.name)).toEqual([
      'Strawberry',
      'Egg',
      'Banana',
    ]);
    expect(suggestFoods(foods, 'oat', new Set(), 10)).toEqual([]);
  });

  it('reports a range against the whole log, so "first" means first ever', () => {
    const noted = [
      ...meals,
      meal('m4', 6, [item('Avocado')], { observation: '  red patch by the mouth  ' }),
    ];
    const r = foodReport(noted, T0 + 4 * DAY, T0 + 7 * DAY);
    expect(r.meals).toBe(2);
    expect(r.foods.map(f => [f.key, f.firstEver])).toEqual([
      ['avocado', true],
      ['strawberry', false],
      ['egg', true],
    ]);
    expect(r.firsts.map(f => f.name)).toEqual(['Egg', 'Avocado']);
    // the parent's words, exactly, with what was in the meal beside them
    expect(r.noticed).toEqual([
      { atMs: T0 + 6 * DAY, text: 'red patch by the mouth', foods: ['Avocado'] },
    ]);
  });

  /*
    "FIRST EATEN" IS THE FIRST TIME EVER (the solids audit, H2). The Foods card's per-food sheet
    printed `firstMs` — the first meal INSIDE the range — under "First eaten", so a banana eaten
    twenty days ago and again two days ago read as first eaten two days ago on a 7-day range.
  */
  it('carries the first time ever beside the first time in the range', () => {
    const history = [
      meal('b1', 0, [item('Banana')]),
      meal('b2', 18, [item('bananas')]),
      meal('p1', 19, [item('Pear')]),
    ];
    const r = foodReport(history, T0 + 13 * DAY, T0 + 20 * DAY);
    const banana = r.foods.find(f => f.key === 'banana');
    const pear = r.foods.find(f => f.key === 'pear');
    expect(banana?.firstMs).toBe(T0 + 18 * DAY);
    expect(banana?.firstEverMs).toBe(T0);
    expect(banana?.firstEver).toBe(false);
    // a food first eaten inside the range: the two are the same instant
    expect(pear?.firstEverMs).toBe(T0 + 19 * DAY);
    expect(pear?.firstEverMs).toBe(pear?.firstMs);
  });
});

/**
 * THE WORDS A PARENT CHOOSES FROM describe how the meal went, never the baby. The list they are
 * held to is the repository's own (`foresight.banned.ts`).
 */
describe('the words', () => {
  it('claim nothing about the baby (CLAUDE.md §2)', () => {
    const lines = [
      ...FOOD_RESPONSES.map(r => RESPONSE_LABEL[r]),
      ...Object.values(UNIT_CHOICE_LABEL),
    ];
    for (const line of lines) {
      for (const phrase of BANNED) expect(line.toLowerCase(), line).not.toContain(phrase);
    }
  });
});
