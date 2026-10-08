/**
 * Writing a pulled page into the mirror: one idempotent apply per strategy (WP4 D17, D18).
 *
 * MOVED FROM `apps/mobile/src/sync/apply.ts` (2026-09-23), with the cursor and the local schema,
 * so that `packages/db/src/integration/sync-round-trip.test.ts` runs THIS code against the real
 * `sync_pull` rather than a copy of it. The one thing that stayed in the app is which of its
 * screen caches a row invalidates (`invalidationKeys` there): that is the app's business, and it
 * reaches this code through `ApplyContext.keysFor`.
 *
 * Every function here takes the caller's `Tx` rather than the `Db`. That is not a style
 * preference, it is the cursor rule. The page's rows, the `local_synced` stamp and the cursor
 * advance have to commit together, so that a process killed between them re-reads the page
 * rather than skipping it, and a re-read is free because every apply below is an upsert.
 *
 * WHAT MAKES AN APPLY IDEMPOTENT HERE. `upsertRow` (`./mirror.ts`) updates first and
 * inserts only when nothing was there, so the same page applied twice writes the same values
 * twice and produces one row. `applyAppend` goes further and never updates at all: the ledger
 * is insert-only for ever (`0002_rls.sql:181` revokes update and delete on it), so a second
 * sight of a transaction must be ignored, not rewritten.
 *
 * TOMBSTONES ARE ORDINARY ROWS. A soft delete arrives as a row with `deleted_at` set, because
 * the server never deletes one (`docs/OFFLINE_SYNC.md` §4). It is upserted like any other row,
 * it stays in the table, every read filters `deleted_at is null` - and the store version is
 * bumped exactly as for a live row, because a subscriber holding the old list has to re-run to
 * lose it.
 *
 * NO FOREIGN KEYS, ON PURPOSE. A detail row can reach the device in a page whose parent
 * activity has not landed, and `./schema.ts` declares no FK so that the row lands anyway
 * (rule 7: never lose a log). The apply order below reduces how often that happens; it does not
 * depend on it.
 *
 * COLUMNS COME FROM THE MIRROR, NOT FROM THE PAYLOAD. Each table's column set is read once from
 * `pragma table_info` and every incoming key not in it is dropped - `details` on an activity,
 * and any column a later server release adds that this build does not mirror. A pulled row can
 * therefore never widen a local table or fail an insert on a column that is not there (D29).
 */
import { HOUSEHOLD_SETTINGS_KEY, settingsEntityId } from '../chains';
import { DETAIL_TABLES, type DetailTable, type PullStrategy } from '../types';
import { encodeValue, localKeyOf, qualifyLocal, UNSENT_STATES, upsertRow } from './mirror';
import type { PullScope } from './pull';
import type { SqlTx as Tx, SqlValue } from './sql';

export type ServerRow = Record<string, unknown>;

/**
 * The window `0010`'s `user_window` branch serves, mirrored so the local replace deletes exactly
 * the rows that page could have contained and not one more. One day back so a reminder that
 * fired while the phone was off is still reconciled, seven days forward because iOS caps the
 * local notifications an app may hold pending.
 */
const USER_WINDOW_BACK_MS = 24 * 60 * 60 * 1000;
const USER_WINDOW_AHEAD_MS = 7 * 24 * 60 * 60 * 1000;

export interface ApplyContext {
  householdId: string;
  userId: string;
  /** `PullResponse.server_time` - the clock the `user_window` replace is scoped by. */
  serverTime: string;
  /**
   * An applied row overwrote a locally modified one whose change is not queued anywhere.
   * `pull.ts` turns it into `sync_conflict_resolved { table, strategy }`.
   */
  onConflict?: ((table: string, strategy: PullStrategy) => void) | undefined;
  /**
   * The caller's cache keys for one written or removed row, collected into `ApplyOutcome.keys`
   * and invalidated after the transaction commits. The app maps a row to its screen caches
   * (`apps/mobile/src/sync/apply.ts`); a caller with no caches leaves it out.
   */
  keysFor?: ((table: string, row: ServerRow) => string[]) | undefined;
}

