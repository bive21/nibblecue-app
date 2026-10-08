/**
 * SOLIDS AS FOUR MEALS, IN NODE (`meals.ts`; the owner, 2026-09-28). What is held here is what a
 * parent would notice if it broke: the four rows start where they should and inside their day, a
 * household's older times open as the meals they were, nothing a parent set is ever dropped, and
 * the table keeps still while it is edited.
 */
import { describe, expect, it } from 'vitest';
import { MEAL_LABEL, MEALS } from '../entry/remembered';
import { DEFAULT_DAY_WINDOW, type DayWindow } from '../today/dayWindow';
import {
  blankMealRows,
  byClock,
  canAddSnack,
  defaultMealAt,
  insideDay,
  MAX_SNACKS,
  MEAL_DEFAULT_AT,
  mealNamesForTimes,
  mealOfName,
  mealOfRule,
  mealRowsFrom,
  mealRowsOfAnswer,
  mealRuleName,
  mealsForTimes,
  mealsOn,
  placeMealTimes,
  withoutSecondSnack,
  withRow,
  withSecondSnack,
  type MealRow,
  type SetTimeIn,
} from './meals';
import { hhmmOf, hm } from './time';

const DAY = DEFAULT_DAY_WINDOW;
const unnamed = (...times: string[]): SetTimeIn[] => times.map(at => ({ at, name: null }));
/** Where each input went, as `key@at`, or `kept@at`. */
const where = (times: readonly SetTimeIn[]): string[] => {
  const { placed, unplaced } = placeMealTimes(times);
  return times.map((t, i) => {
    const p = placed.find(x => x.index === i);
    return p === undefined
      ? unplaced.includes(i)
        ? `kept@${t.at}`
        : `lost@${t.at}`
      : `${p.key}@${t.at}`;
  });
};
const shape = (rows: readonly MealRow[]): string[] =>
  rows.map(r => `${r.key} ${r.at} ${r.on ? 'on' : 'off'}`);

describe('the four rows and where they start', () => {
  it('starts breakfast at 7:30, lunch at 11:30, a snack at 3:00 and dinner at 5:30', () => {
    expect(MEAL_DEFAULT_AT).toEqual({
      BREAKFAST: '07:30',
      LUNCH: '11:30',
      SNACK: '15:00',
      DINNER: '17:30',
    });
    // every one of them inside the day every phone falls back to
    for (const meal of MEALS) expect(defaultMealAt(meal, DAY)).toBe(MEAL_DEFAULT_AT[meal]);
  });

  it('opens a household with nothing set on all four, every one on, in the day’s order', () => {
    expect(shape(blankMealRows(DAY))).toEqual([
      'BREAKFAST 07:30 on',
      'LUNCH 11:30 on',
      'SNACK 15:00 on',
      'DINNER 17:30 on',
    ]);
  });

  it('allows two snacks and one of every other meal', () => {
    expect(MAX_SNACKS).toBe(2);
    expect(mealRuleName('LUNCH')).toBe('Lunch');
    for (const meal of MEALS) expect(mealRuleName(meal)).toBe(MEAL_LABEL[meal]);
  });
});

