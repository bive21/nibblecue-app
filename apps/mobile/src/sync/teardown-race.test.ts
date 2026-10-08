/**
 * The teardown race (docs/ACCOUNTS.md §4; WP4.9).
 *
 * Sign-out deletes the database file. A flush or a pull that reaches `openLocalDb` after that
 * moment silently RECREATES it — the handle is memoized, so no error is raised and nothing is
 * logged — and §4's acceptance rule ("the app container contains no file matching the DB name")
 * becomes quietly false, with one household's rows sitting in a file the next signed-in user's
 * app will happily open. Nothing in the app fails when that happens, which is why it is a test.
 *
 * Everything here is the shipped code: `runTeardown` itself, `outboxTeardown()`'s late binding,
 * `db/latch.ts`'s latch (the half of `openLocalDb` with no native dependency), and a real
 * `OutboxWorker` over a real SQLite database with a real queued op in it. Only the file system
 * is a stand-in, because `expo-file-system` does not load in node — and the stand-in is wired
 * the way `closeAndDeleteLocalDb` is wired, latch first.
 */
import type { Net, SyncApi } from '@nibblecue/core';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createAnalytics } from '../analytics';
import { runTeardown, type TeardownDeps } from '../auth/teardown';
import { logActivity } from '../data/activities';
import { counts as outboxCounts, pending as outboxPending } from '../data/outbox';
import {
  allowReopen,
  assertCanOpen,
  localDbStopped,
  LocalDbStoppedError,
  stopLocalDb,
} from '../db/latch';
import type { Db } from '../db/driver';
import { CHILD_A, HOUSEHOLD, seedHousehold, USER, type Fixture } from '../testing/fixtures';
import { MockSyncApi, MockSyncServer } from './providers/mock';
import { outboxTeardown, setSyncRuntime, stopSyncForTeardown } from './status';
import { OutboxWorker } from './worker';

let fixture: Fixture | null = null;
afterEach(() => {
  fixture?.restoreIds();
  fixture = null;
  setSyncRuntime(null);
  allowReopen();
});

const online: Net = { isConnected: async () => true, onReconnect: () => () => undefined };

/** A transport that never answers: the flush that is still in flight when sign-out begins. */
const hangs: SyncApi = {
  push: () => new Promise(() => undefined),
  pull: () => new Promise(() => undefined),
};

interface Harness {
  db: Db;
  worker: OutboxWorker;
  deps: TeardownDeps;
  /** Stands in for the SQLite file and its -wal/-shm siblings. */
  fileExists(): boolean;
  quarantined: unknown[][];
  paused: number;
}

async function harness(api: SyncApi): Promise<Harness> {
  fixture = await seedHousehold({ idPrefix: 'aaaabbbb' });
  const { db, clock } = fixture;
  const worker = new OutboxWorker(db, api, online, clock, {
    analytics: createAnalytics(() => undefined).emit,
    onState: () => undefined,
  });
  worker.start();

  let file = true;
  const h: Harness = {
    db,
    worker,
    fileExists: () => file,
    quarantined: [],
    paused: 0,
    deps: null as unknown as TeardownDeps,
  };

  // The runtime exactly as `SyncProvider` registers it: `stopForTeardown` closes the latch and
  // pauses the cadence, and does NOT stop the worker — step 2 still has to be able to flush.
  setSyncRuntime({
    flush: reason => worker.flush(reason),
    pullNow: async () => undefined,
    mock: null,
    pending: () => worker.pending(),
    refresh: async () => undefined,
    dueNow: async () => undefined,
    retry: async () => undefined,
    stopForTeardown: () => {
      h.paused += 1;
      stopLocalDb();
    },
  });

  h.deps = {
    flags: { get: async () => null, set: async () => undefined },
    session: { current: async () => ({ id: USER, email: 'dana@example.test' }) },
    ui: {
      // `auth/bindings.ts` wires exactly this: the latch and the cadence stop before the freeze.
      freeze: () => stopSyncForTeardown(),
      closeSheets: () => undefined,
    },
    network: { online: async () => true },
    outbox: outboxTeardown(),
    quarantine: {
      write: async (_user, ops) => {
        h.quarantined.push([...ops]);
        return ops.length > 0;
      },
    },
    notifications: {
      cancelAllScheduled: async () => undefined,
      dismissAllDelivered: async () => undefined,
    },
    widgets: { clearSnapshot: async () => undefined, reloadAll: async () => undefined },
    push: { markInvalidOnServer: async () => undefined, unregisterLocally: async () => undefined },
    auth: { signOut: async () => undefined },
    db: {
      // `closeAndDeleteLocalDb`'s own order: latch first, then the file, so that whatever
      // deleted it cannot be beaten to the recreate by something already in flight.
      closeAndDelete: async () => {
        stopLocalDb();
        file = false;
      },
    },
    keychain: { clearSession: async () => undefined },
    prefs: {
      clearForSignOut: async () => undefined,
      clearForHouseholdEnd: async () => undefined,
    },
    caches: { clearMemory: async () => undefined, clearTmp: async () => undefined },
    nav: { resetToAuth: () => undefined },
    analytics: { emit: () => undefined },
  };
  return h;
}

