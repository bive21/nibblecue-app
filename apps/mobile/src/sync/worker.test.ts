/**
 * The outbox worker, against the real local database and the real fake server.
 *
 * Everything here runs in node against `node:sqlite` and `MockSyncApi`, with the clock, the
 * connection and the jitter injected — which is the point of the whole seam. "Kill the app
 * mid-flush and relaunch" is a new `OutboxWorker` over the same `Db`; "three of five got
 * through" is `abortAfterOps = 3`; "the response was lost" is `dropNextResponse()`. None of it
 * needs a device, a simulator or a hosted project, and all of it is the code the phone runs.
 *
 * The §9 scenario tags name the rows of `docs/OFFLINE_SYNC.md`'s matrix that are about the
 * CLIENT's half — what the queue does with an answer — where `mock-scenarios.test.ts` covers
 * what the server does with an op.
 */
import {
  MAX_ATTEMPTS,
  MAX_BATCH,
  STUCK_SENDING_MS,
  backoffDelayMs,
  deriveOpId,
  type Net,
  type OutboxRow,
  type PushOp,
  type SyncApi,
} from '@nibblecue/core';
import { afterEach, describe, expect, it } from 'vitest';
import { createAnalytics, type AnalyticsRecord } from '../analytics';
import { logActivity } from '../data/activities';
import { logBottleFromStash } from '../data/stash';
import { startTimer, stopTimer } from '../data/timers';
import type { Db } from '../db/driver';
import {
  CHILD_A,
  HOUSEHOLD,
  LOCATION,
  USER,
  seedContainer,
  seedHousehold,
} from '../testing/fixtures';
import type { FakeClock } from '../testing/clock';
import { MockSyncApi, MockSyncServer } from './providers/mock';
import { SyncFailure } from './providers/types';
import { replayQuarantined } from './replay';
import { syncBannerFrom, syncChipFrom } from './status';
import {
  bannerCodeOf,
  OutboxWorker,
  parkStranded,
  refusedByServer,
  WAITS_ON_PARKED,
  wireSafe,
  wireText,
  type SyncNotice,
  type SyncSnapshot,
  type WorkerHooks,
} from './worker';

const PARTNER = 'bbbbbbbb-0000-4000-8000-000000000002';
const CONTAINER = 'dddddddd-0000-4000-8000-0000000000c1';

interface Harness {
  db: Db;
  clock: FakeClock;
  server: MockSyncServer;
  api: SyncApi;
  /** The device's own `MockSyncApi`, for a test that needs to drive the transport by hand. */
  device: MockSyncApi;
  net: Net & { connected: boolean; reconnect(): void };
  events: AnalyticsRecord[];
  states: SyncSnapshot[];
  notices: SyncNotice[];
  /** A worker over this database. A second one is a relaunch after a kill. */
  worker(): OutboxWorker;
  /** The same worker over a transport the test controls, and any hooks it needs besides. */
  workerWith(api: SyncApi, extra?: Partial<WorkerHooks>): OutboxWorker;
  /** Every batch this harness has seen leave, in order. */
  batches: number[];
  restoreIds(): void;
}

async function harness(): Promise<Harness> {
  const seeded = await seedHousehold();
  const clock = seeded.clock;
  // The server's clock is the device's, one millisecond ahead per read: `now()` advances between
  // statements on a real server, and `app.sync_edit_clock` compares the client's edit clock
  // against it. A server clock frozen behind the device would reject every op CC422.
  let tick = 0;
  const server = new MockSyncServer({
    now: () => {
      tick += 1;
      return clock.now() + tick;
    },
  });
  server.addMember({ household_id: HOUSEHOLD, user_id: USER, role: 'OWNER' });
  server.addMember({ household_id: HOUSEHOLD, user_id: PARTNER, role: 'PARENT' });

  const batches: number[] = [];
  const device = new MockSyncApi(server, USER);
  const api: SyncApi = {
    push(ops: PushOp[]) {
      batches.push(ops.length);
      return device.push(ops);
    },
    pull: req => device.pull(req),
  };

  let connected = true;
  const reconnectListeners = new Set<() => void>();
  const net = {
    isConnected: () => Promise.resolve(connected),
    onReconnect(cb: () => void) {
      reconnectListeners.add(cb);
      return () => reconnectListeners.delete(cb);
    },
    get connected() {
      return connected;
    },
    set connected(value: boolean) {
      connected = value;
    },
    reconnect() {
      connected = true;
      for (const cb of [...reconnectListeners]) cb();
    },
  };

  const events: AnalyticsRecord[] = [];
  const analytics = createAnalytics(
    record => events.push(record),
    () => clock.now(),
  );
  const states: SyncSnapshot[] = [];
  const notices: SyncNotice[] = [];

  const build = (transport: SyncApi, extra: Partial<WorkerHooks> = {}) =>
    new OutboxWorker(seeded.db, transport, net, clock, {
      analytics: analytics.emit,
      onState: s => states.push(s),
      // Mid-window jitter, so every backoff assertion is an exact number.
      rng: () => 0.5,
      onNotice: n => notices.push(n),
      ...extra,
    });

  return {
    db: seeded.db,
    clock,
    server,
    api,
    device,
    net,
    events,
    states,
    notices,
    batches,
    restoreIds: seeded.restoreIds,
    worker: () => build(api),
    workerWith: build,
  };
}

let cleanup: (() => void) | null = null;
afterEach(() => {
  cleanup?.();
  cleanup = null;
});

async function setup(): Promise<Harness> {
  const h = await harness();
  cleanup = h.restoreIds;
  return h;
}

/** Let every already-queued microtask and immediate run, without moving the clock. */
const settle = (): Promise<void> => new Promise(resolve => setImmediate(resolve));

const rows = (db: Db): Promise<OutboxRow[]> =>
  db.all<OutboxRow>('select * from outbox order by seq asc', []);

const rowFor = async (db: Db, clientOpId: string): Promise<OutboxRow> => {
  const row = await db.get<OutboxRow>('select * from outbox where client_op_id = ?', [clientOpId]);
  if (row === undefined) throw new Error(`no outbox row ${clientOpId}`);
  return row;
};

const diaper = (h: Harness, salient: string, at?: string) =>
  logActivity(h.db, h.clock, {
    householdId: HOUSEHOLD,
    createdBy: USER,
    deviceId: 'device-1',
    source: 'quicklog',
    childId: CHILD_A,
    type: 'diaper',
    startAt: at ?? h.clock.iso(),
    detail: { kind: 'WET' },
    salient,
  });

/* ================================================================ state machine */

