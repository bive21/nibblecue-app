/**
 * The reads behind the medicine sheet and the care items screen (docs/CARE_ITEMS.md §2, §5).
 * Nothing here interprets: a count is how many times an item was logged in the day, a "last"
 * is when; the row copy is the item's own words repeated back.
 */
import type { Db } from '../driver';
import type { CareKind, CareRoute } from '../../data/care';

export interface CareItemRow {
  id: string;
  name: string;
  kind: CareKind;
  usual_amount: string | null;
  route: CareRoute;
  note: string | null;
  archived_at: string | null;
  /** Live reminder times, `HH:MM`, ascending. */
  reminders: { id: string; at_local_time: string }[];
}

/** The live list, alphabetically, each with its reminder times. */
export async function careItems(db: Db, householdId: string): Promise<CareItemRow[]> {
  const items = await db.all<Omit<CareItemRow, 'reminders'>>(
    `select id, name, kind, usual_amount, route, note, archived_at
       from care_items where household_id = ? and archived_at is null
      order by lower(name) asc, id asc`,
    [householdId],
  );
  if (items.length === 0) return [];
  const rules = await db.all<{ id: string; care_item_id: string; at_local_time: string }>(
    `select id, care_item_id, at_local_time from schedule_rules
      where household_id = ? and care_item_id is not null and deleted_at is null
        and is_active = 1
      order by at_local_time asc, id asc`,
    [householdId],
  );
  const byItem = new Map<string, { id: string; at_local_time: string }[]>();
  for (const r of rules) {
    const list = byItem.get(r.care_item_id) ?? [];
    list.push({ id: r.id, at_local_time: r.at_local_time.slice(0, 5) });
    byItem.set(r.care_item_id, list);
  }
  return items.map(i => ({ ...i, reminders: byItem.get(i.id) ?? [] }));
}

export async function careItem(db: Db, itemId: string): Promise<CareItemRow | undefined> {
  const row = await db.get<Omit<CareItemRow, 'reminders'>>(
    'select id, name, kind, usual_amount, route, note, archived_at from care_items where id = ?',
    [itemId],
  );
  if (!row) return undefined;
  const rules = await db.all<{ id: string; at_local_time: string }>(
    `select id, at_local_time from schedule_rules
      where care_item_id = ? and deleted_at is null and is_active = 1
      order by at_local_time asc, id asc`,
    [itemId],
  );
  return {
    ...row,
    reminders: rules.map(r => ({ id: r.id, at_local_time: r.at_local_time.slice(0, 5) })),
  };
}

export interface CareItemActivity {
  /** How many entries name the item between the bounds (the local day). */
  today: number;
  /** ISO of the newest entry naming the item, any day. */
  lastAt: string | null;
  /**
   * WHO LOGGED THAT NEWEST ENTRY, and their name as the log shows it (null until the profile
   * has arrived). The question a parent brings to this sheet at 3 a.m. is "did anyone give it
   * yet?", and in a household of two phones the answer is often "yes — the other one did".
   */
  lastBy: string | null;
  lastByName: string | null;
}

/** One item's day, baby by baby — what the medicine sheet's rows and Today's tile read. */
export interface CareItemDayByChild extends CareItemActivity {
  /**
   * Today's count for each child asked about. An entry with no child — a household that had no
   * children when it was logged — counts for every one of them, as it did for one.
   */
  todayByChild: Map<string, number>;
  /** The child the newest entry was for; null for an entry with none. */
  lastChildId: string | null;
}

/**
 * Per item: today's count PER CHILD, and the newest entry, for the children named (household
 * rows included) — or for everyone when `childIds` is null or empty.
 *
 * THE COUNT IS KEPT PER BABY (the audits of 2026-09-24: solids H5, handoff M8). The one number
 * the old read gave (`today`, still here) adds every child in scope together, and on "Both" that
 * was twins' vitamins added up against one baby's plan — "2 of 1 today" — or, after only Ada's,
 * "1 of 1" for a pair where Liam has had nothing. A reader that has more than one baby in view
 * reads `todayByChild`. The single-child `careActivity` that wrapped this went on 2026-09-26, with
 * nothing left reading it.
 */
export async function careActivityFor(
  db: Db,
  householdId: string,
  childIds: readonly string[] | null,
  dayStartIso: string,
  dayEndIso: string,
): Promise<Map<string, CareItemDayByChild>> {
  const ids = childIds ?? [];
  const scope =
    ids.length === 0
      ? ''
      : ` and (a.child_id in (${ids.map(() => '?').join(', ')}) or a.child_id is null)`;
  const rows = await db.all<{
    care_item_id: string;
    start_at: string;
    child_id: string | null;
    created_by: string | null;
    by_name: string | null;
  }>(
    `select d.care_item_id, a.start_at, a.child_id, a.created_by, p.display_name as by_name
       from activities a join med_details d on d.activity_id = a.id
       left join profiles p on p.id = a.created_by
      where a.household_id = ? and a.type = 'med' and a.deleted_at is null
        and d.care_item_id is not null${scope}
      order by a.start_at desc, a.id desc`,
    [householdId, ...ids],
  );
  const out = new Map<string, CareItemDayByChild>();
  for (const r of rows) {
    const cur = out.get(r.care_item_id) ?? {
      today: 0,
      lastAt: null,
      lastBy: null,
      lastByName: null,
      todayByChild: new Map(ids.map(id => [id, 0])),
      lastChildId: null,
    };
    if (cur.lastAt === null) {
      cur.lastAt = r.start_at;
      cur.lastBy = r.created_by;
      cur.lastByName = r.by_name?.trim() || null;
      cur.lastChildId = r.child_id;
    }
    if (r.start_at >= dayStartIso && r.start_at < dayEndIso) {
      cur.today += 1;
      for (const id of r.child_id === null ? ids : [r.child_id]) {
        cur.todayByChild.set(id, (cur.todayByChild.get(id) ?? 0) + 1);
      }
    }
    out.set(r.care_item_id, cur);
  }
  return out;
}