async function queueOne(db: Db): Promise<void> {
  const clock = fixture!.clock;
  await logActivity(db, clock, {
    householdId: HOUSEHOLD,
    createdBy: USER,
    deviceId: null,
    source: 'quicklog',
    childId: CHILD_A,
    type: 'diaper',
    startAt: clock.iso(),
    detail: { kind: 'WET' },
  });
}

describe('a flush racing a teardown (docs/ACCOUNTS.md §4)', () => {
  it('LEAVES NO DATABASE FILE, and the latch refuses every reopen until the next sign-in', async () => {
    const h = await harness(hangs);
    await queueOne(h.db);
    // a flush that will never answer, still in flight when the sign-out starts
    const inFlight = h.worker.flush('write');

    const result = await runTeardown('local', h.deps);

    expect(result.ran).toBe(true);
    expect(h.fileExists()).toBe(false);
    expect(localDbStopped()).toBe(true);
    // the guard `openLocalDb` runs before it touches the file system
    expect(() => assertCanOpen()).toThrow(LocalDbStoppedError);
    // and the flush finishing afterwards cannot bring the file back
    h.worker.stop();
    void inFlight;
    expect(h.fileExists()).toBe(false);

    allowReopen();
    expect(localDbStopped()).toBe(false);
    expect(() => assertCanOpen()).not.toThrow();
  });

  it('closes the latch at step 1, BEFORE step 8 deletes the file', async () => {
    const h = await harness(hangs);
    const order: string[] = [];
    const deps: TeardownDeps = {
      ...h.deps,
      ui: {
        freeze: () => {
          stopSyncForTeardown();
          order.push(`freeze:${localDbStopped()}`);
        },
        closeSheets: () => undefined,
      },
      db: {
        closeAndDelete: async () => {
          order.push(`delete:${localDbStopped()}`);
          await h.deps.db.closeAndDelete();
        },
      },
    };
    await runTeardown('local', deps);
    // the latch is already closed when the UI freezes; it is not something step 8 does
    expect(order).toEqual(['freeze:true', 'delete:true']);
    expect(h.paused).toBe(1);
  });

  it("STEP 2 STILL FLUSHES: pausing the engine must not stop the sign-out's last chance", async () => {
    const server = new MockSyncServer();
    server.addMember({ household_id: HOUSEHOLD, user_id: USER, role: 'OWNER' });
    const h = await harness(new MockSyncApi(server, USER));
    await queueOne(h.db);
    expect((await outboxCounts(h.db)).unsent).toBeGreaterThan(0);

    await runTeardown('local', h.deps);

    // the ops reached the server inside step 2's budget, so step 3 had nothing to keep
    expect((await outboxCounts(h.db)).unsent).toBe(0);
    expect(server.rowCount('activities')).toBe(1);
    expect(h.quarantined).toEqual([]);
  });

  it('step 3 quarantines every row the server did not accept, SENDING included', async () => {
    const h = await harness(hangs);
    await queueOne(h.db);
    // leave a row claimed into SENDING, which is what a request abandoned mid-flight looks like
    await h.db.run(`update outbox set state = 'SENDING', sending_at = ? where state = 'PENDING'`, [
      new Date().toISOString(),
    ]);

    const result = await runTeardown('local', h.deps);

    expect(result.quarantined).toBeGreaterThan(0);
    const kept = h.quarantined[0] ?? [];
    expect(kept.length).toBe(result.quarantined);
    // a SENDING row is a row whose answer will never arrive on this install; dropping it would
    // lose the entry that was closest to being safe
    expect(kept.some(row => (row as { state: string }).state === 'SENDING')).toBe(true);
  });

  it('the binding is the one the app uses: no runtime means an empty queue, not a throw', async () => {
    const h = await harness(hangs);
    setSyncRuntime(null);
    const result = await runTeardown('local', h.deps);
    expect(result.failed).toEqual([]);
    expect(result.quarantined).toBe(0);
    expect(h.fileExists()).toBe(false);
  });

  /**
   * NO ENGINE YET, AND THE QUEUE STILL IN THE FILE (2026-09-25). At launch the account read that
   * finds the household gone — or a refresh the server refuses — can come back before
   * `SyncProvider` has built its engine. Asked with no runtime, step 3 used to report an empty
   * queue, and step 8 then deleted the rows it is there to keep. The app's binding reads the file
   * instead (`auth/bindings.ts` `queueOnDisk`, which is `outboxPending` over the opened database).
   */
  it('with no runtime, step 3 reads the unsent rows from the file before step 8 deletes it', async () => {
    const h = await harness(hangs);
    await queueOne(h.db);
    setSyncRuntime(null);
    const deps: TeardownDeps = { ...h.deps, outbox: outboxTeardown(() => outboxPending(h.db)) };

    const household = await runTeardown('household', deps);

    expect(household.quarantined).toBe(1);
    expect(h.quarantined).toHaveLength(1);
    expect((h.quarantined[0]?.[0] as { state: string }).state).toBe('PENDING');
    expect(h.fileExists()).toBe(false);
  });

  it('a household teardown closes the latch too, and leaves it closed until a household is shown', async () => {
    const h = await harness(hangs);
    await queueOne(h.db);
    // offline, so step 2 does not spend its budget on a transport that never answers
    const deps: TeardownDeps = { ...h.deps, network: { online: async () => false } };
    const result = await runTeardown('household', deps);
    expect(result.quarantined).toBeGreaterThan(0);
    expect(h.paused).toBe(1);
    expect(h.fileExists()).toBe(false);
    // nothing reopens it on its own — `SyncProvider` lifts it when the next household is shown
    expect(() => assertCanOpen()).toThrow(LocalDbStoppedError);
  });
});

describe('the latch guards the shipped opener', () => {
  it('openLocalDb runs the guard before it touches the file system', () => {
    const source = readFileSync(join(__dirname, '..', 'db', 'index.ts'), 'utf8');
    const opener = source.slice(source.indexOf('export function openLocalDb'));
    const body = opener.slice(0, opener.indexOf('\n}\n'));
    expect(body).toContain('assertCanOpen()');
    // and the guard runs before the memoized handle is created, not after
    expect(body.indexOf('assertCanOpen()')).toBeLessThan(body.indexOf('handle = open()'));
    // step 8 closes the latch itself, so a delete can never leave it open
    expect(source).toMatch(/closeAndDeleteLocalDb[\s\S]{0,400}stopLocalDb\(\)/);
  });
});
