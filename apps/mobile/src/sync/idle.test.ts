/**
 * WHAT AN IDLE PULL PASS COSTS THE PHONE (the owner, 2026-09-27: "the way the app runs is
 * optimized").
 *
 * An open app pulls every 30 seconds (`PULL_TICK_MS`), and every pass re-reads a little on
 * purpose: each delta table from its cursor less `PULL_LAG_MS`, so a slow commit is never skipped,
 * and each `full` table whole, because absence there is removal. Nothing had changed on the
 * server, and every row of that was upserted again and handed its screen keys: on the 5,000-row
 * household below, with the modules, notification channels, vaccine switches and guidance a real
 * household carries, 90 rows rewritten twice a minute and 15 keys — Today's rows and newest
 * entries, the Log, Reports, the schedule, the stash, the planner's preferences — named for
 * re-reading. A row the mirror already holds exactly is left alone now (`writePage` in
 * `packages/core/src/sync/local/apply.ts`; `apply.test.ts` holds the comparison), and a pass over
 * an unchanged server writes no row and wakes no screen. What it still writes is the cursors'
 * bookkeeping (`sync_state`), which is what makes the next pass start where this one ended.
 */
import { describe, expect, it } from 'vitest';
import { buildHousehold, IDS } from '../../../../tools/fixtures/gen-household.mjs';
import type { FixtureRow } from '../../../../tools/fixtures/gen-household.mjs';
import { createStore } from '../data/store';
import type { Db, Tx } from '../db/driver';
import { FakeClock } from '../testing/clock';
import { openTestDb } from '../testing/local-db';
import { SERVER_EPOCH } from './harness';
import { runAllPhases } from './phases';
import { MockSyncApi, MockSyncServer } from './providers/mock';
import { PullEngine } from './pull';

const HOUSE = buildHousehold();

/** The fixture household on a server, with the settings and guidance a real one carries. */
function household(clock: FakeClock): MockSyncServer {
  let ticks = Date.parse(SERVER_EPOCH);
  const server = new MockSyncServer({
    now: () => {
      ticks = Math.max(ticks + 1, clock.now() + 1);
      return ticks;
    },
  });
  const epoch = HOUSE.meta.epoch;
  server.addMember({ household_id: IDS.household, user_id: IDS.owner, role: 'OWNER' });
  server.insertAsOtherDevice('profiles', {
    id: IDS.owner,
    display_name: 'Owner',
    updated_at: epoch,
  });
  server.insertAsOtherDevice('households', {
    id: IDS.household,
    household_id: IDS.household,
    name: 'Idle',
    owner_id: IDS.owner,
    home_time_zone: 'UTC',
    updated_at: epoch,
  });
  for (const [i, id] of IDS.child.entries()) {
    server.insertAsOtherDevice('children', {
      id,
      household_id: IDS.household,
      name: i === 0 ? 'Ada' : 'Bo',
      birth_date: '2026-05-01',
      updated_at: epoch,
    });
  }
  server.insertAsOtherDevice('storage_locations', {
    id: IDS.location,
    household_id: IDS.household,
    name: 'Freezer',
    kind: 'FREEZER',
    updated_at: epoch,
  });
  const put = (table: string, rows: readonly FixtureRow[]) => {
    for (const row of rows) server.insertAsOtherDevice(table, { ...row });
  };
  put('activities', HOUSE.activities);
  for (const [table, rows] of Object.entries(HOUSE.details)) put(table, rows);
  put('milk_containers', HOUSE.containers);
  put('milk_inventory_transactions', HOUSE.ledger);
  put('schedule_rules', HOUSE.rules);
  put('schedule_instances', HOUSE.instances);
  const modules = ['bottle', 'breastfeed', 'pump', 'diaper', 'sleep', 'solids', 'med', 'bath'];
  for (const [i, module_id] of modules.entries()) {
    server.insertAsOtherDevice('module_settings', {
      household_id: IDS.household,
      module_id,
      enabled: true,
      sort_order: i,
      quick_enabled: i < 6,
      quick_position: i,
      created_at: epoch,
      updated_at: epoch,
    });
  }
  /*
    CuddleCue's household here also carries notification channels, the milk and vaccine guidance
    and each dose's switch. NibbleCue pulls none of them (`tables.ts`), and their guidance files
    were CuddleCue's assets; it pulls its own records instead, so a few of those are on the server.
  */
  for (const [i, child_id] of IDS.child.entries()) {
    server.insertAsOtherDevice('nibble_records', {
      id: `9e0b0000-0000-4000-8000-00000000000${i}`,
      household_id: IDS.household,
      child_id,
      kind: 'profile',
      body: { version: 1 },
      client_edited_at: epoch,
      created_by: IDS.owner,
      updated_by: IDS.owner,
      created_at: epoch,
      updated_at: epoch,
      deleted_at: null,
    });
  }
  return server;
}

/** The mirror, noting every row a transaction writes, by table. */
function counted(db: Db, written: Map<string, number>): Db {
  const noting = (t: Tx): Tx => ({
    run: async (sql, params) => {
      const r = await t.run(sql, params);
      const table = /^\s*(?:update|insert(?: or \w+)? into|delete from)\s+(\w+)/i.exec(sql)?.[1];
      if (table !== undefined && r.changes > 0) {
        written.set(table, (written.get(table) ?? 0) + r.changes);
      }
      return r;
    },
    all: (sql, params) => t.all(sql, params),
    get: (sql, params) => t.get(sql, params),
  });
  return {
    run: (sql, params) => db.run(sql, params),
    all: (sql, params) => db.all(sql, params),
    get: (sql, params) => db.get(sql, params),
    tx: fn => db.tx(t => fn(noting(t))),
  };
}

describe('an idle pull pass', () => {
  it('re-reads what it must, and writes no row and wakes no screen for it (was 90 rows and 15 keys a pass)', async () => {
    const clock = new FakeClock(SERVER_EPOCH);
    const server = household(clock);
    const { db: raw } = await openTestDb();
    const written = new Map<string, number>();
    const store = createStore();
    const named = new Set<string>();
    const invalidate = store.invalidate.bind(store);
    store.invalidate = (...keys: string[]) => {
      for (const k of keys) named.add(k);
      invalidate(...keys);
    };
    const engine = new PullEngine({
      db: counted(raw, written),
      api: new MockSyncApi(server, IDS.owner),
      clock,
      householdId: IDS.household,
      userId: IDS.owner,
      store,
    });
    // the first sync, however many passes the page cap takes
    let outcome = await runAllPhases(engine);
    for (let i = 0; i < 12 && outcome.incomplete.length > 0; i++) {
      outcome = await runAllPhases(engine);
    }
    expect(outcome.incomplete).toEqual([]);
    // NibbleCue's own records arrived with the rest
    expect(await raw.all('select id from nibble_records', [])).toHaveLength(IDS.child.length);

    for (let pass = 0; pass < 3; pass++) {
      // the next tick, with nothing new on the server
      clock.advance(30_000);
      written.clear();
      named.clear();
      const idle = await runAllPhases(engine);
      // the server did send rows — the lag window and every `full` table — and they were read
      // (16 rows on NibbleCue's tables, where CuddleCue's guidance and settings made it 90)
      expect(idle.applied).toBeGreaterThan(10);
      const rows = [...written].filter(([table]) => table !== 'sync_state');
      expect(rows, JSON.stringify([...written])).toEqual([]);
      expect([...named]).toEqual([]);
    }
  });
});
