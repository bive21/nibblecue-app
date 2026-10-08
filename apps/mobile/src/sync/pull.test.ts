/**
 * The page loop, against the real local database and the real fake server.
 *
 * Six of the eight assertions here are about a pull that goes WRONG halfway: a process killed
 * between the rows and the cursor, a page boundary that falls between two rows sharing a
 * timestamp, a transaction that committed after the one the cursor stopped at, a household that
 * has more history than one pass may spend, and a caller who has been removed from the
 * household while the app was open. Each of those is a way to lose a parent's log silently, and
 * none of them is visible by looking at a screen.
 */
import { PULL_LAG_MS } from '@nibblecue/core';
import { afterEach, describe, expect, it } from 'vitest';
import { createStore, keys } from '../data/store';
import type { Db, Tx } from '../db/driver';
import { CHILD_A, HOUSEHOLD, LOCATION, USER, seedHousehold } from '../testing/fixtures';
import type { FakeClock } from '../testing/clock';
import { readCursor } from './cursors';
import { runAllPhases } from './phases';
import { MockSyncApi, MockSyncServer, type Row } from './providers/mock';
import { PullEngine } from './pull';
import { pullTable, type PullTable } from './tables';

const PARTNER = 'bbbbbbbb-0000-4000-8000-000000000002';
const CONTAINER = 'dddddddd-0000-4000-8000-0000000000c1';

const activitiesTable = (page = 500): PullTable => {
  const base = pullTable('activities');
  if (base === undefined) throw new Error('activities is not a pulled table');
  return { ...base, page };
};

interface Harness {
  db: Db;
  clock: FakeClock;
  server: MockSyncServer;
  engine(over?: Partial<ConstructorParameters<typeof PullEngine>[0]>): PullEngine;
}

let restore: (() => void) | null = null;

afterEach(() => {
  restore?.();
  restore = null;
});

async function harness(): Promise<Harness> {
  const fixture = await seedHousehold();
  restore = fixture.restoreIds;
  const { db, clock } = fixture;
  const server = new MockSyncServer({ now: () => clock.now() });
  server.addMember({ household_id: HOUSEHOLD, user_id: USER, role: 'OWNER' });
  return {
    db,
    clock,
    server,
    engine(over = {}) {
      return new PullEngine({
        db,
        api: new MockSyncApi(server, USER),
        clock,
        householdId: HOUSEHOLD,
        userId: USER,
        ...over,
      });
    },
  };
}

/** A row on the server as another caregiver's device would have left it. */
function putActivity(
  server: MockSyncServer,
  id: string,
  updatedAt: string,
  over: Partial<Row> = {},
): void {
  server.insertAsOtherDevice('activities', {
    id,
    client_op_id: id,
    household_id: HOUSEHOLD,
    child_id: CHILD_A,
    type: 'water',
    start_at: updatedAt,
    end_at: null,
    quantity: null,
    canonical_unit: null,
    notes: null,
    is_private: false,
    metadata: {},
    created_by: PARTNER,
    updated_by: PARTNER,
    device_id: null,
    created_at: updatedAt,
    updated_at: updatedAt,
    deleted_at: null,
    ...over,
  });
}