describe('the outbox state machine', () => {
  it('a thrown request returns the batch to PENDING with attempts UNCHANGED (D12)', async () => {
    const h = await setup();
    const written = await diaper(h, 'a');
    h.server.abortAfterOps = 0; // the connection drops before any op is applied

    const worker = h.worker();
    worker.start();
    const outcome = await worker.flush('manual');

    expect(outcome.stoppedBecause).toBe('transport');
    const row = await rowFor(h.db, written.opIds[0] as string);
    expect(row.state).toBe('PENDING');
    // Ten flaky minutes in a tunnel must never park a valid log as FAILED.
    expect(row.attempts).toBe(0);
    expect(row.sending_at).toBeNull();
    expect(row.next_attempt_at).not.toBeNull();
    expect(h.server.rowCount('activities')).toBe(0);
  });

  it('a CONFLICT increments attempts and backs off inside the expected window', async () => {
    const h = await setup();
    const written = await diaper(h, 'a');
    h.server.rejectNextWith('CONFLICT', 'someone else got there first');

    const worker = h.worker();
    worker.start();
    await worker.flush('manual');

    const row = await rowFor(h.db, written.opIds[0] as string);
    expect(row.state).toBe('PENDING');
    expect(row.attempts).toBe(1);
    expect(row.last_error).toBe('someone else got there first');
    // 0.5x-1.0x of a capped exponential base; rng is pinned at 0.5, so it is exactly 750 ms.
    const delay = Date.parse(row.next_attempt_at as string) - h.clock.now();
    expect(delay).toBe(backoffDelayMs(0, () => 0.5));
    expect(delay).toBeGreaterThanOrEqual(500);
    expect(delay).toBeLessThanOrEqual(1000);
  });

  it('a backed-off op is not sent again until its next_attempt_at has passed', async () => {
    const h = await setup();
    await diaper(h, 'a');
    h.server.rejectNextWith('CONFLICT', 'not yet');
    const worker = h.worker();
    worker.start();
    await worker.flush('manual');

    expect((await worker.flush('manual')).stoppedBecause).toBe('empty');
    h.clock.advance(1000);
    expect((await worker.flush('manual')).synced).toBe(1);
  });

  it('ten rejections park the op as FAILED and leave the local row untouched', async () => {
    const h = await setup();
    const written = await diaper(h, 'a');
    const worker = h.worker();
    worker.start();

    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      h.server.rejectNextWith('SERVER', 'the server fell over');
      await worker.flush('manual');
      h.clock.advance(600_000); // past any backoff
    }

    const row = await rowFor(h.db, written.opIds[0] as string);
    expect(row.state).toBe('FAILED');
    expect(row.attempts).toBe(MAX_ATTEMPTS - 1);
    // A FAILED op never deletes a parent's entry. The row is theirs.
    const activity = await h.db.get<{ id: string; deleted_at: string | null }>(
      'select id, deleted_at from activities where id = ?',
      [written.entityIds[0] as string],
    );
    expect(activity?.deleted_at).toBeNull();
    expect((await worker.counts()).failed).toBe(1);
  });

  it('retry clears the attempt count, because a person asking again is new information', async () => {
    const h = await setup();
    const written = await diaper(h, 'a');
    const worker = h.worker();
    worker.start();
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      h.server.rejectNextWith('SERVER', 'nope');
      await worker.flush('manual');
      h.clock.advance(600_000);
    }
    await worker.retry(written.opIds[0] as string);

    const row = await rowFor(h.db, written.opIds[0] as string);
    expect(row.state).toBe('PENDING');
    expect(row.attempts).toBe(0);
    expect(row.next_attempt_at).toBeNull();
    expect((await worker.flush('manual')).synced).toBe(1);
  });

  it('retry with no id retries everything that failed', async () => {
    const h = await setup();
    await diaper(h, 'a');
    await diaper(h, 'b');
    const worker = h.worker();
    worker.start();
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      h.server.rejectNextWith('VALIDATION', 'terminal'); // first op of each pass
      await worker.flush('manual');
      h.clock.advance(600_000);
    }
    expect((await worker.counts()).failed).toBeGreaterThan(0);
    await worker.retry();
    expect((await worker.counts()).failed).toBe(0);
  });

  it('a VALIDATION rejection is terminal at the first attempt', async () => {
    const h = await setup();
    const written = await diaper(h, 'a');
    h.server.rejectNextWith('VALIDATION', 'validation_error');
    const worker = h.worker();
    worker.start();
    await worker.flush('manual');
    expect((await rowFor(h.db, written.opIds[0] as string)).state).toBe('FAILED');
  });

  it('discard drops the OPERATION and keeps the ROW', async () => {
    const h = await setup();
    const written = await diaper(h, 'a');
    const worker = h.worker();
    worker.start();
    await worker.discard(written.opIds[0] as string);

    expect(await rows(h.db)).toHaveLength(0);
    const activity = await h.db.get<{ id: string }>('select id from activities where id = ?', [
      written.entityIds[0] as string,
    ]);
    expect(activity).toBeDefined();
  });

  it('does nothing at all when the phone is offline, and says so', async () => {
    const h = await setup();
    await diaper(h, 'a');
    h.net.connected = false;
    const worker = h.worker();
    worker.start();

    const outcome = await worker.flush('tick');
    expect(outcome).toMatchObject({ sent: 0, stoppedBecause: 'offline' });
    expect((await rowFor(h.db, (await rows(h.db))[0]?.client_op_id as string)).state).toBe(
      'PENDING',
    );
    expect(h.states.at(-1)?.connected).toBe(false);
  });

  it('does nothing when it has not been started, or has been stopped', async () => {
    const h = await setup();
    await diaper(h, 'a');
    const worker = h.worker();
    expect((await worker.flush('manual')).stoppedBecause).toBe('stopped');
    worker.start();
    worker.stop();
    expect((await worker.flush('manual')).stoppedBecause).toBe('stopped');
    expect(h.server.rowCount('activities')).toBe(0);
  });

  /*
    A WRITE THAT LANDS WHILE A PASS IS RUNNING IS SENT BY A FOLLOW-UP PASS, not by the next
    60-second tick (the owner, 2026-09-24, in Expo Go: "it says not sync or sync pending a lot").
    The second call still returns at once — nobody waits on a pass they did not start — but the
    worker owes one more pass and runs it when the first ends.
  */
  it('sends a write that commits after the last batch with one follow-up pass, not a tick', async () => {
    const h = await setup();
    await diaper(h, 'a');
    // `as`, not an annotation: assigned inside the hook below, which narrowing cannot see
    let second = null as { opIds: string[] } | null;
    let during = null as Awaited<ReturnType<OutboxWorker['flush']>> | null;
    const worker: OutboxWorker = new OutboxWorker(h.db, h.api, h.net, h.clock, {
      analytics: () => undefined as never,
      onState: () => undefined,
      rng: () => 0.5,
      // the tail of the pass: the queue is already empty when the second entry commits
      pullAfterPush: async () => {
        if (second !== null) return;
        second = await diaper(h, 'b', h.clock.iso(h.clock.now() + 60_000));
        during = await worker.flush('write');
      },
    });
    worker.start();
    await worker.flush('write');
    expect(during?.stoppedBecause).toBe('stopped');
    const op = second?.opIds[0] as string;
    // nothing calls flush again: the follow-up pass is the worker's own
    for (let i = 0; i < 20 && (await rowFor(h.db, op)).state !== 'SYNCED'; i++) await settle();
    expect((await rowFor(h.db, op)).state).toBe('SYNCED');
    expect(h.server.rowCount('activities')).toBe(2);
  });

  it('owes no follow-up once stopped', async () => {
    const h = await setup();
    await diaper(h, 'a');
    let second = false;
    const worker: OutboxWorker = new OutboxWorker(h.db, h.api, h.net, h.clock, {
      analytics: () => undefined as never,
      onState: () => undefined,
      rng: () => 0.5,
      pullAfterPush: async () => {
        if (second) return;
        second = true;
        await diaper(h, 'b', h.clock.iso(h.clock.now() + 60_000));
        void worker.flush('write');
        worker.stop();
      },
    });
    worker.start();
    await worker.flush('write');
    for (let i = 0; i < 5; i++) await settle();
    expect(h.server.rowCount('activities')).toBe(1);
  });

  it('flushes when the network comes back', async () => {
    const h = await setup();
    await diaper(h, 'a');
    h.net.connected = false;
    const worker = h.worker();
    worker.start();
    await worker.flush('manual');
    expect(h.server.rowCount('activities')).toBe(0);

    h.net.reconnect();
    await new Promise(resolve => setImmediate(resolve));
    expect(h.server.rowCount('activities')).toBe(1);
  });
});

