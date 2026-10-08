/**
 * A PUMP SESSION SPLIT INTO SEVERAL CONTAINERS, EACH IN ITS OWN PLACE (the owner, 2026-09-29:
 * *"if user pumps, and the result is 9oz, we have the option to keep in stash but split into 2,
 * what if user wants to split into 3 different bottles, with 2 left in counter (4hours), and 1 in
 * the fridge?"*). The write's half, `storePumpSession` with `parts` (docs/MILK_STASH.md §2, §3):
 *
 *   - one container CREATE and one ADD per container, each container in its own place, the pump
 *     session the source of every one of them, and the household total moved by the session exactly;
 *   - every id the client's own, derived from the intent and lettered a to f, so a replay writes
 *     nothing twice and a split in two writes the ids it always has;
 *   - a split that does not add up, a seventh container or a place that is gone refused before a
 *     row is written;
 *   - one Undo taking back every container, whether its ops are still on the phone or already on
 *     the server.
 *
 * And the stash reading them right afterwards: a counter bottle is dated by the guidance file's own
 * room-temperature window and comes first in the use-first order, the fridge bottle after it.
 */
import {
  MILK_GUIDANCE,
  conditionWindows,
  deriveOpId,
  evenSplit,
  guidanceDates,
  ozToMl,
  setSplitPart,
  splitPartTag,
} from '@nibblecue/core';
import { afterEach, describe, expect, it } from 'vitest';
import type { Db } from '../db/driver';
import { ledgerBalanceMl, stashSummary } from '../db/queries/stash';
import { MockSyncApi, MockSyncServer } from '../sync/providers/mock';
import { OutboxWorker } from '../sync/worker';
import { HOUSEHOLD, LOCATION, USER, liveActivities, seedHousehold } from '../testing/fixtures';
import { saveLocation } from './locations';
import {
  rankContainers,
  stashTotalMl,
  StorePlaceGoneError,
  storePumpSession,
  type StoredPart,
} from './stash';
import { undoWrite } from './undo';

const restores: (() => void)[] = [];
afterEach(() => {
  while (restores.length > 0) restores.pop()?.();
});

async function fixture() {
  const f = await seedHousehold();
  restores.push(f.restoreIds);
  return f;
}

const ctx = { householdId: HOUSEHOLD, createdBy: USER, deviceId: null, source: 'sheet' as const };
/** 9 oz, 4.5 on each side: 133 + 133 = 266 ml, `ozToMl(9)`. */
const NINE_OZ = {
  ...ctx,
  startAt: '2026-09-14T07:30:00.000Z',
  endAt: '2026-09-14T07:48:00.000Z',
  leftMl: 133,
  rightMl: 133,
  store: true,
  destination: 'store' as const,
  containerType: 'BOTTLE' as const,
};
const INTENT = 'ffffffff-1111-4000-8000-000000000009';
const ACTIVITY = 'ffffffff-2222-4000-8000-000000000009';

const profile = MILK_GUIDANCE.CDC_US['2026_01'];

interface ContainerOut {
  id: string;
  initial_ml: number;
  amount_ml: number;
  status: string;
  location_id: string;
  pumped_at: string;
  first_frozen_at: string | null;
  source_activity_id: string | null;
  container_type: string;
}

/**
 * Every container; with `ids`, in THAT order — the order the write listed them. One write stamps
 * every container with the same instant, so a query can only order them by id, which is a hash.
 */
async function containers(db: Db, ids?: readonly string[]): Promise<ContainerOut[]> {
  const rows = await db.all<ContainerOut>(
    `select id, initial_ml, amount_ml, status, location_id, pumped_at, first_frozen_at,
            source_activity_id, container_type from milk_containers order by id`,
  );
  if (ids === undefined) return rows;
  return ids.map(id => {
    const row = rows.find(c => c.id === id);
    if (row === undefined) throw new Error(`no container ${id}`);
    return row;
  });
}
const adds = (db: Db) =>
  db.all<{
    container_id: string;
    delta_ml: number;
    to_location_id: string | null;
    activity_id: string | null;
  }>(
    "select container_id, delta_ml, to_location_id, activity_id from milk_inventory_transactions where kind = 'ADD'",
  );
const queued = (db: Db) =>
  db.all<{ client_op_id: string; entity: string; op: string; entity_id: string }>(
    'select client_op_id, entity, op, entity_id from outbox order by seq',
  );

