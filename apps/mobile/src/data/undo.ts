/**
 * Undo — one toast, two mechanisms (WP4 D35; `docs/OFFLINE_SYNC.md` §1.1).
 *
 * §1.1 says it plainly: "UNDO within the toast window deletes the *outbox row* if it is still
 * `PENDING` and removes the optimistic local row; after the op has moved to `SENDING`/`SYNCED`
 * it instead enqueues the soft-delete. The user-visible behavior is identical."
 *
 * What §1.1 does not say is what happens when an op enters `SENDING` DURING the 5.2 s the toast
 * is up — which is the ordinary case on a good connection, not an edge. So the fork is decided
 * inside ONE transaction, per op: whatever is still `PENDING` — or `FAILED`, which the server
 * refused and so never applied — comes off the queue and out of the mirror; only what has left
 * is compensated (2026-09-24: an intent used to be all one or all the other, and the mixed case
 * asked the server to reverse ops it had never received). The worker and the undo cannot both
 * win, because SQLite serializes the two transactions and the loser sees the other's result.
 *
 * THE LEDGER IS NEVER UNWRITTEN. `milk_inventory_transactions` is append-only — the server
 * revokes `update` and `delete` on it (`0002_rls.sql:181`) and a mutable total cannot be
 * audited or replayed from a queue. So an undo that has to reach the server posts a
 * compensating `ADJUST` of the opposite sign and leaves the `USE` row exactly where it is
 * (`docs/MILK_STASH.md` §7c). Only the cancelled branch removes a ledger row, and only because
 * the server never saw it.
 *
 * Every compensating op's id is `deriveOpId(<the op it undoes>, 'undo')`, so undoing twice —
 * a retry, a replay from a killed process — is the same operation and the server's
 * `client_op_id` indexes swallow it.
 */
import {
  DETAIL_TABLES,
  deriveOpId,
  type ActivityType,
  type ChainOp,
  type Clock,
  type OutboxRow,
} from '@nibblecue/core';
import type { Db, Tx } from '../db/driver';
import { enqueue, payloadOf, rowsFor } from './outbox';
import {
  softDelete,
  upsertRow,
  type RemovedRow,
  type RepositoryDeps,
  type WriteOutcome,
} from './repository';
import { emptiedPatchId, reopenPatchId } from './stash';
import { activityKeys, keys, store as appStore } from './store';

export type UndoResult = 'cancelled' | 'soft_deleted';

/**
 * Undo everything one intent wrote. One transaction, one answer.
 *
 * `outcome` is the value `commitWrite` returned — the toast holds it, and holding the ids is
 * what makes the undo exact rather than "the most recent entry", which is the §7d bug in
 * another costume.
 */
