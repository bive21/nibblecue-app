/**
 * A BAG THE STASH EMPTIES IS CLOSED ON THE SERVER, AND A PATCH NEVER RIDES BEHIND ITS OWN LEDGER
 * ROWS (the audit of 2026-09-24, feeding H3 and timers 21; the sync sweep, S1–S4).
 *
 * The server's balance trigger writes a container's amount and never its status, and a container
 * is last-writer-wins as a whole row that every ledger row re-stamps. So a bag closed only on the
 * phone came back from the next pull as a 0 oz bag in the stash, and a status patch queued behind
 * a ledger row of its own write reached the server older than the row it patched and was dropped.
 * These run the phone's real write path against the in-app server the owner's phone talks to,
 * and pull the result back, because "closed on the phone" was never the question.
 */
import { afterEach, describe, expect, it } from 'vitest';
import type { Db } from '../db/driver';
import { stashSummary } from '../db/queries/stash';
import { MockSyncApi, MockSyncServer } from '../sync/providers/mock';
import { PullEngine } from '../sync/pull';
import { OutboxWorker } from '../sync/worker';
import {
  CHILD_A,
  HOUSEHOLD,
  LOCATION,
  USER,
  seedContainer,
  seedHousehold,
} from '../testing/fixtures';
import { deleteEntry } from './entries';
import { saveLocation } from './locations';
import {
  adjustContainer,
  emptiedPatchId,
  logBottleFromStash,
  reopenPatchId,
  splitContainer,
  storePumpSession,
} from './stash';
import { undoWrite } from './undo';

const A = 'ffffffff-0000-4000-8000-00000000000a';

const restores: (() => void)[] = [];
afterEach(() => {
  while (restores.length > 0) restores.pop()?.();
});

const ctx = {
  householdId: HOUSEHOLD,
  createdBy: USER,
  deviceId: 'device-1',
  source: 'sheet' as const,
};

async function device() {
  const f = await seedHousehold();
  restores.push(f.restoreIds);
  let tick = 0;
  // the server's clock runs a hair ahead of the phone's, as a real one does between statements
  const server = new MockSyncServer({ now: () => f.clock.now() + ++tick });
  server.addMember({ household_id: HOUSEHOLD, user_id: USER, role: 'OWNER' });
  server.addChild({ id: CHILD_A, household_id: HOUSEHOLD, name: 'Emma' });
  server.addLocation({ id: LOCATION, household_id: HOUSEHOLD, name: 'Fridge', kind: 'FRIDGE' });
  const api = new MockSyncApi(server, USER);
  const puller = new PullEngine({
    db: f.db,
    api,
    clock: f.clock,
    householdId: HOUSEHOLD,
    userId: USER,
  });
  const worker = new OutboxWorker(
    f.db,
    api,
    { isConnected: () => Promise.resolve(true), onReconnect: () => () => undefined },
    f.clock,
    {
      analytics: () => undefined as never,
      onState: () => undefined,
      rng: () => 0.5,
      // a pass ends by pulling back what it wrote, exactly as the app's engine does
      pullAfterPush: tables => puller.pullTables(tables).then(() => undefined),
    },
  );
  worker.start();
  return { ...f, server, worker };
}
type Device = Awaited<ReturnType<typeof device>>;

/** A bag on the server and on the phone, stored a while before anything draws from it. */
async function bag(d: Device, id: string, ml: number) {
  d.server.addContainer({ id, householdId: HOUSEHOLD, ownerId: USER, locationId: LOCATION, ml });
  await seedContainer(d.db, { id, amountMl: ml, pumpedAt: d.clock.iso() });
  d.clock.advance(60 * 60_000);
}

const onPhone = (db: Db, id: string) =>
  db.get<{ amount_ml: number; status: string; used_at: string | null }>(
    'select amount_ml, status, used_at from milk_containers where id = ?',
    [id],
  );
const onServer = (d: Device, id: string) =>
  (d.server.milk_containers as { id: string; amount_ml: number; status: string }[]).find(
    c => c.id === id,
  );
const queued = (db: Db) =>
  db.all<{ entity: string; op: string; entity_id: string; payload: string; state: string }>(
    'select entity, op, entity_id, payload, state from outbox order by seq',
    [],
  );
const failed = (db: Db) => db.all('select * from outbox where state = ?', ['FAILED']);

const bottle = (consumedMl: number) => ({
  ...ctx,
  childId: CHILD_A,
  startAt: '2026-09-14T09:30:00.000Z',
  consumedMl,
});