/** The invariant every stash test holds: the summary, the containers and the ledger agree. */
async function balances(db: Db): Promise<void> {
  const total = await db.tx(t => stashTotalMl(t, HOUSEHOLD));
  expect((await stashSummary(db, HOUSEHOLD)).totalMl).toBe(total);
  for (const c of await containers(db)) {
    expect(await db.tx(t => ledgerBalanceMl(t, c.id)), c.id).toBe(c.amount_ml);
  }
}

/** The household's own places, as the owner's example has them: the counter and the fridge. */
async function places(db: Db, clock: Parameters<typeof saveLocation>[1]) {
  const counter = await saveLocation(db, clock, { ...ctx, name: 'Counter', kind: 'ROOM' });
  const freezer = await saveLocation(db, clock, { ...ctx, name: 'Freezer', kind: 'FREEZER' });
  if (counter.locationId === null || freezer.locationId === null) throw new Error('no places');
  return { counter: counter.locationId, fridge: LOCATION, freezer: freezer.locationId };
}

const split = (mls: readonly number[], where: readonly string[]): StoredPart[] =>
  mls.map((ml, i) => ({ ml, locationId: where[i] ?? LOCATION }));

describe('a session split into containers, each in its own place (MILK_STASH §2)', () => {
  it('the owner’s 9 oz as three bottles, two on the counter and one in the fridge', async () => {
    const { db, clock } = await fixture();
    const at = await places(db, clock);
    const before = await db.tx(t => stashTotalMl(t, HOUSEHOLD));
    const parts = split(evenSplit(ozToMl(9), 3, 'oz'), [at.counter, at.counter, at.fridge]);
    const r = await storePumpSession(db, clock, { ...NINE_OZ, parts });
    expect(r.committed).toBe(true);

    // three containers, what each holds and where, in the order they were listed
    expect(r.containerIds).toHaveLength(3);
    expect(r.storedParts).toEqual(
      parts.map((p, i) => ({ containerId: r.containerIds[i], ml: p.ml, locationId: p.locationId })),
    );
    const rows = await containers(db, r.containerIds);
    expect(rows.map(c => [c.initial_ml, c.amount_ml, c.location_id, c.status])).toEqual([
      [89, 89, at.counter, 'STORED'],
      [89, 89, at.counter, 'STORED'],
      [88, 88, at.fridge, 'STORED'],
    ]);
    // the one session behind every bottle, in the type the parent chose, never frozen
    expect(rows.every(c => c.source_activity_id === r.activityId)).toBe(true);
    expect(rows.every(c => c.container_type === 'BOTTLE' && c.first_frozen_at === null)).toBe(true);
    expect(await liveActivities(db)).toBe(1);

    // one ADD per container, into its own place, tied to the session
    expect(await adds(db)).toEqual(
      expect.arrayContaining(
        rows.map(c => ({
          container_id: c.id,
          delta_ml: c.initial_ml,
          to_location_id: c.location_id,
          activity_id: r.activityId,
        })),
      ),
    );
    expect(await adds(db)).toHaveLength(3);
    // and the household total moves by the session, to the ml
    expect((await db.tx(t => stashTotalMl(t, HOUSEHOLD))) - before).toBe(ozToMl(9));
    // the pump row says the session went to the stash
    expect(
      await db.get('select stored_to_stash, total_ml from pump_details where activity_id = ?', [
        r.activityId,
      ]),
    ).toEqual({ stored_to_stash: 1, total_ml: 266 });
    await balances(db);
  });

  it('dates a counter bottle by the file’s room-temperature window, and puts it first to use', async () => {
    const { db, clock } = await fixture();
    const at = await places(db, clock);
    const parts = split(evenSplit(ozToMl(9), 3, 'oz'), [at.fridge, at.counter, at.counter]);
    const r = await storePumpSession(db, clock, { ...NINE_OZ, parts });
    const [fridge, counterA, counterB] = r.containerIds;
    const rows = await containers(db);
    const row = (id: string | undefined) => rows.find(c => c.id === id)!;

    // the counter's clock is the profile's ROOM window from the pump; the fridge's is its own
    const room = conditionWindows(profile, 'ROOM');
    const onCounter = guidanceDates(profile, 'ROOM', { ...row(counterA), thawed_at: null });
    expect(onCounter.bestUseAt).toBe(Date.parse(NINE_OZ.startAt) + room.bestUseMinutes * 60_000);
    expect(onCounter.limitAt).toBe(Date.parse(NINE_OZ.startAt) + room.limitMinutes * 60_000);
    const inFridge = guidanceDates(profile, 'FRIDGE', { ...row(fridge), thawed_at: null });
    expect(inFridge.bestUseAt).toBe(
      Date.parse(NINE_OZ.startAt) + conditionWindows(profile, 'FRIDGE').bestUseMinutes * 60_000,
    );
    expect(onCounter.bestUseAt!).toBeLessThan(inFridge.bestUseAt!);

    // use first (§6b): the two counter bottles, then the fridge bottle listed before them
    const ranked = await db.tx(t =>
      rankContainers(t, HOUSEHOLD, {
        profile,
        nowMs: clock.now(),
        timeZone: 'America/Los_Angeles',
      }),
    );
    expect(ranked.map(c => c.id)).toEqual([counterA, counterB, fridge]);

    // and once the counter's window has passed, a counter bottle is not suggested at all
    const late = await db.tx(t =>
      rankContainers(t, HOUSEHOLD, {
        profile,
        nowMs: onCounter.limitAt! + 60_000,
        timeZone: 'America/Los_Angeles',
      }),
    );
    expect(late.map(c => c.id)).toEqual([fridge]);
  });

  it('gives the container in a freezer its freeze date, and the others none', async () => {
    const { db, clock } = await fixture();
    const at = await places(db, clock);
    const parts = split(evenSplit(ozToMl(9), 3, 'oz'), [at.counter, at.fridge, at.freezer]);
    const r = await storePumpSession(db, clock, { ...NINE_OZ, parts });
    const rows = await containers(db, r.containerIds);
    expect(rows.map(c => [c.location_id, c.first_frozen_at])).toEqual([
      [at.counter, null],
      [at.fridge, null],
      [at.freezer, clock.iso()],
    ]);
    expect(r.storedParts.map(p => p.locationId)).toEqual([at.counter, at.fridge, at.freezer]);
    await balances(db);
  });

  it('takes the amounts the sheet set, the last container holding the rest', async () => {
    const { db, clock } = await fixture();
    const at = await places(db, clock);
    // 4 oz on the counter, 3 oz on the counter, the rest (2 oz) in the fridge
    const mls = setSplitPart(evenSplit(ozToMl(9), 3, 'oz'), 0, ozToMl(4), 'oz');
    const r = await storePumpSession(db, clock, {
      ...NINE_OZ,
      parts: split(mls, [at.counter, at.counter, at.fridge]),
    });
    expect((await containers(db, r.containerIds)).map(c => c.initial_ml)).toEqual([118, 89, 59]);
    expect(r.storedParts.map(p => p.ml)).toEqual([118, 89, 59]);
    await balances(db);
  });

  it('one part is a session kept as one, in that part’s place, under the ids it always had', async () => {
    const { db, clock } = await fixture();
    const at = await places(db, clock);
    const r = await storePumpSession(db, clock, {
      ...NINE_OZ,
      intentId: INTENT,
      activityId: ACTIVITY,
      parts: [{ ml: 266, locationId: at.counter }],
    });
    expect(r.containerIds).toEqual([deriveOpId(INTENT, 'container-id')]);
    expect((await containers(db)).map(c => [c.initial_ml, c.location_id])).toEqual([
      [266, at.counter],
    ]);
  });
});