export interface ApplyOutcome {
  written: number;
  /** Rows a `full` replace removed because the server did not return them. */
  removed: number;
  /** Local edits an applied row overwrote with nothing queued to restore them. */
  conflicts: number;
  /** Store keys to invalidate **after** the transaction commits. */
  keys: string[];
}

const EMPTY: ApplyOutcome = { written: 0, removed: 0, conflicts: 0, keys: [] };

/**
 * The order the tables of one response are applied in. Parents before the rows that point at
 * them: children before activities, containers before the ledger that moves them, phases before
 * rules before instances. A detail row is not in the list because it never travels alone - it
 * rides inside its activity and is written immediately after it.
 */
export const APPLY_ORDER: readonly string[] = [
  'profiles',
  'households',
  'household_members',
  'children',
  'nibble_records',
  'module_settings',
  'household_settings',
  'household_duty',
  'storage_locations',
  // the catalog before the list that points at it
  'supply_items',
  'shopping_items',
  'household_tasks',
  'subscription_entitlements',
  'milk_guidance_profiles',
  'care_items',
  'activities',
  'running_timers',
  'milk_containers',
  'milk_inventory_transactions',
  'schedule_phases',
  'schedule_rules',
  'schedule_instances',
  'favorites',
  'reminders',
  'notification_preferences',
  'privacy_preferences',
  'app_messages',
  'vaccine_guidance_profiles',
  'vaccine_tracking_settings',
  'vaccine_records',
];

/** Sort a response's table names into apply order; a name not in the list goes last, in place. */
export function inApplyOrder(names: readonly string[]): string[] {
  const rank = (n: string) => {
    const i = APPLY_ORDER.indexOf(n);
    return i === -1 ? APPLY_ORDER.length : i;
  };
  return [...names].sort((a, b) => rank(a) - rank(b));
}

/**
 * Local-only NOT NULL columns the server has never heard of, and which the pull therefore has
 * to fill itself or the first insert of a pulled row fails.
 *
 * There is exactly one today. `household_members` has no `updated_at` on the server at all
 * (`0001_init.sql`: household_id, user_id, role, nickname, joined_at, removed_at) - which is
 * precisely why its pull strategy is `full` - while WP2's `mirrored()` helper appended
 * `updated_at text not null` to the local table on the strength of `docs/MOBILE.md` §7's
 * blanket rule. `mirror-parity.test.ts` records it as a deliberate local-only column; what it
 * could not know is that a pulled row would hit the NOT NULL. So the pull stamps it with the
 * response's `server_time`, which is the only true statement available: not when the membership
 * changed, but when this device saw it change. (Until 2026-09-27 it was when this device last saw
 * it at all, which made every row of every `full` members page a change — the household's cache
 * key bumped every 30 seconds for nothing. Nothing reads the stamp; `writePage` leaves it out of
 * "is this row new".)
 *
 * `is_mom` is deliberately NOT here. It is local state with a default, and `upsertRow` writes
 * only the columns a row carries, so it survives every bootstrap (D18).
 */
const LOCAL_STAMPS: Readonly<Record<string, readonly string[]>> = {
  household_members: ['updated_at'],
};

/**
 * Which outbox entity a local edit of this table would have queued. Only these tables can hold
 * an unsent local change, so only these can have one overwritten.
 */
const CONFLICT_ENTITY: Readonly<Record<string, string>> = {
  activities: 'activity',
  running_timers: 'timer',
  milk_containers: 'container',
  schedule_rules: 'schedule_rule',
  schedule_phases: 'schedule_phase',
  schedule_instances: 'schedule_instance',
  vaccine_records: 'vaccine_record',
  care_items: 'care_item',
  storage_locations: 'location',
  shopping_items: 'shopping_item',
  household_tasks: 'task',
  supply_items: 'supply_item',
  nibble_records: 'nibble_record',
};

/* ------------------------------------------------------------------ columns */

const columnCache = new Map<string, Set<string>>();