describe('a default outside the waking day is brought inside it', () => {
  it('moves breakfast to half an hour after a later wake, and dinner before an earlier bed', () => {
    const late: DayWindow = { wake: '08:00', bed: '20:30' };
    expect(defaultMealAt('BREAKFAST', late)).toBe('08:30');
    expect(defaultMealAt('LUNCH', late)).toBe('11:30');
    const early: DayWindow = { wake: '06:30', bed: '17:00' };
    expect(defaultMealAt('DINNER', early)).toBe('16:30');
    expect(defaultMealAt('SNACK', early)).toBe('15:00');
  });

  it('leaves a time already inside exactly where it is, bed time included', () => {
    expect(insideDay('07:30', DAY)).toBe('07:30');
    expect(insideDay('19:30', DAY)).toBe('19:30');
    expect(insideDay('07:00', DAY)).toBe('07:00');
  });

  it('goes to the NEARER end of a day that runs past midnight', () => {
    const owl: DayWindow = { wake: '11:00', bed: '03:00' };
    // 7:30 AM is three and a half hours before waking and four and a half after bed
    expect(insideDay('07:30', owl)).toBe('11:30');
    // 4:00 AM is an hour after bed
    expect(insideDay('04:00', owl)).toBe('02:30');
    expect(insideDay('23:00', owl)).toBe('23:00');
  });

  it('keeps inside a day shorter than an hour, and moves nothing in a day with no night', () => {
    const short: DayWindow = { wake: '12:00', bed: '12:40' };
    expect(insideDay('07:30', short)).toBe('12:20');
    expect(insideDay('07:30', { wake: '07:00', bed: '07:00' })).toBe('07:30');
  });

  it('lands every default inside the day, for every day from 5 to 10 up and 5 PM to 10 PM down', () => {
    const inside = (at: string, day: DayWindow) => {
      const w = hm(day.wake);
      const span = (hm(day.bed) - w + 1440) % 1440;
      return (hm(at) - w + 1440) % 1440 <= span;
    };
    for (let wake = 5 * 60; wake <= 10 * 60; wake += 15)
      for (let bed = 17 * 60; bed <= 22 * 60; bed += 15) {
        const day = { wake: hhmmOf(wake), bed: hhmmOf(bed) };
        for (const r of blankMealRows(day))
          expect(inside(r.at, day), `${r.key} ${day.wake}–${day.bed}`).toBe(true);
      }
  });
});

describe('a rule’s name, read back as a meal', () => {
  it('reads the four words in any case, with any spaces round them', () => {
    expect(mealOfName('Lunch')).toBe('LUNCH');
    expect(mealOfName('  breakfast ')).toBe('BREAKFAST');
    expect(mealOfName('SNACK')).toBe('SNACK');
    expect(mealOfName('Dinner')).toBe('DINNER');
    for (const none of [null, undefined, '', '  ', 'Brunch', 'Nap', 'Vitamin D drops'])
      expect(mealOfName(none)).toBeNull();
  });

  it('finds the meal of a named solids time, and of nothing else', () => {
    expect(mealOfRule({ activity: 'solids', ruleType: 'FIXED', name: 'Lunch' })).toBe('LUNCH');
    expect(mealOfRule({ activity: 'solids', ruleType: 'FIXED', name: null })).toBeNull();
    expect(mealOfRule({ activity: 'solids', ruleType: 'INTERVAL', name: 'Lunch' })).toBeNull();
    expect(mealOfRule({ activity: 'bottle', ruleType: 'FIXED', name: 'Lunch' })).toBeNull();
    expect(mealOfRule(null)).toBeNull();
  });
});