describe('writing N containers: one op each, the client’s own ids, idempotent', () => {
  it('queues one CREATE and one ADD per container, behind the session, each lettered a to f', async () => {
    const { db, clock } = await fixture();
    const at = await places(db, clock);
    await db.run('delete from outbox'); // the places' own ops are not this write's
    const mls = evenSplit(ozToMl(9), 6, 'oz');
    const where = [at.counter, at.counter, at.fridge, at.fridge, at.freezer, at.freezer];
    const r = await storePumpSession(db, clock, {
      ...NINE_OZ,
      intentId: INTENT,
      activityId: ACTIVITY,
      parts: split(mls, where),
    });
    expect(r.committed).toBe(true);
    const letters = mls.map((_, i) => splitPartTag(i));
    expect(letters).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
    // every container id is derived from the intent: the phone made it, and a retry makes it again
    expect(r.containerIds).toEqual(letters.map(l => deriveOpId(INTENT, `container-id:${l}`)));

    const ops = await queued(db);
    expect(ops[0]).toMatchObject({
      client_op_id: INTENT,
      entity: 'activity',
      op: 'CREATE',
      entity_id: ACTIVITY,
    });
    const containerOps = ops.filter(o => o.entity === 'container');
    const ledgerOps = ops.filter(o => o.entity === 'milk_txn');
    expect(containerOps).toEqual(
      letters.map((l, i) => ({
        client_op_id: deriveOpId(INTENT, `container:${l}`),
        entity: 'container',
        op: 'CREATE',
        entity_id: r.containerIds[i],
      })),
    );
    expect(ledgerOps.map(o => o.client_op_id)).toEqual(
      letters.map(l => deriveOpId(INTENT, `add:${l}`)),
    );
    // nothing else: the session, six containers, six ADDs
    expect(ops).toHaveLength(1 + 6 + 6);
    // each ADD waits for its own container, and each container for the session
    const deps = await db.all<{ client_op_id: string; depends_on: string | null }>(
      'select client_op_id, depends_on from outbox order by seq',
    );
    const dependsOn = new Map(deps.map(d => [d.client_op_id, d.depends_on]));
    letters.forEach(l => {
      expect(dependsOn.get(deriveOpId(INTENT, `container:${l}`))).toBe(INTENT);
      expect(dependsOn.get(deriveOpId(INTENT, `add:${l}`))).toBe(
        deriveOpId(INTENT, `container:${l}`),
      );
    });
    await balances(db);
  });

  it('a split in two writes exactly the ids the split in two always wrote', async () => {
    const viaParts = await fixture();
    const partsRun = await storePumpSession(viaParts.db, viaParts.clock, {
      ...NINE_OZ,
      intentId: INTENT,
      activityId: ACTIVITY,
      parts: split([118, 148], [LOCATION, LOCATION]),
    });
    const partsOps = (await queued(viaParts.db)).map(o => o.client_op_id);
    restores.pop()?.();

    const viaSplit = await fixture();
    const splitRun = await storePumpSession(viaSplit.db, viaSplit.clock, {
      ...NINE_OZ,
      intentId: INTENT,
      activityId: ACTIVITY,
      locationId: LOCATION,
      split: { part1Ml: 118 },
    });
    expect(partsRun.containerIds).toEqual(splitRun.containerIds);
    expect(partsOps).toEqual((await queued(viaSplit.db)).map(o => o.client_op_id));
    expect((await containers(viaSplit.db, splitRun.containerIds)).map(c => c.initial_ml)).toEqual([
      118, 148,
    ]);
  });

  it('a replay of the same intent writes nothing twice: still three containers, three ADDs', async () => {
    const { db, clock } = await fixture();
    const at = await places(db, clock);
    const input = {
      ...NINE_OZ,
      intentId: INTENT,
      activityId: ACTIVITY,
      parts: split(evenSplit(ozToMl(9), 3, 'oz'), [at.counter, at.counter, at.fridge]),
    };
    const first = await storePumpSession(db, clock, input);
    const opsAfterFirst = await queued(db);
    const again = await storePumpSession(db, clock, input);
    expect(again.containerIds).toEqual(first.containerIds);
    expect(await containers(db)).toHaveLength(3);
    expect(await adds(db)).toHaveLength(3);
    expect(await liveActivities(db)).toBe(1);
    expect(await queued(db)).toEqual(opsAfterFirst);
    expect(await db.tx(t => stashTotalMl(t, HOUSEHOLD))).toBe(ozToMl(9));
    await balances(db);
  });

  it('refuses a split that does not add up, a seventh container, or a place that is gone, writing nothing', async () => {
    const { db, clock } = await fixture();
    const at = await places(db, clock);
    await db.run('delete from outbox');
    const nothingWritten = async () => {
      expect(await liveActivities(db)).toBe(0);
      expect(await containers(db)).toEqual([]);
      expect(await queued(db)).toEqual([]);
    };
    // a millilitre short of the session: the total would move by something else
    await expect(
      storePumpSession(db, clock, {
        ...NINE_OZ,
        parts: split([89, 89, 87], [at.counter, at.counter, at.fridge]),
      }),
    ).rejects.toThrow(RangeError);
    await nothingWritten();
    // seven containers
    await expect(
      storePumpSession(db, clock, {
        ...NINE_OZ,
        parts: split([38, 38, 38, 38, 38, 38, 38], Array(7).fill(at.fridge) as string[]),
      }),
    ).rejects.toThrow(RangeError);
    await nothingWritten();
    // a place deleted on the other phone while the sheet was open, and the thawing place
    await db.run('update storage_locations set deleted_at = ? where id = ?', [
      clock.iso(),
      at.counter,
    ]);
    await expect(
      storePumpSession(db, clock, {
        ...NINE_OZ,
        parts: split(evenSplit(ozToMl(9), 2, 'oz'), [at.counter, at.fridge]),
      }),
    ).rejects.toThrow(StorePlaceGoneError);
    await nothingWritten();
    const thawing = await saveLocation(db, clock, { ...ctx, name: 'Thawing', kind: 'THAWED' });
    await db.run('delete from outbox');
    await expect(
      storePumpSession(db, clock, {
        ...NINE_OZ,
        parts: split(evenSplit(ozToMl(9), 2, 'oz'), [at.fridge, thawing.locationId ?? '']),
      }),
    ).rejects.toThrow(StorePlaceGoneError);
    await nothingWritten();
  });
});