/* ================================================================ §9 */

describe('@AT-07 an offline bottle from the stash reaches the server exactly once', () => {
  it('survives airplane mode, a kill and a relaunch', async () => {
    const h = await setup();
    await seedContainer(h.db, { id: CONTAINER, amountMl: 150 });
    h.server.addContainer({
      id: CONTAINER,
      householdId: HOUSEHOLD,
      ownerId: USER,
      locationId: LOCATION,
      ml: 150,
    });

    const tapTime = h.clock.iso();
    h.net.connected = false;
    const written = await logBottleFromStash(h.db, h.clock, {
      householdId: HOUSEHOLD,
      createdBy: USER,
      deviceId: 'device-1',
      source: 'quicklog',
      childId: CHILD_A,
      startAt: tapTime,
      consumedMl: 120,
    });
    expect(written.committed).toBe(true);

    // offline: the queue is full and the server is empty
    const doomed = h.worker();
    doomed.start();
    expect((await doomed.flush('write')).stoppedBecause).toBe('offline');
    expect(h.server.rowCount('activities')).toBe(0);

    // the app is killed with the ops still queued, then relaunched with a network
    h.clock.advance(4 * 3_600_000);
    h.net.connected = true;
    const relaunched = h.worker();
    relaunched.start();
    const outcome = await relaunched.flush('foreground');

    expect(outcome.synced).toBe(written.opIds.length);
    expect(h.server.rowCount('activities', { type: 'bottle' })).toBe(1);
    const activity = h.server.activities[0];
    // start_at is the tap time, not the flush time, four hours later.
    expect(activity?.['start_at']).toBe(tapTime);
    expect(h.server.detailRow(String(activity?.['id']), 'bottle_details')).not.toBeNull();
    const uses = h.server.milk_inventory_transactions.filter(r => r['kind'] === 'USE');
    expect(uses).toHaveLength(1);
    expect(uses[0]?.['delta_ml']).toBe(-120);

    for (const row of await rows(h.db)) expect(row.state).toBe('SYNCED');
    const local = await h.db.get<{ local_synced: number }>(
      'select local_synced from activities where id = ?',
      [written.activityId],
    );
    expect(local?.local_synced).toBe(1);
  });
});

describe('@AT-07a a lost response is replayed, not doubled', () => {
  it('re-sends the same client_op_id and takes `duplicate` as the success it is', async () => {
    const h = await setup();
    const written = await diaper(h, 'a');
    h.server.dropNextResponse();

    const worker = h.worker();
    worker.start();
    expect((await worker.flush('write')).stoppedBecause).toBe('transport');
    // the server DID apply it; only the answer was lost
    expect(h.server.rowCount('activities')).toBe(1);
    expect((await rowFor(h.db, written.opIds[0] as string)).attempts).toBe(0);

    h.clock.advance(5_000);
    const second = await worker.flush('tick');
    expect(second.synced).toBe(1);
    expect(h.server.rowCount('activities')).toBe(1);
    expect((await rowFor(h.db, written.opIds[0] as string)).state).toBe('SYNCED');

    // A duplicate is a success and is never shown to a parent: no toast, no notice.
    expect(h.notices).toEqual([]);
    const suppressed = h.events.filter(e => e.event === 'duplicate_suppressed');
    expect(suppressed).toHaveLength(1);
    expect(suppressed[0]?.props['layer']).toBe('server_idempotency');
  });
});

describe('@AT-07b a flush interrupted mid-batch', () => {
  it('reclaims what the killed process left in SENDING and lands one row per write', async () => {
    const h = await setup();
    for (const tag of ['a', 'b', 'c', 'd', 'e']) {
      await diaper(h, tag, h.clock.iso(h.clock.now() + tag.charCodeAt(0)));
    }

    // A KILL, not a failed request: three of the five reached the server and the process died
    // before any answer could be written down, so all five rows are still SENDING. A request
    // that merely FAILS takes the backoff path instead, which is the test above this one.
    const killed: SyncApi = {
      push: async ops => {
        await h.device.push(ops.slice(0, 3));
        return new Promise(() => undefined); // the process never gets an answer
      },
      pull: req => h.device.pull(req),
    };
    const doomed = h.workerWith(killed);
    doomed.start();
    void doomed.flush('write');
    await settle();
    expect(h.server.rowCount('activities')).toBe(3);
    expect((await rows(h.db)).every(r => r.state === 'SENDING')).toBe(true);

    const relaunched = h.worker();
    relaunched.start();
    const outcome = await relaunched.flush('foreground');

    expect(outcome.synced).toBe(5);
    expect(h.server.rowCount('activities')).toBe(5);
    for (const row of await rows(h.db)) expect(row.state).toBe('SYNCED');
  });

  it('does NOT reclaim an op created 90 s ago whose request left 2 s ago (D11)', async () => {
    // §8's sketch reclaims on `created_at`, which would cancel this row's own in-flight request
    // and send it twice. The clock that matters is `sending_at`.
    const h = await setup();
    const written = await diaper(h, 'a');
    const worker = h.worker();
    worker.start();
    await worker.flush('manual'); // drains the queue and settles `start()`'s reclaim

    const opId = written.opIds[0] as string;
    h.clock.advance(90_000);
    await h.db.run(
      `update outbox set state = 'SENDING', created_at = ?, sending_at = ? where client_op_id = ?`,
      [h.clock.iso(h.clock.now() - 90_000), h.clock.iso(h.clock.now() - 2_000), opId],
    );

    await worker.flush('tick');
    expect((await rowFor(h.db, opId)).state).toBe('SENDING');

    // and once it really has been sending too long, it comes back
    h.clock.advance(STUCK_SENDING_MS);
    await worker.flush('tick');
    expect((await rowFor(h.db, opId)).state).toBe('SYNCED');
  });
});