describe('a bottle that empties a bag closes it on the server (H3, S2)', () => {
  it('queues the close ahead of the USE row, and the bag stays out of the stash after a pull', async () => {
    const d = await device();
    await bag(d, A, 120);
    const out = await logBottleFromStash(d.db, d.clock, bottle(120));

    const ops = await queued(d.db);
    expect(ops.map(o => `${o.entity}:${o.op}`)).toEqual([
      'activity:CREATE',
      'container:UPDATE',
      'milk_txn:CREATE',
    ]);
    expect(JSON.parse(ops[1]?.payload ?? '{}')).toMatchObject({
      status: 'USED',
      used_at: '2026-09-14T09:30:00.000Z',
    });

    await d.worker.flush('manual');
    expect(await failed(d.db)).toEqual([]);
    expect(onServer(d, A)).toMatchObject({ amount_ml: 0, status: 'USED' });
    // the pull brought the server's row back, and it is still closed
    expect(await onPhone(d.db, A)).toMatchObject({ amount_ml: 0, status: 'USED' });
    expect(await stashSummary(d.db, HOUSEHOLD)).toMatchObject({ totalMl: 0, containers: 0 });
    expect(out.committed).toBe(true);
  });

  it('leaves a bag it did not empty open', async () => {
    const d = await device();
    await bag(d, A, 200);
    await logBottleFromStash(d.db, d.clock, bottle(120));
    expect((await queued(d.db)).some(o => o.entity === 'container')).toBe(false);
    await d.worker.flush('manual');
    expect(onServer(d, A)).toMatchObject({ amount_ml: 80, status: 'STORED' });
  });

  it('ties a written-off remainder to the bottle that caused it', async () => {
    const d = await device();
    await bag(d, A, 124);
    const out = await logBottleFromStash(d.db, d.clock, bottle(120));
    const rows = await d.db.all<{ kind: string; delta_ml: number; activity_id: string | null }>(
      'select kind, delta_ml, activity_id from milk_inventory_transactions where container_id = ? order by created_at, id',
      [A],
    );
    expect(rows.filter(r => r.kind !== 'ADD')).toEqual(
      expect.arrayContaining([
        { kind: 'USE', delta_ml: -120, activity_id: out.activityId },
        { kind: 'ADJUST', delta_ml: -4, activity_id: out.activityId },
      ]),
    );
  });
});

describe('Undo of a bottle that emptied a bag (H3 with the toast)', () => {
  it('before it is sent: the close is taken out of the queue with the rest, and nothing reaches the server', async () => {
    const d = await device();
    await bag(d, A, 120);
    const out = await logBottleFromStash(d.db, d.clock, bottle(120));
    // the toast holds the bottle and its milk, not the close
    expect(out.opIds).not.toContain(emptiedPatchId(out.activityId, A));

    expect(await undoWrite(d.db, d.clock, out)).toBe('cancelled');
    expect(await queued(d.db)).toEqual([]);
    expect(await onPhone(d.db, A)).toMatchObject({ amount_ml: 120, status: 'STORED' });
    await d.worker.flush('manual');
    expect(onServer(d, A)).toMatchObject({ amount_ml: 120, status: 'STORED' });
  });

  it('after it is sent: the bag is reopened on the server ahead of the milk going back', async () => {
    const d = await device();
    await bag(d, A, 120);
    const out = await logBottleFromStash(d.db, d.clock, bottle(120));
    await d.worker.flush('manual');
    expect(onServer(d, A)).toMatchObject({ status: 'USED' });

    d.clock.advance(3_000); // the parent's three seconds before the toast's Undo
    expect(await undoWrite(d.db, d.clock, out)).toBe('soft_deleted');
    const pending = (await queued(d.db)).filter(o => o.state === 'PENDING');
    const reopen = pending.findIndex(o => o.entity === 'container');
    const milkBack = pending.findIndex(o => o.entity === 'milk_txn');
    expect(reopen).toBeGreaterThan(-1);
    expect(reopen).toBeLessThan(milkBack);
    expect(await onPhone(d.db, A)).toMatchObject({
      amount_ml: 120,
      status: 'STORED',
      used_at: null,
    });

    await d.worker.flush('manual');
    expect(await failed(d.db)).toEqual([]);
    expect(onServer(d, A)).toMatchObject({ amount_ml: 120, status: 'STORED' });
    expect(await onPhone(d.db, A)).toMatchObject({ amount_ml: 120, status: 'STORED' });
    expect(await stashSummary(d.db, HOUSEHOLD)).toMatchObject({ totalMl: 120, containers: 1 });
  });
});

