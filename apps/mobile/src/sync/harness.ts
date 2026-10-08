/**
 * One fixture for the whole §9 matrix: a deterministic clock, a seeded `rng`, a real local
 * database over `node:sqlite`, a real fake server, and a `restore()` that puts the device back
 * to a just-installed state. **Test-only** (see `../testing/local-db.ts` and `no-bundle.test.ts`).
 *
 * Why it exists, given that `worker.test.ts` and `mock-scenarios.test.ts` each built their own:
 * those two prove the worker and the server in isolation, and each set up exactly what it
 * needed. The §9 matrix is the end-to-end row — a parent taps, the queue holds it, the network
 * comes back, the server answers — so it needs the local stack and the transport in ONE object,
 * with the same clock behind both. Two clocks that drift by a minute make `app.sync_edit_clock`
 * reject every op, and the failure reads as a scenario bug rather than as a harness bug.
 *
 * THE SERVER'S CLOCK TICKS, and the device's does not, for the reason `worker.test.ts:68-71`
 * and `mock-scenarios.test.ts` both record: `now()` and `app.touch()` advance between statements
 * on a real server, so a field edited a millisecond after its row was created must win the
 * per-field comparison. A frozen server clock would make `mergeFields` drop that edit here while
 * Postgres keeps it, and the shared scenario table would stop being shared.
 *
 * `restore()` CLEARS `dedupe_keys` EXPLICITLY. The duplicate guard is a table rather than a
 * module-global `Map` precisely because the prototype's was a `Map` and leaked between screens
 * (`docs/UX_AUDIT.md` §4.62); a harness that reset "the database" by dropping the mirror and
 * forgetting the local-only tables would reintroduce exactly that leak inside the test suite,
 * where it reads as a flaky scenario. `harness.test.ts` asserts the clearing directly, and
 * asserts it the only way that means anything: a write that WAS suppressed is accepted again.
 */
import { deriveOpId, type Clock, type Net, type PushOp, type SyncApi } from '@nibblecue/core';
import type { ScenarioCtx, ServerProbe } from '@nibblecue/core/sync/scenarios';
import { createAnalytics, type AnalyticsRecord } from '../analytics';
import { setIdSource } from '../data/ids';
import type { Db } from '../db/driver';
import { LOCAL_ONLY_TABLES, MIRRORED_TABLES } from '../db/schema';
import { FakeClock } from '../testing/clock';
import { openTestDb } from '../testing/local-db';
import {
  CHILD_A,
  CHILD_B,
  HOUSEHOLD,
  LOCATION,
  USER,
  seedContainer,
  seedHousehold,
  seededIds,
} from '../testing/fixtures';
import { MockSyncApi, MockSyncServer } from './providers/mock';
import { PullEngine } from './pull';
import { mockProbe } from './providers/mock-probe';
import { OutboxWorker, type SyncNotice, type SyncSnapshot } from './worker';

/** The second caregiver: a second identity on a second device, never a second session. */
export const PARTNER = 'bbbbbbbb-0000-4000-8000-000000000002';
/** The container every stash scenario draws from. */
export const CONTAINER = 'dddddddd-0000-4000-8000-0000000000c1';
export const CONTAINER_ML = 150;

/**
 * The scenario table's clock is anchored in the past on purpose, and the anchor is copied from
 * `packages/db/src/integration/sync-scenarios.test.ts` so both backends run the same instants.
 * `@SYNC-1000` walks a thousand one-second steps; started at a wall clock it would finish
 * sixteen minutes in the future, where `app.sync_edit_clock` rejects every op CC422 — correctly,
 * and uselessly.
 */
export const HARNESS_EPOCH = '2026-03-02T10:00:00.000Z';

/**
 * Where the SERVER's clock stands, and it is deliberately months ahead of the device's.
 *
 * `app.sync_edit_clock` rejects an op whose `client_edited_at` is more than five minutes AHEAD
 * of the server (CC422), and accepts one that is behind by any amount — a phone that has been
 * in a drawer for a week is a normal phone. Against Postgres the server's clock is the real
 * `now()` while the scenario table's is anchored in the past, so every scenario runs far behind
 * the server; `sync-scenarios.test.ts` and `mock-scenarios.test.ts` both encode that. A fake
 * whose clock tracked the DEVICE's would not: `@SYNC-1000` walks a thousand one-second steps,
 * its later ops are minted minutes ahead of the instant the harness started, and the fake would
 * reject three hundred of them while Postgres applied all thousand. That is the fake disagreeing
 * with the server about a rule, which is the one thing this pair exists to prevent.
 */
export const SERVER_EPOCH = '2026-09-14T08:00:00.000Z';

/** The namespace the deterministic ids derive from. Arbitrary, fixed, and never renamed. */
const SEED_NS = '5f9a1c3e-8b24-4d7a-9e06-1c2b3a4d5e6f';

