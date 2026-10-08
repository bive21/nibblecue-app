/**
 * WRITING ONE ROW INTO THE LOCAL MIRROR — the part of `apps/mobile/src/data/repository.ts` that
 * both the app's write path and the pull's apply use, moved here (2026-09-23) so that
 * `packages/db`'s round-trip test runs this code rather than a copy of it.
 */
import { DETAIL_TABLES, type LocalRow, type OutboxState } from '../types';
import type { SqlTx, SqlValue } from './sql';

/** The states an outbox row can be in that still owe the server something. */
export const UNSENT_STATES: readonly OutboxState[] = ['PENDING', 'SENDING', 'FAILED'];

/**
 * Every local table's primary key. The repository writes by name, never by position, and a
 * table it does not know throws rather than guessing a key — an upsert on the wrong column is
 * how one parent's row silently overwrites another's.
 */
export const LOCAL_PRIMARY_KEY: Readonly<Record<string, readonly string[]>> = {
  profiles: ['id'],
  households: ['id'],
  household_members: ['household_id', 'user_id'],
  children: ['id'],
  module_settings: ['household_id', 'module_id'],
  household_settings: ['household_id'],
  household_duty: ['household_id'],
  subscription_entitlements: ['id'],
  activities: ['id'],
  ...Object.fromEntries(DETAIL_TABLES.map(t => [t, ['activity_id'] as readonly string[]])),
  running_timers: ['id'],
  favorites: ['id'],
  storage_locations: ['id'],
  milk_containers: ['id'],
  milk_inventory_transactions: ['id'],
  milk_guidance_profiles: ['profile', 'version'],
  schedule_phases: ['id'],
  schedule_rules: ['id'],
  care_items: ['id'],
  schedule_instances: ['id'],
  reminders: ['id'],
  notification_preferences: ['household_id', 'user_id', 'channel'],
  privacy_preferences: ['household_id', 'user_id', 'module_id'],
  app_messages: ['id'],
  app_message_dismissals: ['message_id', 'user_id'],
  vaccine_guidance_profiles: ['profile', 'version'],
  vaccine_tracking_settings: ['household_id', 'child_id', 'dose_id'],
  vaccine_records: ['id'],
  // the two shared lists (WP6b, WP6c). A mirrored table missing from this map is not a quiet
  // gap: `upsertRow` and the pull's apply both throw on it, inside their transactions, so the
  // first list write and the first pulled list page failed until these two lines existed.
  // apps/mobile/src/sync/tables.test.ts pins every mirrored table against the map so it cannot
  // happen again.
  shopping_items: ['id'],
  household_tasks: ['id'],
  supply_items: ['id'],
  // NibbleCue's own records (schema v22)
  nibble_records: ['id'],
};

/** Table names come from this map, never from a payload; the check says so. */
export function qualifyLocal(table: string): string {
  if (!Object.prototype.hasOwnProperty.call(LOCAL_PRIMARY_KEY, table)) {
    throw new TypeError(`no local primary key known for table '${table}'`);
  }
  return table;
}

/** A local table's primary key columns. */
export function localKeyOf(table: string): readonly string[] {
  const pk = LOCAL_PRIMARY_KEY[qualifyLocal(table)];
  if (pk === undefined || pk.length === 0) throw new TypeError(`table '${table}' has no key`);
  return pk;
}

/**
 * Domain shape to SQLite (D31): booleans become 0/1, jsonb becomes text, and `undefined` means
 * "this chain does not write that column" rather than "write null" — an UPDATE chain carries
 * only the columns it changes, and null would erase the rest.
 */
export function encodeValue(value: unknown): SqlValue {
  if (value === null) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'number' || typeof value === 'string') return value;
  if (typeof value === 'object') return JSON.stringify(value);
  throw new TypeError(`a local column cannot hold ${typeof value}`);
}

/**
 * Upsert one row on its primary key: UPDATE first, INSERT only if nothing was there.
 *
 * Not `insert … on conflict do update`. SQLite assembles the whole candidate row before it
 * looks for the conflict, so an upsert carrying only the four columns an edit changes fails
 * `NOT NULL` on `type`, `start_at`, `created_by` and the rest — for a row that exists. Update
 * first and that whole class disappears: a CREATE chain's complete row inserts, an UPDATE
 * chain's patch updates, and a patch aimed at a row that is not there still fails loudly,
 * which is the correct answer to "edit an entry this device has never seen".
 *
 * Updating first is also what makes a replay converge. A chain rebuilt from an already-written
 * row — a process killed between the write and the flush, a widget intent drained twice —
 * rewrites the same values instead of raising on the primary key. And it is what makes the
 * pull's re-read of a page free, which every safety device in the pull rests on.
 *
 * `activities.local_synced` is never in a chain, so it keeps its default on insert and its
 * value on update: the pull owns it, not the writer.
 */
export async function upsertRow(t: SqlTx, row: LocalRow): Promise<void> {
  const table = qualifyLocal(row.table);
  const pk = localKeyOf(table);
  const columns = Object.keys(row.row).filter(c => row.row[c] !== undefined);
  for (const key of pk) {
    if (!columns.includes(key)) {
      throw new TypeError(`a row for '${table}' must carry its key column '${key}'`);
    }
  }
  const where = pk.map(c => `${c} = ?`).join(' and ');
  const keyValues = pk.map(c => encodeValue(row.row[c]));
  const patch = columns.filter(c => !pk.includes(c));
  if (patch.length > 0) {
    const { changes } = await t.run(
      `update ${table} set ${patch.map(c => `${c} = ?`).join(', ')} where ${where}`,
      [...patch.map(c => encodeValue(row.row[c])), ...keyValues],
    );
    if (changes > 0) return;
  } else {
    const existing = await t.get<{ one: number }>(`select 1 as one from ${table} where ${where}`, [
      ...keyValues,
    ]);
    if (existing !== undefined) return;
  }
  await t.run(
    `insert into ${table} (${columns.join(', ')}) values (${columns.map(() => '?').join(', ')})`,
    columns.map(c => encodeValue(row.row[c])),
  );
}