describe('a household’s older solids times open as the meals they were', () => {
  it('reads an unnamed time by the solids sheet’s own clock', () => {
    expect(where(unnamed('07:00', '12:00', '17:30'))).toEqual([
      'BREAKFAST@07:00',
      'LUNCH@12:00',
      'DINNER@17:30',
    ]);
    // 3:00 PM is a snack, and so is 9:00 PM, the sheet's own answer after dinner
    expect(where(unnamed('15:00', '21:00'))).toEqual(['SNACK@15:00', 'SNACK_2@21:00']);
  });

  it('turns a second time in a meal already taken into a snack, while a snack row is free', () => {
    expect(where(unnamed('07:00', '08:30'))).toEqual(['BREAKFAST@07:00', 'SNACK@08:30']);
    expect(where(unnamed('07:00', '08:00', '09:00'))).toEqual([
      'BREAKFAST@07:00',
      'SNACK@08:00',
      'SNACK_2@09:00',
    ]);
  });

  it('keeps, never drops, what no row can take', () => {
    expect(where(unnamed('07:00', '08:30', '12:00', '12:30', '15:00', '18:00', '19:00'))).toEqual([
      'BREAKFAST@07:00',
      'SNACK@08:30',
      'LUNCH@12:00',
      'SNACK_2@12:30',
      'kept@15:00',
      'DINNER@18:00',
      'kept@19:00',
    ]);
  });

  it('gives a named time its own row first, whatever its clock says', () => {
    // the named breakfast at 8:00 is the breakfast; the unnamed 7:00 is then a second morning time
    expect(
      where([
        { at: '07:00', name: null },
        { at: '08:00', name: 'Breakfast' },
      ]),
    ).toEqual(['SNACK@07:00', 'BREAKFAST@08:00']);
    // a lunch set early is still lunch
    expect(where([{ at: '10:00', name: 'Lunch' }])).toEqual(['LUNCH@10:00']);
  });

  it('never renames a name: another meal’s second copy, or a word of its own, is kept', () => {
    expect(
      where([
        { at: '07:00', name: 'Breakfast' },
        { at: '07:30', name: 'Breakfast' },
        { at: '10:00', name: 'Brunch' },
      ]),
    ).toEqual(['BREAKFAST@07:00', 'kept@07:30', 'kept@10:00']);
    expect(
      where([
        { at: '09:30', name: 'Snack' },
        { at: '15:00', name: 'snack' },
        { at: '20:00', name: 'Snack' },
      ]),
    ).toEqual(['SNACK@09:30', 'SNACK_2@15:00', 'kept@20:00']);
  });

  it('places the same times the same way whatever order they are read in', () => {
    const a = unnamed('18:00', '07:00', '08:30', '12:00');
    const b = unnamed('07:00', '08:30', '12:00', '18:00');
    expect(where(a).sort()).toEqual(where(b).sort());
  });

  it('accounts for every time it is given, once, for any list at all', () => {
    // a seeded walk over lists of up to ten times, named and not
    let seed = 7;
    const next = () => (seed = (seed * 48271) % 2147483647);
    const names = [null, null, 'Breakfast', 'Lunch', 'Snack', 'Dinner', 'Brunch'];
    for (let run = 0; run < 400; run++) {
      const n = next() % 11;
      const times: SetTimeIn[] = Array.from({ length: n }, () => ({
        at: hhmmOf(next() % 1440),
        name: names[next() % names.length] ?? null,
      }));
      const { placed, unplaced } = placeMealTimes(times);
      const seen = [...placed.map(p => p.index), ...unplaced].sort((x, y) => x - y);
      expect(seen).toEqual(times.map((_, i) => i));
      // no row is taken twice, and at most two snacks
      const keys = placed.map(p => p.key);
      expect(new Set(keys).size).toBe(keys.length);
      expect(placed.filter(p => p.meal === 'SNACK').length).toBeLessThanOrEqual(MAX_SNACKS);
    }
  });
});

describe('the table a set of times opens as', () => {
  it('puts each time on its row, the rest off at their defaults, in clock order', () => {
    const opened = mealRowsFrom(unnamed('17:15'), DAY);
    expect(shape(opened.rows)).toEqual([
      'BREAKFAST 07:30 off',
      'LUNCH 11:30 off',
      'SNACK 15:00 off',
      'DINNER 17:15 on',
    ]);
    expect(opened.origin).toEqual({ DINNER: 0 });
    expect(opened.kept).toEqual([]);
  });

  it('draws the second snack only when a time took it, and orders the rows by time on opening', () => {
    const opened = mealRowsFrom(unnamed('10:00', '07:00', '15:30', '12:00'), DAY);
    expect(shape(opened.rows)).toEqual([
      'BREAKFAST 07:00 on',
      'SNACK 10:00 on',
      'LUNCH 12:00 on',
      'SNACK_2 15:30 on',
      'DINNER 17:30 off',
    ]);
    expect(opened.origin).toEqual({ BREAKFAST: 1, SNACK: 0, LUNCH: 3, SNACK_2: 2 });
    expect(shape(mealRowsFrom(unnamed('07:00'), DAY).rows)).not.toContain('SNACK_2');
  });

  it('reads back exactly what it would write: the meals on, at their times', () => {
    let rows = blankMealRows(DAY);
    rows = withRow(rows, 'LUNCH', { at: '12:15' });
    rows = withRow(rows, 'SNACK', { on: false });
    rows = withSecondSnack(withRow(rows, 'SNACK', { on: true }), DAY);
    rows = withRow(rows, 'DINNER', { on: false });
    const written = mealsOn(rows).map(m => ({ at: m.at, name: mealRuleName(m.meal) }));
    const reopened = mealRowsFrom(written, DAY);
    expect(mealsOn(reopened.rows)).toEqual(mealsOn(rows));
    expect(reopened.kept).toEqual([]);
    // the same meals, times and switches, in clock order; which of two snacks is the one with the
    // switch is decided afresh (the earlier), since both are simply "Snack" once written
    const meaning = (rs: readonly MealRow[]) =>
      byClock(rs).map(r => `${r.meal} ${r.at} ${r.on ? 'on' : 'off'}`);
    expect(meaning(reopened.rows)).toEqual(meaning(rows));
  });

  it('reopens a setup answer, with any leftover times from before meals kept', () => {
    const back = mealRowsOfAnswer(
      [
        { meal: 'BREAKFAST', at: '07:00' },
        { meal: 'DINNER', at: '18:00' },
      ],
      ['07:00', '18:00'],
      DAY,
    );
    expect(back.others).toEqual([]);
    expect(mealsOn(back.rows)).toEqual([
      { meal: 'BREAKFAST', at: '07:00' },
      { meal: 'DINNER', at: '18:00' },
    ]);
    // an older answer: times only, and more of them than the rows hold
    const older = mealRowsOfAnswer([], ['07:00', '08:00', '09:00', '09:30', '12:00'], DAY);
    expect(older.others).toEqual(['09:30']);
    expect(mealsOn(older.rows).map(m => m.meal)).toEqual(['BREAKFAST', 'SNACK', 'SNACK', 'LUNCH']);
  });

  it('names a list of unnamed times the way the table would show them', () => {
    expect(mealsForTimes(['12:00', '07:00'])).toEqual([
      { meal: 'BREAKFAST', at: '07:00' },
      { meal: 'LUNCH', at: '12:00' },
    ]);
    expect(mealNamesForTimes(['07:00', '07:30', '08:00', '08:30'])).toEqual([
      'Breakfast',
      'Snack',
      'Snack',
      null,
    ]);
  });
});

