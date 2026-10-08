/**
 * ── LOGGED BEFORE THIS ────────────────────────────────────────────────────────────────────────
 *
 * The look back a Health note opens on (the owner, 2026-10-08, from a parent's feedback: "so that
 * it can be looked back what happened before that. for example solid food was eaten at 7pm. and
 * allergic showed up the next day"). Everything logged for the note's baby in the 24, 48 or 72
 * hours before the note STARTED — the start the parent gave, which may be yesterday evening, not
 * the minute they typed it.
 *
 * WHAT IT RETURNS IS THE LOG ITSELF, narrowed to a window. Every entry of that baby's that began in
 * the window, or ran into it, by anyone, in the order it happened. The one fact it adds is
 * arithmetic over the same log: a food whose FIRST logged meal for this baby is inside the window
 * is named as a first time logged (the first-time rule `solids/history.ts` already keeps for the
 * sheet's foods), which is a date and nothing more.
 *
 * WHAT IT WILL NEVER DO (CLAUDE.md §2 rules 1 to 3 and 6): rank an entry, pick one out, put the
 * nearest first because it is nearest, or link any entry to the note. There is no score here to
 * sort by and no field that says which entry matters; a list in time order is the one order that
 * says nothing about the note.
 *
 * OLDEST FIRST, ON PURPOSE. It reads as what happened, in the order it happened, ending where the
 * note begins — the question the parent asked ("what happened before that"). Newest first would put
 * the entries nearest the note at the top of the list, which is the one position a reader takes as
 * "most relevant", and the app has no business suggesting that.
 *
 * WHOSE ENTRIES: the note's baby's only. A parent's own records (pumping, the `mom` group) are not
 * the baby's care and may be private; a private entry is never in it. Another Health note in the
 * window is in it, as the entry it is.
 *
 * THE PLAN'S HISTORY FLOOR. Free shows the last seven days of the log in the app (the Log's floor,
 * `historyFloorMs`); a window that reaches past it is cut there and says so (`clipped`), with the
 * entries kept and in the full download. Logging and the look back themselves are free.
 *
 * Pure: rows in, a list out. No clock, no zone, no database.
 */
import type { TodayActivity } from '../today/rows';
import { MODULE_BY_ID, type ModuleId } from '../modules/module-registry';
import { isFirstTime, mealEntriesFrom, type MealEntry } from '../solids/history';
import { foodKey, itemsOf } from '../solids/items';

const HOUR = 3_600_000;

/** The windows a parent can choose, in hours. */
export const LOOK_BACK_HOURS = [24, 48, 72] as const;
export type LookBackHours = (typeof LOOK_BACK_HOURS)[number];
/** Two days: a meal the evening before and a night between, which is the parent's own example. */
export const DEFAULT_LOOK_BACK_HOURS: LookBackHours = 48;

/** The note the look back is for: which baby, and when it started. */
export interface LookBackNote {
  id: string;
  childId: string | null;
  startMs: number;
}

export interface LookBackItem<T extends TodayActivity = TodayActivity> {
  entry: T;
  /**
   * On a meal: the foods in it whose first logged meal for this baby is this one, as the meal spells
   * them. Empty on everything else.
   */
  firstTimeFoods: readonly string[];
}

export interface LookBack<T extends TodayActivity = TodayActivity> {
  hours: LookBackHours;
  /** The window, `[fromMs, toMs)`: `toMs` is the note's start. */
  fromMs: number;
  toMs: number;
  /** Oldest first (see the header). */
  items: LookBackItem<T>[];
  /** The window reached past the plan's floor: entries before it are kept, not shown here. */
  clipped: boolean;
}

/** The baby's own entries: not a parent's records, never a private one. */
function theBabys(r: TodayActivity, childId: string | null): boolean {
  if (r.isPrivate) return false;
  if (r.childId !== childId) return false;
  return MODULE_BY_ID[r.type as ModuleId]?.group !== 'mom';
}

/** Began in the window, or began before it and ran into it. */
function inWindow(r: TodayActivity, fromMs: number, toMs: number): boolean {
  if (r.startMs >= toMs) return false;
  return r.startMs >= fromMs || (r.endMs !== null && r.endMs > fromMs);
}

/**
 * WHAT WAS LOGGED BEFORE THIS NOTE. `rows` must reach back at least `hours` before the note
 * (anything outside the window is ignored); `meals` is every meal the household has logged — the
 * note's baby's are picked out here — so a first time is a first time ever, not only in the window.
 * The window's own meals are read from `rows` too, so a meal missing from `meals` is never missed.
 */
export function lookBackFor<T extends TodayActivity>(input: {
  note: LookBackNote;
  rows: readonly T[];
  meals: readonly MealEntry[];
  hours: LookBackHours;
  /** The plan's history floor (`historyFloorMs`), or null where there is none. */
  floorMs?: number | null;
}): LookBack<T> {
  const { note, hours } = input;
  const toMs = note.startMs;
  const windowFrom = toMs - hours * HOUR;
  const floor = input.floorMs ?? null;
  const clipped = floor !== null && floor > windowFrom;
  const fromMs = clipped ? floor : windowFrom;

  const picked = input.rows
    .filter(r => r.id !== note.id && theBabys(r, note.childId) && inWindow(r, fromMs, toMs))
    // and a row that began before the floor stays out even if it ran into the window: the plan's
    // floor is a floor on what the app shows, whatever the entry did after it
    .filter(r => floor === null || r.startMs >= floor)
    .sort((a, b) => a.startMs - b.startMs || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  // this baby's meals: the history handed in, and the window's own, each meal once
  const byId = new Map<string, MealEntry>();
  for (const m of input.meals) if (m.childId === note.childId) byId.set(m.id, m);
  for (const m of mealEntriesFrom(picked)) if (!byId.has(m.id)) byId.set(m.id, m);
  const meals = [...byId.values()];

  const items = picked.map(entry => {
    if (entry.type !== 'solids') return { entry, firstTimeFoods: [] as string[] };
    const seen = new Set<string>();
    const firsts: string[] = [];
    for (const item of itemsOf({ items: entry.solidsItems ?? null, food: entry.food ?? null })) {
      const name = item.name.trim();
      const key = foodKey(name);
      if (key === '' || seen.has(key)) continue;
      seen.add(key);
      if (isFirstTime(name, meals, entry.startMs, entry.id)) firsts.push(name);
    }
    return { entry, firstTimeFoods: firsts };
  });

  return { hours, fromMs, toMs, items, clipped };
}