async function columnsOf(t: Tx, table: string): Promise<Set<string>> {
  const cached = columnCache.get(table);
  if (cached !== undefined) return cached;
  const rows = await t.all<{ name: string }>(`pragma table_info(${qualify(table)})`);
  const set = new Set(rows.map(r => r.name));
  if (set.size === 0) throw new TypeError(`the local mirror has no table '${table}'`);
  columnCache.set(table, set);
  return set;
}

/** Table names come from this code's own maps, never from a response. */
const qualify = qualifyLocal;
const pkOf = localKeyOf;

/** Keep only columns the mirror has, so a payload can never widen a table or fail an insert. */
function project(row: ServerRow, columns: Set<string>): ServerRow {
  const out: ServerRow = {};
  for (const [k, v] of Object.entries(row)) {
    if (columns.has(k) && v !== undefined) out[k] = v;
  }
  return out;
}

const keyOf = (row: ServerRow, pk: readonly string[]): string =>
  pk.map(c => String(row[c] ?? '')).join(' ');

const at = (v: unknown): number => {
  const n = Date.parse(String(v));
  return Number.isNaN(n) ? 0 : n;
};

/* ------------------------------------------------------------------ the write */

/**
 * Upsert a page and report what it disturbed.
 *
 * Two batched reads do the bookkeeping, because doing it per row would mean a thousand
 * statements for one page of activities:
 *
 *   1. the local copy of every row in the page — its `updated_at`, to tell "the server is telling
 *      us something new" from "the server is overwriting an edit made on this phone", and every
 *      other column, to tell either from "the server is telling us what we already hold";
 *   2. the ids that still owe the server something (`UNSENT_STATES`, which includes `FAILED`
 *      because a failed op still holds the parent's edit and WP4.9's replay can still send it).
 *
 * A local row that is NEWER than the incoming one and has nothing queued is the conflict: the
 * edit that made it newer is gone, and last-writer-wins has just resolved against this device.
 *
 * A ROW ALREADY HELD EXACTLY AS THE PAGE HAS IT IS NOT WRITTEN AGAIN, AND WAKES NO READER
 * (2026-09-27). Every pass re-reads a little on purpose — each delta table from its cursor less
 * `PULL_LAG_MS`, and each `full` table whole — and every row of it was upserted and handed its
 * cache keys, changed or not: 90 rows and 15 keys on every 30-second pass of an idle household
 * with a 5,000-entry log, its modules, its vaccine switches and both guidance profiles
 * (`apps/mobile/src/sync/idle.test.ts`) — which a mounted screen would re-read twice a minute for
 * nothing, and now none (the members' own stamp, `LOCAL_STAMPS`, is not news). The comparison is
 * value for value against what `upsertRow` would store, so it can only ever call a row changed
 * that is not — the cost of which is the write every row used to get — and never the reverse.
 * `written` still counts the rows the page carried: the outcome says what the server sent.
 * `alsoSame` lets a caller hold back a row whose own columns match but whose companion does not
 * (an activity whose detail changed); `skipped` names the rows held back.
 */
