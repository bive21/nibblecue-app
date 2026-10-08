/**
 * Undo across the outbox boundary — both branches of D35, and the rule that separates them.
 *
 * Whichever branch runs, the parent sees the same thing: the entry is gone and the count is
 * back where it started. What differs is what the SERVER is told, and that is what these tests
 * pin — because getting it wrong is either a row the server keeps forever or a ledger row
 * deleted from an append-only table.
 */
import { deriveOpId } from '@nibblecue/core';
import { afterEach, describe, expect, it } from 'vitest';
import type { Db } from '../db/driver';
import {
  CHILD_A,
  HOUSEHOLD,
  USER,
  liveActivities,
  seedContainer,
  seedHousehold,
} from '../testing/fixtures';
import { logActivity } from './activities';
import { logBottleFromStash } from './stash';
import { undoWrite } from './undo';

const CONTAINER = 'ffffffff-0000-4000-8000-000000000001';
const TAP = '2026-09-14T03:12:00.000Z';

const restores: (() => void)[] = [];
afterEach(() => {
  while (restores.length > 0) restores.pop()?.();
});

async function fixture() {
  const f = await seedHousehold();
  restores.push(f.restoreIds);
  return f;
}

const ops = (db: Db) =>
  db.all<{ client_op_id: string; entity: string; op: string; state: string; payload: string }>(
    'select client_op_id, entity, op, state, payload from outbox order by seq',
    [],
  );

const amountOf = async (db: Db, id: string): Promise<number> =>
  (await db.get<{ amount_ml: number }>('select amount_ml from milk_containers where id = ?', [id]))
    ?.amount_ml ?? -1;

