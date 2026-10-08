/**
 * SOLIDS AT SET TIMES ARE MEALS (the owner, 2026-09-28: *"instead of freely filling out the time in
 * rhythm for solid, do the same thing but prefill it in a table where user can label Breakfast,
 * Lunch, Dinner, and Snack. Either generate all 4 rows where user can set the time for each, or let
 * user labels the time they enter. see which one makes more sense. make sure managing it on
 * onboarding, brings over to the actual app. make it interesting too, not just boring table."*).
 *
 * FOUR ROWS, GENERATED AND PREFILLED, not free times with a label to pick for each. Switching a meal
 * on and choosing its time is quicker than composing a list and labeling every entry in it; the
 * rows cannot produce two Breakfasts; every reminder and Schedule row then says the meal's name;
 * and a baby starting solids keeps on the one or two meals they eat and turns the rest on as they
 * come. Breakfast, Lunch, Snack and Dinner once each, and one more Snack on request (a baby on three
 * meals often has a morning snack and an afternoon one): never more than two snacks.
 *
 * NOTHING NEW IN THE MODEL. Each meal that is on is one FIXED solids rule at its clock time, the
 * shape a set time has always been, whose NAME is the meal's label: "Breakfast", "Lunch", "Snack",
 * "Dinner". The name already syncs, and `ruleLabel` already shows a named rule by its name, so the
 * day list, Up next, the wheel and the reminder say "Lunch at 12:00 PM" with no new column. The
 * bedtime is the precedent: a FIXED sleep rule with a reserved name (the app's `setTimes.ts`).
 *
 * NOTHING HERE IS ABOUT WHAT A BABY SHOULD EAT. The four defaults are starting positions for rows a
 * parent turns off, the same kind of starting pill `mealForTime` is: never a count of meals, never a
 * time a baby ought to eat at, and every one of them the parent's to move (CLAUDE.md §2 rules 1, 3).
 *
 * Pure, so `meals.test.ts` holds all of it in node.
 */
import { MEAL_LABEL, MEALS, mealForMinutes, type Meal } from '../entry/remembered';
import type { DayWindow } from '../today/dayWindow';
import { hhmmOf, hm } from './time';
import type { Rule } from './types';

/** The one rhythm whose set times are meals. */
export const MEAL_ACTIVITY = 'solids';

/** A row of the table: the four meals, and the second snack a parent can add. */
export type MealKey = Meal | 'SNACK_2';

export interface MealRow {
  /** Which row: stable while the form is open, so a row never jumps as its time changes. */
  key: MealKey;
  meal: Meal;
  /** `HH:MM`, the household's own clock. */
  at: string;
  /** A row that is off writes no rule. */
  on: boolean;
}

/** A meal that is on, as the setup draft and the seed keep it. */
export interface MealTime {
  meal: Meal;
  at: string;
}

/** One solids set time as the rules hold it: its clock time and its name, null for none. */
export interface SetTimeIn {
  at: string;
  name: string | null;
}

/**
 * WHERE THE ROWS START: breakfast 7:30, lunch 11:30, a snack at 3:00 and dinner 5:30 — the main
 * session's decision of 2026-09-28, inside the day every phone falls back to (7:00 AM to 7:30 PM,
 * `DEFAULT_DAY_WINDOW`). A household whose day is another shape has them brought inside it
 * (`insideDay`).
 */
export const MEAL_DEFAULT_AT: Readonly<Record<Meal, string>> = {
  BREAKFAST: '07:30',
  LUNCH: '11:30',
  SNACK: '15:00',
  DINNER: '17:30',
};

/**
 * THE SECOND SNACK'S TWO PLACES: mid morning or mid afternoon, whichever is further from the snack
 * already on the table, so "Add a snack" lands in the other half of the day rather than beside it.
 */
export const SECOND_SNACK_AT: readonly [string, string] = ['09:30', '15:00'];

/** Breakfast, Lunch and Dinner once each; the snack twice at most. */
export const MAX_SNACKS = 2;

/** How far inside the waking day a default that fell outside it is brought. */
export const MEAL_INSET_MINUTES = 30;

/** The day's own order, for rows that share a clock time. */
const KEY_RANK: Readonly<Record<MealKey, number>> = {
  BREAKFAST: 0,
  LUNCH: 1,
  SNACK: 2,
  SNACK_2: 3,
  DINNER: 4,
};

