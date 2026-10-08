/**
 * ── EVERY FOOD, TRACKED BACK ──────────────────────────────────────────────────────────────────
 *
 * The owner wanted to "track back the food that they enter and its response" (2026-09-24). That
 * is three questions a parent actually asks — has she had egg yet, when was the first time, and
 * how has strawberry gone each time — and all three are counts and dates over the household's
 * own meals (CLAUDE.md §2 rule 6). Nothing here says a food is good, risky, enough or too much:
 * no allergen list, no guideline, no "should". The first time is a date, not a warning.
 *
 * Pure and keyed by `foodKey`, so one food typed three ways is one food here.
 */
import type { TodayActivity } from '../today/rows';
import {
  FOOD_RESPONSES,
  foodKey,
  foodNameTooLong,
  itemsOf,
  type FoodResponse,
  type FoodUnit,
  type SolidsItem,
} from './items';

/** One meal, as the history reads it. */
export interface MealEntry {
  id: string;
  childId: string | null;
  atMs: number;
  items: readonly SolidsItem[];
  /** The parent's own words about the meal, verbatim. */
  observation?: string | null;
}

export interface FoodSummary {
  key: string;
  /** The spelling used most recently — the one a parent will recognise. */
  name: string;
  /** How many meals it was in. */
  times: number;
  firstMs: number;
  lastMs: number;
  /** The last amount and unit said for it, which the sheet starts the next one from. */
  lastAmount: number | null;
  lastUnit: FoodUnit | null;
  /** How it went, counted — each meal once, whether rated together or on its own. */
  responses: Readonly<Record<FoodResponse, number>>;
  lastResponse: FoodResponse | null;
  /** What was counted, per unit. Never added across units: five pieces and a spoon are not six. */
  amountByUnit: Readonly<Partial<Record<FoodUnit, number>>>;
}

const noResponses = (): Record<FoodResponse, number> =>
  Object.fromEntries(FOOD_RESPONSES.map(r => [r, 0])) as Record<FoodResponse, number>;

/** Solids rows from the log, as meals. Older meals read their text as a list (`itemsOf`). */
export function mealEntriesFrom(rows: readonly TodayActivity[]): MealEntry[] {
  return rows
    .filter(r => r.type === 'solids')
    .map(r => ({
      id: r.id,
      childId: r.childId,
      atMs: r.startMs,
      items: itemsOf({ items: r.solidsItems ?? null, food: r.food ?? null }),
      observation: r.observation ?? null,
    }));
}

/** Every food across these meals, most recently eaten first. */
export function summarizeFoods(entries: readonly MealEntry[]): FoodSummary[] {
  const byKey = new Map<string, FoodSummary & { responses: Record<FoodResponse, number> }>();
  const ordered = [...entries].sort((a, b) => a.atMs - b.atMs);
  for (const meal of ordered) {
    // a food listed twice in one meal is still one meal with it
    const seen = new Set<string>();
    for (const item of meal.items) {
      const key = foodKey(item.name);
      if (key === '' || seen.has(key)) continue;
      seen.add(key);
      const cur = byKey.get(key);
      const amountByUnit: Partial<Record<FoodUnit, number>> = { ...(cur?.amountByUnit ?? {}) };
      if (item.amount !== null && item.unit !== null) {
        amountByUnit[item.unit] = (amountByUnit[item.unit] ?? 0) + item.amount;
      }
      const responses = cur?.responses ?? noResponses();
      if (item.response !== null) responses[item.response] += 1;
      byKey.set(key, {
        key,
        name: item.name,
        times: (cur?.times ?? 0) + 1,
        firstMs: cur?.firstMs ?? meal.atMs,
        lastMs: meal.atMs,
        lastAmount: item.amount ?? cur?.lastAmount ?? null,
        lastUnit: item.unit ?? cur?.lastUnit ?? null,
        responses,
        lastResponse: item.response ?? cur?.lastResponse ?? null,
        amountByUnit,
      });
    }
  }
  return [...byKey.values()].sort((a, b) => b.lastMs - a.lastMs);
}

/** When each food was first eaten, across every meal given. */
export function firstTimes(entries: readonly MealEntry[]): Map<string, number> {
  const first = new Map<string, number>();
  for (const meal of entries) {
    for (const item of meal.items) {
      const key = foodKey(item.name);
      if (key === '') continue;
      const at = first.get(key);
      if (at === undefined || meal.atMs < at) first.set(key, meal.atMs);
    }
  }
  return first;
}

