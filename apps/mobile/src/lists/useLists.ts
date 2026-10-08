/**
 * The two lists as a screen wants them (WP6b, WP6c): the rows from the local mirror, mapped
 * into the shapes `packages/core/lists` reasons about, and re-read whenever a write
 * invalidates them.
 *
 * TODAY IS THE HOUSEHOLD'S, never the device's. A caregiver in another time zone ticking a
 * chore has to tick the household's box, not the one their own midnight has moved on to —
 * `useTimeZone` is the same source the schedule and Today read.
 */
import {
  supplyCategory,
  wallClock,
  type ShoppingLine,
  type SupplyItem,
  type TaskRepeat,
  type TaskRow,
} from '@nibblecue/core';
import { useMemo } from 'react';
import { useAuth } from '../auth/AuthContext';
import { useLocalQuery } from '../data/useLocalQuery';
import { keys } from '../data/store';
import {
  householdPeople,
  householdTasks,
  shoppingItems,
  type PersonRow,
} from '../db/queries/lists';
import { supplyItems } from '../db/queries/supplies';
import { todayIso } from '../lib/locale';
import { useTimeZone } from '../sheets/quick/prefs';
import { useMinuteTick } from '../time/useMinuteTick';

export interface ShoppingView {
  lines: ShoppingLine[];
  /** The rows as stored, for the sheet that edits one. */
  rows: Awaited<ReturnType<typeof shoppingItems>>;
  loaded: boolean;
  /**
   * The list has been read from the local mirror at least once: `lines` is what is on it, not the
   * empty list a screen starts with. The shopping list's first-open motion waits for it, so an
   * empty first frame is never taken for the list (`ShoppingScreen`, S1).
   */
  read: boolean;
}

/** What `useShopping` starts from, by identity: any read hands back a different array. */
const NOT_READ: Awaited<ReturnType<typeof shoppingItems>> = [];

export function useShopping(): ShoppingView {
  const { account } = useAuth();
  const householdId = account?.memberships[0]?.household_id ?? null;
  const rows = useLocalQuery(
    // the catalog key too: correcting the size on an item changes what its lines read
    householdId === null ? [] : [keys.shopping(householdId), keys.supplies(householdId)],
    db => (householdId === null ? Promise.resolve([]) : shoppingItems(db, householdId)),
    NOT_READ,
  );
  const lines = useMemo<ShoppingLine[]>(
    () =>
      rows.map(r => ({
        id: r.id,
        title: r.title,
        qty: r.qty,
        // the line's own note wins over the item's: a note typed on a line is about THIS trip
        note: r.note ?? r.supply_notes,
        // and the item's shop wins over the line's, because the item is where it is corrected
        store: r.supply_store ?? r.store,
        checkedAt: r.checked_at,
        supplyId: r.supply_id,
        // the catalog's own word for what kind of thing it is: `Diapers`, `Wipes`, `Formula`.
        // Read live off the item, like every other supply column on a line.
        categoryLabel: r.supply_category === null ? null : supplyCategory(r.supply_category).label,
        variant: r.supply_variant,
        pack: r.supply_pack,
        link: r.supply_url,
      })),
    [rows],
  );
  return { lines, rows, loaded: householdId !== null, read: rows !== NOT_READ };
}

export interface SuppliesView {
  items: SupplyItem[];
  /** The rows as stored, for the sheet that edits one. */
  rows: Awaited<ReturnType<typeof supplyItems>>;
  loaded: boolean;
  /** The catalog has been read at least once (`ShoppingView.read`'s twin): not the empty start. */
  read: boolean;
}

/** What `useSupplies` starts from, by identity. */
const SUPPLIES_NOT_READ: Awaited<ReturnType<typeof supplyItems>> = [];

/** The catalog, in the shape `packages/core/supplies` reasons about. */
export function useSupplies(): SuppliesView {
  const { account } = useAuth();
  const householdId = account?.memberships[0]?.household_id ?? null;
  const rows = useLocalQuery(
    householdId === null ? [] : [keys.supplies(householdId)],
    db => (householdId === null ? Promise.resolve([]) : supplyItems(db, householdId)),
    SUPPLIES_NOT_READ,
  );
  const items = useMemo<SupplyItem[]>(
    () =>
      rows.map(r => ({
        id: r.id,
        category: r.category,
        brand: r.brand,
        product: r.product,
        variant: r.variant,
        pack: r.pack,
        store: r.store,
        notes: r.notes,
        url: r.url,
        lastBoughtOn: r.last_bought_on,
      })),
    [rows],
  );
  return { items, rows, loaded: householdId !== null, read: rows !== SUPPLIES_NOT_READ };
}

export interface TasksView {
  tasks: TaskRow[];
  rows: Awaited<ReturnType<typeof householdTasks>>;
  /** The household's own day and weekday, and the minutes past its midnight. */
  today: string;
  weekday: number;
  nowMinutes: number;
  timeZone: string;
  loaded: boolean;
}

export function useTasks(): TasksView {
  const { account } = useAuth();
  const householdId = account?.memberships[0]?.household_id ?? null;
  const timeZone = useTimeZone();
  // the strip's "overdue" turns over at a minute, which is the granularity of every other
  // elapsed in the app — an hour would leave a 9 p.m. chore looking on time until 10
  const nowMs = useMinuteTick();
  const rows = useLocalQuery(
    householdId === null ? [] : [keys.tasks(householdId)],
    db => (householdId === null ? Promise.resolve([]) : householdTasks(db, householdId)),
    [] as Awaited<ReturnType<typeof householdTasks>>,
  );
  const tasks = useMemo<TaskRow[]>(
    () =>
      rows.map(r => ({
        id: r.id,
        title: r.title,
        // Postgres `time` mirrors as HH:MM:SS; every screen and the engine want HH:MM
        atLocalTime: r.at_local_time === null ? null : r.at_local_time.slice(0, 5),
        repeat: r.repeat as TaskRepeat,
        assignedTo: r.assigned_to,
        lastDoneOn: r.last_done_on,
      })),
    [rows],
  );
  const { today, weekday, nowMinutes } = useMemo(() => {
    const now = new Date(nowMs);
    const iso = todayIso(now, timeZone);
    // The weekday and the clock read in the HOUSEHOLD's zone. `wallClock` is the one formatter
    // the schedule engine already runs on every phone — hourCycle h23, never `hour12: false`,
    // which reads "24:05" at midnight on some ICU builds and would put a chore an hour late
    // into tomorrow. The weekday is arithmetic on the date it gives, not a second formatter.
    try {
      const wall = wallClock(timeZone, nowMs);
      return {
        today: iso,
        weekday: new Date(Date.UTC(wall.year, wall.month - 1, wall.day)).getUTCDay(),
        nowMinutes: wall.hour * 60 + wall.minute,
      };
    } catch {
      // a zone id this device's ICU does not know: the device's own day, as `todayIso` does
      return {
        today: iso,
        weekday: now.getDay(),
        nowMinutes: now.getHours() * 60 + now.getMinutes(),
      };
    }
  }, [nowMs, timeZone]);
  return { tasks, rows, today, weekday, nowMinutes, timeZone, loaded: householdId !== null };
}

/** The household's people, for the "who" row on a chore. Offline, like everything else. */
export function usePeople(): PersonRow[] {
  const { account } = useAuth();
  const householdId = account?.memberships[0]?.household_id ?? null;
  return useLocalQuery(
    householdId === null ? [] : [keys.household(householdId)],
    db => (householdId === null ? Promise.resolve([]) : householdPeople(db, householdId)),
    [] as PersonRow[],
  );
}