describe('@SYNC-DEPS a chain never sends an op ahead of what it depends on', () => {
  it('holds the ledger op back while its activity is still queued', async () => {
    const h = await setup();
    await seedContainer(h.db, { id: CONTAINER, amountMl: 150 });
    h.server.addContainer({
      id: CONTAINER,
      householdId: HOUSEHOLD,
      ownerId: USER,
      locationId: LOCATION,
      ml: 150,
    });
    const written = await logBottleFromStash(h.db, h.clock, {
      householdId: HOUSEHOLD,
      createdBy: USER,
      deviceId: 'device-1',
      source: 'quicklog',
      childId: CHILD_A,
      startAt: h.clock.iso(),
      consumedMl: 120,
    });
    const [activityOp, ledgerOp] = written.opIds as [string, string];
    expect((await rowFor(h.db, ledgerOp)).depends_on).toBe(activityOp);

    // The activity op is backed off into the future; its ledger row must wait, not overtake.
    await h.db.run('update outbox set next_attempt_at = ? where client_op_id = ?', [
      h.clock.iso(h.clock.now() + 60_000),
      activityOp,
    ]);
    const worker = h.worker();
    worker.start();
    expect((await worker.flush('manual')).stoppedBecause).toBe('empty');
    // the container's own seeded ADD row is the only ledger row there is
    expect(h.server.rowCount('milk_inventory_transactions', { kind: 'USE' })).toBe(0);
    expect((await rowFor(h.db, ledgerOp)).state).toBe('PENDING');

    h.clock.advance(60_000);
    await worker.flush('manual');
    expect(h.server.rowCount('activities')).toBe(1);
    expect(h.server.rowCount('milk_inventory_transactions', { kind: 'USE' })).toBe(1);
  });
});

describe('@SYNC-OVERDRAW the other caregiver got there first', () => {
  it('rewrites the draw as USE(what was left) + ADJUST(the shortfall), and keeps the feed', async () => {
    const h = await setup();
    await seedContainer(h.db, { id: CONTAINER, amountMl: 150 });
    h.server.addContainer({
      id: CONTAINER,
      householdId: HOUSEHOLD,
      ownerId: USER,
      locationId: LOCATION,
      ml: 150,
    });
    // the partner poured 120 ml from the same bag while this device was offline
    await new MockSyncApi(h.server, PARTNER).push([
      {
        client_op_id: deriveOpId(CONTAINER, 'partner'),
        entity: 'milk_txn',
        op: 'CREATE',
        entity_id: deriveOpId(CONTAINER, 'partner-row'),
        household_id: HOUSEHOLD,
        payload: {
          container_id: CONTAINER,
          kind: 'USE',
          delta_ml: -120,
          occurred_at: h.clock.iso(),
          created_by: PARTNER,
          client_edited_at: h.clock.iso(),
        },
      },
    ]);
    expect(h.server.milk_containers[0]?.['amount_ml']).toBe(30);

    const written = await logBottleFromStash(h.db, h.clock, {
      householdId: HOUSEHOLD,
      createdBy: USER,
      deviceId: 'device-1',
      source: 'quicklog',
      childId: CHILD_A,
      startAt: h.clock.iso(),
      consumedMl: 120,
    });
    const ledgerOp = written.opIds[1] as string;

    const worker = h.worker();
    worker.start();
    await worker.flush('write');

    // The rewrite is not a retry, so it does not wait for a backoff: the replacement ops are
    // picked up by the NEXT pass of the same flush and the queue is empty when it returns.
    // Four, not three, since the stash sweep of 2026-09-24: the rewrite empties the bag, so it
    // also closes it (a container patch ahead of the rewritten ledger rows) — without it the bag
    // came back from the next pull as a 0 oz bag in the stash (scenarios/stash.scenario.test.ts)
    const queued = await rows(h.db);
    expect(queued).toHaveLength(4);
    expect(queued.every(r => r.state === 'SYNCED')).toBe(true);
    expect(queued.filter(r => r.entity === 'container').map(r => r.op)).toEqual(['UPDATE']);
    expect(h.server.milk_containers[0]).toMatchObject({ amount_ml: 0, status: 'USED' });
    // the rewritten USE kept the rejected op's own derived key — it is a replacement in place,
    // which is what makes a second rewrite after a kill byte-identical — and consumed no attempt
    const use = queued.find(r => r.client_op_id === ledgerOp);
    expect(use?.attempts).toBe(0);

    // the local mirror reads the truth, not what this device believed when it poured
    const localUse = await h.db.get<{ delta_ml: number }>(
      'select delta_ml from milk_inventory_transactions where id = ?',
      [ledgerOp],
    );
    expect(localUse?.delta_ml).toBe(-30);
    const localAdjust = await h.db.get<{ n: number }>(
      "select count(*) as n from milk_inventory_transactions where kind = 'ADJUST'",
    );
    expect(localAdjust?.n).toBe(1);

    // this device's own ledger rows: not the partner's draw, and not the container's seeded ADD
    const ledger = h.server.milk_inventory_transactions.filter(
      r => r['created_by'] === USER && r['kind'] !== 'ADD',
    );
    expect(ledger.map(r => r['delta_ml']).sort((a, b) => Number(a) - Number(b))).toEqual([
      -90, -30,
    ]);
    expect(ledger.find(r => r['kind'] === 'ADJUST')?.['delta_ml']).toBe(-90);
    // the pair sums to what the parent actually poured
    expect(ledger.reduce((sum, r) => sum + Number(r['delta_ml']), 0)).toBe(-120);
    // the balance never goes negative and the number a parent reads never reads high
    expect(h.server.milk_containers[0]?.['amount_ml']).toBe(0);
    // THE FEED IS NEVER LOST TO FIX AN INVENTORY NUMBER
    expect(h.server.rowCount('activities', { type: 'bottle' })).toBe(1);
    expect(h.server.activities[0]?.['quantity']).toBe(120);
    for (const row of await rows(h.db)) expect(row.state).toBe('SYNCED');

    // one honest toast, once
    expect(h.notices).toEqual([
      { kind: 'stash_adjusted', containerId: CONTAINER, availableMl: 30, shortfallMl: 90 },
    ]);
  });
});