export interface HarnessOptions {
  /** Where the device's clock starts. */
  at?: string;
  /** The tag the scenario's uuids derive from, so two scenarios never mint the same row id. */
  scenario?: string;
  /** The seeded `rng`'s seed. The default puts every backoff in the middle of its window. */
  rngSeed?: number;
  /** Seed the stash with a container holding `CONTAINER_ML`. Default true. */
  stash?: boolean;
}

/** A controllable `Net`: the airplane switch every offline row of §9 flips. */
export interface TestNet extends Net {
  connected: boolean;
  /** Come back online and tell the worker about it, as NetInfo would. */
  reconnect(): void;
}

export interface SyncHarness {
  db: Db;
  clock: FakeClock;
  /**
   * A seeded pseudo-random source. The worker takes it for backoff jitter; a fixture that needs
   * an arbitrary-but-stable number takes it too, so no test ever calls `Math.random()`.
   */
  rng(): number;
  server: MockSyncServer;
  /** This device's transport. Every batch it sends is recorded in `batches`. */
  api: SyncApi;
  net: TestNet;
  /** The sizes of the batches this device has sent, in order. `@SYNC-1000` reads it. */
  batches: number[];
  events: AnalyticsRecord[];
  states: SyncSnapshot[];
  notices: SyncNotice[];
  /**
   * A worker over this database and this transport. A second call is a relaunch after a kill.
   * `over` substitutes a wrapped `Db` — the budget test passes an instrumented one so it can
   * time what a flush pass holds the database for, which is a claim about the queue and can
   * only be measured from inside the seam the queue writes through.
   */
  worker(over?: Db): OutboxWorker;
  /** The scenario table's context, and the probe that reads the server. */
  ctx: ScenarioCtx;
  probe: ServerProbe;
  /** Deterministic uuids for this harness, the same source `ctx.uuid` uses. */
  uuid(tag: string): string;
  /**
   * Back to a just-installed device: every local table empty — `dedupe_keys` INCLUDED — and a
   * freshly seeded household. The server keeps what it has, because a restore is a device being
   * wiped, not a household being deleted.
   */
  restore(): Promise<void>;
  /** Put the platform id source back. Every harness must be disposed in an `afterEach`. */
  dispose(): void;
}

/** A tiny deterministic PRNG (mulberry32). Seeded, so a jittered backoff is an exact number. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The clock the local write path takes, over the fake one. */
const clockOf = (c: FakeClock): Clock => c;