async function writePage(
  t: Tx,
  table: string,
  strategy: PullStrategy,
  rows: readonly ServerRow[],
  ctx: ApplyContext,
  alsoSame: (row: ServerRow) => boolean = () => true,
): Promise<{ written: number; conflicts: number; keys: string[]; skipped: Set<string> }> {
  if (rows.length === 0) return { written: 0, conflicts: 0, keys: [], skipped: new Set() };
  const columns = await columnsOf(t, table);
  const pk = pkOf(table);
  const localStamps = LOCAL_STAMPS[table] ?? [];
  // the stamps this pull filled itself, row by row: a value the server did send is compared
  const stamped: string[][] = [];
  const projected = rows.map(r => {
    const row = project(r, columns);
    const filled: string[] = [];
    for (const column of localStamps) {
      if (columns.has(column) && row[column] === undefined) {
        row[column] = ctx.serverTime;
        filled.push(column);
      }
    }
    stamped.push(filled);
    return row;
  });

  const single = pk.length === 1 ? pk[0] : undefined;
  const ids = single === undefined ? [] : projected.map(r => String(r[single] ?? ''));
  const held = await localRows(t, table, pk, columns, ids, ctx);
  const unsent =
    CONFLICT_ENTITY[table] === undefined || ids.length === 0
      ? new Set<string>()
      : await unsentEntityIds(t, ids);

  const stamps = columns.has('local_synced');
  let conflicts = 0;
  const touched: string[] = [];
  const skipped = new Set<string>();

  // A SETTINGS ROW THIS PHONE HAS CHANGED AND NOT YET SENT keeps the change: the server's copy is
  // the one before it, and the push that follows answers for it. A refused op (FAILED) lets the
  // server's row in — that is the value the household really has.
  const owners = projected.map(row => settingsOwnerId(table, row, ctx.householdId));
  const ownerIds = owners.filter((o): o is string => o !== null);
  const inFlight =
    ownerIds.length === 0
      ? new Set<string>()
      : await unsentEntityIds(t, ownerIds, IN_FLIGHT_STATES);

  for (const [i, row] of projected.entries()) {
    const owner = owners[i];
    if (owner !== null && owner !== undefined && inFlight.has(owner)) continue;
    const id = single === undefined ? '' : String(row[single] ?? '');
    const key = keyOf(row, pk);
    const local = held.get(key);
    const previous = local?.['updated_at'];
    if (
      CONFLICT_ENTITY[table] !== undefined &&
      previous !== undefined &&
      !unsent.has(id) &&
      at(previous) > at(row['updated_at'])
    ) {
      // A pulled row adopts the server's `updated_at` unconditionally; this only counts how
      // often that overwrote something this device had changed and not queued.
      conflicts += 1;
      ctx.onConflict?.(table, strategy);
    }
    // The pull owns `local_synced`: the server has answered for this row, so it is only still
    // "queued" if this device is holding an op for it.
    const write = stamps ? { ...row, local_synced: unsent.has(id) ? 0 : 1 } : row;
    if (sameAsHeld(local, write, stamped[i]) && alsoSame(row)) {
      skipped.add(key);
      continue;
    }
    await upsertRow(t, { table, row: write });
    touched.push(...(ctx.keysFor?.(table, row) ?? []));
  }
  return { written: projected.length, conflicts, keys: touched, skipped };
}

/**
 * The mirror's copy of the rows a page carries, by `keyOf` — one read for the page. A single key
 * is asked for by its ids; a composite one is a settings row or a published profile, a table of a
 * few dozen rows at most, read whole in the household (or whole, where it has none).
 */
async function localRows(
  t: Tx,
  table: string,
  pk: readonly string[],
  columns: Set<string>,
  ids: readonly string[],
  ctx: ApplyContext,
): Promise<Map<string, ServerRow>> {
  const out = new Map<string, ServerRow>();
  const single = pk.length === 1 ? pk[0] : undefined;
  let rows: ServerRow[];
  if (single !== undefined) {
    if (ids.length === 0) return out;
    rows = await t.all<ServerRow>(
      `select * from ${qualify(table)} where ${single} in (${ids.map(() => '?').join(', ')})`,
      ids as SqlValue[],
    );
  } else {
    rows = columns.has('household_id')
      ? await t.all<ServerRow>(`select * from ${qualify(table)} where household_id = ?`, [
          ctx.householdId,
        ])
      : await t.all<ServerRow>(`select * from ${qualify(table)}`);
  }
  for (const row of rows) out.set(keyOf(row, pk), row);
  return out;
}

/**
 * Whether the mirror already holds every column a write carries, value for value as `upsertRow`
 * would store it. Strict equality on the stored value, so a column SQLite converted on the way in
 * (a number into a text column) reads as changed and is written again, as it always was: this
 * can mistake a row for changed, never a change for nothing. A local stamp the pull fills itself
 * (`LOCAL_STAMPS`) is not a column the server said anything about, so it is not compared.
 */
function sameAsHeld(
  local: ServerRow | undefined,
  write: ServerRow,
  stamps: readonly string[] = [],
): boolean {
  if (local === undefined) return false;
  for (const [column, value] of Object.entries(write)) {
    if (value === undefined || stamps.includes(column)) continue;
    if (local[column] !== encodeValue(value)) return false;
  }
  return true;
}