describe('@SYNC-TIMER-STOP2 two devices stop one timer', () => {
  async function stopTwice(h: Harness) {
    const timerId = deriveOpId(HOUSEHOLD, 'timer');
    const startedAt = h.clock.iso(h.clock.now() - 30 * 60_000);
    // the partner's device already stopped it and its activity is on the server
    await new MockSyncApi(h.server, PARTNER).push([
      {
        client_op_id: deriveOpId(timerId, 'partner-op'),
        entity: 'activity',
        op: 'CREATE',
        entity_id: deriveOpId(timerId, 'partner-activity'),
        household_id: HOUSEHOLD,
        payload: {
          child_id: CHILD_A,
          type: 'sleep',
          start_at: startedAt,
          end_at: h.clock.iso(h.clock.now() - 60_000),
          metadata: { timer_id: timerId },
          client_edited_at: h.clock.iso(),
          detail: { table: 'sleep_details', kind: 'NAP' },
        },
      },
    ]);

    await startTimer(h.db, h.clock, {
      householdId: HOUSEHOLD,
      createdBy: USER,
      deviceId: 'device-1',
      source: 'today',
      childId: CHILD_A,
      type: 'sleep',
      startedAt,
      timerId,
    });
    await h.db.run(`delete from outbox where entity = 'timer' and op = 'CREATE'`);
    return {
      timerId,
      stopped: await stopTimer(h.db, h.clock, {
        householdId: HOUSEHOLD,
        createdBy: USER,
        deviceId: 'device-1',
        source: 'today',
        childId: CHILD_A,
        timerId,
        type: 'sleep',
        startAt: startedAt,
        endAt: h.clock.iso(),
        detail: { kind: 'NAP' },
      }),
    };
  }

  it('the loser adopts the winner: one soft delete, in one transaction (D26)', async () => {
    const h = await setup();
    const { stopped } = await stopTwice(h);
    const loserId = stopped.entityIds[0] as string;

    const worker = h.worker();
    worker.start();
    await worker.flush('write');

    expect(h.server.rowCount('activities', { type: 'sleep' })).toBe(1);
    const local = await h.db.get<{ deleted_at: string | null; local_synced: number }>(
      'select deleted_at, local_synced from activities where id = ?',
      [loserId],
    );
    expect(local?.deleted_at).not.toBeNull();
    expect(local?.local_synced).toBe(1);
    // the detail row cannot be soft-deleted (the table has no `deleted_at`), so it goes with it
    const detail = await h.db.get<{ activity_id: string }>(
      'select activity_id from sleep_details where activity_id = ?',
      [loserId],
    );
    expect(detail).toBeUndefined();
    for (const row of await rows(h.db)) expect(row.state).toBe('SYNCED');
  });

  it('applying the adoption a second time changes nothing', async () => {
    const h = await setup();
    const { stopped } = await stopTwice(h);
    const loserId = stopped.entityIds[0] as string;
    const worker = h.worker();
    worker.start();
    await worker.flush('write');
    const first = await h.db.get<{ deleted_at: string }>(
      'select deleted_at from activities where id = ?',
      [loserId],
    );

    // the same answer arrives again — a replay after a kill, or a second pass
    h.clock.advance(60_000);
    await h.db.run(`update outbox set state = 'PENDING', sending_at = null`);
    await worker.flush('manual');

    const second = await h.db.get<{ deleted_at: string }>(
      'select deleted_at from activities where id = ?',
      [loserId],
    );
    expect(second?.deleted_at).toBe(first?.deleted_at);
    expect(h.server.rowCount('activities', { type: 'sleep' })).toBe(1);
  });
});

describe('@SYNC-1000 a thousand queued ops', () => {
  it('flushes in batches of at most fifty, exactly once each, without blocking a write', async () => {
    const h = await setup();
    const total = 1000;
    const base = h.clock.now();
    for (let i = 0; i < total; i++) {
      await diaper(h, `k-${i}`, h.clock.iso(base + i * 1000));
    }
    expect((await h.worker().counts()).pending).toBe(total);

    const worker = h.worker();
    worker.start();
    await settle(); // let start()'s reclaim and its first snapshot land
    const marks: number[] = [];
    const before = h.states.length;
    const started = performance.now();
    const outcome = await worker.flush('foreground');
    marks.push(performance.now() - started);

    expect(outcome.synced).toBe(total);
    expect(Math.max(...h.batches)).toBeLessThanOrEqual(MAX_BATCH);
    expect(h.batches).toHaveLength(total / MAX_BATCH);
    expect(h.server.rowCount('activities', { type: 'diaper' })).toBe(total);

    // The chip counts down. One snapshot per pass, each with fifty fewer ops owed than the last,
    // and one more when the pass ends — so twenty distinct values, never a rise.
    const during = h.states.slice(before).map(s => s.pending + s.sending);
    for (let i = 1; i < during.length; i++) {
      expect(during[i] as number).toBeLessThanOrEqual(during[i - 1] as number);
    }
    expect(new Set(during).size).toBe(total / MAX_BATCH);
    expect(during[0]).toBe(total - MAX_BATCH);
    expect(during.at(-1)).toBe(0);
    /*
      1000 ops in 20 passes: no single pass may stall the UI thread it shares.

      THE BUDGET IS DELIBERATELY AN ORDER OF MAGNITUDE LOOSE, because wall-clock here measures the
      machine as much as the flush. The same code on this container measures 6.0 ms a pass with
      nothing else running and 57.9 ms a pass while the other five turbo tasks share the box — a
      ten-fold spread from contention alone, and the old 50 ms budget sat inside it, so the
      assertion failed for load and passed for luck. A budget that flakes teaches a reader to
      re-run rather than to look, which is worse than no budget at all.

      What it is still worth catching is a REGRESSION IN SHAPE: a pass that reads the whole outbox
      instead of its own fifty, a snapshot that recounts every row, an await lost inside the loop.
      Each of those costs a factor, not a percentage — 250 ms a pass is forty times the idle cost
      and four times the worst load yet seen, which is the band those live in. The assertion
      message prints the measured figure, so a failure here says how far out it is.
    */
    expect((marks[0] as number) / (total / MAX_BATCH)).toBeLessThan(250);

    // and a write that lands DURING a flush is neither lost nor duplicated
    h.clock.advance(1000);
    const concurrent = Promise.all([diaper(h, 'during-1'), diaper(h, 'during-2')]);
    const [, written] = await Promise.all([worker.flush('tick'), concurrent]);
    await worker.flush('write');
    expect(written).toHaveLength(2);
    expect(h.server.rowCount('activities', { type: 'diaper' })).toBe(total + 2);
    expect((await worker.counts()).pending).toBe(0);
  }, 60_000);
});

/* ================================================================ what the banner reads */

/**
 * THE BANNER COMES BACK FROM THE OUTBOX ITSELF (the owner on staging, 2026-09-28: the chip said
 * "Not synced" and, once the app had restarted, nothing offered Try again). What a FAILED op was
 * refused for is kept on its row, and every snapshot the worker publishes — the first one of a
 * launch included — carries the reason the banner speaks for. And a run of requests that got no
 * answer is dated, so "We can't reach the server" is said for that and only for that.
 */