export async function createSyncHarness(options: HarnessOptions = {}): Promise<SyncHarness> {
  const scenario = options.scenario ?? 'harness';
  const seeded = await seedHousehold({ idPrefix: 'eeeeeeee' });
  const clock = new FakeClock(options.at ?? HARNESS_EPOCH);
  // The device's clock does not move by itself; the server's moves one millisecond per read,
  // because `now()` and `app.touch()` advance between statements on a real server. It is also
  // never allowed to fall behind the device — see SERVER_EPOCH.
  let serverTicks = Date.parse(SERVER_EPOCH);
  const server = new MockSyncServer({
    now: () => {
      serverTicks = Math.max(serverTicks + 1, clock.now() + 1);
      return serverTicks;
    },
  });
  server.addMember({ household_id: HOUSEHOLD, user_id: USER, role: 'OWNER' });
  // The partner is a PARENT rather than a CAREGIVER because `@SYNC-DELETE-EDIT` has them
  // correcting and deleting an entry the owner created, which `activities_update` allows only
  // for OWNER and PARENT.
  server.addMember({ household_id: HOUSEHOLD, user_id: PARTNER, role: 'PARENT' });
  server.addChild({ id: CHILD_A, household_id: HOUSEHOLD, name: 'Emma' });
  server.addChild({ id: CHILD_B, household_id: HOUSEHOLD, name: 'Liam' });
  server.addLocation({ id: LOCATION, household_id: HOUSEHOLD, name: 'Fridge', kind: 'FRIDGE' });
  if (options.stash !== false) {
    server.addContainer({
      id: CONTAINER,
      householdId: HOUSEHOLD,
      ownerId: USER,
      locationId: LOCATION,
      ml: CONTAINER_ML,
    });
    await seedContainer(seeded.db, { id: CONTAINER, amountMl: CONTAINER_ML });
  }

  const rng = mulberry32(options.rngSeed ?? 0x5eed);
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
  const net: TestNet = {
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

  const uuid = (tag: string): string => deriveOpId(SEED_NS, `${scenario}:${tag}`);

  const ctx: ScenarioCtx = {
    householdId: HOUSEHOLD,
    childId: CHILD_A,
    otherChildId: CHILD_B,
    userId: USER,
    otherUserId: PARTNER,
    containerId: CONTAINER,
    containerMl: CONTAINER_ML,
    locationId: LOCATION,
    otherDevice: new MockSyncApi(server, PARTNER),
    uuid,
    now: () => clock.now(),
    iso: (at?: number) => clock.iso(at),
  };

  const harness: SyncHarness = {
    db: seeded.db,
    clock,
    rng,
    server,
    api,
    net,
    batches,
    events,
    states,
    notices,
    ctx,
    probe: mockProbe(server),
    uuid,
    worker: (over?: Db) => {
      const target = over ?? seeded.db;
      // The pull engine is wired into the worker exactly as `SyncEngine` wires it: a flush pass
      // ends by pulling back the tables it wrote to. Without it a merged timer would leave this
      // phone with no running timer at all until the next tick, which is not the behavior
      // §9's "loser shows Timer merged; no data loss" describes — and the composition is the
      // thing these rows exist to prove.
      const puller = new PullEngine({
        db: target,
        api,
        clock: clockOf(clock),
        householdId: HOUSEHOLD,
        userId: USER,
      });
      return new OutboxWorker(target, api, net, clockOf(clock), {
        analytics: analytics.emit,
        onState: s => states.push(s),
        rng,
        onNotice: n => notices.push(n),
        pullAfterPush: tables => puller.pullTables(tables).then(() => undefined),
      });
    },
    restore: async () => {
      await clearLocalDb(seeded.db);
      // A fresh id source, so a restored device mints the same ids the first one did — which is
      // what makes a scenario repeatable rather than merely re-runnable.
      setIdSource(seededIds('eeeeeeee'));
      await reseed(seeded.db, options.stash !== false);
      events.length = 0;
      states.length = 0;
      notices.length = 0;
      batches.length = 0;
    },
    dispose: seeded.restoreIds,
  };
  return harness;
}

/** A second phone in the same household: its own database and its own queue, one server. */
export interface SecondDevice {
  db: Db;
  api: SyncApi;
  userId: string;
  worker(): OutboxWorker;
}

/**
 * The other caregiver's phone (§9 row 17c, and every "two devices" row of the matrix).
 *
 * It gets its OWN `Db`, because that is the only way a two-device scenario is honest: one
 * database with two workers would share the outbox, the duplicate guard and the mirror, which
 * is precisely the state that must not be shared. It does NOT take the id source — writes on
 * this device pass their ids explicitly — because the source is a module global and a second
 * seeding would repoint the first device's.
 */
export async function addDevice(
  h: SyncHarness,
  userId: string,
  options: { stash?: boolean } = {},
): Promise<SecondDevice> {
  const { db } = await openTestDb();
  await reseed(db, options.stash !== false);
  const api = new MockSyncApi(h.server, userId);
  const net: Net = {
    isConnected: () => Promise.resolve(true),
    onReconnect: () => () => undefined,
  };
  // This phone's events go nowhere: the assertions about analytics are about THIS device, and
  // two devices sharing one event list would make "emitted once" unreadable.
  const quiet = createAnalytics(
    () => undefined,
    () => h.clock.now(),
  );
  return {
    db,
    api,
    userId,
    worker: () =>
      new OutboxWorker(db, api, net, clockOf(h.clock), {
        analytics: quiet.emit,
        onState: () => undefined,
        rng: h.rng,
      }),
  };
}

/**
 * Empty every local table. `dedupe_keys` is named by `LOCAL_ONLY_TABLES` rather than by a list
 * written here, so a table added to the schema in WP5 cannot be forgotten by this function —
 * `harness.test.ts` asserts the two lists are the ones the schema exports.
 */
export async function clearLocalDb(db: Db): Promise<void> {
  await db.tx(async t => {
    for (const table of [...MIRRORED_TABLES, ...LOCAL_ONLY_TABLES]) {
      await t.run(`delete from ${table}`);
    }
  });
}

const AT = '2026-09-14T08:00:00.000Z';

/** The seed of `testing/fixtures.ts`, re-applied after a wipe. */
async function reseed(db: Db, withStash: boolean): Promise<void> {
  await db.run(
    'insert into profiles (id, display_name, email, created_at, updated_at) values (?, ?, ?, ?, ?)',
    [USER, 'Dana', null, AT, AT],
  );
  await db.run(
    'insert into households (id, name, owner_id, home_time_zone, created_at, updated_at) values (?, ?, ?, ?, ?, ?)',
    [HOUSEHOLD, 'The Rivera house', USER, 'America/Los_Angeles', AT, AT],
  );
  for (const [id, name] of [
    [CHILD_A, 'Emma'],
    [CHILD_B, 'Liam'],
  ] as const) {
    await db.run(
      'insert into children (id, household_id, name, birth_date, created_at, updated_at) values (?, ?, ?, ?, ?, ?)',
      [id, HOUSEHOLD, name, '2026-06-01', AT, AT],
    );
  }
  await db.run(
    'insert into storage_locations (id, household_id, name, kind, sort_order, is_default) values (?, ?, ?, ?, ?, ?)',
    [LOCATION, HOUSEHOLD, 'Fridge', 'FRIDGE', 0, 1],
  );
  if (withStash) await seedContainer(db, { id: CONTAINER, amountMl: CONTAINER_ML });
}
