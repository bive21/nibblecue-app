/**
 * UNDO TAKES BACK WHAT NEVER LEFT AND REVERSES ONLY WHAT DID (the sync sweep of 2026-09-24, P3
 * and P7 — both ended at "Not synced").
 *
 * An intent used to be all-cancelled or all-compensated. The tutorial's clean-up undoes several
 * writes as one claim, and when the last practice entry was still queued, the rows just taken off
 * the queue were "compensated" too — the server was asked to delete entries it never had. And a
 * CREATE the server refused counted as sent, so its Undo queued a DELETE that waited on the
 * refusal forever. These run the real writes and the real Undo against the in-app server.
 */
import { afterEach, describe, expect, it } from 'vitest';
import type { Db } from '../db/driver';
import { MockSyncApi, MockSyncServer } from '../sync/providers/mock';
import { OutboxWorker } from '../sync/worker';
import { CHILD_A, HOUSEHOLD, LOCATION, USER, seedHousehold } from '../testing/fixtures';
import { logActivity } from './activities';
import { deleteEntry } from './entries';
import type { WriteOutcome } from './repository';
import { skipSlot } from './schedule';
import { addStoredMilk, logBottleFromStash } from './stash';
import { undoWrite } from './undo';

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
  return { ...f, server, worker };
}
type Device = Awaited<ReturnType<typeof device>>;

const unsent = (db: Db) =>
  db.all<{ entity: string; op: string; state: string; last_error: string | null }>(
    `select entity, op, state, last_error from outbox where state != 'SYNCED' order by seq`,
    [],
  );
const live = (db: Db, id: string) =>
  db.get<{ id: string; deleted_at: string | null }>(
    'select id, deleted_at from activities where id = ?',
    [id],
  );

const diaper = (d: Device) =>
  logActivity(d.db, d.clock, {
    ...ctx,
    childId: CHILD_A,
    type: 'diaper',
    startAt: d.clock.iso(),
    detail: { kind: 'WET' },
  });

/** Several writes undone as one — the tutorial's claim. */
const claimOf = (...outcomes: WriteOutcome[]): WriteOutcome => ({
  committed: true,
  suppressed: false,
  opIds: outcomes.flatMap(o => o.opIds),
  entityIds: outcomes.flatMap(o => o.entityIds),
  intentId: outcomes[0]?.intentId ?? 'claim',
});

describe('an Undo over ops in mixed states', () => {
  it('reverses the one the server has, and simply takes back the one still queued', async () => {
    const d = await device();
    const sent = await diaper(d);
    await d.worker.flush('manual'); // this one reached the server
    d.clock.advance(60_000);
    const queued = await diaper(d); // this one is still on the phone

    expect(await undoWrite(d.db, d.clock, claimOf(sent, queued))).toBe('soft_deleted');
    // the queued one never leaves: its row is gone and nothing is sent for it
    expect(await live(d.db, queued.entityIds[0] as string)).toBeUndefined();
    // the sent one is deleted on the server by exactly one compensating op
    const left = await unsent(d.db);
    expect(left.map(r => `${r.entity}:${r.op}`)).toEqual(['activity:DELETE']);

    await d.worker.flush('manual');
    expect(await unsent(d.db)).toEqual([]);
    const onServer = (d.server as unknown as { rowsOf(t: string): Record<string, unknown>[] })
      .rowsOf('activities')
      .filter(r => r['id'] === sent.entityIds[0]);
    expect(onServer[0]?.['deleted_at']).not.toBeNull();
  });
});

describe('an Undo of an entry the server refused', () => {
  it('is cancelled outright: no DELETE waits on the refusal, and the chip clears', async () => {
    const d = await device();
    // a sleep that ends before it starts — the server's own time check refuses it
    const bad = await logActivity(d.db, d.clock, {
      ...ctx,
      childId: CHILD_A,
      type: 'sleep',
      startAt: d.clock.iso(d.clock.now()),
      endAt: d.clock.iso(d.clock.now() - 60_000),
      detail: { kind: 'NAP', wake_count: null, location: null },
    });
    await d.worker.flush('manual');
    expect((await unsent(d.db)).map(r => r.state)).toEqual(['FAILED']);

    expect(await undoWrite(d.db, d.clock, bad)).toBe('cancelled');
    expect(await unsent(d.db)).toEqual([]);
    expect(await live(d.db, bad.entityIds[0] as string)).toBeUndefined();
  });
});

