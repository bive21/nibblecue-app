/**
 * The per-household, per-table pull cursor over the v2 `sync_state` table (WP4 D15, D16).
 *
 * `sync_state` is keyed `(household_id, table_name)` because a user can belong to two households
 * and every pull is household-scoped; the v1 table keyed by `table_name` alone would have made
 * one household's progress the other's. Nothing ever wrote a row to v1, which is why v2 drops
 * it rather than migrating it (`./schema.ts`).
 *
 * ── THE STORED CURSOR IS EXACT; THE READ REWINDS ────────────────────────────────────────────
 *
 * `now()` in Postgres is transaction-START time. A transaction that begins at T and commits at
 * T+3 s writes `updated_at = T` but becomes visible only after one that wrote T+1 and committed
 * at T+2. A keyset cursor parked at T+1 would step straight over the row stamped T and never
 * see it again — the row is not late, the cursor is early.
 *
 * So every delta read asks from `cursor_updated_at - PULL_LAG_MS`, and every apply is an
 * idempotent upsert, which is what makes the overlap free. What is STORED is still the exact
 * `(updated_at, id)` of the last row seen, because that pair is also what the next page inside
 * the same pass continues from, and rewinding twice would never make progress.
 *
 * ── WHY THE REWIND DROPS `since_id` ─────────────────────────────────────────────────────────
 *
 * The server predicate is the row comparison `(updated_at, id) > ($ts, $id)` (`0010`). Rewind
 * `$ts` by 30 s and keep `$id`, and every row at exactly the rewound instant with a SMALLER id
 * is excluded — rows the rewind exists to re-read. The id tiebreak is only meaningful for the
 * instant the cursor actually stopped at, so a rewound request sends `since_id: null` and the
 * server coalesces it to the all-zero uuid, which sorts below every real one.
 *
 * Progress is still guaranteed: the rewind applies to the FIRST page of a table in a pass only.
 * Page two onward continues from the `next_cursor` the server just returned, so a household
 * that writes more rows in 30 s than one page holds still drains, one pass at a time.
 */
import { PULL_LAG_MS } from '../constants';
import type { PullCursor } from '../types';
import type { PullPhase } from './pull';
import type { SqlTx as Tx } from './sql';

/** A table's progress, as `sync_state` holds it. */
export interface CursorState {
  cursor: PullCursor | null;
  lastFullSyncAt: string | null;
  phase: string | null;
}

/**
 * What a table's `sync_state` row says about how far a pass has got.
 *
 * `'<phase>'` while the table still has pages owed, `'<phase>_complete'` once the server
 * answered `has_more: false`. `backfill_complete` is therefore the literal marker the Reports
 * note reads (`docs/plans/WP4.md` WP4.8), and the same shape works for the other two phases
 * without a second column.
 */
export type PhaseMark = PullPhase | `${PullPhase}_complete`;

export const phaseMark = (phase: PullPhase, drained: boolean): PhaseMark =>
  drained ? (`${phase}_complete` as PhaseMark) : phase;

export const isDrained = (mark: string | null): boolean =>
  mark !== null && mark.endsWith('_complete');

const EMPTY: CursorState = { cursor: null, lastFullSyncAt: null, phase: null };

interface Row {
  cursor_updated_at: string | null;
  cursor_id: string | null;
  last_full_sync_at: string | null;
  phase: string | null;
}

const stateOf = (row: Row | undefined): CursorState => {
  if (row === undefined) return EMPTY;
  const at = row.cursor_updated_at;
  return {
    cursor: at === null ? null : { updated_at: at, id: row.cursor_id ?? '' },
    lastFullSyncAt: row.last_full_sync_at,
    phase: row.phase,
  };
};

/** The exact stored cursor, untouched by the lag. */
export async function readCursor(t: Tx, householdId: string, table: string): Promise<CursorState> {
  const row = await t.get<Row>(
    `select cursor_updated_at, cursor_id, last_full_sync_at, phase
       from sync_state where household_id = ? and table_name = ?`,
    [householdId, table],
  );
  return stateOf(row);
}

