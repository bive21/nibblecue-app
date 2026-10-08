/**
 * Reading the two shared lists from the local mirror (WP6b, WP6c; migration 0016).
 *
 * Both are household-scoped and small — a shopping list is tens of lines, a chore list fewer —
 * so each is one unpaged query with no window and no cursor. Soft-deleted rows never leave the
 * database and never reach a screen: `deleted_at is null` is in both.
 */
import type { Db, Tx } from '../driver';

export interface ShoppingItemRow {
  id: string;
  household_id: string;
  title: string;
  qty: number;
  note: string | null;
  store: string | null;
  checked_at: string | null;
  checked_by: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  /** The catalog item this line came from (0017), or null for a one-off. */
  supply_id: string | null;
  /**
   * The catalog item's own columns, READ LIVE rather than copied onto the line when it was
   * added. Correcting the size on the diapers fixes every line that points at them, which is
   * the whole reason the catalog is a separate thing from the list.
   */
  /** The catalog item's category id, so the line can name what KIND of thing it is. */
  supply_category: string | null;
  supply_variant: string | null;
  supply_pack: string | null;
  supply_store: string | null;
  supply_notes: string | null;
  supply_url: string | null;
}

/** The columns of a line, with its catalog item's detail joined on. */
const SHOPPING_SELECT = `select s.id, s.household_id, s.title, s.qty, s.note, s.store,
            s.checked_at, s.checked_by, s.created_by, s.created_at, s.updated_at, s.supply_id,
            p.category as supply_category,
            p.variant as supply_variant, p.pack as supply_pack, p.store as supply_store,
            p.notes as supply_notes, p.url as supply_url
       from shopping_items s
       left join supply_items p on p.id = s.supply_id and p.deleted_at is null`;

/**
 * The list, newest addition first among what is still to buy.
 *
 * ORDER IS BY `created_at`, not by `updated_at`: a line that was ticked and unticked would
 * otherwise jump to the top of a list somebody is walking down in a shop.
 */
export async function shoppingItems(t: Db | Tx, householdId: string): Promise<ShoppingItemRow[]> {
  return t.all<ShoppingItemRow>(
    `${SHOPPING_SELECT}
      where s.household_id = ? and s.deleted_at is null
      order by s.created_at desc, s.id desc`,
    [householdId],
  );
}

export interface TaskRowLocal {
  id: string;
  household_id: string;
  title: string;
  at_local_time: string | null;
  repeat: string;
  assigned_to: string | null;
  last_done_on: string | null;
  last_done_by: string | null;
  last_done_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

/** Every live chore. The engine (`packages/core/lists`) decides which belong to today. */
export async function householdTasks(t: Db | Tx, householdId: string): Promise<TaskRowLocal[]> {
  return t.all<TaskRowLocal>(
    `select id, household_id, title, at_local_time, repeat, assigned_to,
            last_done_on, last_done_by, last_done_at, created_by, created_at, updated_at
       from household_tasks
      where household_id = ? and deleted_at is null
      order by case when at_local_time is null then 1 else 0 end, at_local_time, title`,
    [householdId],
  );
}

export interface PersonRow {
  id: string;
  name: string;
}

/**
 * The household's people, for "who is this chore for". Read from the LOCAL mirror rather than
 * the accounts API, because a chore list has to work on a phone with no signal — the same
 * reason every other read in this app goes to SQLite first.
 */
export async function householdPeople(t: Db | Tx, householdId: string): Promise<PersonRow[]> {
  return t.all<PersonRow>(
    `select p.id as id, p.display_name as name
       from household_members m
       join profiles p on p.id = m.user_id
      where m.household_id = ? and m.removed_at is null
      order by p.display_name`,
    [householdId],
  );
}