describe('deleting a stash bottle, then Undo (timers 21)', () => {
  it('closes the bag again when the milk goes back out of it — never a 0 ml bag in the stash', async () => {
    const d = await device();
    await bag(d, A, 120);
    const fed = await logBottleFromStash(d.db, d.clock, bottle(120));
    d.clock.advance(60_000);
    const del = await deleteEntry(d.db, d.clock, {
      ...ctx,
      activityId: fed.activityId,
      childId: CHILD_A,
      type: 'bottle',
    });
    expect(await onPhone(d.db, A)).toMatchObject({ amount_ml: 120, status: 'STORED' });

    expect(await undoWrite(d.db, d.clock, del)).toBe('cancelled');
    const back = await onPhone(d.db, A);
    expect(back).toMatchObject({ amount_ml: 0, status: 'USED' });
    expect(back?.used_at).not.toBeNull();
    expect(await stashSummary(d.db, HOUSEHOLD)).toMatchObject({ containers: 0 });
  });

  /**
   * A DELETE THAT PUTS MILK BACK INTO A CLOSED BAG REOPENS IT ON THE SERVER TOO (data/entries.ts),
   * or the next pull hides the milk. The patch is keyed by the bag and the ADJUST's instant
   * (`reopenPatchId`), so an undo of the delete before it is sent takes it back out of the queue.
   */
  it('deleting a synced bottle that emptied a bag reopens it on the server, and a pull keeps the milk', async () => {
    const d = await device();
    await bag(d, A, 120);
    const fed = await logBottleFromStash(d.db, d.clock, bottle(120));
    await d.worker.flush('manual');
    expect(onServer(d, A)).toMatchObject({ amount_ml: 0, status: 'USED' });
    d.clock.advance(60_000);

    const del = await deleteEntry(d.db, d.clock, {
      ...ctx,
      activityId: fed.activityId,
      childId: CHILD_A,
      type: 'bottle',
    });
    // the reopening is not the toast's to undo, and it rides ahead of the milk going back
    expect(del.opIds).not.toContain(reopenPatchId(A, d.clock.iso()));
    expect(del.entityIds).not.toContain(A);
    const pending = (await queued(d.db)).filter(o => o.state === 'PENDING');
    const reopen = pending.findIndex(o => o.entity === 'container');
    expect(reopen).toBeGreaterThan(-1);
    expect(reopen).toBeLessThan(pending.findIndex(o => o.entity === 'milk_txn'));

    await d.worker.flush('manual');
    expect(await failed(d.db)).toEqual([]);
    expect(onServer(d, A)).toMatchObject({ amount_ml: 120, status: 'STORED' });
    // the pass ends with a pull: the bag the stash shows is still there, milk and all
    expect(await onPhone(d.db, A)).toMatchObject({ amount_ml: 120, status: 'STORED' });
    expect(await stashSummary(d.db, HOUSEHOLD)).toMatchObject({ totalMl: 120, containers: 1 });
  });

  it('deleting a bottle gives back the few ml written off beside it — a 124 ml bag comes back whole', async () => {
    const d = await device();
    await bag(d, A, 124);
    const fed = await logBottleFromStash(d.db, d.clock, bottle(120));
    await d.worker.flush('manual');
    d.clock.advance(60_000);
    await deleteEntry(d.db, d.clock, {
      ...ctx,
      activityId: fed.activityId,
      childId: CHILD_A,
      type: 'bottle',
    });
    expect(await onPhone(d.db, A)).toMatchObject({ amount_ml: 124, status: 'STORED' });
    await d.worker.flush('manual');
    expect(await failed(d.db)).toEqual([]);
    expect(onServer(d, A)).toMatchObject({ amount_ml: 124, status: 'STORED' });
  });

  it('takes the reopening back out of the queue when the delete is undone before it is sent', async () => {
    const d = await device();
    await bag(d, A, 120);
    const fed = await logBottleFromStash(d.db, d.clock, bottle(120));
    await d.worker.flush('manual');
    d.clock.advance(60_000);
    const del = await deleteEntry(d.db, d.clock, {
      ...ctx,
      activityId: fed.activityId,
      childId: CHILD_A,
      type: 'bottle',
    });
    expect((await queued(d.db)).some(o => o.entity === 'container' && o.state === 'PENDING')).toBe(
      true,
    );

    expect(await undoWrite(d.db, d.clock, del)).toBe('cancelled');
    expect((await queued(d.db)).filter(o => o.state === 'PENDING')).toEqual([]);
    expect(await onPhone(d.db, A)).toMatchObject({ amount_ml: 0, status: 'USED' });
    await d.worker.flush('manual');
    expect(onServer(d, A)).toMatchObject({ amount_ml: 0, status: 'USED' });
  });

  it('once the delete was sent, the undo closes the bag on the server too, ahead of the ADJUST', async () => {
    const d = await device();
    await bag(d, A, 120);
    const fed = await logBottleFromStash(d.db, d.clock, bottle(120));
    await d.worker.flush('manual');
    d.clock.advance(60_000);
    const del = await deleteEntry(d.db, d.clock, {
      ...ctx,
      activityId: fed.activityId,
      childId: CHILD_A,
      type: 'bottle',
    });
    await d.worker.flush('manual');
    d.clock.advance(3_000);

    expect(await undoWrite(d.db, d.clock, del)).toBe('soft_deleted');
    expect(await onPhone(d.db, A)).toMatchObject({ amount_ml: 0, status: 'USED' });
    const pending = (await queued(d.db)).filter(o => o.state === 'PENDING');
    const close = pending.findIndex(o => o.entity === 'container');
    expect(close).toBeGreaterThan(-1);
    expect(close).toBeLessThan(pending.findIndex(o => o.entity === 'milk_txn'));

    await d.worker.flush('manual');
    expect(await failed(d.db)).toEqual([]);
    expect(onServer(d, A)).toMatchObject({ amount_ml: 0, status: 'USED' });
    expect(await onPhone(d.db, A)).toMatchObject({ amount_ml: 0, status: 'USED' });
  });
});