async function unsentEntityIds(
  t: Tx,
  ids: readonly string[],
  states: readonly string[] = UNSENT_STATES,
): Promise<Set<string>> {
  const rows = await t.all<{ entity_id: string }>(
    `select distinct entity_id from outbox
      where state in (${states.map(() => '?').join(', ')})
        and entity_id in (${ids.map(() => '?').join(', ')})`,
    [...states, ...ids] as SqlValue[],
  );
  return new Set(rows.map(r => r.entity_id));
}

/**
 * THE OP THAT OWNS A SETTINGS ROW (the handoff audit's L2, at its root). A settings row has a
 * composite key, and the op that writes it carries an id DERIVED from what it names
 * (`settingsEntityId`) — so "does this phone still owe the server this row?" asked by the row's
 * own key never matched, and a pull that landed between a settings write and its push put the
 * server's older row back: a module switched on flipped off again, and the list of who's on went
 * back to the one before, until the push landed and the next pull. Null for any other table.
 */
function settingsOwnerId(table: string, row: ServerRow, householdId: string): string | null {
  const hh = String(row['household_id'] ?? householdId);
  const v = (column: string) => String(row[column] ?? '');
  switch (table) {
    case 'module_settings':
      return settingsEntityId(hh, 'module_settings', v('module_id'));
    // one row, one owner id, whichever column the op wrote — the waking window or the milk unit
    case 'household_settings':
      return settingsEntityId(hh, 'household_settings', HOUSEHOLD_SETTINGS_KEY);
    case 'household_duty':
      return settingsEntityId(hh, 'household_duty', 'duty');
    case 'notification_preferences':
      return settingsEntityId(hh, 'notification_preferences', `${v('user_id')}:${v('channel')}`);
    case 'privacy_preferences':
      return settingsEntityId(hh, 'privacy_preferences', `${v('user_id')}:${v('module_id')}`);
    case 'vaccine_tracking_settings':
      return settingsEntityId(hh, 'vaccine_tracking_settings', `${v('child_id')}:${v('dose_id')}`);
    default:
      return null;
  }
}

/** A settings op still on its way — queued or in flight, not refused (`FAILED` lets the server's row in). */
const IN_FLIGHT_STATES: readonly string[] = ['PENDING', 'SENDING'];

/* ------------------------------------------------------------------ strategies */

/**
 * `delta` and `delta_status`: a keyset page, tombstones included. `activities` carries its one
 * detail row embedded (`0010`'s lateral, the mirror image of a push's `payload.detail`), and
 * five of the fifteen activity types have no detail row at all and arrive with `details: null`.
 */
export async function applyDelta(
  t: Tx,
  table: string,
  rows: readonly ServerRow[],
  ctx: ApplyContext,
  strategy: PullStrategy = 'delta',
): Promise<ApplyOutcome> {
  if (table === 'activities') return applyActivities(t, rows, ctx, strategy);
  const page = await writePage(t, table, strategy, rows, ctx);
  return { written: page.written, removed: 0, conflicts: page.conflicts, keys: page.keys };
}