const id = (n: number): string => `eeee0000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const T0 = '2026-09-14T08:00:00.000Z';
const plus = (ms: number): string => new Date(Date.parse(T0) + ms).toISOString();

describe('the page loop', () => {
  it('leaves the cursor unmoved when the write throws, and the retry applies exactly once', async () => {
    const h = await harness();
    putActivity(h.server, id(1), T0);

    // A `Db` that commits nothing: the callback runs, then the transaction is rolled back by a
    // throw. This is a process killed between the rows and the cursor, which is the one window
    // the single-transaction rule exists to close.
    const boom = { on: true };
    const flaky: Db = {
      ...h.db,
      tx: <T>(fn: (t: Tx) => Promise<T>) =>
        h.db.tx(async t => {
          const out = await fn(t);
          if (boom.on) throw new Error('the process was killed mid-apply');
          return out;
        }),
    };

    const failed = await h.engine({ db: flaky }).run([activitiesTable()], null);
    expect(failed.stoppedBecause).toBe('error');
    expect(await h.db.all('select id from activities')).toHaveLength(0);
    expect((await readCursor(h.db, HOUSEHOLD, 'activities')).cursor).toBeNull();

    boom.on = false;
    const retried = await h.engine().run([activitiesTable()], null);
    expect(retried.stoppedBecause).toBe('done');
    expect(await h.db.all('select id from activities')).toHaveLength(1);
    expect((await readCursor(h.db, HOUSEHOLD, 'activities')).cursor).toEqual({
      updated_at: T0,
      id: id(1),
    });
  });

  it('does not lose a row when two share a timestamp across a page boundary', async () => {
    const h = await harness();
    // Same instant, two rows: `updated_at` alone is not a total order, and a cursor that stored
    // only the timestamp would step over the second one for ever.
    putActivity(h.server, id(1), T0);
    putActivity(h.server, id(2), T0);
    putActivity(h.server, id(3), plus(60_000));

    const outcome = await h.engine().run([activitiesTable(1)], null);
    expect(outcome.stoppedBecause).toBe('done');
    const rows = await h.db.all<{ id: string }>('select id from activities order by id');
    expect(rows.map(r => r.id)).toEqual([id(1), id(2), id(3)]);
    expect((await readCursor(h.db, HOUSEHOLD, 'activities')).cursor).toEqual({
      updated_at: plus(60_000),
      id: id(3),
    });
  });

  it('re-reads the lag window and sees a slow-committing row, with no duplicates', async () => {
    const h = await harness();
    putActivity(h.server, id(1), T0);
    putActivity(h.server, id(2), plus(60_000));
    // A transaction that started before the cursor's row and committed after it: it is stamped
    // inside the window and becomes visible only once the client has already moved past it.
    putActivity(h.server, id(3), plus(PULL_LAG_MS));
    h.server.withholdUntilCursorPast(id(3));

    const first = await h.engine().run([activitiesTable()], null);
    expect(first.stoppedBecause).toBe('done');
    expect(await h.db.all('select id from activities')).toHaveLength(2);

    const second = await h.engine().run([activitiesTable()], null);
    const rows = await h.db.all<{ id: string }>('select id from activities order by id');
    // the late row arrived, and the row that was re-read is still one row
    expect(rows.map(r => r.id)).toEqual([id(1), id(2), id(3)]);
    expect(second.applied).toBeGreaterThan(0);
  });

  it('stops at the page cap and resumes from the stored cursor on the next pass', async () => {
    const h = await harness();
    for (let n = 1; n <= 5; n++) putActivity(h.server, id(n), plus(n * 1_000));

    const engine = h.engine({ maxPagesPerTable: 2 });
    const first = await engine.run([activitiesTable(1)], 'recent');
    expect(first.incomplete).toEqual(['activities']);
    expect(await h.db.all('select id from activities')).toHaveLength(2);
    const parked = await readCursor(h.db, HOUSEHOLD, 'activities');
    expect(parked.cursor).toEqual({ updated_at: plus(2_000), id: id(2) });
    // the phase is recorded but NOT marked complete, which is what the Reports note reads
    expect(parked.phase).toBe('recent');

    await engine.run([activitiesTable(1)], 'recent');
    expect(await h.db.all('select id from activities')).toHaveLength(4);
    const final = await engine.run([activitiesTable(1)], 'recent');
    expect(final.incomplete).toEqual([]);
    expect(await h.db.all('select id from activities')).toHaveLength(5);
    expect((await readCursor(h.db, HOUSEHOLD, 'activities')).phase).toBe('recent_complete');
  });

  it('applies an activity that has no detail row, leaving the stash total alone', async () => {
    const h = await harness();
    // `water` is one of the five types with no detail table at all; a write path that invented
    // one would fail its foreign key on an empty row.
    putActivity(h.server, id(1), T0, { type: 'water' });
    await h.db.run(
      `insert into milk_containers (id, household_id, owner_id, location_id, amount_ml,
        initial_ml, pumped_at, created_by, created_at, updated_at)
        values (?, ?, ?, ?, 120, 150, ?, ?, ?, ?)`,
      [CONTAINER, HOUSEHOLD, USER, LOCATION, T0, USER, T0, T0],
    );

    await h.engine().run([activitiesTable()], null);
    const row = await h.db.get<{ type: string }>('select type from activities where id = ?', [
      id(1),
    ]);
    expect(row?.type).toBe('water');
    for (const detail of ['bottle_details', 'breastfeed_details', 'pump_details']) {
      expect(await h.db.all(`select activity_id from ${detail}`)).toHaveLength(0);
    }
    const stash = await h.db.get<{ total: number }>(
      'select sum(amount_ml) as total from milk_containers where household_id = ?',
      [HOUSEHOLD],
    );
    expect(stash?.total).toBe(120);
  });

  it('bumps the store only for what it wrote, once the transaction has committed', async () => {
    const h = await harness();
    putActivity(h.server, id(1), T0);
    const store = createStore();
    const seen: string[] = [];
    store.subscribe(keys.timeline(CHILD_A, 'all'), () => seen.push('timeline'));
    store.subscribe(keys.outbox(), () => seen.push('outbox'));

    await h.engine({ store }).run([activitiesTable()], null);
    // The timeline re-runs; the queue does not, because a pull never changes what this device
    // still owes the server.
    expect(seen).toEqual(['timeline']);
  });
});

describe('a pull that is refused', () => {
  it('hands CC403 on the household pull up, and touches nothing itself (D37)', async () => {
    const h = await harness();
    putActivity(h.server, id(1), T0);
    // Removed from the household while the app was open. `sync_pull` raises CC403 rather than
    // answering with empty pages, which is the only signal that says "you may have been removed".
    // What that means for the mirror is the account read's to decide (`auth/mirror.ts`), so the
    // engine only stops the pass and says so.
    h.server.members.length = 0;

    const forbidden: string[] = [];
    const outcome = await h
      .engine({ onForbidden: householdId => void forbidden.push(householdId) })
      .run([activitiesTable()], null);

    expect(outcome.stoppedBecause).toBe('forbidden');
    expect(forbidden).toEqual([HOUSEHOLD]);
    expect(await h.db.all('select id from activities')).toHaveLength(0);
    expect((await readCursor(h.db, HOUSEHOLD, 'activities')).cursor).toBeNull();
  });

  it('reports an unreachable server without moving anything', async () => {
    const h = await harness();
    putActivity(h.server, id(1), T0);
    h.server.online = false;
    const outcome = await h.engine().run([activitiesTable()], null);
    expect(outcome.stoppedBecause).toBe('offline');
    expect(outcome.incomplete).toEqual(['activities']);
    expect((await readCursor(h.db, HOUSEHOLD, 'activities')).cursor).toBeNull();
  });

  it('reports a cursor read the database refused, and never rejects (2026-10-08)', async () => {
    // every pass nobody awaits ends in `.catch(rethrowUnlessTeardown)`, so a rejection here was
    // an "Uncaught (in promise)" on the owner's phone beside the pass's own "pull failed"
    const h = await harness();
    putActivity(h.server, id(1), T0);
    const locked: Db = {
      ...h.db,
      all: () =>
        Promise.reject(
          new Error(
            "Call to function 'NativeStatement.finalizeAsync' has been rejected. → Caused by: Error code : database is locked",
          ),
        ),
    };
    const outcome = await h.engine({ db: locked }).run([activitiesTable()], null);
    expect(outcome.stoppedBecause).toBe('error');
    expect(outcome.error).toMatch(/database is locked/);
    expect(outcome.incomplete).toEqual(['activities']);
    expect(await h.db.all('select id from activities')).toHaveLength(0);
  });
});

describe('the phases', () => {
  it('asks for bootstrap before recent, and recent before backfill', async () => {
    const h = await harness();
    const asked: string[][] = [];
    const api = new MockSyncApi(h.server, USER);
    const engine = h.engine({
      api: {
        push: api.push.bind(api),
        pull: req => {
          asked.push(req.tables.map(t => t.name));
          return api.pull(req);
        },
      },
    });

    await runAllPhases(engine);
    const first = asked[0] ?? [];
    expect(first).toContain('children');
    expect(first).not.toContain('activities');
    const flat = asked.flat();
    expect(flat.indexOf('children')).toBeLessThan(flat.indexOf('activities'));
    // NibbleCue pulls no backfill tables (`tables.ts`), so the log is the last thing asked for
    expect(flat).not.toContain('milk_inventory_transactions');
  });

  /*
    CuddleCue proved the resume on the stash ledger's backfill. NibbleCue pulls no ledger (and
    no backfill phase), so the same resume is proved on the table it does page through: the log,
    in the recent phase.
  */
  it('resumes a phase that was interrupted, from where it stopped', async () => {
    const h = await harness();
    for (let n = 1; n <= 3; n++) putActivity(h.server, id(n), plus(n * 1_000));
    const table = activitiesTable(1);
    const stopped = await h.engine({ maxPagesPerTable: 1 }).run([table], 'recent');
    expect(stopped.incomplete).toEqual(['activities']);
    expect(await h.db.all('select id from activities')).toHaveLength(1);
    const parked = await readCursor(h.db, HOUSEHOLD, 'activities');
    expect(parked.phase).toBe('recent');

    // A new engine is a relaunch: nothing is held in memory, only `sync_state`.
    await h.engine().run([table], 'recent');
    expect(await h.db.all('select id from activities')).toHaveLength(3);
    expect((await readCursor(h.db, HOUSEHOLD, 'activities')).phase).toBe('recent_complete');
  });

  it('pullTables folds back only the tables a push wrote to', async () => {
    const h = await harness();
    putActivity(h.server, id(1), T0);
    const outcome = await h.engine().pullTables(['activities', 'community_threads']);
    expect(outcome.tables).toEqual(['activities']);
    expect(await h.db.all('select id from activities')).toHaveLength(1);
    // nothing else was asked for, so nothing else has a cursor
    expect((await readCursor(h.db, HOUSEHOLD, 'milk_containers')).cursor).toBeNull();
  });
});