const DAY_MINUTES = 1440;
const wrap = (m: number): number => ((m % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;

/** The meal a clock time falls in, by the solids sheet's own windows (`mealForTime`). */
export const mealAtClock = (hhmm: string): Meal => mealForMinutes(hm(hhmm));

/**
 * A rule's name read back as a meal: "Lunch" is LUNCH, in any case and with any spaces round it.
 * Anything else — no name, a medicine's, "Brunch" — is no meal at all.
 */
export function mealOfName(name: string | null | undefined): Meal | null {
  if (name === null || name === undefined) return null;
  const said = name.trim().toLowerCase();
  if (said === '') return null;
  return MEALS.find(m => MEAL_LABEL[m].toLowerCase() === said) ?? null;
}

/**
 * THE MEAL A SLOT IS FOR: a FIXED solids rule that carries a meal's name. Null for every other
 * rule, and for an older solids time with no name — whose sheet opens on the clock's guess, as a
 * sheet opened from the Quick grid does.
 */
export function mealOfRule(
  rule: Pick<Rule, 'activity' | 'ruleType' | 'name'> | null | undefined,
): Meal | null {
  if (rule === null || rule === undefined) return null;
  if (rule.activity !== MEAL_ACTIVITY || rule.ruleType !== 'FIXED') return null;
  return mealOfName(rule.name);
}

/** The name a meal's rule carries: the meal's own word, the one the solids sheet's sky writes. */
export const mealRuleName = (meal: Meal): string => MEAL_LABEL[meal];

/**
 * A TIME BROUGHT INSIDE THE HOUSEHOLD'S WAKING DAY, wake to bed, when it falls outside it: to the
 * nearer end, half an hour in. A household up at 8:00 has breakfast start at 8:30 rather than
 * before anyone is awake; one whose day ends at 5:00 PM has dinner start at 4:30. A time already
 * inside is left exactly where it is, and so is every time when wake and bed are one clock time,
 * which is a day with no night in it.
 *
 * Only DEFAULTS pass through here. A time a parent set is theirs wherever it falls, and two
 * defaults can meet only in a day that starts after lunch or ends before breakfast — then the
 * parent moves one.
 */
export function insideDay(at: string, day: DayWindow): string {
  const wake = hm(day.wake);
  const span = wrap(hm(day.bed) - wake);
  if (span === 0) return at;
  const into = wrap(hm(at) - wake);
  if (into <= span) return at;
  const inset = Math.min(MEAL_INSET_MINUTES, Math.floor(span / 2));
  const sinceBed = into - span;
  const toWake = DAY_MINUTES - into;
  return hhmmOf(sinceBed <= toWake ? wrap(wake + span - inset) : wrap(wake + inset));
}

/** A meal's default, inside the household's day. */
export const defaultMealAt = (meal: Meal, day: DayWindow): string =>
  insideDay(MEAL_DEFAULT_AT[meal], day);

/** The rows in clock order, the day's own order between two at one time. A copy; never in place. */
export function byClock<T extends { at: string; key?: MealKey; meal: Meal }>(
  rows: readonly T[],
): T[] {
  const rank = (r: T): number => KEY_RANK[r.key ?? r.meal];
  return [...rows].sort((a, b) => hm(a.at) - hm(b.at) || rank(a) - rank(b));
}

/**
 * THE TABLE A HOUSEHOLD WITH NOTHING SET OPENS ON: all four meals, every one ON, each at its
 * default inside the day — the owner's "everything on, then turn off what you don't use" of the
 * same day for the feeding cards (core `initialDraft`). A table with every row on is only a
 * starting position: nothing is written until the parent saves it.
 */
export function blankMealRows(day: DayWindow): MealRow[] {
  return byClock(MEALS.map(meal => ({ key: meal, meal, at: defaultMealAt(meal, day), on: true })));
}

/** Where one set time went: the row it takes, and its place in the list it came from. */
export interface PlacedTime {
  key: MealKey;
  meal: Meal;
  index: number;
}

export interface MealPlacement {
  placed: PlacedTime[];
  /** Indexes of the times no row could take, kept exactly as they are. */
  unplaced: number[];
}

/**
 * WHICH ROW EACH OF A HOUSEHOLD'S SOLIDS TIMES TAKES — the reading every household that set solids
 * times before 2026-09-28 depends on, because those times have no names.
 *
 *   1. A NAMED time goes to its own meal's row first, since a name is what the parent (or this
 *      table) wrote: "Lunch" is lunch, at whatever time it was set. A second Snack takes the second
 *      snack row. A name that is not a meal, or a meal whose row is already taken (twins viewed
 *      together whose breakfasts differ), is not renamed: it is KEPT.
 *   2. An UNNAMED time goes to the meal its clock falls in (`mealAtClock`: 05:00 to 10:30 is
 *      breakfast, 10:30 to 14:00 lunch, 17:00 to 21:00 dinner, anything else a snack), in clock
 *      order, so the earlier of two morning times is the breakfast. A second time in a meal already
 *      taken becomes a Snack while a snack row is free.
 *   3. WHAT STILL CANNOT BE PLACED IS KEPT, never dropped: a third time in the morning with both
 *      snack rows taken, say. The form shows it under "Other times" at its own time, and Save
 *      writes it back unchanged — the same rule, the same time, no name — unless the parent
 *      removes it there. A parent's set time is never lost to a table with no row for it.
 */
export function placeMealTimes(times: readonly SetTimeIn[]): MealPlacement {
  const order = times
    .map((t, index) => ({ ...t, index }))
    .sort((a, b) => hm(a.at) - hm(b.at) || a.index - b.index);
  const taken = new Set<MealKey>();
  const placed: PlacedTime[] = [];
  const unplaced: number[] = [];
  const snackRow = (): MealKey | null =>
    !taken.has('SNACK') ? 'SNACK' : !taken.has('SNACK_2') ? 'SNACK_2' : null;
  const put = (key: MealKey | null, meal: Meal, index: number) => {
    if (key === null) {
      unplaced.push(index);
      return;
    }
    taken.add(key);
    placed.push({ key, meal, index });
  };
  const hasName = (t: SetTimeIn) => t.name !== null && t.name.trim() !== '';
  for (const t of order.filter(hasName)) {
    const meal = mealOfName(t.name);
    if (meal === null) unplaced.push(t.index);
    else if (meal === 'SNACK') put(snackRow(), meal, t.index);
    else put(taken.has(meal) ? null : meal, meal, t.index);
  }
  for (const t of order.filter(x => !hasName(x))) {
    const clock = mealAtClock(t.at);
    if (clock !== 'SNACK' && !taken.has(clock)) put(clock, clock, t.index);
    else put(snackRow(), 'SNACK', t.index);
  }
  return { placed, unplaced: unplaced.sort((a, b) => a - b) };
}

/** The table a list of set times opens as, which time each row came from, and what was kept. */
export interface MealOpening {
  rows: MealRow[];
  /** The index, in the list given, of the time each row that is on came from. */
  origin: Partial<Record<MealKey, number>>;
  /** Indexes of the times kept as they are (`placeMealTimes` rule 3). */
  kept: number[];
}

/**
 * THE TABLE, OPENED ON A HOUSEHOLD'S TIMES: each placed time's row on at its own time, every other
 * meal off at its default, the second snack only when a time took it, and the rows in clock order
 * — the order a form opens in, which it then keeps while the parent edits.
 */
export function mealRowsFrom(times: readonly SetTimeIn[], day: DayWindow): MealOpening {
  const { placed, unplaced } = placeMealTimes(times);
  const origin: Partial<Record<MealKey, number>> = {};
  const rows: MealRow[] = [];
  const row = (key: MealKey, meal: Meal): void => {
    const p = placed.find(x => x.key === key);
    if (p !== undefined) {
      origin[key] = p.index;
      rows.push({ key, meal, at: times[p.index]?.at ?? defaultMealAt(meal, day), on: true });
    } else if (key !== 'SNACK_2') {
      rows.push({ key, meal, at: defaultMealAt(meal, day), on: false });
    }
  };
  for (const meal of MEALS) row(meal, meal);
  row('SNACK_2', 'SNACK');
  return { rows: byClock(rows), origin, kept: unplaced };
}

/**
 * The meals a setup answer kept, and its times no meal accounts for, as the table they reopen as.
 * `others` are the leftover times, in clock order: an answer from a build before meals, whose
 * times did not all find a row.
 */
export function mealRowsOfAnswer(
  meals: readonly MealTime[],
  times: readonly string[],
  day: DayWindow,
): { rows: MealRow[]; others: string[] } {
  const leftover = times.filter(at => !meals.some(m => m.at === at));
  const input: SetTimeIn[] = [
    ...meals.map(m => ({ at: m.at, name: mealRuleName(m.meal) })),
    ...leftover.map(at => ({ at, name: null })),
  ];
  const opened = mealRowsFrom(input, day);
  return {
    rows: opened.rows,
    others: opened.kept
      .map(i => input[i]?.at ?? '')
      .filter(at => at !== '')
      .sort(),
  };
}

/** The meals that are on, in clock order: what a save writes, one rule each. */
export function mealsOn(rows: readonly MealRow[]): MealTime[] {
  return byClock(rows.filter(r => r.on)).map(r => ({ meal: r.meal, at: r.at }));
}

/**
 * The meals a list of unnamed times would be given: the placed ones, in clock order. For an answer
 * or a proposal that has times and no names yet — setup's draft from before meals, Schedule from
 * your log — so what it writes carries the names the table would show for it.
 */
export function mealsForTimes(times: readonly string[]): MealTime[] {
  const { placed } = placeMealTimes(times.map(at => ({ at, name: null })));
  return byClock(placed.map(p => ({ meal: p.meal, at: times[p.index] ?? '' }))).filter(
    m => m.at !== '',
  );
}

/** Each time's meal from `placeMealTimes`, by position; null for a time kept as it is. */
export function mealNamesForTimes(times: readonly string[]): (string | null)[] {
  const { placed } = placeMealTimes(times.map(at => ({ at, name: null })));
  return times.map((_, i) => {
    const p = placed.find(x => x.index === i);
    return p === undefined ? null : mealRuleName(p.meal);
  });
}

/* ------------------------------------------------------------------ editing the table */

/** One row changed where it stands: the table keeps its order while the parent edits it. */
export function withRow(
  rows: readonly MealRow[],
  key: MealKey,
  patch: Partial<Pick<MealRow, 'at' | 'on'>>,
): MealRow[] {
  return rows.map(r => (r.key === key ? { ...r, ...patch } : r));
}

/**
 * WHETHER "ADD A SNACK" IS OFFERED: while the snack row is on and there is no second one. With the
 * snack off, the way to a snack is its own switch, one row up.
 */
export const canAddSnack = (rows: readonly MealRow[]): boolean =>
  rows.filter(r => r.meal === 'SNACK').length < MAX_SNACKS &&
  rows.some(r => r.key === 'SNACK' && r.on);

/** Minutes between two clock times the short way round. */
const clockGap = (a: string, b: string): number => {
  const d = Math.abs(hm(a) - hm(b));
  return Math.min(d, DAY_MINUTES - d);
};

/**
 * THE SECOND SNACK, ADDED: on, at whichever of 9:30 AM and 3:00 PM is further from the first
 * snack, inside the day, and put in among the rows at its time WITHOUT MOVING ANY OF THEM — before
 * the first row set later than it, or last. Nothing changes where "Add a snack" is not offered.
 */
export function withSecondSnack(rows: readonly MealRow[], day: DayWindow): MealRow[] {
  if (!canAddSnack(rows)) return [...rows];
  const first = rows.find(r => r.key === 'SNACK');
  const [morning, afternoon] = SECOND_SNACK_AT.map(t => insideDay(t, day)) as [string, string];
  const at =
    first === undefined || clockGap(morning, first.at) >= clockGap(afternoon, first.at)
      ? morning
      : afternoon;
  const added: MealRow = { key: 'SNACK_2', meal: 'SNACK', at, on: true };
  const later = rows.findIndex(r => hm(r.at) > hm(at));
  return later < 0 ? [...rows, added] : [...rows.slice(0, later), added, ...rows.slice(later)];
}

/** The second snack taken away again. */
export const withoutSecondSnack = (rows: readonly MealRow[]): MealRow[] =>
  rows.filter(r => r.key !== 'SNACK_2');