/** An activity and, immediately after it, the one detail row it brought with it. */
async function applyActivities(
  t: Tx,
  rows: readonly ServerRow[],
  ctx: ApplyContext,
  strategy: PullStrategy,
): Promise<ApplyOutcome> {
  // each row's detail, projected onto the mirror's own columns, and the copies the mirror holds
  const details = new Map<string, { table: DetailTable; row: ServerRow }>();
  const byTable = new Map<DetailTable, string[]>();
  for (const row of rows) {
    const detail = row['details'];
    if (detail === null || detail === undefined || typeof detail !== 'object') continue;
    const embedded = detail as ServerRow;
    const name = String(embedded['table'] ?? '');
    const known = DETAIL_TABLES.find(d => d === name);
    // A detail table this build does not know is dropped rather than guessed at: the activity
    // itself is what a parent reads on the timeline, and losing the page over one unknown
    // shape would lose the log (D29).
    if (known === undefined) continue;
    const projected = project(embedded, await columnsOf(t, known));
    details.set(String(row['id'] ?? ''), { table: known, row: projected });
    const ids = byTable.get(known) ?? [];
    ids.push(String(projected['activity_id'] ?? ''));
    byTable.set(known, ids);
  }
  const heldDetails = new Map<string, ServerRow>();
  for (const [table, ids] of byTable) {
    const held = await localRows(t, table, ['activity_id'], await columnsOf(t, table), ids, ctx);
    for (const [key, row] of held) heldDetails.set(`${table} ${key}`, row);
  }
  const detailSame = (row: ServerRow): boolean => {
    const detail = details.get(String(row['id'] ?? ''));
    if (detail === undefined) return true;
    const key = `${detail.table} ${String(detail.row['activity_id'] ?? '')}`;
    return sameAsHeld(heldDetails.get(key), detail.row);
  };

  // an activity held back as unchanged is held back with its detail, which `detailSame` compared
  const parents = await writePage(t, 'activities', strategy, rows, ctx, detailSame);
  let written = parents.written;
  for (const row of rows) {
    const id = String(row['id'] ?? '');
    const detail = details.get(id);
    if (detail === undefined) continue;
    written += 1;
    if (parents.skipped.has(id)) continue;
    await upsertRow(t, { table: detail.table, row: detail.row });
  }
  return { written, removed: 0, conflicts: parents.conflicts, keys: parents.keys };
}

/**
 * `full`: the page IS the current set, so absence means removal (D18) - but only within the
 * scope the server answered in. `favorites`, `reminders` and `notification_preferences` are
 * viewer-scoped by policy, `subscription_entitlements` is the caller's row with no household
 * filter at all, and `milk_guidance_profiles` is published reference data with no
 * `household_id` column to scope by: its rows are never removed by absence.
 *
 * `household_members.is_mom` survives because `upsertRow` writes only the columns the row
 * carries and the server has never heard of that column - it exists in the mirror alone
 * (`docs/plans/WP4.md` Q7). An `insert ... on conflict do update` of a whole row would reset it
 * to 0 on every bootstrap, which is exactly the bug the update-first upsert avoids.
 */
export async function applyFull(
  t: Tx,
  table: string,
  rows: readonly ServerRow[],
  ctx: ApplyContext,
  scope: PullScope,
  strategy: PullStrategy = 'full',
): Promise<ApplyOutcome> {
  const page = await writePage(t, table, strategy, rows, ctx);
  const swept = await sweep(t, table, rows, ctx, scope, strategy);
  return {
    written: page.written,
    removed: swept.removed,
    conflicts: page.conflicts,
    keys: [...page.keys, ...swept.keys],
  };
}

/**
 * Delete the in-scope local rows the page did not contain.
 *
 * Read the keys, diff in memory, delete by key - rather than one `not in` with as many
 * placeholders as the page has rows. Every `full` table is tiny by definition (that is WHY it
 * is `full`: no `updated_at` to page by), the diff is readable in a failure message, and a
 * composite key does not need a row-value `in` this SQLite may or may not support.
 */