describe('the table keeps still while it is edited', () => {
  it('changes a row where it stands, even when its new time passes another', () => {
    const rows = withRow(blankMealRows(DAY), 'BREAKFAST', { at: '13:00' });
    expect(rows.map(r => r.key)).toEqual(['BREAKFAST', 'LUNCH', 'SNACK', 'DINNER']);
    expect(rows[0]?.at).toBe('13:00');
  });

  it('adds the second snack in the other half of the day, among the rows, moving none', () => {
    const added = withSecondSnack(blankMealRows(DAY), DAY);
    expect(shape(added)).toEqual([
      'BREAKFAST 07:30 on',
      'SNACK_2 09:30 on',
      'LUNCH 11:30 on',
      'SNACK 15:00 on',
      'DINNER 17:30 on',
    ]);
    // a first snack moved to the morning sends the second to the afternoon
    const morning = withSecondSnack(withRow(blankMealRows(DAY), 'SNACK', { at: '10:00' }), DAY);
    expect(morning.find(r => r.key === 'SNACK_2')?.at).toBe('15:00');
    // rows out of clock order stay out of it: the new 9:30 row goes before the first one set
    // later than it, which is a breakfast the parent has just moved to 4:00 PM
    const shuffled = withRow(blankMealRows(DAY), 'BREAKFAST', { at: '16:00' });
    expect(withSecondSnack(shuffled, DAY).map(r => r.key)).toEqual([
      'SNACK_2',
      'BREAKFAST',
      'LUNCH',
      'SNACK',
      'DINNER',
    ]);
  });

  it('offers a second snack only beside a first that is on, and never a third', () => {
    const rows = blankMealRows(DAY);
    expect(canAddSnack(rows)).toBe(true);
    expect(canAddSnack(withRow(rows, 'SNACK', { on: false }))).toBe(false);
    const two = withSecondSnack(rows, DAY);
    expect(canAddSnack(two)).toBe(false);
    expect(withSecondSnack(two, DAY)).toEqual(two);
    expect(withoutSecondSnack(two)).toEqual(rows);
  });

  it('keeps the second snack inside the day too', () => {
    const late: DayWindow = { wake: '10:00', bed: '22:00' };
    const rows = withRow(blankMealRows(late), 'SNACK', { at: '16:00' });
    expect(withSecondSnack(rows, late).find(r => r.key === 'SNACK_2')?.at).toBe('10:30');
  });
});