describe('Undo takes back every container of a split', () => {
  it('while its ops are still on the phone: no container, no ledger row, nothing queued', async () => {
    const { db, clock } = await fixture();
    const at = await places(db, clock);
    await db.run('delete from outbox');
    const before = await db.tx(t => stashTotalMl(t, HOUSEHOLD));
    const r = await storePumpSession(db, clock, {
      ...NINE_OZ,
      parts: split(evenSplit(ozToMl(9), 3, 'oz'), [at.counter, at.counter, at.fridge]),
    });
    clock.advance(3_000); // the parent's three seconds before the toast's Undo
    expect(await undoWrite(db, clock, r)).toBe('cancelled');
    expect(await containers(db)).toEqual([]);
    expect(await adds(db)).toEqual([]);
    expect(await queued(db)).toEqual([]);
    expect(await liveActivities(db)).toBe(0);
    expect(await db.tx(t => stashTotalMl(t, HOUSEHOLD))).toBe(before);
  });

  it('after they were sent: each container discarded empty here and on the server, the ledger even', async () => {
    const f = await fixture();
    let tick = 0;
    const server = new MockSyncServer({ now: () => f.clock.now() + ++tick });
    server.addMember({ household_id: HOUSEHOLD, user_id: USER, role: 'OWNER' });
    const worker = new OutboxWorker(
      f.db,
      new MockSyncApi(server, USER),
      { isConnected: () => Promise.resolve(true), onReconnect: () => () => undefined },
      f.clock,
      { analytics: () => undefined as never, onState: () => undefined, rng: () => 0.5 },
    );
    worker.start();
    const { db, clock } = f;
    const at = await places(db, clock);
    await worker.flush('manual');
    const r = await storePumpSession(db, clock, {
      ...NINE_OZ,
      deviceId: 'device-1',
      parts: split(evenSplit(ozToMl(9), 3, 'oz'), [at.counter, at.counter, at.fridge]),
    });
    await worker.flush('manual');
    const onServer = server as unknown as {
      milk_containers: { id: string; status: string; amount_ml: number }[];
    };
    expect(onServer.milk_containers.filter(c => r.containerIds.includes(c.id))).toHaveLength(3);

    clock.advance(3_000);
    expect(await undoWrite(db, clock, r)).toBe('soft_deleted');
    // here at once: every container discarded and empty, and each one's ledger back to nothing
    for (const c of await containers(db)) {
      expect([c.status, c.amount_ml], c.id).toEqual(['DISCARDED', 0]);
      expect(await db.tx(t => ledgerBalanceMl(t, c.id)), c.id).toBe(0);
    }
    expect(await db.tx(t => stashTotalMl(t, HOUSEHOLD))).toBe(0);
    // and on the server once it is sent, with nothing refused on the way
    await worker.flush('manual');
    expect(await db.all("select client_op_id from outbox where state = 'FAILED'")).toEqual([]);
    expect(
      onServer.milk_containers
        .filter(c => r.containerIds.includes(c.id))
        .map(c => [c.status, c.amount_ml]),
    ).toEqual([
      ['DISCARDED', 0],
      ['DISCARDED', 0],
      ['DISCARDED', 0],
    ]);
  });
});
