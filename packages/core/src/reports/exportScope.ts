/**
 * CHOOSING WHAT TO EXPORT — the range and the child (CLAUDE.md §4; PRODUCT_SPEC.md §8).
 *
 * THIS FILE IS THE PAID HALF, AND IT ONLY EXISTS BECAUSE THE FREE HALF IS UNCONDITIONAL. The full
 * download in `export.ts` is a legal duty: everything, every plan, one button, never narrowed by
 * the history window. What Plus sells is the CONVENIENCE built on top of it — a month instead of
 * two years, one twin instead of both, a document instead of two data files. So this module
 * NARROWS a document that was already complete; it is never the only way to get the data, and
 * nothing here may ever become the only way.
 *
 * WHAT A ROW IS, TO A RANGE. Three kinds, decided by the row's own columns rather than by a list
 * of table names somebody has to remember to extend:
 *
 *   An ENTRY has an instant of its own — `start_at`, `occurred_at`, `pumped_at`, `fire_at`,
 *   `scheduled_for` — or a local date of its own (`occurred_on`, on an immunisation record). It
 *   is in the export when that moment is in the range.
 *
 *   A DETAIL belongs to an entry: it names an `activity_id` and carries no time. It goes wherever
 *   its activity goes, because half a bottle entry is worse than none of it.
 *
 *   CONTEXT is everything else: the children, the household, the members, the care items, the
 *   schedule rules, the supply catalog, the published guidance. It has no moment, so no window
 *   excludes it, and it travels whole — a file that dropped the `children` table because the
 *   babies were created before the range would be a file where every row names an id and nothing
 *   names a person.
 *
 * `created_at` IS DELIBERATELY NOT AN INSTANT. Every table has one, so treating it as the row's
 * moment would turn the whole export into "rows written this week" — a month-old care item would
 * vanish from a month-long export and take the medicine names with it. The column that matters is
 * the one that says when the thing HAPPENED, and only six of them exist.
 *
 * A DATED ROW WITH NO DATE YET IS KEPT. A planned immunisation has `occurred_on: null` — it has
 * not happened, so no window can exclude it, and dropping it would quietly remove the household's
 * own plan from a document they chose to make. The rule errs toward including the parent's row;
 * that is the direction this product errs in everywhere else, and the count line on the sheet
 * tells them exactly what came out.
 *
 * NOTHING HERE INTERPRETS, SUMMARISES OR DROPS A DELETED ROW. Soft-deleted rows travel with their
 * `deleted_at` intact, exactly as the free download carries them: an entry the household deleted
 * is still an entry it made.
 */

import { localDayKey } from '../today/day';

/** The window, in the shape `rangeOf` already returns (`toMs` exclusive). */
export interface ExportWindow {
  fromMs: number;
  /** The first instant AFTER the last local day in the range. */
  toMs: number;
}

export interface ExportScope {
  window: ExportWindow;
  /** The chosen child, or null for every child in the household. */
  childId: string | null;
  /** The household's zone — `occurred_on` is a local date and needs one to be compared. */
  timeZone: string;
}

/**
 * The columns that say when a row's event happened, in no particular order because a row carries
 * at most one of them. Each is named here with the table it belongs to so the next person can
 * check the list against the schema rather than trust it.
 */
export const EVENT_INSTANT_KEYS: readonly string[] = [
  'start_at', // activities
  'occurred_at', // milk_inventory_transactions
  'pumped_at', // milk_containers
  'fire_at', // reminders
  'scheduled_for', // schedule_instances
];

/** The same, for a column that holds a LOCAL DATE (`YYYY-MM-DD`) rather than an instant. */
export const EVENT_DATE_KEYS: readonly string[] = [
  'occurred_on', // vaccine_records
];

/**
 * The column a row names its child in. `children` is the exception and has to be: the row IS the
 * child, so its own `id` is the child id, and a one-child export whose `children` table still
 * listed the sibling would not be an export of one child.
 */
const CHILD_KEY = 'child_id';

export type RowMoment =
  | { kind: 'context' }
  | { kind: 'instant'; atMs: number }
  | { kind: 'day'; day: string }
  /** A dated row whose own date is empty — it has not happened, so no window excludes it. */
  | { kind: 'undated' };