/**
 * Every named table's cursor in ONE read, keyed by name; a table with no row is the empty state,
 * exactly as `readCursor` answers it. A pass starts every table at once (29 of them, every 30
 * seconds), and one query is one trip across the bridge instead of one per table.
 */
export async function readCursors(
  t: Tx,
  householdId: string,
  tables: readonly string[],
): Promise<Map<string, CursorState>> {
  const out = new Map<string, CursorState>();
  if (tables.length === 0) return out;
  const rows = await t.all<Row & { table_name: string }>(
    `select table_name, cursor_updated_at, cursor_id, last_full_sync_at, phase
       from sync_state where household_id = ? and table_name in (${tables.map(() => '?').join(', ')})`,
    [householdId, ...tables],
  );
  const byName = new Map(rows.map(r => [r.table_name, r]));
  for (const name of tables) out.set(name, stateOf(byName.get(name)));
  return out;
}

/** What goes on the wire for the first page of a table in a pass: the cursor, rewound. */
export interface SinceRequest {
  since: string | null;
  since_id: string | null;
}

/**
 * The stored cursor as the server should be asked for it. A cursor that has never moved asks
 * from the beginning of time (`since: null`), which `0010` turns into `'-infinity'` so the
 * first page uses the same index range scan every later page does.
 */
export function rewound(cursor: PullCursor | null, lagMs: number = PULL_LAG_MS): SinceRequest {
  if (cursor === null) return { since: null, since_id: null };
  const at = Date.parse(cursor.updated_at);
  // A cursor this build cannot parse is worse than no cursor: asking from an invalid instant
  // would make the server's comparison answer nothing for ever. Start again from the beginning
  // and let the upserts absorb the re-read.
  if (Number.isNaN(at)) return { since: null, since_id: null };
  return { since: new Date(Math.max(0, at - lagMs)).toISOString(), since_id: null };
}

/** The first page's request for a table whose cursor is `state`. */
export const sinceFor = (state: CursorState): SinceRequest => rewound(state.cursor);

/**
 * Advance the cursor. **Always called with the caller's `Tx`**, never with the `Db`: the page's
 * rows and this write commit together or not at all, which is the whole crash-safety argument —
 * a process killed between them re-reads the page, and every apply is an upsert.
 */
export async function writeCursor(
  t: Tx,
  householdId: string,
  table: string,
  next: {
    cursor?: PullCursor | null;
    phase?: PhaseMark;
    lastFullSyncAt?: string;
  },
): Promise<void> {
  await t.run(
    `insert into sync_state (household_id, table_name, cursor_updated_at, cursor_id,
                             last_full_sync_at, phase, page_token)
       values (?, ?, null, null, null, null, null)
       on conflict (household_id, table_name) do nothing`,
    [householdId, table],
  );
  const sets: string[] = [];
  const params: (string | null)[] = [];
  if (next.cursor !== undefined) {
    sets.push('cursor_updated_at = ?', 'cursor_id = ?');
    params.push(next.cursor?.updated_at ?? null, next.cursor?.id ?? null);
  }
  if (next.phase !== undefined) {
    sets.push('phase = ?');
    params.push(next.phase);
  }
  if (next.lastFullSyncAt !== undefined) {
    sets.push('last_full_sync_at = ?');
    params.push(next.lastFullSyncAt);
  }
  if (sets.length === 0) return;
  await t.run(
    `update sync_state set ${sets.join(', ')} where household_id = ? and table_name = ?`,
    [...params, householdId, table],
  );
}

/** Every table of this household that has recorded progress. The prune's guard reads it. */
export async function cursorPhases(
  t: Tx,
  householdId: string,
): Promise<Record<string, string | null>> {
  const rows = await t.all<{ table_name: string; phase: string | null }>(
    'select table_name, phase from sync_state where household_id = ?',
    [householdId],
  );
  const out: Record<string, string | null> = {};
  for (const row of rows) out[row.table_name] = row.phase;
  return out;
}

/** Forget this household's progress entirely — a forced teardown, or a full resync. */
export async function clearCursors(t: Tx, householdId: string): Promise<void> {
  await t.run('delete from sync_state where household_id = ?', [householdId]);
}