export async function undoWrite(
  db: Db,
  clock: Clock,
  outcome: WriteOutcome,
  deps: RepositoryDeps = {},
): Promise<UndoResult> {
  if (!outcome.committed) {
    throw new TypeError('there is nothing to undo: the write was suppressed or never committed');
  }
  const at = clock.iso();
  const touched = new Set<string>([keys.outbox()]);

  const result = await db.tx(async t => {
    const rows = await rowsFor(t, outcome.opIds);
    if (rows.length === 0) {
      throw new Error('the outbox no longer holds this intent; it cannot be undone from here');
    }
    /*
      WHAT NEVER REACHED THE SERVER IS TAKEN BACK; ONLY WHAT DID IS COMPENSATED — op by op (the
      sync sweep of 2026-09-24, P3 and P7).

      "Never reached" is PENDING, and also FAILED: a refused op was not applied, so the server has
      nothing of it to reverse. Before, one op that had left made the whole intent take the
      compensating branch, which queued a reversal for every row — including the ones this very
      statement had just taken off the queue, so the server was asked to delete an entry it had
      never been given ("activity not found", retried for minutes, then "Not synced"). The
      tutorial's clean-up, which undoes several writes as one claim, hit it whenever its last
      practice entry was still queued. And a refused CREATE was "sent", so its Undo queued a
      DELETE that waited on the refused op forever and kept the chip at "1 queued".
    */
    const holes = rows.map(() => '?').join(', ');
    const ids = rows.map(r => r.client_op_id);
    const unsent = new Set(
      (
        await t.all<{ client_op_id: string }>(
          `select client_op_id from outbox where client_op_id in (${holes}) and state in ('PENDING', 'FAILED')`,
          ids,
        )
      ).map(r => r.client_op_id),
    );
    if (unsent.size > 0) {
      await t.run(
        `delete from outbox where client_op_id in (${holes}) and state in ('PENDING', 'FAILED')`,
        ids,
      );
    }
    const cancelled = unsent.size === rows.length;
    const removed = outcome.removed ?? [];

    for (const row of rows) for (const key of await keysOf(t, row)) touched.add(key);
    if (cancelled) {
      for (const row of rows) await removeOptimistic(t, row, removed);
      return 'cancelled';
    }
    for (const row of rows) {
      if (unsent.has(row.client_op_id)) await removeOptimistic(t, row, removed);
    }
    const sent = rows.filter(r => !unsent.has(r.client_op_id));
    /*
      A CONTAINER IS COMPENSATED FIRST — its discard is queued ahead of the ledger rows that put
      its milk back — for the reason `discardContainer` writes its patch before its DISCARD row:
      a container is last-writer-wins as a whole row, and every ledger row the server applies
      re-stamps the container's `updated_at`. A discard queued after the ledger's compensation
      would reach the server older than the row it patches and be dropped (it was, in the test
      this came with). Locally the discard sets the status alone; the ledger's own compensation
      brings the amount back to nothing.
    */
    const containers = sent.filter(r => r.entity === 'container');
    for (const row of containers) await compensate(t, clock, row, at, removed);
    /*
      AND THE REST NEWEST FIRST, the order an undo is (the investigation of 2026-09-24 into the
      owner's "Not synced"). The tour's clean-up undoes a whole run as one intent, oldest op
      first: a trial bag's ADD, then the bottles drawn from it. Compensated in that order the
      ADD's −120 landed first — a downward adjustment may go into deficit — and each draw's
      upward adjustment after it still left the bag below zero, which the server's balance rule
      refuses; the refusal is parked FAILED at once. Newest first, every step of the ledger
      stays at or above zero: the draws go back into the bag, and then the bag's milk comes out.
    */
    for (const row of [...sent].reverse()) {
      if (row.entity !== 'container') await compensate(t, clock, row, at, removed);
    }
    for (const row of containers) {
      await t.run('update milk_containers set amount_ml = 0 where id = ?', [row.entity_id]);
    }
    return 'soft_deleted';
  });

  (deps.store ?? appStore).invalidate(...touched);
  return result;
}

/** The cache keys one op's row affects, read before the row is changed or removed. */
async function keysOf(t: Tx, row: OutboxRow): Promise<string[]> {
  if (row.entity === 'activity') {
    const activity = await t.get<{ child_id: string | null; type: ActivityType }>(
      'select child_id, type from activities where id = ?',
      [row.entity_id],
    );
    if (activity === undefined) return [keys.household(row.household_id)];
    return activityKeys(row.household_id, activity.child_id, activity.type);
  }
  if (row.entity === 'timer') return [keys.timers(row.household_id)];
  return [keys.stash(row.household_id)];
}

/** Nothing left the device, so nothing has to be explained: take the rows back out. */
async function removeOptimistic(
  t: Tx,
  row: OutboxRow,
  removed: readonly RemovedRow[],
): Promise<void> {
  switch (row.entity) {
    case 'activity': {
      // undoing a DELETE that never left the device (WP5.8): the tombstone simply comes off
      if (row.op === 'DELETE') {
        await t.run('update activities set deleted_at = null where id = ?', [row.entity_id]);
        return;
      }
      await t.run('delete from activities where id = ?', [row.entity_id]);
      for (const table of DETAIL_TABLES) {
        await t.run(`delete from ${table} where activity_id = ?`, [row.entity_id]);
      }
      return;
    }
    case 'milk_txn': {
      const payload = payloadOf(row);
      await t.run('delete from milk_inventory_transactions where id = ?', [row.entity_id]);
      await returnToContainer(t, payload);
      return;
    }
    case 'container': {
      await t.run('delete from milk_containers where id = ?', [row.entity_id]);
      return;
    }
    case 'timer': {
      if (row.op === 'CREATE') {
        await t.run('delete from running_timers where id = ?', [row.entity_id]);
        return;
      }
      /*
        A STOP THAT NEVER LEFT THE PHONE: its timer comes back exactly as it was, same id — the
        server still has it, because the DELETE that would have ended it was just taken out of
        the queue. Before this the row stayed gone and the card only came back when a pull
        happened to find the server's copy (the audit of 2026-09-24: "Undo on a Woke up / Stop
        toast doesn't bring the timer back").
      */
      if (row.op === 'DELETE') {
        const snapshot = removedRow(removed, 'running_timers', row.entity_id);
        if (snapshot !== null) await upsertRow(t, { table: 'running_timers', row: snapshot });
      }
      return;
    }
    default:
      throw new TypeError(`undo cannot cancel a '${row.entity}' operation`);
  }
}