/** What moment a row has, read off its own columns. */
export function rowMoment(row: Record<string, unknown>): RowMoment {
  for (const key of EVENT_INSTANT_KEYS) {
    if (!(key in row)) continue;
    const raw = row[key];
    if (typeof raw !== 'string' || raw === '') return { kind: 'undated' };
    const atMs = Date.parse(raw);
    // an unparseable instant is not a reason to drop somebody's row; it is a reason to keep it
    // and let them see it, which is what `undated` does
    return Number.isNaN(atMs) ? { kind: 'undated' } : { kind: 'instant', atMs };
  }
  for (const key of EVENT_DATE_KEYS) {
    if (!(key in row)) continue;
    const raw = row[key];
    if (typeof raw !== 'string' || raw === '') return { kind: 'undated' };
    return { kind: 'day', day: raw.slice(0, 10) };
  }
  return { kind: 'context' };
}

/** The child a row is about, or null when it is the household's rather than one baby's. */
export function rowChildId(table: string, row: Record<string, unknown>): string | null {
  const key = table === 'children' ? 'id' : CHILD_KEY;
  if (!(key in row)) return null;
  const value = row[key];
  return typeof value === 'string' && value !== '' ? value : null;
}

/** The entry a detail row belongs to. Exactly `activity_id`: `matched_activity_id` on a schedule
 *  instance is a reference to somewhere else, not the row's own identity, and that row has a
 *  `scheduled_for` of its own to be judged by. */
export function rowActivityId(row: Record<string, unknown>): string | null {
  if (!('activity_id' in row)) return null;
  const value = row['activity_id'];
  return typeof value === 'string' && value !== '' ? value : null;
}

/** True when the row's own moment falls inside the window. */
export function momentInWindow(moment: RowMoment, window: ExportWindow, timeZone: string): boolean {
  switch (moment.kind) {
    case 'context':
    case 'undated':
      return true;
    case 'instant':
      return moment.atMs >= window.fromMs && moment.atMs < window.toMs;
    case 'day': {
      // ISO dates compare correctly as strings, which is the whole reason the column is one.
      // `toMs` is exclusive and lands on the next day's first instant, so the last day in the
      // range is the one containing `toMs - 1`.
      const first = localDayKey(timeZone, window.fromMs);
      const last = localDayKey(timeZone, window.toMs - 1);
      return moment.day >= first && moment.day <= last;
    }
  }
}

export interface ScopedExport {
  /** The same table map, narrowed. Every table is still present, empty where nothing survived. */
  tables: Record<string, Record<string, unknown>[]>;
  /** How many rows are in the file, across every table. */
  rows: number;
  /** How many of them are entries — the number a parent recognises as "things I logged". */
  activities: number;
}

/**
 * Narrow a whole export document to one range and, optionally, one child.
 *
 * TWO PASSES, BECAUSE A DETAIL CANNOT BE JUDGED ON ITS OWN. The activities are scoped first and
 * their surviving ids collected; everything else is scoped after, so a bottle's detail row leaves
 * with its bottle and never on its own account.
 */
export function scopeExport(
  tables: Readonly<Record<string, readonly Record<string, unknown>[]>>,
  scope: ExportScope,
): ScopedExport {
  const keep = (table: string, row: Record<string, unknown>): boolean => {
    if (scope.childId !== null) {
      const child = rowChildId(table, row);
      // a null child is the HOUSEHOLD's row — a pump session, the shopping list — and stays:
      // "one child" narrows what is about a baby, it does not delete the household around them
      if (child !== null && child !== scope.childId) return false;
    }
    return momentInWindow(rowMoment(row), scope.window, scope.timeZone);
  };

  const out: Record<string, Record<string, unknown>[]> = {};
  const keptActivities = new Set<string>();
  const scopedActivities = (tables['activities'] ?? []).filter(row => keep('activities', row));
  for (const row of scopedActivities) {
    const id = row['id'];
    if (typeof id === 'string') keptActivities.add(id);
  }

  for (const [table, rows] of Object.entries(tables)) {
    if (table === 'activities') {
      out[table] = scopedActivities;
      continue;
    }
    out[table] = rows.filter(row => {
      // A row with no moment of its own that names an entry is that entry's DETAIL, and it
      // travels with it. A row that has both — a stash transaction carries `occurred_at` as well
      // as the bottle it poured — is judged on its own moment, so the ledger still reconciles
      // against the dates in the file.
      if (rowMoment(row).kind === 'context') {
        const activityId = rowActivityId(row);
        if (activityId !== null) return keptActivities.has(activityId);
      }
      return keep(table, row);
    });
  }

  let total = 0;
  for (const rows of Object.values(out)) total += rows.length;
  return { tables: out, rows: total, activities: scopedActivities.length };
}