/**
 * Whether this food would be a first for the baby at `atMs` — nothing with its key logged
 * before then. For the "First time" mark on the sheet; the meal being edited is left out by
 * its id, so correcting the first-ever strawberry does not make it stop being the first.
 */
export function isFirstTime(
  name: string,
  entries: readonly MealEntry[],
  atMs: number,
  exceptId: string | null = null,
): boolean {
  const key = foodKey(name);
  if (key === '') return false;
  return !entries.some(
    m => m.id !== exceptId && m.atMs < atMs && m.items.some(i => foodKey(i.name) === key),
  );
}

/**
 * THE SHEET'S SUGGESTIONS — the household's own foods, never a catalog (the owner, of another
 * app's prefilled list: "it is a lot of data and information"). With nothing typed, the most
 * recent; while typing, the ones whose name starts with it, then the ones containing it.
 */
export function suggestFoods(
  foods: readonly FoodSummary[],
  typed: string,
  excludeKeys: ReadonlySet<string>,
  limit: number,
): FoodSummary[] {
  const q = foodKey(typed);
  // a part of an older meal's text too long to be a saved name — a sentence typed into the one
  // field there was — is still counted and shown everywhere, but never offered back as a food
  const open = foods.filter(f => !excludeKeys.has(f.key) && !foodNameTooLong(f.name));
  if (q === '') return open.slice(0, limit);
  const starts = open.filter(f => f.key.startsWith(q) && f.key !== q);
  const contains = open.filter(f => !f.key.startsWith(q) && f.key.includes(q));
  return [...starts, ...contains].slice(0, limit);
}

/* ── the report ───────────────────────────────────────────────────────────────────────────── */

export interface FoodInRange extends FoodSummary {
  /** Its first meal ever falls inside the range. */
  firstEver: boolean;
  /**
   * WHEN IT WAS FIRST EATEN, EVER — across every meal the report was given, not only the range's.
   *
   * `firstMs` (from `FoodSummary`) is the first meal INSIDE the range, and the Foods card's
   * per-food sheet printed it under "First eaten": a banana eaten twenty days ago and again two
   * days ago read as first eaten two days ago on a 7-day range (the solids audit, H2). The two are
   * the same instant exactly when `firstEver` is true.
   */
  firstEverMs: number;
}

export interface NoticedNote {
  atMs: number;
  /** The parent's words, verbatim. */
  text: string;
  /** What was in that meal, for context. */
  foods: string[];
}

export interface FoodReport {
  meals: number;
  foods: FoodInRange[];
  /** The foods eaten for the first time in the range, in the order they were first eaten. */
  firsts: FoodInRange[];
  /** Everything the household wrote about a meal in the range, newest first. */
  noticed: NoticedNote[];
}

/**
 * A range of meals, measured against the whole log so "first" means first ever. `all` is every
 * meal the household has for this child; the range is `[fromMs, toMs)`.
 */
export function foodReport(all: readonly MealEntry[], fromMs: number, toMs: number): FoodReport {
  const inRange = all.filter(m => m.atMs >= fromMs && m.atMs < toMs);
  const first = firstTimes(all);
  const foods: FoodInRange[] = summarizeFoods(inRange).map(f => {
    const at = first.get(f.key) ?? f.firstMs;
    return { ...f, firstEver: at >= fromMs && at < toMs, firstEverMs: at };
  });
  const firsts = foods.filter(f => f.firstEver).sort((a, b) => a.firstMs - b.firstMs);
  const noticed = inRange
    .filter(m => typeof m.observation === 'string' && m.observation.trim() !== '')
    .sort((a, b) => b.atMs - a.atMs)
    .map(m => ({
      atMs: m.atMs,
      text: (m.observation as string).trim(),
      foods: m.items.map(i => i.name),
    }));
  return { meals: inRange.length, foods, firsts, noticed };
}

/** `loved 2 · liked 1 · didn't like 1` — the counts that are not zero, in scale order. */
export function responseCounts(responses: Readonly<Record<FoodResponse, number>>): string {
  const words: Record<FoodResponse, string> = {
    LOVED: 'loved',
    LIKED: 'liked',
    UNSURE: 'not sure',
    DISLIKED: "didn't like",
  };
  return FOOD_RESPONSES.filter(r => responses[r] > 0)
    .map(r => `${words[r]} ${responses[r]}`)
    .join(' · ');
}