describe('what the banner reads from the queue', () => {
  const codeOf = async (db: Db, clientOpId: string) =>
    (
      await db.get<{ code: string | null }>(
        'select last_error_code as code from outbox where client_op_id = ?',
        [clientOpId],
      )
    )?.code;

  it('keeps a FAILED op’s refusal on its row, and a relaunch’s first snapshot says it', async () => {
    const h = await setup();
    const written = await diaper(h, 'a');
    h.server.rejectNextWith('FORBIDDEN', 'forbidden');
    const first = h.worker();
    first.start();
    await first.flush('manual');
    const op = written.opIds[0] as string;
    expect((await rowFor(h.db, op)).state).toBe('FAILED');
    expect(await codeOf(h.db, op)).toBe('FORBIDDEN');
    first.stop();

    // killed and opened again: nothing is in memory any more, only the outbox
    h.states.length = 0;
    const second = h.worker();
    second.start();
    await settle();
    expect(h.states.at(-1)).toMatchObject({ failed: 1, failedCode: 'FORBIDDEN' });
  });

  it('speaks for the failure a retry can help first: SERVER, then the entry, then the role', () => {
    expect(bannerCodeOf([])).toBeNull();
    expect(bannerCodeOf(['FORBIDDEN'])).toBe('FORBIDDEN');
    expect(bannerCodeOf(['FORBIDDEN', 'CONFLICT'])).toBe('CONFLICT');
    expect(bannerCodeOf(['FORBIDDEN', 'VALIDATION', 'CONFLICT'])).toBe('VALIDATION');
    expect(bannerCodeOf(['FORBIDDEN', 'VALIDATION', 'SERVER'])).toBe('SERVER');
    // a row an earlier build parked has no code: it reads as the server's, which offers Try again
    expect(bannerCodeOf([null])).toBe('SERVER');
    expect(bannerCodeOf(['FORBIDDEN', null])).toBe('SERVER');
    expect(bannerCodeOf(['something new'])).toBe('SERVER');
  });

  it('clears the code when the op goes through, and counts only what is still FAILED', async () => {
    const h = await setup();
    const written = await diaper(h, 'a');
    const op = written.opIds[0] as string;
    const worker = h.worker();
    worker.start();
    h.server.rejectNextWith('VALIDATION', 'validation_error');
    await worker.flush('manual');
    expect(h.states.at(-1)).toMatchObject({ failed: 1, failedCode: 'VALIDATION' });

    await worker.retry();
    expect(h.states.at(-1)).toMatchObject({ failed: 0, failedCode: null });
    expect((await worker.flush('manual')).synced).toBe(1);
    expect(await codeOf(h.db, op)).toBeNull();
  });

  it('dates a run of requests that got no answer, keeps the date while it lasts, and ends it at an answer', async () => {
    const h = await setup();
    await diaper(h, 'a');
    const worker = h.worker();
    worker.start();
    // the phone says it is online, and the server cannot be reached
    h.server.online = false;
    const t0 = h.clock.now();
    expect((await worker.flush('manual')).stoppedBecause).toBe('transport');
    expect(h.states.at(-1)).toMatchObject({ stalledSince: t0, stalledBy: 'network' });

    h.clock.advance(600_000); // past the backoff
    await worker.flush('tick');
    expect(h.states.at(-1)).toMatchObject({ stalledSince: t0, stalledBy: 'network' });

    h.server.online = true;
    h.clock.advance(600_000);
    expect((await worker.flush('tick')).synced).toBe(1);
    expect(h.states.at(-1)).toMatchObject({ stalledSince: null, stalledBy: null, pending: 0 });
  });

  it('calls a whole call the server refused the server’s, never the network’s', async () => {
    const h = await setup();
    await diaper(h, 'a');
    const refusing: SyncApi = {
      push: () =>
        Promise.reject(
          new SyncFailure('server', 'permission denied for function sync_push', 'FORBIDDEN', 403),
        ),
      pull: req => h.device.pull(req),
    };
    const worker = h.workerWith(refusing);
    worker.start();
    expect((await worker.flush('manual')).stoppedBecause).toBe('refused');
    expect(h.states.at(-1)).toMatchObject({ stalledSince: h.clock.now(), stalledBy: 'server' });
    // still owed — and, since 2026-09-29, a refusal is an answer: it costs the op an attempt, so it
    // cannot be sent and refused for the rest of the install (`refusedByServer`)
    expect((await rows(h.db))[0]).toMatchObject({ state: 'PENDING', attempts: 1 });
  });

  it('retries a call refused for the SESSION for free: a 401 is not about the ops', async () => {
    const h = await setup();
    await diaper(h, 'a');
    const expired: SyncApi = {
      push: () =>
        Promise.reject(
          new SyncFailure('server', 'permission denied for function sync_push', 'FORBIDDEN', 401),
        ),
      pull: req => h.device.pull(req),
    };
    const worker = h.workerWith(expired);
    worker.start();
    expect((await worker.flush('manual')).stoppedBecause).toBe('transport');
    expect(h.states.at(-1)).toMatchObject({ stalledBy: 'server' });
    expect((await rows(h.db))[0]).toMatchObject({ state: 'PENDING', attempts: 0 });
  });

  it('lets a run go when the phone goes offline: Offline is the chip’s own word', async () => {
    const h = await setup();
    await diaper(h, 'a');
    const worker = h.worker();
    worker.start();
    h.server.online = false;
    await worker.flush('manual');
    expect(h.states.at(-1)?.stalledSince).not.toBeNull();
    h.net.connected = false;
    await worker.flush('tick');
    expect(h.states.at(-1)).toMatchObject({ connected: false, stalledSince: null });
  });

  /**
   * A PULL ON TODAY SENDS WHAT IS WAITING (2026-09-28: the owner's "7 queued"). `dueNow` clears the
   * wait and nothing else: the op keeps the attempts it has spent, and a FAILED op is left for Try
   * again, which is the banner's.
   */
  it('a pull makes a backed-off op due at once, keeping its attempts, and leaves FAILED alone', async () => {
    const h = await setup();
    await diaper(h, 'a');
    await diaper(h, 'b');
    const worker = h.worker();
    worker.start();
    h.server.online = false;
    await worker.flush('manual');
    h.server.online = true;
    await h.db.run(`update outbox set state = 'FAILED' where client_op_id = ?`, [
      (await rows(h.db))[1]!.client_op_id,
    ]);
    const before = (await rows(h.db))[0]!;
    expect(before.next_attempt_at).not.toBeNull();
    // an ordinary pass leaves it waiting
    expect((await worker.flush('manual')).stoppedBecause).toBe('empty');
    await worker.dueNow();
    const after = await rows(h.db);
    expect(after[0]).toMatchObject({
      state: 'PENDING',
      next_attempt_at: null,
      attempts: before.attempts,
    });
    expect(after[1]).toMatchObject({ state: 'FAILED' });
    expect((await worker.flush('manual')).synced).toBe(1);
  });

  it('Try again sends a queue that is waiting out a backoff at once', async () => {
    const h = await setup();
    await diaper(h, 'a');
    const worker = h.worker();
    worker.start();
    h.server.online = false;
    await worker.flush('manual');
    h.server.online = true;
    // still inside its backoff: an ordinary pass leaves it waiting
    expect((await worker.flush('manual')).stoppedBecause).toBe('empty');
    await worker.retry();
    expect((await worker.flush('manual')).synced).toBe(1);
  });
});

