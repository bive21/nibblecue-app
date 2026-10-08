/**
 * The phase machine and the facade that drives it.
 *
 * Two things are proved here that neither `pull.test.ts` nor `worker.test.ts` can prove alone:
 * that a first launch really does get the household before it gets the history, and that the
 * seam `OutboxWorker` was built around - `pullAfterPush` - is actually connected to the pull
 * engine by `SyncEngine`, rather than being an optional hook nobody ever passed.
 */
import type { Net } from '@nibblecue/core';
import { afterEach, describe, expect, it } from 'vitest';
import { logActivity } from '../data/activities';
import type { Db } from '../db/driver';
import { CHILD_A, HOUSEHOLD, USER, seedHousehold } from '../testing/fixtures';
import type { FakeClock } from '../testing/clock';
import { SyncEngine } from './index';
import {
  BACKFILL_NOTE,
  phaseComplete,
  pullProgress,
  runAllPhases,
  runBackground,
  runInitialSync,
} from './phases';
import { MockSyncApi, MockSyncServer } from './providers/mock';
import { PullEngine } from './pull';
import { tablesOfPhase } from './tables';
import type { AppStateSource, Scheduler } from './triggers';

const PARTNER = 'bbbbbbbb-0000-4000-8000-000000000002';
const T0 = '2026-09-14T08:00:00.000Z';

let restore: (() => void) | null = null;

afterEach(() => {
  restore?.();
  restore = null;
});

interface Harness {
  db: Db;
  clock: FakeClock;
  server: MockSyncServer;
  api: MockSyncApi;
  engine: PullEngine;
}

async function harness(): Promise<Harness> {
  const fixture = await seedHousehold();
  restore = fixture.restoreIds;
  const { db, clock } = fixture;
  const server = new MockSyncServer({ now: () => clock.now() });
  server.addMember({ household_id: HOUSEHOLD, user_id: USER, role: 'OWNER' });
  const api = new MockSyncApi(server, USER);
  return {
    db,
    clock,
    server,
    api,
    engine: new PullEngine({ db, api, clock, householdId: HOUSEHOLD, userId: USER }),
  };
}

function putActivity(server: MockSyncServer, id: string, updatedAt: string): void {
  server.insertAsOtherDevice('activities', {
    id,
    client_op_id: id,
    household_id: HOUSEHOLD,
    child_id: CHILD_A,
    type: 'water',
    start_at: updatedAt,
    is_private: false,
    metadata: {},
    created_by: PARTNER,
    created_at: updatedAt,
    updated_at: updatedAt,
    deleted_at: null,
  });
}

const id = (n: number): string => `eeee0000-0000-4000-8000-${String(n).padStart(12, '0')}`;

/** An app that is in the foreground and a scheduler that never fires by itself. */
function stubs(): {
  appState: AppStateSource;
  scheduler: Scheduler;
  net: Net;
  ticks: (() => void)[];
} {
  const ticks: (() => void)[] = [];
  return {
    appState: { current: () => 'background', addListener: () => () => undefined },
    scheduler: {
      every: (_ms, fn) => {
        ticks.push(fn);
        return ticks.length;
      },
      cancel: () => undefined,
    },
    net: { isConnected: () => Promise.resolve(true), onReconnect: () => () => undefined },
    ticks,
  };
}

