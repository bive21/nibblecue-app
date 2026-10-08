/**
 * UNDO ON A STOP BRINGS THE TIMER BACK, and Undo on a pump saved to the stash takes the
 * container back — sent or not (the audit of 2026-09-24).
 *
 * Both used to fail the moment their ops had left the phone: `compensate` threw for a timer and
 * a container ("out of WP4's scope"), and a stop still on the phone came back WITHOUT its timer,
 * waiting on a pull to find the server's copy. That was rare while every op waited for the
 * 60-second tick; with the write nudge wired it is the ordinary case, so both are held here, on
 * both sides of the send, and against the in-app server the owner's phone actually talks to.
 */
import { afterEach, describe, expect, it } from 'vitest';
import type { Db } from '../db/driver';
import { MockSyncApi, MockSyncServer } from '../sync/providers/mock';
import { OutboxWorker } from '../sync/worker';
import { CHILD_A, HOUSEHOLD, USER, seedHousehold } from '../testing/fixtures';
import { storePumpSession } from './stash';
import { startTimer, stopTimer } from './timers';
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
  server.seedDefaultLocations(HOUSEHOLD);
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

const timersOn = (db: Db) =>
  db.all<{ id: string; type: string; started_at: string; child_id: string | null; meta: string }>(
    'select id, type, started_at, child_id, meta from running_timers',
    [],
  );
const pendingOps = (db: Db) =>
  db.all<{ entity: string; op: string; entity_id: string }>(
    `select entity, op, entity_id from outbox where state = 'PENDING' order by seq`,
    [],
  );

async function runningSleep(d: Awaited<ReturnType<typeof device>>) {
  const startedAt = d.clock.iso(d.clock.now() - 45 * 60_000);
  const started = await startTimer(d.db, d.clock, {
    ...ctx,
    childId: CHILD_A,
    type: 'sleep',
    startedAt,
    meta: { kind: 'NIGHT' },
  });
  return { id: started.entityIds[0] as string, startedAt };
}

const stopSleep = (d: Awaited<ReturnType<typeof device>>, timerId: string, startAt: string) =>
  stopTimer(d.db, d.clock, {
    ...ctx,
    timerId,
    childId: CHILD_A,
    type: 'sleep',
    startAt,
    endAt: d.clock.iso(),
    detail: { kind: 'NIGHT', wake_count: null, location: null },
  });

describe('Undo on a stop', () => {
  it('before it is sent: the timer comes back as it was, same id, and nothing is sent', async () => {
    const d = await device();
    const t = await runningSleep(d);
    await d.worker.flush('manual'); // the start is on the server
    const stop = await stopSleep(d, t.id, t.startedAt);
    expect(await timersOn(d.db)).toEqual([]);
    expect(stop.removed?.[0]?.table).toBe('running_timers');

    expect(await undoWrite(d.db, d.clock, stop)).toBe('cancelled');
    const back = await timersOn(d.db);
    expect(back.map(r => [r.id, r.type, r.started_at, r.child_id])).toEqual([
      [t.id, 'sleep', t.startedAt, CHILD_A],
    ]);
    expect(JSON.parse(back[0]?.meta ?? '{}')).toEqual({ kind: 'NIGHT' });
    expect(await pendingOps(d.db)).toEqual([]);
    // and the server never lost it
    expect(d.server.rowCount('running_timers')).toBe(1);
  });

  it('after it is sent: the entry goes and the timer comes back running, on the phone and the server', async () => {
    const d = await device();
    const t = await runningSleep(d);
    const stop = await stopSleep(d, t.id, t.startedAt);
    await d.worker.flush('manual'); // the stop reached the server: timer gone, sleep saved
    expect(d.server.rowCount('running_timers')).toBe(0);
    expect(d.server.rowCount('activities')).toBe(1);

    expect(await undoWrite(d.db, d.clock, stop)).toBe('soft_deleted');
    const back = await timersOn(d.db);
    expect(back).toHaveLength(1);
    // a NEW timer (the undone entry keeps the old timer id), with the same start and word
    expect(back[0]?.id).not.toBe(t.id);
    expect(back[0]?.started_at).toBe(t.startedAt);
    expect(JSON.parse(back[0]?.meta ?? '{}')).toEqual({ kind: 'NIGHT' });

    await d.worker.flush('manual');
    expect(d.server.rowCount('running_timers')).toBe(1);
    const failed = await d.db.all('select * from outbox where state = ?', ['FAILED']);
    expect(failed).toEqual([]);
    // the entry is deleted on the server too
    expect(
      (d.server as unknown as { activities: { deleted_at: string | null }[] }).activities.every(
        a => a.deleted_at !== null,
      ),
    ).toBe(true);
  });

  it('the restored timer can be stopped again, and that stop is not swallowed as a duplicate', async () => {
    const d = await device();
    const t = await runningSleep(d);
    const stop = await stopSleep(d, t.id, t.startedAt);
    await d.worker.flush('manual');
    await undoWrite(d.db, d.clock, stop);
    await d.worker.flush('manual');
    const again = (await timersOn(d.db))[0];
    await stopSleep(d, again?.id as string, again?.started_at as string);
    await d.worker.flush('manual');
    const live = (
      d.server as unknown as { activities: { deleted_at: string | null }[] }
    ).activities.filter(a => a.deleted_at === null);
    expect(live).toHaveLength(1);
  });
});

describe('Undo on a pump saved to the stash', () => {
  it('after it is sent: the container is discarded empty, the ledger balances, the timer returns', async () => {
    const d = await device();
    const started = await startTimer(d.db, d.clock, {
      ...ctx,
      childId: null,
      type: 'pump',
      startedAt: d.clock.iso(d.clock.now() - 20 * 60_000),
    });
    const timerId = started.entityIds[0] as string;
    await d.worker.flush('manual');
    const saved = await storePumpSession(d.db, d.clock, {
      ...ctx,
      startAt: d.clock.iso(d.clock.now() - 20 * 60_000),
      endAt: d.clock.iso(),
      leftMl: 60,
      rightMl: 60,
      totalOnlyMl: null,
      timerId,
      store: true,
    });
    await d.worker.flush('manual');
    const containerId = saved.containerIds[0] as string;
    expect(containerId).toBeTruthy();

    d.clock.advance(3_000); // the parent's three seconds before the toast's Undo
    expect(await undoWrite(d.db, d.clock, saved)).toBe('soft_deleted');
    const local = await d.db.get<{ status: string; amount_ml: number }>(
      'select status, amount_ml from milk_containers where id = ?',
      [containerId],
    );
    expect(local).toEqual({ status: 'DISCARDED', amount_ml: 0 });
    expect(await timersOn(d.db)).toHaveLength(1);

    await d.worker.flush('manual');
    expect(await d.db.all('select * from outbox where state = ?', ['FAILED'])).toEqual([]);
    const server = d.server as unknown as {
      milk_containers: { id: string; status: string; amount_ml: number }[];
    };
    const onServer = server.milk_containers.find(c => c.id === containerId);
    expect(onServer?.status).toBe('DISCARDED');
    expect(d.server.rowCount('running_timers')).toBe(1);
  });
});