/** The row a write's `localDeletes` took out, as it was, or null when the outcome has none. */
function removedRow(
  removed: readonly RemovedRow[],
  table: string,
  id: string,
): Record<string, unknown> | null {
  return removed.find(r => r.table === table && r.row['id'] === id)?.row ?? null;
}

/** A mirror jsonb column, read back as the object an op carries. */
function objectOf(value: unknown): Record<string, unknown> {
  if (value !== null && typeof value === 'object') return value as Record<string, unknown>;
  if (typeof value !== 'string' || value === '') return {};
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed !== null && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/**
 * The server has this op, or is sending it: explain the reversal rather than hide it.
 *
 * A TIMER AND A CONTAINER ARE UNDONE HERE TOO, since 2026-09-24. They used to throw — "out of
 * WP4's scope", on the reading that an op sent within the toast's five seconds was rare. It was
 * rare only because nothing sent it: the write nudge was never wired, so every op waited for the
 * 60-second tick. With the nudge wired (`SyncProvider`), a stop or a pump saved to the stash is
 * on the server within the second, and Undo on its toast would have answered with an error.
 *
 *   * a STOP (timer DELETE): the timer comes back as a NEW timer — its start, its sides and its
 *     nap-or-night as they were, under a fresh id. Not the old id: the entry this undo takes
 *     away still carries `metadata.timer_id`, and the server reads a second entry with the same
 *     timer id as a duplicate stop (D26), so the NEXT real stop would vanish into the undone one.
 *   * a START (timer CREATE): the timer goes, the way a discard takes it.
 *   * a CONTAINER (a pump session saved to the stash): discarded, empty — a container is never
 *     deleted on the server — with the ledger's own compensation putting its milk back.
 */
async function compensate(
  t: Tx,
  clock: Clock,
  row: OutboxRow,
  at: string,
  removed: readonly RemovedRow[],
): Promise<void> {
  const undoId = deriveOpId(row.client_op_id, 'undo');
  switch (row.entity) {
    case 'timer': {
      if (row.op === 'CREATE') {
        await t.run('delete from running_timers where id = ?', [row.entity_id]);
        const stop: ChainOp = {
          client_op_id: undoId,
          entity: 'timer',
          op: 'DELETE',
          entity_id: row.entity_id,
          household_id: row.household_id,
          payload: { timer_id: row.entity_id, client_edited_at: at },
          depends_on: row.client_op_id,
        };
        await enqueue(t, stop, clock);
        return;
      }
      if (row.op !== 'DELETE') {
        throw new TypeError('a timer change that has already been sent cannot be undone here');
      }
      const snapshot = removedRow(removed, 'running_timers', row.entity_id);
      if (snapshot === null) {
        throw new TypeError('this stop cannot be undone: the timer it ended is not held');
      }
      const fields = {
        child_id: snapshot['child_id'] ?? null,
        type: snapshot['type'],
        started_at: snapshot['started_at'],
        paused_ms: snapshot['paused_ms'] ?? 0,
        active_side: snapshot['active_side'] ?? null,
        side_started_at: snapshot['side_started_at'] ?? null,
        left_seconds: snapshot['left_seconds'] ?? 0,
        right_seconds: snapshot['right_seconds'] ?? 0,
      };
      const meta = objectOf(snapshot['meta']);
      await upsertRow(t, {
        table: 'running_timers',
        row: {
          ...fields,
          id: undoId,
          household_id: row.household_id,
          started_by: snapshot['started_by'] ?? null,
          meta,
          created_at: at,
          updated_at: at,
        },
      });
      const restart: ChainOp = {
        client_op_id: undoId,
        entity: 'timer',
        op: 'CREATE',
        entity_id: undoId,
        household_id: row.household_id,
        payload: { ...fields, meta, client_edited_at: at },
        depends_on: row.client_op_id,
      };
      await enqueue(t, restart, clock);
      return;
    }
    case 'container': {
      if (row.op !== 'CREATE') {
        throw new TypeError('a container change that has already been sent cannot be undone here');
      }
      const fields = { status: 'DISCARDED', discarded_at: at, discard_reason: null };
      await upsertRow(t, {
        table: 'milk_containers',
        row: { id: row.entity_id, ...fields, updated_at: at },
      });
      const discard: ChainOp = {
        client_op_id: undoId,
        entity: 'container',
        op: 'UPDATE',
        entity_id: row.entity_id,
        household_id: row.household_id,
        payload: { ...fields, client_edited_at: at },
        depends_on: row.client_op_id,
      };
      await enqueue(t, discard, clock);
      return;
    }
    case 'activity': {
      if (row.op === 'DELETE') {
        // the delete has been sent: the undo is an UPDATE carrying `restore: true`, the one op
        // that lifts a tombstone server-side (0012). The row keeps every edit it carried.
        await t.run('update activities set deleted_at = null, updated_at = ? where id = ?', [
          at,
          row.entity_id,
        ]);
        const restore: ChainOp = {
          client_op_id: undoId,
          entity: 'activity',
          op: 'UPDATE',
          entity_id: row.entity_id,
          household_id: row.household_id,
          payload: { restore: true, client_edited_at: at },
          depends_on: row.client_op_id,
        };
        await enqueue(t, restore, clock);
        return;
      }
      await softDelete(t, 'activities', row.entity_id, at);
      const op: ChainOp = {
        client_op_id: undoId,
        entity: 'activity',
        op: 'DELETE',
        entity_id: row.entity_id,
        household_id: row.household_id,
        payload: { deleted_at: at, client_edited_at: at },
        depends_on: row.client_op_id,
      };
      await enqueue(t, op, clock);
      return;
    }
    case 'milk_txn': {
      const payload = payloadOf(row);
      const delta = numberOf(payload['delta_ml']);
      const fields = {
        container_id: payload['container_id'],
        kind: 'ADJUST',
        delta_ml: -delta,
        from_location_id: null,
        to_location_id: null,
        activity_id: null,
        occurred_at: at,
        created_by: payload['created_by'] ?? null,
      };
      await upsertRow(t, {
        table: 'milk_inventory_transactions',
        row: {
          id: undoId,
          client_op_id: undoId,
          household_id: row.household_id,
          ...fields,
          created_at: at,
        },
      });
      await returnToContainer(t, payload, {
        clock,
        at,
        householdId: row.household_id,
        opId: row.client_op_id,
      });
      const op: ChainOp = {
        client_op_id: undoId,
        entity: 'milk_txn',
        op: 'CREATE',
        entity_id: undoId,
        household_id: row.household_id,
        payload: { ...fields, client_edited_at: at },
        depends_on: row.client_op_id,
      };
      await enqueue(t, op, clock);
      return;
    }
    default:
      throw new TypeError(
        `a '${row.entity}' operation that has already been sent cannot be undone here`,
      );
  }
}

/**
 * When an undo that has already been sent changes a container's status, what the reversing patch
 * needs: the undo's own clock and instant, and the op being reversed (its id derives the patch's,
 * so undoing twice queues it once). Absent on the cancelled path — nothing was sent to reverse.
 */
interface ContainerStamp {
  clock: Clock;
  at: string;
  householdId: string;
  opId: string;
}

/**
 * Put a ledger row's milk back into its container locally — and keep the container's STATUS
 * true to what it now holds, here and on the server.
 *
 *   * Milk back in a bag that was USED: it is STORED again. When a bottle emptied it, the bottle's
 *     own write queued a patch closing it (`emptiedPatchId` in stash.ts) that the toast's Undo
 *     does not hold; it is settled here — taken out of the queue while it has not been sent, or
 *     answered by a patch reopening the bag once it has, queued ahead of the ADJUST that puts the
 *     milk back (a container patch behind a ledger row of its own write is dropped by
 *     last-writer-wins). Without it an undone bottle left the bag closed on the server with its
 *     milk inside, gone from the stash after the next pull. A bag closed by something else — a
 *     later bottle from the other phone, or that phone's pass over a bag the two emptied
 *     between them — is reopened on the server the same way, with a patch of the Undo's own.
 *   * A bag taken back to nothing: USED, with the time — never STORED at 0 ml (the audit of
 *     2026-09-24, timers 21: deleting a stash bottle and undoing the delete left a 0 ml bag in
 *     the stash). Once sent, the server is told the same, ahead of the ADJUST.
 */
async function returnToContainer(
  t: Tx,
  payload: Record<string, unknown>,
  stamp?: ContainerStamp,
): Promise<void> {
  const containerId = payload['container_id'];
  if (typeof containerId !== 'string') return;
  const delta = numberOf(payload['delta_ml']);
  await t.run('update milk_containers set amount_ml = amount_ml - ? where id = ?', [
    delta,
    containerId,
  ]);
  const c = await t.get<{ amount_ml: number; status: string }>(
    'select amount_ml, status from milk_containers where id = ?',
    [containerId],
  );
  if (c === undefined) return;
  if (c.amount_ml > 0 && c.status === 'USED') {
    await t.run(`update milk_containers set status = 'STORED', used_at = null where id = ?`, [
      containerId,
    ]);
    await settleClosingPatch(t, payload, containerId, stamp);
    return;
  }
  if (c.amount_ml <= 0 && (c.status === 'STORED' || c.status === 'THAWING')) {
    const occurred = typeof payload['occurred_at'] === 'string' ? payload['occurred_at'] : null;
    const usedAt = stamp?.at ?? occurred;
    await t.run(`update milk_containers set status = 'USED', used_at = ? where id = ?`, [
      usedAt,
      containerId,
    ]);
    // a reopening queued with the milk that is now going back out never has to be sent
    if (occurred !== null) {
      await t.run(`delete from outbox where client_op_id = ? and state in ('PENDING', 'FAILED')`, [
        reopenPatchId(containerId, occurred),
      ]);
    }
    if (stamp !== undefined) {
      await enqueue(
        t,
        statusPatch(deriveOpId(stamp.opId, 'undo:used'), containerId, stamp.householdId, stamp.at, {
          status: 'USED',
          used_at: usedAt,
        }),
        stamp.clock,
      );
    }
  }
}

/** The bottle's own closing patch for this bag, taken back: cancelled, or answered once sent. */
async function settleClosingPatch(
  t: Tx,
  payload: Record<string, unknown>,
  containerId: string,
  stamp: ContainerStamp | undefined,
): Promise<void> {
  const activityId = payload['activity_id'];
  if (typeof activityId !== 'string') return;
  let patchId: string;
  try {
    patchId = emptiedPatchId(activityId, containerId);
  } catch {
    return; // not an id this app minted, so no patch of ours
  }
  // never sent, or refused for good: the server never closed the bag, and now it never will
  const { changes } = await t.run(
    `delete from outbox where client_op_id = ? and state in ('PENDING', 'FAILED')`,
    [patchId],
  );
  if (changes > 0) return;
  const held = await t.get<{ household_id: string }>(
    'select household_id from outbox where client_op_id = ?',
    [patchId],
  );
  // nothing was sent, so there is nothing to stamp a reopening with
  if (stamp === undefined) return;
  if (held === undefined) {
    /*
      THE BAG WAS CLOSED, BUT NOT BY THIS BOTTLE: by a later bottle from the other phone, or by
      that phone's pass over a bag the two of them emptied between them
      (`OutboxWorker.closeEmptiedBags`). The milk is going back in all the same, so the server is
      told the bag is open again. Without this it kept the bag closed with the milk inside, and
      the next pull took it out of both stashes (found reviewing the stash sweep, 2026-09-24).
      The id derives from the op being reversed, so undoing twice queues it once.
    */
    await enqueue(
      t,
      statusPatch(deriveOpId(stamp.opId, 'undo:stored'), containerId, stamp.householdId, stamp.at, {
        status: 'STORED',
        used_at: null,
      }),
      stamp.clock,
    );
    return;
  }
  await enqueue(
    t,
    statusPatch(deriveOpId(patchId, 'undo'), containerId, held.household_id, stamp.at, {
      status: 'STORED',
      used_at: null,
    }),
    stamp.clock,
  );
}

function statusPatch(
  id: string,
  containerId: string,
  householdId: string,
  at: string,
  fields: { status: string; used_at: string | null },
): ChainOp {
  return {
    client_op_id: id,
    entity: 'container',
    op: 'UPDATE',
    entity_id: containerId,
    household_id: householdId,
    payload: { ...fields, client_edited_at: at },
    depends_on: null,
  };
}

function numberOf(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`a ledger payload must carry a numeric delta_ml, got ${String(value)}`);
  }
  return value;
}
