/**
 * The two local prunes, and the two guards that make them safe to run at all (WP4 D30).
 *
 * CLAUDE.md rule 7 is "never lose a log", and §7 forbids removing rows without a reversible
 * path. Both prunes below have one, and it is the same one: **the server keeps everything**.
 * `docs/DATABASE.md:388` keeps tombstones server-side for ever, and a `SYNCED` outbox row is by
 * definition an operation the server has already applied. A full resync therefore restores
 * every row either prune removes, which is why they are allowed to exist at all - and why the
 * guards below are tested rather than assumed.
 *
 * WHAT IS PRUNED
 *   * `SYNCED` outbox rows older than `SYNCED_PRUNE_DAYS` (7). They are kept that long only so
 *     the Sync inspector can still show what went out.
 *   * Tombstones - rows with `deleted_at` set - older than `TOMBSTONE_PRUNE_DAYS` (90), in the
 *     three tables where they accumulate, together with the detail row of a pruned activity.
 *
 * WHAT IS NOT, AND WHY
 *   * `FAILED`, `PENDING` and `SENDING` outbox rows, at any age. A `FAILED` op is a log a
 *     parent wrote that the server refused; WP4.9's replay is how it gets sent, and a prune
 *     that swept it would be the one code path in this app that loses an entry outright.
 *   * The milk ledger, ever. It is append-only and it IS the balance (`docs/MILK_STASH.md` §3);
 *     removing a row would change a total, including the total on a pruned activity's
 *     container. A pruned activity can leave a ledger row whose `activity_id` points at
 *     nothing, which is a dangling reference in a mirror that declares no foreign keys and
 *     reads as "used, source no longer on this device" - the honest answer.
 *   * `children`, `profiles`, `households` and `storage_locations` tombstones. They are a
 *     handful of rows, and a missing one is a visible hole: an entry with no child name, a
 *     container in no location. The growth is in `activities`, which is where the prune is.
 *   * The free plan's 7-day history window is a READ-TIME gate in WP13. It is never a sync, a
 *     backfill or a prune decision, because a parent who upgrades must find their whole history
 *     waiting, not a request to re-download it.
 *
 * THE TWO GUARDS
 *   1. **The completed-pull guard.** A table's tombstones are only pruned once `sync_state`
 *      records a completed pull for that table in this household. Before that, this device has
 *      not yet seen what the server holds, and "older than 90 days" would be measured against a
 *      mirror that is still filling up.
 *   2. **The pending-op guard.** A row named by ANY outbox row, in any state, is never pruned.
 *      Not just `PENDING`: a `FAILED` op still holds an edit, and a `SYNCED` one is the record
 *      that the tombstone the server has is the tombstone this device sent.
 */
import { SYNCED_PRUNE_DAYS, TOMBSTONE_PRUNE_DAYS } from '@nibblecue/core';
import { pruneDedupeKeys } from '../data/dedupe';
import type { Db, SqlValue, Tx } from '../db/driver';
import { readCursor } from './cursors';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Where a tombstone accumulates, and what has to go with it. A detail row has no `deleted_at`
 * of its own (`0001_init.sql:196-252`) and is unreachable once its activity is gone, so it is
 * removed with its parent rather than left as an orphan keyed by a row nothing points to.
 */
export const TOMBSTONE_TABLES: readonly { table: string; children: readonly string[] }[] = [
  {
    table: 'activities',
    children: [
      'bottle_details',
      'breastfeed_details',
      'pump_details',
      'sleep_details',
      'diaper_details',
      'solids_details',
      'med_details',
      'measurement_details',
    ],
  },
  { table: 'schedule_rules', children: [] },
  { table: 'schedule_phases', children: [] },
];

export interface PruneOptions {
  /** Defaults to `SYNCED_PRUNE_DAYS`. */
  syncedDays?: number | undefined;
  /** Defaults to `TOMBSTONE_PRUNE_DAYS`. */
  tombstoneDays?: number | undefined;
  /** Prune `dedupe_keys` past their TTL in the same pass. On by default. */
  dedupeKeys?: boolean | undefined;
}