describe('the three phases', () => {
  it('finishes bootstrap before it starts on the log, and the log before the history', async () => {
    const h = await harness();
    const asked: string[][] = [];
    const engine = new PullEngine({
      db: h.db,
      clock: h.clock,
      householdId: HOUSEHOLD,
      userId: USER,
      api: {
        push: h.api.push.bind(h.api),
        pull: req => {
          asked.push(req.tables.map(t => t.name));
          return h.api.pull(req);
        },
      },
    });

    await runInitialSync(engine);
    const bootstrapOnly = asked.flat();
    expect(bootstrapOnly).toContain('household_members');
    expect(bootstrapOnly).toContain('nibble_records');
    expect(bootstrapOnly).not.toContain('activities');

    await runBackground(engine);
    const flat = asked.flat();
    expect(flat.indexOf('activities')).toBeGreaterThan(flat.indexOf('household_members'));
    // NibbleCue pulls no history tables (`tables.ts`): nothing is left for a backfill phase
    expect(tablesOfPhase('backfill')).toEqual([]);
  });

  it('has no history to wait for, so the backfill note never shows (NibbleCue pulls none)', async () => {
    const h = await harness();
    // CuddleCue's backfill tables (the stash ledger, vaccines, messages) are not pulled here
    expect(await pullProgress(h.db, HOUSEHOLD)).toEqual({ backfillComplete: true, pending: [] });
    expect(await phaseComplete(h.db, HOUSEHOLD, 'bootstrap')).toBe(false);
    expect(await phaseComplete(h.db, HOUSEHOLD, 'recent')).toBe(false);

    expect((await runAllPhases(h.engine)).stoppedBecause).toBe('done');
    expect(await pullProgress(h.db, HOUSEHOLD)).toEqual({ backfillComplete: true, pending: [] });
    expect(await phaseComplete(h.db, HOUSEHOLD, 'bootstrap')).toBe(true);
    expect(await phaseComplete(h.db, HOUSEHOLD, 'recent')).toBe(true);
    // The note WP10 renders is sentence case, plain, and never a warning.
    expect(BACKFILL_NOTE).toBe('Still loading older entries');
  });

  it('stops the pass when the server cannot be reached, without touching the later phases', async () => {
    const h = await harness();
    h.server.online = false;
    const outcome = await runAllPhases(h.engine);
    expect(outcome.stoppedBecause).toBe('offline');
    // Neither phase was drained, so nothing recorded progress.
    expect(await phaseComplete(h.db, HOUSEHOLD, 'bootstrap')).toBe(false);
    expect(await phaseComplete(h.db, HOUSEHOLD, 'recent')).toBe(false);
  });
});

describe('SyncEngine', () => {
  it('folds the pushed tables back in at the end of a flush', async () => {
    const h = await harness();
    const s = stubs();
    const engine = new SyncEngine({
      db: h.db,
      api: h.api,
      net: s.net,
      clock: h.clock,
      householdId: HOUSEHOLD,
      userId: USER,
      analytics: () => ({ event: 'app_open', props: {}, at: T0 }),
      appState: s.appState,
      scheduler: s.scheduler,
    });
    engine.start();

    // Another caregiver's entry, already on the server and unknown to this device.
    putActivity(h.server, id(1), T0);
    // This device logs one of its own, which is what makes the flush touch `activities`.
    await logActivity(h.db, h.clock, {
      householdId: HOUSEHOLD,
      createdBy: USER,
      deviceId: 'device-1',
      source: 'quicklog',
      childId: CHILD_A,
      type: 'diaper',
      startAt: h.clock.iso(),
      detail: { kind: 'WET' },
    });

    const flushed = await engine.flush('manual');
    expect(flushed.synced).toBe(1);
    // `pullAfterPush` ran inside the flush: the other caregiver's row is here without anything
    // else having asked for it.
    const rows = await h.db.all<{ id: string }>('select id from activities order by id');
    expect(rows.map(r => r.id)).toContain(id(1));
    engine.stop();
  });

  it('runs one pull at a time, and remembers what started it', async () => {
    const h = await harness();
    const s = stubs();
    const engine = new SyncEngine({
      db: h.db,
      api: h.api,
      net: s.net,
      clock: h.clock,
      householdId: HOUSEHOLD,
      userId: USER,
      analytics: () => ({ event: 'app_open', props: {}, at: T0 }),
      appState: s.appState,
      scheduler: s.scheduler,
    });
    putActivity(h.server, id(1), T0);

    const a = engine.pullNow('refresh');
    const b = engine.pullNow('tick');
    // The second caller joined the pass already running rather than starting a second one.
    expect(await a).toBe(await b);
    expect(engine.lastPullReason).toBe('tick');
    expect(await h.db.all('select id from activities')).toHaveLength(1);
  });

  it('exposes the prune, and it is a no-op before anything has been pulled', async () => {
    const h = await harness();
    const s = stubs();
    const engine = new SyncEngine({
      db: h.db,
      api: h.api,
      net: s.net,
      clock: h.clock,
      householdId: HOUSEHOLD,
      userId: USER,
      analytics: () => ({ event: 'app_open', props: {}, at: T0 }),
      appState: s.appState,
      scheduler: s.scheduler,
    });
    const outcome = await engine.prune();
    expect(outcome.outbox).toBe(0);
    expect(outcome.waitingOnPull).toContain('activities');
  });
});
