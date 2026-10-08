/**
 * The timeline's writes (docs/PRODUCT_SPEC.md §4; docs/plans/WP5.md WP5.8): deleting an entry
 * and bringing it back.
 *
 * A delete is a soft delete and a `DELETE` op PLUS, when the entry drew milk from the stash, one
 * compensating `ADJUST` per `USE` row it caused — the ledger is append-only (DATABASE.md §4),
 * so the milk goes back as a new row, never by touching the USE. Both are one chain and one
 * outcome, so the 5.2 s Undo reverses both: `undoWrite` cancels the PENDING ops outright, or,
 * once they have been sent, enqueues the `restore` UPDATE (0012) and an ADJUST the other way.
 *
 * Private pump sessions: the delete is the creator's own, and the stash change it reverses was
 * always visible to the household (§4) — nothing here consults privacy.
 *
 * EVERY ROW THE BOTTLE TOOK COMES BACK, and a bag it emptied is reopened (the stash sweep of
 * 2026-09-24). A bottle's write-off of the last few ml is tied to it now (`activity_id` on the
 * remainder ADJUST in stash.ts), so it is returned beside the draw — a 125 ml bag no longer comes
 * back as 120. And a bottle that emptied a bag CLOSED it on the server as well (`emptiedPatchId`):
 * putting the milk back without reopening it left the server holding a USED bag with 120 ml
 * inside, and the next pull emptied the stash card. The reopening is queued behind the DELETE and
 * ahead of the ledger rows — a container is last-writer-wins as a whole row, and a patch behind a
 * ledger row of its own write is dropped (S4). It is not the Undo's to cancel: `returnToContainer`
 * takes it back out of the queue, or answers it, when the milk goes back out.
 */
import { deriveOpId, type ChainOp, type Clock } from '@nibblecue/core';
import type { Db } from '../db/driver';
import { editActivity, type DeleteActivityInput, type EditActivityInput } from './activities';
import { newIntentId } from './ids';
import { commitWrite, type LocalRow, type RepositoryDeps, type WriteOutcome } from './repository';
import { reopenPatchId } from './stash';
import { activityKeys, keys } from './store';
import { undoWrite } from './undo';

export type DeleteEntryInput = DeleteActivityInput;

interface UseRow {
  id: string;
  container_id: string;
  delta_ml: number;
}

/**
 * NOT THIS PERSON'S TO DELETE, and said so before anything is written (the household sweep of
 * 2026-09-24).
 *
 * A caregiver may correct their own entries and nobody else's (`ROLE_DETAILS` in core's
 * `accounts/roles.ts`; `activities_update` in 0002_rls.sql), and the server has always refused
 * the rest. But the delete was written on the phone FIRST and only refused on its way out, and
 * three things went wrong in between: the entry left the caregiver's log for good while it stayed
 * on every other phone (the refused op is FAILED, and no pull brings back a row the server never
 * changed); a bottle poured from the stash put its milk back — the compensating ADJUST rides the
 * same push as the DELETE and is not an activity write, so the server applied it while refusing
 * the delete, and every phone's stash then counted milk the baby had already drunk; and those
 * compensations stayed queued behind a refused op.
 *
 * So the phone asks the question the server will ask, of the member list it already mirrors, and
 * does not start a write it knows will be refused. A member row this phone has not pulled yet is
 * NOT a refusal: then the server decides, exactly as it did before.
 */
export class EntryNotYoursError extends Error {
  constructor() {
    super('only a parent or owner may change or delete an entry somebody else logged');
    this.name = 'EntryNotYoursError';
  }
}

/**
 * `app.can_admin`, or `app.can_write` and the entry's own author — the server's rule, read locally.
 * Exported for the entry editor, which shows a caregiver someone else's entry read-only rather than
 * offering a Save the server will refuse (the feeding and household sweeps of 2026-09-24).
 */
export async function mayChangeEntry(
  db: Db,
  input: { householdId: string; createdBy: string; activityId: string },
): Promise<boolean> {
  const member = await db.get<{ role: string }>(
    `select role from household_members
      where household_id = ? and user_id = ? and removed_at is null`,
    [input.householdId, input.createdBy],
  );
  if (member === undefined) return true;
  if (member.role === 'OWNER' || member.role === 'PARENT') return true;
  if (member.role !== 'CAREGIVER') return false;
  const entry = await db.get<{ created_by: string }>(
    'select created_by from activities where id = ?',
    [input.activityId],
  );
  return entry === undefined || entry.created_by === input.createdBy;
}

/**
 * A CORRECTION FROM THE ENTRY EDITOR, behind the question `deleteEntry` asks (the feeding and
 * household sweeps of 2026-09-24). An edit the server will refuse used to be written on the phone
 * first: the server kept the household's value, every other phone showed it, and this phone kept
 * its own for good — a pull re-sends a row only when it changes, and a refused op leaves the local
 * row as it is (`OutboxWorker.fail`). So the phone refuses first, and writes nothing. The photo
 * queue's own edit (`entryPhotos.ts`) goes straight to `editActivity`: it only ever finishes an
 * upload the editor already allowed.
 */