export interface PruneOutcome {
  /** `SYNCED` outbox rows removed. */
  outbox: number;
  /** Tombstones removed, per table. */
  tombstones: Record<string, number>;
  /** Detail rows removed with their pruned parent. */
  details: number;
  /** Expired `dedupe_keys` rows removed. */
  dedupeKeys: number;
  /** Tables skipped because no completed pull is recorded for them yet. */
  waitingOnPull: string[];
}

/**
 * One housekeeping pass. Safe to call on every launch: with nothing old enough it is four
 * cheap statements and no writes.
 *
 * Everything happens in one transaction. A prune that removed the tombstones and was killed
 * before the detail rows would leave rows keyed by an activity nothing can reach, and
 * `pragma foreign_keys` cannot help because the mirror deliberately declares none.
 */
export async function prune(
  db: Db,
  householdId: string,
  nowMs: number,
  options: PruneOptions = {},
): Promise<PruneOutcome> {
  const syncedCutoff = new Date(nowMs - (options.syncedDays ?? SYNCED_PRUNE_DAYS) * DAY_MS);
  const tombCutoff = new Date(nowMs - (options.tombstoneDays ?? TOMBSTONE_PRUNE_DAYS) * DAY_MS);

  // The guard read happens before the transaction because it is a read of `sync_state` that
  // nothing in this pass writes, and holding a write transaction open across it buys nothing.
  const eligible: string[] = [];
  const waitingOnPull: string[] = [];
  for (const { table } of TOMBSTONE_TABLES) {
    const state = await readCursor(db, householdId, table);
    if (state.lastFullSyncAt === null) waitingOnPull.push(table);
    else eligible.push(table);
  }

  return db.tx(async t => {
    const outcome: PruneOutcome = {
      outbox: await pruneSyncedOutbox(t, syncedCutoff.toISOString()),
      tombstones: {},
      details: 0,
      dedupeKeys: 0,
      waitingOnPull,
    };
    for (const entry of TOMBSTONE_TABLES) {
      if (!eligible.includes(entry.table)) continue;
      const done = await pruneTombstones(
        t,
        entry.table,
        entry.children,
        householdId,
        tombCutoff.toISOString(),
      );
      outcome.tombstones[entry.table] = done.rows;
      outcome.details += done.details;
    }
    if (options.dedupeKeys !== false) outcome.dedupeKeys = await pruneDedupeKeys(t, nowMs);
    return outcome;
  });
}

/** `SYNCED` only, by `created_at`: the age of the operation, not of the row's last touch. */
async function pruneSyncedOutbox(t: Tx, cutoffIso: string): Promise<number> {
  const { changes } = await t.run(`delete from outbox where state = 'SYNCED' and created_at < ?`, [
    cutoffIso,
  ]);
  return changes;
}

/**
 * The tombstones of one table, with the pending-op guard applied as a subquery rather than a
 * second round trip: `entity_id` is `not null` on every outbox row, so `not in` cannot be
 * poisoned by a null the way it would be on a nullable column.
 */
async function pruneTombstones(
  t: Tx,
  table: string,
  children: readonly string[],
  householdId: string,
  cutoffIso: string,
): Promise<{ rows: number; details: number }> {
  const doomed = await t.all<{ id: string }>(
    `select id from ${table}
      where household_id = ?
        and deleted_at is not null
        and deleted_at < ?
        and id not in (select entity_id from outbox)`,
    [householdId, cutoffIso],
  );
  if (doomed.length === 0) return { rows: 0, details: 0 };
  const ids = doomed.map(r => r.id);
  const holes = ids.map(() => '?').join(', ');

  let details = 0;
  for (const child of children) {
    const { changes } = await t.run(
      `delete from ${child} where activity_id in (${holes})`,
      ids as SqlValue[],
    );
    details += changes;
  }
  const { changes } = await t.run(`delete from ${table} where id in (${holes})`, ids as SqlValue[]);
  return { rows: changes, details };
}