/* ================================================================ refused for good (2026-09-29) */

/**
 * THE OWNER ON STAGING, 2026-09-29, IN THIS ORDER: "keeps showing 1 queued, in the beginning it
 * asks to try again server error thing", then "your role can't save this. (I am parent)".
 *
 * Three ways an op could sit owed for good, or be blamed on the wrong thing, each closed here:
 * a whole call the server refused was retried for ever at no cost; an op waiting on a parked op
 * was never sent and never parked; and a refusal of an op a sign-in brought back from a household
 * the account has left said the parent's role could not save it.
 */
describe('an op the server refuses for good is parked, never queued for ever', () => {
  const OTHER_HOUSEHOLD = 'aaaaaaaa-0000-4000-8000-00000000000f';
  const PAST_ANY_BACKOFF = 300_001;

  const codeOf = async (db: Db, clientOpId: string) =>
    (
      await db.get<{ code: string | null }>(
        'select last_error_code as code from outbox where client_op_id = ?',
        [clientOpId],
      )
    )?.code ?? null;

  /** A transport that refuses, as a whole call, every batch holding one of `bad`. */
  const refusingWhen = (h: Harness, bad: ReadonlySet<string>, sent: string[][] = []): SyncApi => ({
    push(ops: PushOp[]) {
      sent.push(ops.map(o => o.client_op_id));
      if (ops.some(o => bad.has(o.client_op_id))) {
        // what Postgres answers for a payload it cannot hold, before any op is applied
        return Promise.reject(
          new SyncFailure('server', 'unsupported Unicode escape sequence', 'SERVER', 400),
        );
      }
      return h.device.push(ops);
    },
    pull: req => h.device.pull(req),
  });

  const bottle = async (h: Harness): Promise<[string, string]> => {
    await seedContainer(h.db, { id: CONTAINER, amountMl: 150 });
    h.server.addContainer({
      id: CONTAINER,
      householdId: HOUSEHOLD,
      ownerId: USER,
      locationId: LOCATION,
      ml: 150,
    });
    const written = await logBottleFromStash(h.db, h.clock, {
      householdId: HOUSEHOLD,
      createdBy: USER,
      deviceId: 'device-1',
      source: 'quicklog',
      childId: CHILD_A,
      startAt: h.clock.iso(),
      consumedMl: 120,
    });
    return written.opIds as [string, string];
  };

  it('tells a refusal of the ops from no answer, and from the session', () => {
    expect(refusedByServer(new SyncFailure('server', 'no', 'SERVER', 400))).toBe(true);
    expect(refusedByServer(new SyncFailure('server', 'no', 'FORBIDDEN', 403))).toBe(true);
    expect(refusedByServer(new SyncFailure('server', 'no', 'SERVER', 500))).toBe(true);
    // a status the provider did not know: still the server's answer
    expect(refusedByServer(new SyncFailure('server', 'no', 'SERVER'))).toBe(true);
    // an answer this phone could not read at all is the server's too
    expect(refusedByServer(new TypeError('results.0: expected object'))).toBe(true);
    // the session, or a gateway asking for patience: not about the ops
    for (const status of [401, 408, 429]) {
      expect(refusedByServer(new SyncFailure('server', 'no', 'FORBIDDEN', status))).toBe(false);
    }
    expect(refusedByServer(new SyncFailure('transport', 'dropped'))).toBe(false);
    expect(refusedByServer(new SyncFailure('offline'))).toBe(false);
  });

  it('a call refused every time costs its op an attempt a pass, and parks it after MAX_ATTEMPTS', async () => {
    const h = await setup();
    const op = (await diaper(h, 'a')).opIds[0] as string;
    const worker = h.workerWith(refusingWhen(h, new Set([op])));
    worker.start();
    for (let spent = 1; spent < MAX_ATTEMPTS; spent++) {
      expect((await worker.flush('tick')).stoppedBecause).toBe('refused');
      expect(await rowFor(h.db, op)).toMatchObject({ state: 'PENDING', attempts: spent });
      // owed while it still has attempts: the chip says so, and the stall is the server's
      expect(h.states.at(-1)).toMatchObject({ pending: 1, failed: 0, stalledBy: 'server' });
      h.clock.advance(PAST_ANY_BACKOFF);
    }
    await worker.flush('tick');
    expect((await rowFor(h.db, op)).state).toBe('FAILED');
    expect(await codeOf(h.db, op)).toBe('SERVER');
    // PARKED: no longer counted as queued. Its failure is the snapshot's, and — past the grace the
    // status store gives a young one — the chip says "Not synced" and the banner offers Try again
    const last = h.states.at(-1) as SyncSnapshot;
    expect(last).toMatchObject({ pending: 0, sending: 0, failed: 1, failedCode: 'SERVER' });
    expect(syncChipFrom(last, h.clock.now())).toEqual({ state: 'error', count: 1 });
    expect(syncBannerFrom(last, h.clock.now())).toEqual({ kind: 'server', needsPerson: true });
    // and Try again starts its count again
    await worker.retry();
    expect(await rowFor(h.db, op)).toMatchObject({ state: 'PENDING', attempts: 0 });
  });

  it('one op the server cannot take no longer holds the rest: each goes on its own', async () => {
    const h = await setup();
    const a = (await diaper(h, 'a')).opIds[0] as string;
    const b = (await diaper(h, 'b')).opIds[0] as string;
    const c = (await diaper(h, 'c')).opIds[0] as string;
    const sent: string[][] = [];
    const worker = h.workerWith(refusingWhen(h, new Set([b]), sent));
    worker.start();
    const outcome = await worker.flush('manual');
    // the batch of three was refused whole, and then sent one by one
    expect(sent).toEqual([[a, b, c], [a], [b], [c]]);
    expect(outcome).toMatchObject({ synced: 2, failed: 0 });
    expect((await rowFor(h.db, a)).state).toBe('SYNCED');
    expect((await rowFor(h.db, c)).state).toBe('SYNCED');
    // only the op the server refused pays for it
    expect(await rowFor(h.db, b)).toMatchObject({ state: 'PENDING', attempts: 1 });
    expect(h.server.rowCount('activities')).toBe(2);
  });

  it('an op whose dependency rode in a refused batch waits, unpaid, until that goes through', async () => {
    const h = await setup();
    const [feed, draw] = await bottle(h);
    const refusing = new Set([feed]);
    const worker = h.workerWith(refusingWhen(h, refusing));
    worker.start();
    await worker.flush('manual');
    expect(await rowFor(h.db, feed)).toMatchObject({ state: 'PENDING', attempts: 1 });
    // never sent on its own ahead of the feed it draws for, and charged nothing for waiting
    expect(await rowFor(h.db, draw)).toMatchObject({ state: 'PENDING', attempts: 0 });
    expect(h.server.rowCount('milk_inventory_transactions', { kind: 'USE' })).toBe(0);

    // the server takes it after all: both go, in order
    refusing.clear();
    h.clock.advance(PAST_ANY_BACKOFF);
    await worker.flush('tick');
    expect((await rowFor(h.db, feed)).state).toBe('SYNCED');
    expect((await rowFor(h.db, draw)).state).toBe('SYNCED');
    expect(h.server.rowCount('milk_inventory_transactions', { kind: 'USE' })).toBe(1);
  });

  it('an op waiting on a parked op is parked with it, carries its code, and comes back with Try again', async () => {
    const h = await setup();
    const [feed, draw] = await bottle(h);
    // the feed was refused earlier and is parked; the draw that waits on it was left behind
    await h.db.run(
      `update outbox set state = 'FAILED', last_error = 'forbidden', last_error_code = 'FORBIDDEN'
        where client_op_id = ?`,
      [feed],
    );
    const worker = h.worker();
    worker.start();
    expect((await worker.flush('manual')).stoppedBecause).toBe('empty');
    // it used to sit PENDING for good — "1 queued" — and Try again never saw it
    expect(await rowFor(h.db, draw)).toMatchObject({
      state: 'FAILED',
      attempts: 0,
      last_error: WAITS_ON_PARKED,
    });
    expect(await codeOf(h.db, draw)).toBe('FORBIDDEN');
    expect(h.states.at(-1)).toMatchObject({ pending: 0, failed: 2, failedCode: 'FORBIDDEN' });

    // Try again puts both back, and they go together, in order
    await worker.retry();
    expect((await worker.flush('manual')).synced).toBe(2);
    expect(h.server.rowCount('milk_inventory_transactions', { kind: 'USE' })).toBe(1);
  });

  it('a parked op goes back to the queue the moment what it waits on is no longer parked', async () => {
    const h = await setup();
    const [feed, draw] = await bottle(h);
    await h.db.run(
      `update outbox set state = 'FAILED', last_error_code = 'SERVER' where client_op_id = ?`,
      [feed],
    );
    await h.db.tx(t => parkStranded(t));
    expect((await rowFor(h.db, draw)).state).toBe('FAILED');
    // the inspector retries the feed alone: the draw follows it without being asked
    const worker = h.worker();
    worker.start();
    await worker.retry(feed);
    expect((await worker.flush('manual')).synced).toBe(2);
    expect((await rowFor(h.db, draw)).state).toBe('SYNCED');
  });

  it('a refusal of an op from a household this account has left says so, not "your role"', async () => {
    const h = await setup();
    // a sign-in brought back what a sign-out kept: one entry of a household left since (`replay.ts`)
    const at = h.clock.iso();
    const replayed = {
      client_op_id: deriveOpId(OTHER_HOUSEHOLD, 'op'),
      entity: 'activity',
      op: 'CREATE',
      entity_id: deriveOpId(OTHER_HOUSEHOLD, 'row'),
      household_id: OTHER_HOUSEHOLD,
      payload: JSON.stringify({
        type: 'diaper',
        child_id: null,
        start_at: at,
        client_edited_at: at,
        detail: { table: 'diaper_details', kind: 'WET' },
      }),
      depends_on: null,
      seq: 1,
      created_at: at,
      state: 'PENDING',
      attempts: 0,
      next_attempt_at: null,
      sending_at: null,
      last_error: null,
    };
    expect((await replayQuarantined(h.db, [replayed])).replayed).toBe(1);
    const here = h.workerWith(h.api, { householdId: HOUSEHOLD });
    here.start();
    await here.flush('manual');
    // the server refuses it whatever the person is here: this account is not in that household
    expect((await rowFor(h.db, replayed.client_op_id)).state).toBe('FAILED');
    expect(await codeOf(h.db, replayed.client_op_id)).toBe('FORBIDDEN');
    const last = h.states.at(-1) as SyncSnapshot;
    expect(last).toMatchObject({ failed: 1, failedCode: 'FORBIDDEN', failedElsewhere: true });
    // the banner says where the entries belong, asks nothing, and blames no role
    expect(syncBannerFrom(last, h.clock.now())).toEqual({ kind: 'elsewhere', needsPerson: false });

    // a refusal in THIS household is still about the role here
    const mine = (await diaper(h, 'a')).opIds[0] as string;
    h.server.rejectNextWith('FORBIDDEN', 'forbidden');
    await here.flush('manual');
    expect((await rowFor(h.db, mine)).state).toBe('FAILED');
    const both = h.states.at(-1) as SyncSnapshot;
    expect(both).toMatchObject({ failed: 2, failedCode: 'FORBIDDEN', failedElsewhere: false });
    expect(syncBannerFrom(both, h.clock.now())).toEqual({ kind: 'permission', needsPerson: true });
  });

  it('with no household to compare, a role refusal reads as this household’s, as before', async () => {
    const h = await setup();
    const op = (await diaper(h, 'a')).opIds[0] as string;
    h.server.rejectNextWith('FORBIDDEN', 'forbidden');
    const worker = h.worker();
    worker.start();
    await worker.flush('manual');
    expect((await rowFor(h.db, op)).state).toBe('FAILED');
    expect(h.states.at(-1)).toMatchObject({ failedCode: 'FORBIDDEN', failedElsewhere: false });
  });

  it('sends text the server can hold: no NUL, and no half of an emoji', async () => {
    expect(wireText('plain')).toBe('plain');
    expect(wireText('moon 🌙 ok')).toBe('moon 🌙 ok');
    expect(wireText('a\u0000b')).toBe('ab');
    // an emoji cut by a length limit keeps its place as the replacement character
    expect(wireText('Fridge\ud83e')).toBe('Fridge\ufffd');
    expect(wireText('\udd76 left')).toBe('\ufffd left');
    expect(wireSafe({ n: 3, ok: true, none: null, deep: [{ notes: 'x\u0000\ud83c' }] })).toEqual({
      n: 3,
      ok: true,
      none: null,
      deep: [{ notes: 'x\ufffd' }],
    });

    const h = await setup();
    const pushed: PushOp[] = [];
    const watching: SyncApi = {
      push(ops: PushOp[]) {
        pushed.push(...ops);
        return h.device.push(ops);
      },
      pull: req => h.device.pull(req),
    };
    await logActivity(h.db, h.clock, {
      householdId: HOUSEHOLD,
      createdBy: USER,
      deviceId: 'device-1',
      source: 'quicklog',
      childId: CHILD_A,
      type: 'diaper',
      startAt: h.clock.iso(),
      detail: { kind: 'WET' },
      notes: 'rash\u0000 cream 🧴 then\ud83e',
    });
    const worker = h.workerWith(watching);
    worker.start();
    expect((await worker.flush('manual')).synced).toBe(1);
    expect(pushed[0]?.payload['notes']).toBe('rash cream 🧴 then\ufffd');
  });
});