export async function editEntry(
  db: Db,
  clock: Clock,
  input: EditActivityInput,
  deps: RepositoryDeps = {},
): Promise<WriteOutcome> {
  if (!(await mayChangeEntry(db, input))) throw new EntryNotYoursError();
  return editActivity(db, clock, input, deps);
}

export async function deleteEntry(
  db: Db,
  clock: Clock,
  input: DeleteEntryInput,
  deps: RepositoryDeps = {},
): Promise<WriteOutcome> {
  if (!(await mayChangeEntry(db, input))) throw new EntryNotYoursError();
  const opId = input.opId ?? newIntentId();
  const at = clock.iso();
  // the draws and the write-off of the last few ml beside them: every row this bottle took
  const uses = await db.all<UseRow>(
    `select id, container_id, delta_ml from milk_inventory_transactions
      where activity_id = ? and kind in ('USE', 'ADJUST')`,
    [input.activityId],
  );

  const rows: LocalRow[] = [
    {
      table: 'activities',
      row: { id: input.activityId, deleted_at: at, updated_at: at, updated_by: input.createdBy },
    },
  ];
  const ops: ChainOp[] = [
    {
      client_op_id: opId,
      entity: 'activity',
      op: 'DELETE',
      entity_id: input.activityId,
      household_id: input.householdId,
      payload: { deleted_at: at, client_edited_at: at },
      depends_on: null,
    },
  ];
  const invalidates = [...activityKeys(input.householdId, input.childId, input.type)];

  // THE BAGS THIS DELETE REOPENS: closed locally (USED) and about to hold milk again. Their
  // patches go first, straight behind the DELETE (see the header), and stay out of the outcome.
  const back = new Map<string, number>();
  for (const use of uses)
    back.set(use.container_id, (back.get(use.container_id) ?? 0) - use.delta_ml);
  const held = new Map<string, { amount_ml: number; status: string }>();
  for (const containerId of back.keys()) {
    const c = await db.get<{ amount_ml: number; status: string }>(
      'select amount_ml, status from milk_containers where id = ?',
      [containerId],
    );
    if (c !== undefined) held.set(containerId, c);
  }
  const reopenIds: string[] = [];
  for (const [containerId, ml] of back) {
    const c = held.get(containerId);
    if (c === undefined || c.status !== 'USED' || c.amount_ml + ml <= 0) continue;
    const id = reopenPatchId(containerId, at);
    reopenIds.push(id);
    ops.push({
      client_op_id: id,
      entity: 'container',
      op: 'UPDATE',
      entity_id: containerId,
      household_id: input.householdId,
      payload: { status: 'STORED', used_at: null, client_edited_at: at },
      depends_on: opId,
    });
  }

  for (const use of uses) {
    // the same tag for the same USE, so a retried delete is one ADJUST, not two
    const id = deriveOpId(opId, `adjust:${use.id}`);
    const back = -use.delta_ml;
    const fields = {
      container_id: use.container_id,
      kind: 'ADJUST',
      delta_ml: back,
      from_location_id: null,
      to_location_id: null,
      // not tied to the entry: the entry is gone and the milk simply is in the container again
      activity_id: null,
      occurred_at: at,
      created_by: input.createdBy,
    };
    rows.push({
      table: 'milk_inventory_transactions',
      row: { id, client_op_id: id, household_id: input.householdId, ...fields, created_at: at },
    });
    ops.push({
      client_op_id: id,
      entity: 'milk_txn',
      op: 'CREATE',
      entity_id: id,
      household_id: input.householdId,
      payload: { ...fields, client_edited_at: at },
      depends_on: opId,
    });
    invalidates.push(keys.stash(input.householdId), keys.container(use.container_id));
  }

  // The optimistic balance, in the same transaction, as logBottleFromStash keeps it: the
  // server's trigger owns amount_ml, but the stash card must show the milk back at once.
  for (const [containerId, ml] of back) {
    const c = held.get(containerId);
    if (c === undefined) continue;
    rows.push({
      table: 'milk_containers',
      row: {
        id: containerId,
        amount_ml: c.amount_ml + ml,
        ...(c.amount_ml + ml > 0 ? { status: 'STORED', used_at: null } : {}),
        updated_at: at,
      },
    });
  }

  const outcome = await commitWrite(
    db,
    clock,
    { intentId: opId, chain: { rows, ops }, source: input.source, invalidates },
    deps,
  );
  if (reopenIds.length === 0) return outcome;
  // the reopening is not the Undo's: `undoWrite` would take the bag row itself back out on a
  // cancel. `returnToContainer` settles it when the milk goes back out.
  const reopened = new Set(reopenIds);
  const reopenedBags = new Set(ops.filter(o => reopened.has(o.client_op_id)).map(o => o.entity_id));
  return {
    ...outcome,
    opIds: outcome.opIds.filter(id => !reopened.has(id)),
    entityIds: outcome.entityIds.filter(id => !reopenedBags.has(id)),
  };
}

/** Undo of `deleteEntry`: the entry back, the milk drawn again — by cancel or by compensation. */
export async function restoreEntry(
  db: Db,
  clock: Clock,
  outcome: WriteOutcome,
  deps: RepositoryDeps = {},
): Promise<void> {
  await undoWrite(db, clock, outcome, deps);
}