describe('undo (D35, OFFLINE_SYNC §1.1)', () => {
  it('cancels outright while every op is still PENDING', async () => {
    const { db, clock } = await fixture();
    const before = await liveActivities(db);
    const out = await logActivity(db, clock, {
      householdId: HOUSEHOLD,
      createdBy: USER,
      deviceId: null,
      source: 'today',
      childId: CHILD_A,
      type: 'diaper',
      startAt: TAP,
      detail: { kind: 'WET' },
    });
    expect(await liveActivities(db)).toBe(before + 1);

    expect(await undoWrite(db, clock, out)).toBe('cancelled');
    expect(await liveActivities(db)).toBe(before);
    // nothing to explain to the server: no row at all, not a tombstone
    expect(await ops(db)).toEqual([]);
    expect((await db.get<{ n: number }>('select count(*) as n from diaper_details', []))?.n).toBe(
      0,
    );
  });

  it('soft-deletes and enqueues a DELETE once an op has left PENDING', async () => {
    const { db, clock } = await fixture();
    const before = await liveActivities(db);
    const out = await logActivity(db, clock, {
      householdId: HOUSEHOLD,
      createdBy: USER,
      deviceId: null,
      source: 'today',
      childId: CHILD_A,
      type: 'diaper',
      startAt: TAP,
      detail: { kind: 'WET' },
    });
    // the worker got there first: this is the ordinary case on a good connection, not an edge
    await db.run(`update outbox set state = 'SENDING', sending_at = ? where client_op_id = ?`, [
      clock.iso(),
      out.opIds[0] ?? '',
    ]);

    expect(await undoWrite(db, clock, out)).toBe('soft_deleted');
    expect(await liveActivities(db)).toBe(before);
    const rows = await ops(db);
    expect(rows.map(r => [r.entity, r.op, r.state])).toEqual([
      ['activity', 'CREATE', 'SENDING'],
      ['activity', 'DELETE', 'PENDING'],
    ]);
    expect(rows[1]?.client_op_id).toBe(deriveOpId(out.opIds[0] ?? '', 'undo'));
    // the row is still there, carrying its tombstone — nothing is removed by app code
    const kept = await db.get<{ deleted_at: string | null }>(
      'select deleted_at from activities where id = ?',
      [out.entityIds[0] ?? ''],
    );
    expect(kept?.deleted_at).toBe(clock.iso());
  });

  it('a cancelled stash bottle puts the milk back and removes the USE row', async () => {
    const { db, clock } = await fixture();
    await seedContainer(db, { id: CONTAINER, amountMl: 150 });
    const out = await logBottleFromStash(db, clock, {
      householdId: HOUSEHOLD,
      createdBy: USER,
      deviceId: null,
      source: 'quicklog',
      childId: CHILD_A,
      startAt: TAP,
      consumedMl: 120,
    });
    expect(await amountOf(db, CONTAINER)).toBe(30);

    expect(await undoWrite(db, clock, out)).toBe('cancelled');
    expect(await liveActivities(db)).toBe(0);
    expect(await amountOf(db, CONTAINER)).toBe(150);
    // the server never saw it, so the ledger row can go
    expect(
      (
        await db.get<{ n: number }>(
          "select count(*) as n from milk_inventory_transactions where kind = 'USE'",
          [],
        )
      )?.n,
    ).toBe(0);
  });

  it('a sent stash bottle is compensated: the USE row stays and an ADJUST is enqueued', async () => {
    const { db, clock } = await fixture();
    await seedContainer(db, { id: CONTAINER, amountMl: 150 });
    const out = await logBottleFromStash(db, clock, {
      householdId: HOUSEHOLD,
      createdBy: USER,
      deviceId: null,
      source: 'quicklog',
      childId: CHILD_A,
      startAt: TAP,
      consumedMl: 120,
    });
    await db.run(`update outbox set state = 'SYNCED' where entity = 'milk_txn'`);

    expect(await undoWrite(db, clock, out)).toBe('soft_deleted');
    expect(await liveActivities(db)).toBe(0);
    // the ledger is append-only: the USE row is untouched and the correction is a new row
    const ledger = await db.all<{ kind: string; delta_ml: number }>(
      'select kind, delta_ml from milk_inventory_transactions order by kind',
      [],
    );
    expect(ledger).toEqual([
      { kind: 'ADD', delta_ml: 150 },
      { kind: 'ADJUST', delta_ml: 120 },
      { kind: 'USE', delta_ml: -120 },
    ]);
    expect(await amountOf(db, CONTAINER)).toBe(150);

    const enqueued = await ops(db);
    const adjust = enqueued.find(o => o.entity === 'milk_txn' && o.state === 'PENDING');
    expect(adjust?.client_op_id).toBe(deriveOpId(deriveOpId(out.intentId, 'use'), 'undo'));
    expect(JSON.parse(adjust?.payload ?? '{}')).toMatchObject({ kind: 'ADJUST', delta_ml: 120 });
  });

  it('is idempotent in the compensating branch: undoing twice is one operation', async () => {
    const { db, clock } = await fixture();
    const out = await logActivity(db, clock, {
      householdId: HOUSEHOLD,
      createdBy: USER,
      deviceId: null,
      source: 'today',
      childId: CHILD_A,
      type: 'diaper',
      startAt: TAP,
      detail: { kind: 'WET' },
    });
    await db.run(`update outbox set state = 'SYNCED'`);
    expect(await undoWrite(db, clock, out)).toBe('soft_deleted');
    expect(await undoWrite(db, clock, out)).toBe('soft_deleted');
    const deletes = (await ops(db)).filter(o => o.op === 'DELETE');
    expect(deletes).toHaveLength(1);
  });

  it('refuses a write that never committed rather than pretending to undo it', async () => {
    const { db, clock } = await fixture();
    await expect(
      undoWrite(db, clock, {
        committed: false,
        suppressed: true,
        opIds: [],
        entityIds: [],
        intentId: 'eeeeeeee-0000-4000-8000-000000000001',
      }),
    ).rejects.toThrow('nothing to undo');
  });
});
