/**
 * EVERY MEAL THE HOUSEHOLD HAS LOGGED, as the food history reads it (docs/SOLIDS.md).
 *
 * The solids sheet needs the whole of it, not a window: "First time" means never before, and a
 * suggestion list built from the last week would forget the food a baby has every Sunday. It is
 * a narrow read — four columns per meal, and a baby has a few meals a day — and it runs when the
 * sheet opens, never on Today's hot path.
 */
import { itemsOf, type MealEntry } from '@nibblecue/core';
import type { Db } from '../driver';

interface MealRow {
  id: string;
  child_id: string | null;
  start_at: string;
  food: string | null;
  items: string | null;
  observation: string | null;
}

/** A meal a year for three years at five a day is well under this; it bounds a runaway read. */
const MEALS_READ_MAX = 6000;

export async function mealHistory(db: Db, householdId: string): Promise<MealEntry[]> {
  const rows = await db.all<MealRow>(
    `select a.id, a.child_id, a.start_at, so.food, so.items, so.observation
       from activities a join solids_details so on so.activity_id = a.id
      where a.household_id = ? and a.type = 'solids' and a.deleted_at is null
      order by a.start_at desc
      limit ${MEALS_READ_MAX}`,
    [householdId],
  );
  const out: MealEntry[] = [];
  for (const r of rows) {
    const atMs = Date.parse(r.start_at);
    if (Number.isNaN(atMs)) continue;
    out.push({
      id: r.id,
      childId: r.child_id,
      atMs,
      items: itemsOf({ items: r.items, food: r.food }),
      observation: r.observation,
    });
  }
  return out;
}