describe('the pump’s fed part: the counter bottle is created closed (S2)', () => {
  it('feed it all: USED on the server from its CREATE, and after the pull', async () => {
    const d = await device();
    const room = await saveLocation(d.db, d.clock, { ...ctx, name: 'Counter', kind: 'ROOM' });
    await d.worker.flush('manual');
    d.clock.advance(60_000);
    const r = await storePumpSession(d.db, d.clock, {
      ...ctx,
      startAt: d.clock.iso(d.clock.now() - 20 * 60_000),
      endAt: d.clock.iso(),
      leftMl: 60,
      rightMl: 60,
      store: true,
      destination: 'all',
      roomLocationId: room.locationId,
      childId: CHILD_A,
    });
    const create = (await queued(d.db)).find(
      o => o.entity === 'container' && o.entity_id === r.feedContainerId,
    );
    expect(create?.op).toBe('CREATE');
    expect(JSON.parse(create?.payload ?? '{}')).toMatchObject({ status: 'USED' });
    // and no patch behind the CREATE, which last-writer-wins would drop
    expect((await queued(d.db)).filter(o => o.entity === 'container' && o.op === 'UPDATE')).toEqual(
      [],
    );

    await d.worker.flush('manual');
    expect(await failed(d.db)).toEqual([]);
    expect(onServer(d, r.feedContainerId as string)).toMatchObject({
      amount_ml: 0,
      status: 'USED',
    });
    expect(await onPhone(d.db, r.feedContainerId as string)).toMatchObject({ status: 'USED' });
    expect(await stashSummary(d.db, HOUSEHOLD)).toMatchObject({ totalMl: 0, containers: 0 });
  });
});

describe('correcting a bag to nothing closes it on the server (S1)', () => {
  it('queues the close ahead of its ADJUST, so the ADJUST cannot make it look older', async () => {
    const d = await device();
    await bag(d, A, 90);
    await adjustContainer(d.db, d.clock, { ...ctx, containerId: A, amountMl: 0 });
    const ops = await queued(d.db);
    expect(ops.map(o => `${o.entity}:${o.op}`)).toEqual(['container:UPDATE', 'milk_txn:CREATE']);

    await d.worker.flush('manual');
    expect(await failed(d.db)).toEqual([]);
    expect(onServer(d, A)).toMatchObject({ amount_ml: 0, status: 'USED' });
    expect(await onPhone(d.db, A)).toMatchObject({ amount_ml: 0, status: 'USED' });
  });
});

describe('splitting a thawing bag (S3)', () => {
  it('sends the half’s thaw time in its CREATE, with no patch behind it to be dropped', async () => {
    const d = await device();
    await bag(d, A, 150);
    const thawedAt = '2026-09-14T07:00:00.000Z';
    await d.db.run(`update milk_containers set status = 'THAWING', thawed_at = ? where id = ?`, [
      thawedAt,
      A,
    ]);
    const r = await splitContainer(d.db, d.clock, { ...ctx, containerId: A, ml: 60 });
    const ops = await queued(d.db);
    const create = ops.find(o => o.entity === 'container' && o.op === 'CREATE');
    expect(create?.entity_id).toBe(r.childContainerId);
    expect(JSON.parse(create?.payload ?? '{}')).toMatchObject({
      status: 'THAWING',
      thawed_at: thawedAt,
    });
    expect(ops.filter(o => o.entity === 'container' && o.op === 'UPDATE')).toEqual([]);
    // and the phone's own copy of the half is thawing from the same moment
    expect(
      await d.db.get('select status, thawed_at from milk_containers where id = ?', [
        r.childContainerId,
      ]),
    ).toEqual({ status: 'THAWING', thawed_at: thawedAt });
  });
});
