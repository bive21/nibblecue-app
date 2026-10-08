/**
 * Delete and its undo (PRODUCT_SPEC.md §4, §16; WP5.8): soft, reversible for 5.2 s, and a
 * stash bottle's milk comes back through the ledger — never by editing the USE row.
 */
import { deriveOpId, type Clock } from '@nibblecue/core';
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
import { deleteEntry, restoreEntry } from './entries';
import { logBottleFromStash } from './stash';

const CONTAINER = 'ffffffff-0000-4000-8000-000000000001';
const TAP = '2026-09-14T03:12:00.000Z';
const ctx = { householdId: HOUSEHOLD, createdBy: USER, deviceId: null, source: 'sheet' as const };

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
const tombstone = async (db: Db, id: string): Promise<string | null> =>
  (
    await db.get<{ deleted_at: string | null }>('select deleted_at from activities where id = ?', [
      id,
    ])
  )?.deleted_at ?? null;

async function aDiaper(db: Db, clock: Clock) {
  const out = await logActivity(db, clock, {
    ...ctx,
    childId: CHILD_A,
    type: 'diaper',
    startAt: TAP,
    detail: { kind: 'WET' },
  });
  return { out, id: out.entityIds[0] ?? '' };
}

describe('deleteEntry', () => {
  it('soft-deletes: the row stays with its tombstone and one DELETE op is queued', async () => {
    const { db, clock } = await fixture();
    const { id } = await aDiaper(db, clock);
    const out = await deleteEntry(db, clock, {
      ...ctx,
      activityId: id,
      childId: CHILD_A,
      type: 'diaper',
    });
    expect(out.committed).toBe(true);
    expect(await liveActivities(db)).toBe(0);
    expect(await tombstone(db, id)).toBe(clock.iso());
    expect((await ops(db)).map(o => [o.entity, o.op])).toEqual([
      ['activity', 'CREATE'],
      ['activity', 'DELETE'],
    ]);
  });

  it('a stash bottle gives its milk back as an ADJUST, and the USE row is untouched', async () => {
    const { db, clock } = await fixture();
    await seedContainer(db, { id: CONTAINER, amountMl: 150 });
    const bottle = await logBottleFromStash(db, clock, {
      ...ctx,
      childId: CHILD_A,
      startAt: TAP,
      consumedMl: 120,
    });
    expect(await amountOf(db, CONTAINER)).toBe(30);

    const out = await deleteEntry(db, clock, {
      ...ctx,
      activityId: bottle.activityId,
      childId: CHILD_A,
      type: 'bottle',
    });
    expect(out.committed).toBe(true);
    expect(await amountOf(db, CONTAINER)).toBe(150);
    const ledger = await db.all<{ kind: string; delta_ml: number; activity_id: string | null }>(
      'select kind, delta_ml, activity_id from milk_inventory_transactions order by kind',
      [],
    );
    expect(ledger).toEqual([
      { kind: 'ADD', delta_ml: 150, activity_id: null },
      { kind: 'ADJUST', delta_ml: 120, activity_id: null },
      { kind: 'USE', delta_ml: -120, activity_id: bottle.activityId },
    ]);
    // one chain: the DELETE and the ADJUST, the ADJUST depending on the delete
    expect(out.opIds).toHaveLength(2);
    const queued = await ops(db);
    const adjust = queued.find(
      o =>
        o.entity === 'milk_txn' &&
        o.op === 'CREATE' &&
        o.state === 'PENDING' &&
        JSON.parse(o.payload).kind === 'ADJUST',
    );
    expect(adjust?.client_op_id).toBe(
      deriveOpId(out.intentId, `adjust:${deriveOpId(bottle.intentId, 'use')}`),
    );
  });
});

describe('restoreEntry — the 5.2 s Undo', () => {
  it('cancels a delete that never left the device: the tombstone comes off, nothing is queued', async () => {
    const { db, clock } = await fixture();
    const { id } = await aDiaper(db, clock);
    const out = await deleteEntry(db, clock, {
      ...ctx,
      activityId: id,
      childId: CHILD_A,
      type: 'diaper',
    });
    await restoreEntry(db, clock, out);
    expect(await tombstone(db, id)).toBeNull();
    expect(await liveActivities(db)).toBe(1);
    expect((await ops(db)).map(o => [o.entity, o.op])).toEqual([['activity', 'CREATE']]);
  });

  it('once the delete has been sent, the undo is an UPDATE with restore: true (0012)', async () => {
    const { db, clock } = await fixture();
    const { id } = await aDiaper(db, clock);
    const out = await deleteEntry(db, clock, {
      ...ctx,
      activityId: id,
      childId: CHILD_A,
      type: 'diaper',
    });
    await db.run(`update outbox set state = 'SYNCED' where op = 'DELETE'`);
    await restoreEntry(db, clock, out);
    expect(await tombstone(db, id)).toBeNull();
    const queued = await ops(db);
    const restore = queued.find(o => o.state === 'PENDING' && o.op === 'UPDATE');
    expect(restore).toMatchObject({ entity: 'activity', op: 'UPDATE' });
    expect(JSON.parse(restore?.payload ?? '{}')).toMatchObject({ restore: true });
    expect(restore?.client_op_id).toBe(deriveOpId(out.opIds[0] ?? '', 'undo'));
  });

  it('draws the milk again when a stash bottle comes back', async () => {
    const { db, clock } = await fixture();
    await seedContainer(db, { id: CONTAINER, amountMl: 150 });
    const bottle = await logBottleFromStash(db, clock, {
      ...ctx,
      childId: CHILD_A,
      startAt: TAP,
      consumedMl: 120,
    });
    const out = await deleteEntry(db, clock, {
      ...ctx,
      activityId: bottle.activityId,
      childId: CHILD_A,
      type: 'bottle',
    });
    expect(await amountOf(db, CONTAINER)).toBe(150);

    // pending: the ADJUST row goes and the balance is re-deducted
    await restoreEntry(db, clock, out);
    expect(await amountOf(db, CONTAINER)).toBe(30);
    expect(await liveActivities(db)).toBe(1);
    expect(
      (
        await db.get<{ n: number }>(
          "select count(*) as n from milk_inventory_transactions where kind = 'ADJUST'",
          [],
        )
      )?.n,
    ).toBe(0);
  });

  it('compensates when the ADJUST has been sent: a second ADJUST the other way', async () => {
    const { db, clock } = await fixture();
    await seedContainer(db, { id: CONTAINER, amountMl: 150 });
    const bottle = await logBottleFromStash(db, clock, {
      ...ctx,
      childId: CHILD_A,
      startAt: TAP,
      consumedMl: 120,
    });
    const out = await deleteEntry(db, clock, {
      ...ctx,
      activityId: bottle.activityId,
      childId: CHILD_A,
      type: 'bottle',
    });
    await db.run(`update outbox set state = 'SYNCED' where client_op_id in (?, ?)`, [
      out.opIds[0] ?? '',
      out.opIds[1] ?? '',
    ]);

    await restoreEntry(db, clock, out);
    expect(await amountOf(db, CONTAINER)).toBe(30);
    const ledger = await db.all<{ kind: string; delta_ml: number }>(
      'select kind, delta_ml from milk_inventory_transactions order by kind, delta_ml',
      [],
    );
    expect(ledger.map(l => [l.kind, l.delta_ml])).toEqual([
      ['ADD', 150],
      ['ADJUST', -120],
      ['ADJUST', 120],
      ['USE', -120],
    ]);
  });
});