describe('deleting an entry the server refused', () => {
  it('sends nothing: the refused CREATE and the DELETE both go, and the entry stays deleted', async () => {
    const d = await device();
    const bad = await logActivity(d.db, d.clock, {
      ...ctx,
      childId: CHILD_A,
      type: 'sleep',
      startAt: d.clock.iso(d.clock.now()),
      endAt: d.clock.iso(d.clock.now() - 60_000),
      detail: { kind: 'NAP', wake_count: null, location: null },
    });
    await d.worker.flush('manual');
    expect((await unsent(d.db)).map(r => r.state)).toEqual(['FAILED']);

    d.clock.advance(60_000);
    await deleteEntry(d.db, d.clock, {
      ...ctx,
      activityId: bad.entityIds[0] as string,
      childId: CHILD_A,
      type: 'sleep',
    });
    await d.worker.flush('manual');
    expect(await unsent(d.db)).toEqual([]);
    expect((await live(d.db, bad.entityIds[0] as string))?.deleted_at).not.toBeNull();
  });

  it('leaves a delete alone when the entry DID reach the server', async () => {
    const d = await device();
    const ok = await diaper(d);
    await d.worker.flush('manual');
    await deleteEntry(d.db, d.clock, {
      ...ctx,
      activityId: ok.entityIds[0] as string,
      childId: CHILD_A,
      type: 'diaper',
    });
    await d.worker.flush('manual');
    expect(await unsent(d.db)).toEqual([]);
    const onServer = (d.server as unknown as { rowsOf(t: string): Record<string, unknown>[] })
      .rowsOf('activities')
      .find(r => r['id'] === ok.entityIds[0]);
    expect(onServer?.['deleted_at']).not.toBeNull();
  });
});

describe('skipping a slot that is already skipped', () => {
  it('changes the reason on the phone and sends nothing the server could not place', async () => {
    const d = await device();
    const ruleId = 'ffffffff-0000-4000-8000-000000000001';
    const at = d.clock.now() + 60 * 60_000;
    await skipSlot(d.db, d.clock, { ...ctx, ruleId, scheduledForMs: at, reason: 'out' });
    const again = await skipSlot(d.db, d.clock, {
      ...ctx,
      ruleId,
      scheduledForMs: at,
      reason: 'asleep',
    });
    expect(again.committed).toBe(true);
    expect(again.opIds).toEqual([]);
    expect(await unsent(d.db)).toEqual([]);
    const row = await d.db.get<{ status: string; skipped_reason: string }>(
      'select status, skipped_reason from schedule_instances where rule_id = ?',
      [ruleId],
    );
    expect(row).toEqual({ status: 'SKIPPED', skipped_reason: 'asleep' });
  });
});

/**
 * A TRIAL BAG TAKEN BACK AFTER BOTTLES CAME OUT OF IT (the investigation of 2026-09-24 into the
 * owner's "Not synced" in Expo Go). The tour's clean-up undoes a whole run as one claim, and the
 * claim is in the order the writes were made: the bag's ADD first, then the draws. Compensated
 * in that order, the ADD's −120 landed first — a downward adjustment may go into deficit — and
 * each draw's upward adjustment after it still left the bag below zero, which the server's
 * balance rule refuses. Refused, then parked FAILED at once: "Not synced", for good.
 */
describe('taking back a bag that bottles were drawn from', () => {
  it('puts the draws back before it removes the bag, so the ledger never goes below zero', async () => {
    const d = await device();
    d.server.addLocation({ id: LOCATION, household_id: HOUSEHOLD, name: 'Fridge', kind: 'FRIDGE' });
    const bag = await addStoredMilk(d.db, d.clock, {
      ...ctx,
      locationId: LOCATION,
      amountMl: 120,
      pumpedAt: d.clock.iso(),
    });
    const bottle = async () => {
      d.clock.advance(60_000);
      return logBottleFromStash(d.db, d.clock, {
        ...ctx,
        childId: CHILD_A,
        startAt: d.clock.iso(),
        consumedMl: 60,
      });
    };
    const first = await bottle();
    const second = await bottle();
    await d.worker.flush('manual');
    expect(await unsent(d.db)).toEqual([]);

    expect(await undoWrite(d.db, d.clock, claimOf(bag, first, second))).toBe('soft_deleted');
    await d.worker.flush('manual');
    // nothing refused and nothing parked: the chip has nothing to say
    expect(await unsent(d.db)).toEqual([]);
  });
});