async function sweep(
  t: Tx,
  table: string,
  rows: readonly ServerRow[],
  ctx: ApplyContext,
  scope: PullScope,
  strategy: PullStrategy,
): Promise<{ removed: number; keys: string[] }> {
  if (scope === 'global') return { removed: 0, keys: [] };
  const columns = await columnsOf(t, table);
  const pk = pkOf(table);
  const where = scopeClause(table, columns, ctx, scope, strategy);
  const kept = new Set(rows.map(r => keyOf(project(r, columns), pk)));
  const local = await t.all<ServerRow>(
    `select ${pk.join(', ')} from ${qualify(table)}${where.sql}`,
    where.params,
  );

  // THE ROW THIS DEVICE STILL OWES THE SERVER IS NOT THE SERVER'S TO WITHDRAW.
  //
  // A `full` page is the server's current set, and absence means removal - but only of rows the
  // server has ever heard of. A timer started in airplane mode is a local row plus a PENDING
  // op; the server cannot return it because it does not have it yet, and a replace that deleted
  // it would take a running timer off the screen mid-nap and, if that op later FAILED, lose it
  // outright. That is rule 7 and rule 12 in one bug, and it is invisible unless a pull happens
  // to beat a push - which is exactly what a reconnect does.
  const single = pk.length === 1 ? pk[0] : undefined;
  // a settings row answers to its op's derived id, not to its own key (`settingsOwnerId`)
  const ownerOf = (row: ServerRow): string | null =>
    settingsOwnerId(table, row, ctx.householdId) ??
    (single === undefined ? null : String(row[single] ?? '') || null);
  const localIds = local.map(ownerOf).filter((v): v is string => v !== null);
  const owed = localIds.length === 0 ? new Set<string>() : await unsentEntityIds(t, localIds);

  let removed = 0;
  const touched: string[] = [];
  for (const row of local) {
    if (kept.has(keyOf(row, pk))) continue;
    const owner = ownerOf(row);
    if (owner !== null && owed.has(owner)) continue;
    await t.run(
      `delete from ${qualify(table)} where ${pk.map(c => `${c} = ?`).join(' and ')}`,
      pk.map(c => encodeValue(row[c])),
    );
    removed += 1;
    touched.push(...(ctx.keysFor?.(table, row) ?? []));
  }
  return { removed, keys: touched };
}

/** The predicate that says which local rows the page could have contained. */
function scopeClause(
  table: string,
  columns: Set<string>,
  ctx: ApplyContext,
  scope: PullScope,
  strategy: PullStrategy,
): { sql: string; params: SqlValue[] } {
  const clauses: string[] = [];
  const params: SqlValue[] = [];
  if (columns.has('household_id') && table !== 'subscription_entitlements') {
    clauses.push('household_id = ?');
    params.push(ctx.householdId);
  }
  if (scope === 'user' && columns.has('user_id')) {
    // `favorites_read` is `... and (user_id is null or user_id = auth.uid())`; a household-wide
    // favorite carries a null user_id and belongs to everyone.
    clauses.push(table === 'favorites' ? '(user_id is null or user_id = ?)' : 'user_id = ?');
    params.push(ctx.userId);
  }
  if (strategy === 'user_window') {
    // Mirror `0010`'s own select, exactly: open rows only, inside the same window. A local
    // replace any wider would delete a reminder that has already fired - the record that it
    // fired - or one scheduled beyond the horizon the server was asked about.
    const now = at(ctx.serverTime);
    clauses.push('sent_at is null', 'cancelled_at is null', 'fire_at >= ?', 'fire_at < ?');
    params.push(
      new Date(now - USER_WINDOW_BACK_MS).toISOString(),
      new Date(now + USER_WINDOW_AHEAD_MS).toISOString(),
    );
  }
  return { sql: clauses.length === 0 ? '' : ` where ${clauses.join(' and ')}`, params };
}

/**
 * `append`: insert or ignore, and never an update. The milk ledger is the balance
 * (`docs/MILK_STASH.md` §3, `docs/OFFLINE_SYNC.md` §5.2) - a correction is a compensating
 * ADJUST row, so rewriting a transaction the device already holds would change a total that a
 * server-side check has already agreed with.
 */
export async function applyAppend(
  t: Tx,
  table: string,
  rows: readonly ServerRow[],
  ctx: ApplyContext,
): Promise<ApplyOutcome> {
  if (rows.length === 0) return EMPTY;
  const columns = await columnsOf(t, table);
  let written = 0;
  const touched: string[] = [];
  for (const raw of rows) {
    const row = project(raw, columns);
    const names = Object.keys(row);
    if (names.length === 0) continue;
    const { changes } = await t.run(
      `insert or ignore into ${qualify(table)} (${names.join(', ')})
         values (${names.map(() => '?').join(', ')})`,
      names.map(c => encodeValue(row[c])),
    );
    if (changes === 0) continue;
    written += 1;
    touched.push(...(ctx.keysFor?.(table, row) ?? []));
  }
  return { written, removed: 0, conflicts: 0, keys: touched };
}

/** For a test that wants a cold column cache; the schema is static, so nothing else needs it. */
export function resetColumnCache(): void {
  columnCache.clear();
}
