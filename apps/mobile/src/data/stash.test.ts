/**
 * The stash draw — `docs/MILK_STASH.md` §7 and the three faults `docs/UX_AUDIT.md` §4.62 found
 * in one path. The invariant every test below re-checks is the one a parent plans a night
 * around: **the total equals the sum of the containers still in the stash**, after every
 * operation, including the ones that failed.
 */
import { afterEach, describe, expect, it } from 'vitest';
import type { Db } from '../db/driver';
import { ledgerBalanceMl, stashSummary } from '../db/queries/stash';
import {
  CHILD_A,
  HOUSEHOLD,
  LOCATION,
  USER,
  liveActivities,
  liveCount,
  seedContainer,
  seedHousehold,
} from '../testing/fixtures';
import { guidanceDates, MILK_GUIDANCE, mlToVolume, ozToMl, volumeToMl } from '@nibblecue/core';
import { saveLocation } from './locations';
import {
  MILK_REMAINDER_FLOOR_ML,
  addStoredMilk,
  adjustContainer,
  discardContainer,
  logBottleFromStash,
  moveContainer,
  planDraw,
  PumpedLaterThanNowError,
  splitContainer,
  stashTotalMl,
  storePumpSession,
} from './stash';
import { runningTimerFor } from '../db/queries/timers';
import { startTimer } from './timers';

const A = 'ffffffff-0000-4000-8000-00000000000a';
const B = 'ffffffff-0000-4000-8000-00000000000b';
const TAP = '2026-09-14T03:12:00.000Z';

const restores: (() => void)[] = [];
afterEach(() => {
  while (restores.length > 0) restores.pop()?.();
});

async function fixture() {
  const f = await seedHousehold();
  restores.push(f.restoreIds);
  return f;
}

const bottle = (consumedMl: number, extra: Record<string, unknown> = {}) => ({
  householdId: HOUSEHOLD,
  createdBy: USER,
  deviceId: null,
  source: 'quicklog' as const,
  childId: CHILD_A,
  startAt: TAP,
  consumedMl,
  ...extra,
});

/** The invariant: what the summary says is what the containers hold. */
async function balances(db: Db): Promise<void> {
  const summary = await stashSummary(db, HOUSEHOLD);
  const total = await db.tx(t => stashTotalMl(t, HOUSEHOLD));
  expect(summary.totalMl).toBe(total);
  const rows = await db.all<{ id: string; amount_ml: number; status: string }>(
    'select id, amount_ml, status from milk_containers where household_id = ?',
    [HOUSEHOLD],
  );
  const inStash = rows.filter(r => r.status === 'STORED' || r.status === 'THAWING');
  expect(total).toBe(inStash.reduce((sum, r) => sum + r.amount_ml, 0));
  // and the ledger explains every container's balance, which is what makes the number audited
  for (const row of rows) {
    expect(await db.tx(t => ledgerBalanceMl(t, row.id)), row.id).toBe(row.amount_ml);
  }
}

describe('planDraw: the ranked walk (MILK_STASH §7b)', () => {
  const container = (id: string, amount_ml: number, pumped_at: string) => ({
    id,
    amount_ml,
    status: 'STORED',
    used_at: null,
    pumped_at,
    first_frozen_at: null,
    location_id: 'l',
  });

  it('takes it all from one container when one covers it', () => {
    const plan = planDraw([container(A, 150, '2026-09-01T00:00:00.000Z')], 120);
    expect(plan.draws).toEqual([{ containerId: A, ml: 120 }]);
    expect(plan.unaccountedMl).toBe(0);
    expect(plan.remainder).toBeNull();
  });

  it('walks down the list when one does not, and the draws sum to the bottle', () => {
    const plan = planDraw(
      [container(A, 74, '2026-09-01T00:00:00.000Z'), container(B, 120, '2026-09-02T00:00:00.000Z')],
      177,
    );
    expect(plan.draws).toEqual([
      { containerId: A, ml: 74 },
      { containerId: B, ml: 103 },
    ]);
    expect(plan.draws.reduce((s, d) => s + d.ml, 0)).toBe(177);
    expect(plan.unaccountedMl).toBe(0);
  });

  it('writes off a leftover under the floor so the balance identity still holds', () => {
    const plan = planDraw([container(A, 124, '2026-09-01T00:00:00.000Z')], 120);
    expect(124 - 120).toBeLessThan(MILK_REMAINDER_FLOOR_ML);
    expect(plan.remainder).toEqual({ containerId: A, ml: 4 });
  });

  it('reports what the stash could not cover rather than refusing the feed', () => {
    const plan = planDraw([container(A, 30, '2026-09-01T00:00:00.000Z')], 120);
    expect(plan.draws).toEqual([{ containerId: A, ml: 30 }]);
    expect(plan.unaccountedMl).toBe(90);
  });
});

describe('logBottleFromStash (MILK_STASH §7, UX_AUDIT §4.62; @AT-13)', () => {
  it('deducts exactly once and the total still equals the containers', async () => {
    const { db, clock } = await fixture();
    await seedContainer(db, { id: A, amountMl: 150 });
    await balances(db);

    const out = await logBottleFromStash(db, clock, bottle(120));
    expect(out.committed).toBe(true);
    expect(out.draws).toEqual([{ containerId: A, ml: 120 }]);
    expect(await stashSummary(db, HOUSEHOLD)).toMatchObject({ totalMl: 30, containers: 1 });
    await balances(db);
  });

  it('a refused duplicate restores every container field, including the ledger row count', async () => {
    const { db, clock } = await fixture();
    await seedContainer(db, { id: A, amountMl: 150 });
    await logBottleFromStash(db, clock, bottle(120));
    const after = await db.get<{ amount_ml: number; status: string; used_at: string | null }>(
      'select amount_ml, status, used_at from milk_containers where id = ?',
      [A],
    );
    const ledgerRows = (
      await db.get<{ n: number }>('select count(*) as n from milk_inventory_transactions', [])
    )?.n;

    // the second tap, 220 ms later: the prototype logged one feed and TWO draws here
    clock.advance(220);
    const second = await logBottleFromStash(db, clock, bottle(120));
    expect(second.suppressed).toBe(true);
    expect(second.draws).toEqual([]);

    expect(await liveActivities(db)).toBe(1);
    expect(
      await db.get<{ amount_ml: number; status: string; used_at: string | null }>(
        'select amount_ml, status, used_at from milk_containers where id = ?',
        [A],
      ),
    ).toEqual(after);
    expect(
      (await db.get<{ n: number }>('select count(*) as n from milk_inventory_transactions', []))?.n,
    ).toBe(ledgerRows);
    await balances(db);
  });

  /**
   * THE REST OF A BAG STAYS IN THE STASH (the owner, 2026-09-26: *"if using bottle for 4 oz, and use
   * from stash that has 5oz … we keep the leftover as 1oz, not just delete the whole entry"*). The
   * bottle sheet now says so under the stash choice (`stashStays`); this is the write it describes.
   */
  it('a 5 oz container and a 4 oz bottle leave the container at 1 oz, still stored — not discarded', async () => {
    const { db, clock } = await fixture();
    const five = volumeToMl(5, 'oz');
    const four = volumeToMl(4, 'oz');
    await seedContainer(db, { id: A, amountMl: five });

    const out = await logBottleFromStash(db, clock, bottle(four));
    expect(out.committed).toBe(true);
    expect(out.draws).toEqual([{ containerId: A, ml: four }]);
    const row = await db.get<{ amount_ml: number; status: string; used_at: string | null }>(
      'select amount_ml, status, used_at from milk_containers where id = ?',
      [A],
    );
    expect(row).toEqual({ amount_ml: five - four, status: 'STORED', used_at: null });
    expect(mlToVolume(row?.amount_ml ?? 0, 'oz')).toBe(1);
    // one USE for the bottle and nothing else: no write-off, no discard, no close
    const moves = await db.all<{ kind: string; delta_ml: number }>(
      "select kind, delta_ml from milk_inventory_transactions where container_id = ? and kind != 'ADD'",
      [A],
    );
    expect(moves).toEqual([{ kind: 'USE', delta_ml: -four }]);
    expect(five - four).toBeGreaterThanOrEqual(MILK_REMAINDER_FLOOR_ML);
    expect(await stashSummary(db, HOUSEHOLD)).toMatchObject({
      totalMl: five - four,
      containers: 1,
    });
    await balances(db);
  });

  it('empties and closes a container the draw used up', async () => {
    const { db, clock } = await fixture();
    await seedContainer(db, { id: A, amountMl: 120 });
    await logBottleFromStash(db, clock, bottle(120));
    const row = await db.get<{ amount_ml: number; status: string; used_at: string | null }>(
      'select amount_ml, status, used_at from milk_containers where id = ?',
      [A],
    );
    expect(row).toEqual({ amount_ml: 0, status: 'USED', used_at: TAP });
    expect(await stashSummary(db, HOUSEHOLD)).toMatchObject({ totalMl: 0, containers: 0 });
    await balances(db);
  });

  it('a bottle larger than one container walks the list and writes one row per container', async () => {
    const { db, clock } = await fixture();
    await seedContainer(db, { id: A, amountMl: 74, pumpedAt: '2026-09-01T00:00:00.000Z' });
    await seedContainer(db, { id: B, amountMl: 120, pumpedAt: '2026-09-02T00:00:00.000Z' });

    const out = await logBottleFromStash(db, clock, bottle(177));
    expect(out.draws).toEqual([
      { containerId: A, ml: 74 },
      { containerId: B, ml: 103 },
    ]);
    const uses = await db.all<{ container_id: string; delta_ml: number }>(
      "select container_id, delta_ml from milk_inventory_transactions where kind = 'USE' order by container_id",
      [],
    );
    expect(uses).toEqual([
      { container_id: A, delta_ml: -74 },
      { container_id: B, delta_ml: -103 },
    ]);
    // and both halves of the walk are one intent, one activity
    expect(await liveActivities(db)).toBe(1);
    expect(await stashSummary(db, HOUSEHOLD)).toMatchObject({ totalMl: 17, containers: 1 });
    await balances(db);
  });

  it('an uncoverable draw still saves the feed and says how much is unaccounted', async () => {
    const { db, clock } = await fixture();
    await seedContainer(db, { id: A, amountMl: 30 });

    const out = await logBottleFromStash(db, clock, bottle(120));
    expect(out.committed).toBe(true);
    expect(out.unaccountedMl).toBe(90);
    expect(await liveActivities(db)).toBe(1);
    const detail = await db.get<{ consumed_ml: number; from_stash: number }>(
      'select consumed_ml, from_stash from bottle_details where activity_id = ?',
      [out.activityId],
    );
    expect(detail).toEqual({ consumed_ml: 120, from_stash: 1 });
    await balances(db);
  });

  it('an empty stash still saves the feed, with no ledger row at all', async () => {
    const { db, clock } = await fixture();
    const out = await logBottleFromStash(db, clock, bottle(120));
    expect(out.committed).toBe(true);
    expect(out.draws).toEqual([]);
    expect(out.unaccountedMl).toBe(120);
    expect(await liveActivities(db)).toBe(1);
    expect(
      (await db.get<{ n: number }>('select count(*) as n from milk_inventory_transactions', []))?.n,
    ).toBe(0);
    expect((await db.get<{ n: number }>('select count(*) as n from outbox', []))?.n).toBe(1);
  });

  it('deducts what was POURED, not what the baby drank (§7a)', async () => {
    const { db, clock } = await fixture();
    await seedContainer(db, { id: A, amountMl: 150 });
    const out = await logBottleFromStash(db, clock, bottle(90, { offeredMl: 120 }));
    expect(out.draws).toEqual([{ containerId: A, ml: 120 }]);
    const activity = await db.get<{ quantity: number }>(
      'select quantity from activities where id = ?',
      [out.activityId],
    );
    expect(activity?.quantity).toBe(90);
    expect(await stashSummary(db, HOUSEHOLD)).toMatchObject({ totalMl: 30 });
    await balances(db);
  });

  it('selects the entry it created by id, never by time', async () => {
    const { db, clock } = await fixture();
    await seedContainer(db, { id: A, amountMl: 300 });
    // an earlier bottle at exactly the same instant: "the newest entry" is ambiguous here, and
    // that ambiguity is what stamped one save's leftover onto another feed in the prototype
    const first = await logBottleFromStash(db, clock, bottle(60));
    clock.advance(4000);
    const second = await logBottleFromStash(db, clock, bottle(120));
    expect(first.activityId).not.toBe(second.activityId);
    const detail = await db.get<{ consumed_ml: number }>(
      'select consumed_ml from bottle_details where activity_id = ?',
      [second.activityId],
    );
    expect(detail?.consumed_ml).toBe(120);
    const firstDetail = await db.get<{ consumed_ml: number }>(
      'select consumed_ml from bottle_details where activity_id = ?',
      [first.activityId],
    );
    expect(firstDetail?.consumed_ml).toBe(60);
    await balances(db);
  });
});

describe('storePumpSession (PRODUCT_SPEC §6.3: inventory moves exactly once)', () => {
  const session = (extra: Record<string, unknown> = {}) => ({
    householdId: HOUSEHOLD,
    createdBy: USER,
    deviceId: null,
    source: 'sheet' as const,
    startAt: '2026-09-14T03:00:00.000Z',
    endAt: '2026-09-14T03:18:00.000Z',
    leftMl: 120,
    rightMl: 100,
    store: true,
    ...extra,
  });

  it('Choose where it goes: the session, a container in the default location, one ADD', async () => {
    const { db, clock } = await fixture();
    const result = await storePumpSession(db, clock, session());
    expect(result.committed).toBe(true);
    expect(result.containerId).not.toBeNull();
    const container = await db.get<{ amount_ml: number; initial_ml: number; location_id: string }>(
      'select amount_ml, initial_ml, location_id from milk_containers where id = ?',
      [result.containerId],
    );
    expect(container).toMatchObject({ amount_ml: 220, initial_ml: 220, location_id: LOCATION });
    const detail = await db.get<{ total_ml: number; stored_to_stash: number; sides: string }>(
      'select total_ml, stored_to_stash, sides from pump_details where activity_id = ?',
      [result.activityId],
    );
    expect(detail).toMatchObject({ total_ml: 220, stored_to_stash: 1, sides: 'BOTH' });
    await balances(db);
  });

  it('Save session only: the activity, no container, nothing in the ledger', async () => {
    const { db, clock } = await fixture();
    const result = await storePumpSession(db, clock, session({ store: false }));
    expect(result.containerId).toBeNull();
    expect(await liveCount(db, 'milk_containers')).toBe(0);
    expect(await liveActivities(db)).toBe(1);
    const detail = await db.get<{ stored_to_stash: number }>(
      'select stored_to_stash from pump_details where activity_id = ?',
      [result.activityId],
    );
    expect(detail?.stored_to_stash).toBe(0);
  });

  it('ends a running pump timer in the same write', async () => {
    const { db, clock } = await fixture();
    await startTimer(db, clock, {
      householdId: HOUSEHOLD,
      createdBy: USER,
      deviceId: null,
      source: 'timer',
      childId: null,
      type: 'pump',
      startedAt: '2026-09-14T03:00:00.000Z',
    });
    const timer = await runningTimerFor(db, HOUSEHOLD, 'pump', null);
    if (!timer) throw new Error('no timer');
    const result = await storePumpSession(db, clock, session({ timerId: timer.id }));
    expect(result.committed).toBe(true);
    expect(await runningTimerFor(db, HOUSEHOLD, 'pump', null)).toBeUndefined();
    const activity = await db.get<{ metadata: string }>(
      'select metadata from activities where id = ?',
      [result.activityId],
    );
    expect(JSON.parse(activity?.metadata ?? '{}')).toMatchObject({ timer_id: timer.id });
    const kinds = await db.all<{ entity: string; op: string }>(
      'select entity, op from outbox order by seq',
      [],
    );
    expect(kinds.map(k => `${k.entity} ${k.op}`)).toContain('timer DELETE');
    await balances(db);
  });

  it('with no storage location yet, the session is saved and nothing is stored', async () => {
    const { db, clock } = await fixture();
    await db.run('delete from storage_locations where household_id = ?', [HOUSEHOLD]);
    const result = await storePumpSession(db, clock, session());
    expect(result.committed).toBe(true);
    expect(result.containerId).toBeNull();
    expect(await liveActivities(db)).toBe(1);
  });

  /**
   * AN END IS NEVER BEFORE ITS START (2026-09-25), the guard `stopTimer` has. A pump timer started
   * on a phone whose clock runs fast, finished here a minute later, was written ending before it
   * began: kept on this phone and refused by the server for good (`activity_time_sane`), so it
   * never synced. It is clamped to a session of no length, as a stopped sleep is.
   */
  it('clamps an end before the start to a session of no length, on the row and in the queue', async () => {
    const { db, clock } = await fixture();
    const start = '2026-09-14T03:03:00.000Z';
    const early = '2026-09-14T03:01:00.000Z';
    const result = await storePumpSession(
      db,
      clock,
      session({ startAt: start, endAt: early, store: false }),
    );
    expect(result.committed).toBe(true);
    expect(
      await db.get('select start_at, end_at from activities where id = ?', [result.activityId]),
    ).toEqual({ start_at: start, end_at: start });
    const queued = await db.all<{ entity: string; payload: string }>(
      "select entity, payload from outbox where entity = 'activity' order by seq",
    );
    expect(queued.map(q => JSON.parse(q.payload) as Record<string, unknown>)).toEqual([
      expect.objectContaining({ start_at: start, end_at: start }),
    ]);

    // "Feed it all" with no counter to pour into: the bottle is dated at the (clamped) end too
    const fed = await storePumpSession(
      db,
      clock,
      session({
        startAt: '2026-09-14T05:03:00.000Z',
        endAt: '2026-09-14T05:01:00.000Z',
        destination: 'all',
        childId: CHILD_A,
      }),
    );
    expect(
      await db.get('select start_at, end_at from activities where id = ?', [fed.activityId]),
    ).toEqual({ start_at: '2026-09-14T05:03:00.000Z', end_at: '2026-09-14T05:03:00.000Z' });
    expect(
      await db.get('select start_at from activities where id = ?', [fed.bottleActivityId]),
    ).toEqual({ start_at: '2026-09-14T05:03:00.000Z' });

    // and a session that ends after it starts is written exactly as it was given
    const fine = await storePumpSession(
      db,
      clock,
      session({ startAt: '2026-09-14T07:00:00.000Z', endAt: '2026-09-14T07:18:00.000Z' }),
    );
    expect(
      await db.get('select start_at, end_at from activities where id = ?', [fine.activityId]),
    ).toEqual({ start_at: '2026-09-14T07:00:00.000Z', end_at: '2026-09-14T07:18:00.000Z' });
  });
});

/* ------------------------------------------------------------------ WP6 */

const profile = MILK_GUIDANCE.CDC_US['2026_01'];
const TZ = 'America/Los_Angeles';
const ctx = { householdId: HOUSEHOLD, createdBy: USER, deviceId: null, source: 'sheet' as const };
const SESSION = {
  ...ctx,
  startAt: '2026-09-14T07:30:00.000Z',
  endAt: '2026-09-14T07:48:00.000Z',
  leftMl: 89,
  rightMl: 88, // 177 ml = ozToMl(6)
  store: true,
};

const containerRows = (db: Db) =>
  db.all<{
    id: string;
    initial_ml: number;
    amount_ml: number;
    status: string;
    location_id: string;
    pumped_at: string;
    first_frozen_at: string | null;
    thawed_at: string | null;
    source_activity_id: string | null;
  }>(
    `select id, initial_ml, amount_ml, status, location_id, pumped_at, first_frozen_at, thawed_at,
            source_activity_id from milk_containers order by initial_ml desc, id`,
  );
const ledger = (db: Db, kind?: string) =>
  db.all<{
    container_id: string;
    kind: string;
    delta_ml: number;
    from_location_id: string | null;
    to_location_id: string | null;
    activity_id: string | null;
  }>(
    `select container_id, kind, delta_ml, from_location_id, to_location_id, activity_id
       from milk_inventory_transactions ${kind ? `where kind = '${kind}'` : ''} order by created_at, id`,
  );

describe('storePumpSession: the three destinations (MILK_STASH §6d) and the split (@AT-11)', () => {
  it('11.1 splits 6 oz as 4 + 2 into 118 + 59: two containers, two ADD rows, exactly 177 ml more, no third', async () => {
    const { db, clock } = await fixture();
    const before = await db.tx(t => stashTotalMl(t, HOUSEHOLD));
    const r = await storePumpSession(db, clock, { ...SESSION, split: { part1Ml: ozToMl(4) } });
    expect(r.committed).toBe(true);
    expect(r.containerIds).toHaveLength(2);
    const rows = await containerRows(db);
    expect(rows.map(c => c.initial_ml)).toEqual([118, 59]);
    expect(rows.every(c => c.source_activity_id === r.activityId)).toBe(true);
    expect((await ledger(db, 'ADD')).map(l => l.delta_ml).sort((a, b) => b - a)).toEqual([118, 59]);
    expect((await db.tx(t => stashTotalMl(t, HOUSEHOLD))) - before).toBe(ozToMl(6));
    expect(await liveCount(db, 'milk_containers')).toBe(2);
    await balances(db);
  });

  it('11.2 keep as one: one container of 177, one ADD; 11.5 a first part equal to the whole is also one', async () => {
    const { db, clock } = await fixture();
    const one = await storePumpSession(db, clock, SESSION);
    expect(one.containerIds).toHaveLength(1);
    expect((await containerRows(db)).map(c => c.initial_ml)).toEqual([177]);
    const whole = await storePumpSession(db, clock, {
      ...SESSION,
      startAt: '2026-09-14T09:30:00.000Z',
      split: { part1Ml: 177 },
    });
    expect(whole.containerIds).toHaveLength(1);
    expect(await liveCount(db, 'milk_containers')).toBe(2);
    await balances(db);
  });

  it('11.4 a replay of the same intent writes nothing twice: still two containers, still 177 ml', async () => {
    const { db, clock } = await fixture();
    const input = {
      ...SESSION,
      split: { part1Ml: ozToMl(4) },
      intentId: 'ffffffff-1111-4000-8000-000000000001',
      activityId: 'ffffffff-2222-4000-8000-000000000001',
    };
    const first = await storePumpSession(db, clock, input);
    const again = await storePumpSession(db, clock, input);
    expect(again.containerIds).toEqual(first.containerIds);
    expect(await liveCount(db, 'milk_containers')).toBe(2);
    expect(await db.tx(t => stashTotalMl(t, HOUSEHOLD))).toBe(177);
    expect(await liveActivities(db)).toBe(1);
    expect(
      await db.all("select id from milk_inventory_transactions where kind = 'ADD'"),
    ).toHaveLength(2);
    await balances(db);
  });

  it('into a freezer the container gets its freeze date now; into the fridge it has none', async () => {
    const { db, clock } = await fixture();
    const frz = await saveLocation(db, clock, { ...ctx, name: 'Freezer', kind: 'FREEZER' });
    const frozen = await storePumpSession(db, clock, { ...SESSION, locationId: frz.locationId });
    const fresh = await storePumpSession(db, clock, {
      ...SESSION,
      startAt: '2026-09-14T09:30:00.000Z',
      locationId: LOCATION,
    });
    const rows = await containerRows(db);
    expect(rows.find(c => c.id === frozen.containerId)).toMatchObject({
      first_frozen_at: clock.iso(),
      location_id: frz.locationId,
    });
    expect(rows.find(c => c.id === fresh.containerId)).toMatchObject({ first_frozen_at: null });
  });

  /**
   * FEED SOME LOGS THE BOTTLE TOO, in the same write (the owner, 2026-09-20: "why does this need
   * to be manually recorded? just make it automatically recorded in the bottle module as well").
   * It used to leave the poured milk sitting in a ROOM container for the bottle sheet to claim
   * on a second pass, which a parent could simply dismiss — and then the ledger held milk on a
   * counter that nothing had ever been fed from.
   */
  it('feed some: the stored part in the fridge, and the poured part logged as a bottle in the same write', async () => {
    const { db, clock } = await fixture();
    const room = await saveLocation(db, clock, { ...ctx, name: 'Counter', kind: 'ROOM' });
    const r = await storePumpSession(db, clock, {
      ...SESSION,
      destination: 'some',
      feedNowMl: ozToMl(2.5),
      roomLocationId: room.locationId,
      childId: CHILD_A,
    });
    expect(r.feedContainerId).not.toBeNull();
    expect(r.bottleActivityId).not.toBeNull();
    const rows = await containerRows(db);
    // the counter container exists and is drawn to zero by the bottle, exactly as `all` does
    expect(rows.find(c => c.id === r.feedContainerId)).toMatchObject({
      initial_ml: ozToMl(2.5),
      amount_ml: 0,
      location_id: room.locationId,
      status: 'USED',
    });
    expect(rows.find(c => c.id === r.containerId)).toMatchObject({
      amount_ml: 177 - ozToMl(2.5),
      location_id: LOCATION,
    });
    // only the stored part is still in the stash; the fed part left it
    expect(await db.tx(t => stashTotalMl(t, HOUSEHOLD))).toBe(177 - ozToMl(2.5));
    // the pump and the bottle, one transaction
    expect(await liveActivities(db)).toBe(2);
    await balances(db);
  });

  it('feed it all: a ROOM container drawn to zero by the bottle this write logs — pumped, poured, fed', async () => {
    const { db, clock } = await fixture();
    const room = await saveLocation(db, clock, { ...ctx, name: 'Counter', kind: 'ROOM' });
    const r = await storePumpSession(db, clock, {
      ...SESSION,
      destination: 'all',
      roomLocationId: room.locationId,
      childId: CHILD_A,
    });
    expect(r.containerIds).toEqual([]);
    expect(r.feedContainerId).not.toBeNull();
    expect(r.bottleActivityId).not.toBeNull();
    const rows = await containerRows(db);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ initial_ml: 177, amount_ml: 0, status: 'USED' });
    const bottle = await db.get<{ child_id: string; quantity: number; type: string }>(
      'select child_id, quantity, type from activities where id = ?',
      [r.bottleActivityId],
    );
    expect(bottle).toEqual({ child_id: CHILD_A, quantity: 177, type: 'bottle' });
    const detail = await db.get<{
      from_stash: number;
      container_id: string | null;
      consumed_ml: number;
    }>('select from_stash, container_id, consumed_ml from bottle_details where activity_id = ?', [
      r.bottleActivityId,
    ]);
    expect(detail).toEqual({ from_stash: 1, container_id: null, consumed_ml: 177 });
    const uses = await ledger(db, 'USE');
    expect(uses).toHaveLength(1);
    expect(uses[0]).toMatchObject({
      container_id: r.feedContainerId,
      delta_ml: -177,
      activity_id: r.bottleActivityId,
    });
    expect(await db.tx(t => stashTotalMl(t, HOUSEHOLD))).toBe(0);
    expect(await liveActivities(db)).toBe(2);
    await balances(db);
  });

  /**
   * NO COUNTER, AND THE FEED IS STILL LOGGED (the audit of 2026-09-24, feeding C5). Without a ROOM
   * location nothing can be poured, and the fed part used to vanish — no bottle, no container —
   * under a toast that said "logged as a bottle". It is now a plain bottle, in the same write.
   */
  it('feed some with no ROOM location: the stored part is saved and the fed part is a plain bottle', async () => {
    const { db, clock } = await fixture();
    const r = await storePumpSession(db, clock, {
      ...SESSION,
      destination: 'some',
      feedNowMl: ozToMl(2.5),
      roomLocationId: null,
      childId: CHILD_A,
    });
    expect(r.feedContainerId).toBeNull();
    expect(r.containerIds).toHaveLength(1);
    expect((await containerRows(db))[0]?.initial_ml).toBe(177 - ozToMl(2.5));
    expect(r.bottleActivityId).not.toBeNull();
    expect(
      await db.get('select child_id, type, quantity, start_at from activities where id = ?', [
        r.bottleActivityId,
      ]),
    ).toEqual({
      child_id: CHILD_A,
      type: 'bottle',
      quantity: ozToMl(2.5),
      start_at: SESSION.endAt,
    });
    expect(
      await db.get(
        'select kind, consumed_ml, offered_ml, from_stash, container_id from bottle_details where activity_id = ?',
        [r.bottleActivityId],
      ),
    ).toEqual({
      kind: 'EBM',
      consumed_ml: ozToMl(2.5),
      offered_ml: ozToMl(2.5),
      from_stash: 0,
      container_id: null,
    });
    // nothing was poured, so the ledger has only the stored part's ADD
    expect((await ledger(db)).map(l => l.kind)).toEqual(['ADD']);
    expect(await liveActivities(db)).toBe(2);
    await balances(db);
  });

  it('feed it all with no ROOM location: the session and one plain bottle, nothing stored', async () => {
    const { db, clock } = await fixture();
    const r = await storePumpSession(db, clock, {
      ...SESSION,
      destination: 'all',
      roomLocationId: null,
      childId: CHILD_A,
    });
    expect(r.committed).toBe(true);
    expect(r.containerIds).toEqual([]);
    expect(r.feedContainerId).toBeNull();
    expect(
      await db.get('select quantity from activities where id = ?', [r.bottleActivityId]),
    ).toEqual({ quantity: 177 });
    expect(await containerRows(db)).toEqual([]);
    expect(await liveActivities(db)).toBe(2);
    // the pump row says nothing went to the stash, because nothing did
    expect(
      await db.get('select stored_to_stash from pump_details where activity_id = ?', [
        r.activityId,
      ]),
    ).toEqual({ stored_to_stash: 0 });
  });
});

/**
 * A SESSION WITH NOTHING ON EITHER SIDE IS NOT A RIGHT-SIDE SESSION (the audit of 2026-09-24,
 * feeding C13): "Save session only" at 0, and a Schedule pump with no amount, were both written
 * as RIGHT, which the full download then carried.
 */
describe('storePumpSession: the sides a session names', () => {
  const zero = {
    householdId: HOUSEHOLD,
    createdBy: USER,
    deviceId: null,
    source: 'sheet' as const,
    startAt: '2026-09-14T03:00:00.000Z',
    endAt: '2026-09-14T03:18:00.000Z',
    store: false,
  };
  const sidesOf = async (db: Db, id: string) =>
    (await db.get<{ sides: string }>('select sides from pump_details where activity_id = ?', [id]))
      ?.sides;

  it('writes BOTH when neither side has an amount, and each side when only it does', async () => {
    const { db, clock } = await fixture();
    const none = await storePumpSession(db, clock, { ...zero, leftMl: null, rightMl: null });
    expect(await sidesOf(db, none.activityId)).toBe('BOTH');
    const zeros = await storePumpSession(db, clock, {
      ...zero,
      startAt: '2026-09-14T05:00:00.000Z',
      endAt: '2026-09-14T05:10:00.000Z',
      leftMl: 0,
      rightMl: 0,
    });
    expect(await sidesOf(db, zeros.activityId)).toBe('BOTH');
    const left = await storePumpSession(db, clock, {
      ...zero,
      startAt: '2026-09-14T07:00:00.000Z',
      endAt: '2026-09-14T07:10:00.000Z',
      leftMl: 60,
      rightMl: 0,
    });
    expect(await sidesOf(db, left.activityId)).toBe('LEFT');
    const right = await storePumpSession(db, clock, {
      ...zero,
      startAt: '2026-09-14T09:00:00.000Z',
      endAt: '2026-09-14T09:10:00.000Z',
      leftMl: null,
      rightMl: 60,
    });
    expect(await sidesOf(db, right.activityId)).toBe('RIGHT');
  });
});

describe('addStoredMilk (SHEETS.addstash)', () => {
  it('a container with no session behind it, its ADD, and a freeze date only in a freezer', async () => {
    const { db, clock } = await fixture();
    const frz = await saveLocation(db, clock, { ...ctx, name: 'Freezer', kind: 'FREEZER' });
    const a = await addStoredMilk(db, clock, {
      ...ctx,
      locationId: LOCATION,
      amountMl: 118,
      pumpedAt: '2026-09-13T20:00:00.000Z',
    });
    const b = await addStoredMilk(db, clock, {
      ...ctx,
      locationId: frz.locationId,
      amountMl: 148,
      pumpedAt: '2026-09-10T20:00:00.000Z',
      firstFrozenAt: '2026-09-11T08:00:00.000Z',
      containerType: 'BOTTLE',
    });
    const rows = await containerRows(db);
    expect(rows.find(c => c.id === a.containerId)).toMatchObject({
      amount_ml: 118,
      first_frozen_at: null,
      source_activity_id: null,
    });
    expect(rows.find(c => c.id === b.containerId)).toMatchObject({
      amount_ml: 148,
      first_frozen_at: '2026-09-11T08:00:00.000Z',
    });
    expect((await ledger(db, 'ADD')).every(l => l.activity_id === null)).toBe(true);
    await balances(db);
  });

  /**
   * NEVER PUMPED LATER THAN NOW (2026-09-25). The sheet saved a Today time later than now in the
   * future, and every date the stash shows counts from `pumped_at` — later than the published
   * windows allow. The sheet reads such a time as last night now; the write refuses one that gets
   * here anyway, before anything is written, with a minute of slack for a clock that runs ahead.
   */
  it('refuses a pumped time later than now and writes nothing', async () => {
    const { db, clock } = await fixture();
    const later = clock.iso(clock.now() + 16.5 * 3_600_000);
    await expect(
      addStoredMilk(db, clock, { ...ctx, locationId: LOCATION, amountMl: 118, pumpedAt: later }),
    ).rejects.toBeInstanceOf(PumpedLaterThanNowError);
    await expect(
      addStoredMilk(db, clock, {
        ...ctx,
        locationId: LOCATION,
        amountMl: 118,
        pumpedAt: clock.iso(clock.now() + 61_000),
      }),
    ).rejects.toThrow('milk cannot be added as pumped later than now');
    expect(await liveCount(db, 'milk_containers')).toBe(0);
    expect(await db.all('select * from outbox')).toEqual([]);
    // now, and a few seconds ahead of it, are not the future
    const ok = await addStoredMilk(db, clock, {
      ...ctx,
      locationId: LOCATION,
      amountMl: 118,
      pumpedAt: clock.iso(clock.now() + 30_000),
    });
    expect(ok.committed).toBe(true);
    await balances(db);
  });
});

describe('moveContainer (@AT-12: first_frozen_at is immutable)', () => {
  const C = 'ffffffff-0000-4000-8000-00000000000a';

  it('12.3 fridge → freezer sets the freeze date once, with one MOVE row of delta 0 carrying both ids', async () => {
    const { db, clock } = await fixture();
    const frz = await saveLocation(db, clock, { ...ctx, name: 'Kitchen freezer', kind: 'FREEZER' });
    await seedContainer(db, { id: C, amountMl: 118 });
    const r = await moveContainer(db, clock, {
      ...ctx,
      containerId: C,
      toLocationId: frz.locationId,
    });
    expect(r).toMatchObject({
      committed: true,
      froze: true,
      keptFreezeDate: false,
      thawing: false,
    });
    expect((await containerRows(db))[0]).toMatchObject({
      location_id: frz.locationId,
      first_frozen_at: clock.iso(),
      status: 'STORED',
    });
    const moves = await ledger(db, 'MOVE');
    expect(moves).toEqual([
      {
        container_id: C,
        kind: 'MOVE',
        delta_ml: 0,
        from_location_id: LOCATION,
        to_location_id: frz.locationId,
        activity_id: null,
      },
    ]);
    await balances(db);
  });

  it('12.1 freezer → freezer keeps the freeze date byte-identical, and says so', async () => {
    const { db, clock } = await fixture();
    const frz = await saveLocation(db, clock, { ...ctx, name: 'Kitchen freezer', kind: 'FREEZER' });
    const garage = await saveLocation(db, clock, {
      ...ctx,
      name: 'Garage chest freezer',
      kind: 'DEEP_FREEZER',
    });
    await seedContainer(db, { id: C, amountMl: 118 });
    await moveContainer(db, clock, { ...ctx, containerId: C, toLocationId: frz.locationId });
    const T0 = (await containerRows(db))[0]!.first_frozen_at;
    clock.advance(3 * 24 * 60 * 60_000);
    const r = await moveContainer(db, clock, {
      ...ctx,
      containerId: C,
      toLocationId: garage.locationId,
    });
    expect(r).toMatchObject({ froze: false, keptFreezeDate: true });
    expect((await containerRows(db))[0]).toMatchObject({
      location_id: garage.locationId,
      first_frozen_at: T0,
    });
    expect(await ledger(db, 'MOVE')).toHaveLength(2);
  });

  // since 2026-09-25 the fridge interlude is a thaw: out of the freezer is where thawing starts
  it('12.4 freezer → fridge → freezer: the first value survives; out is a THAW, back in a MOVE', async () => {
    const { db, clock } = await fixture();
    const frz = await saveLocation(db, clock, { ...ctx, name: 'Kitchen freezer', kind: 'FREEZER' });
    await seedContainer(db, { id: C, amountMl: 118 });
    await moveContainer(db, clock, { ...ctx, containerId: C, toLocationId: frz.locationId });
    const T0 = (await containerRows(db))[0]!.first_frozen_at;
    clock.advance(60 * 60_000);
    const out = await moveContainer(db, clock, { ...ctx, containerId: C, toLocationId: LOCATION });
    expect(out).toMatchObject({ startedThaw: true, thawing: false, refrozen: false });
    const thawedAt = clock.iso();
    clock.advance(60 * 60_000);
    const back = await moveContainer(db, clock, {
      ...ctx,
      containerId: C,
      toLocationId: frz.locationId,
    });
    expect(back).toMatchObject({ froze: false, startedThaw: false, refrozen: true });
    expect((await containerRows(db))[0]).toMatchObject({
      first_frozen_at: T0,
      thawed_at: thawedAt,
      status: 'STORED',
    });
    const moves = (await ledger(db)).filter(m => m.kind !== 'ADD');
    expect(moves.map(m => [m.kind, m.from_location_id, m.to_location_id, m.delta_ml])).toEqual([
      ['MOVE', LOCATION, frz.locationId, 0],
      ['THAW', frz.locationId, LOCATION, 0],
      ['MOVE', LOCATION, frz.locationId, 0],
    ]);
    await balances(db);
  });

  /**
   * THE OWNER'S CASE (2026-09-25: "Milk stash from freezer, yes make the change"). A bag frozen
   * weeks ago goes straight to the plain fridge — no "Mark thawing" — and is dated as what it is,
   * thawed milk in a refrigerator, from the moment it left the freezer: the published file's 24
   * hours, not four days from a pump date weeks ago, which read "Past window" on arrival.
   */
  it('a frozen bag moved straight to the fridge starts thawing: thawed_at is the move, dated THAWED', async () => {
    const { db, clock } = await fixture();
    const frz = await saveLocation(db, clock, { ...ctx, name: 'Kitchen freezer', kind: 'FREEZER' });
    await seedContainer(db, { id: C, amountMl: 118, pumpedAt: '2026-08-02T14:30:00.000Z' });
    await moveContainer(db, clock, { ...ctx, containerId: C, toLocationId: frz.locationId });
    clock.advance(2 * 60 * 60_000);
    const r = await moveContainer(db, clock, { ...ctx, containerId: C, toLocationId: LOCATION });
    expect(r).toMatchObject({
      committed: true,
      toKind: 'FRIDGE',
      startedThaw: true,
      thawing: false,
      froze: false,
      keptFreezeDate: false,
      refrozen: false,
    });
    const row = (await containerRows(db))[0]!;
    expect(row).toMatchObject({ location_id: LOCATION, status: 'STORED', thawed_at: clock.iso() });
    const dates = guidanceDates(profile, 'FRIDGE', row);
    const thawedMs = Date.parse(clock.iso());
    expect(dates).toMatchObject({
      kind: 'THAWED',
      anchorField: 'thawed_at',
      anchorAt: thawedMs,
      bestUseAt: thawedMs + profile.conditions.THAWED.bestUseMinutes * 60_000,
      missing: null,
    });
    expect(await ledger(db, 'THAW')).toEqual([
      {
        container_id: C,
        kind: 'THAW',
        delta_ml: 0,
        from_location_id: frz.locationId,
        to_location_id: LOCATION,
        activity_id: null,
      },
    ]);
    await balances(db);
  });

  it('out of the freezer onto the counter the thaw starts too; the counter keeps its own dates, the fridge after it the thaw', async () => {
    const { db, clock } = await fixture();
    const frz = await saveLocation(db, clock, { ...ctx, name: 'Kitchen freezer', kind: 'FREEZER' });
    const counter = await saveLocation(db, clock, { ...ctx, name: 'Counter', kind: 'ROOM' });
    await seedContainer(db, { id: C, amountMl: 118, pumpedAt: '2026-08-02T14:30:00.000Z' });
    await moveContainer(db, clock, { ...ctx, containerId: C, toLocationId: frz.locationId });
    clock.advance(60 * 60_000);
    const out = await moveContainer(db, clock, {
      ...ctx,
      containerId: C,
      toLocationId: counter.locationId,
    });
    expect(out).toMatchObject({ startedThaw: true, toKind: 'ROOM' });
    const leftFreezer = clock.iso();
    const onCounter = (await containerRows(db))[0]!;
    expect(onCounter.thawed_at).toBe(leftFreezer);
    // the file has no thawed-at-room condition: the counter is dated from the pump, as before
    expect(guidanceDates(profile, 'ROOM', onCounter)).toMatchObject({
      kind: 'ROOM',
      anchorField: 'pumped_at',
    });
    clock.advance(30 * 60_000);
    const fridge = await moveContainer(db, clock, {
      ...ctx,
      containerId: C,
      toLocationId: LOCATION,
    });
    expect(fridge).toMatchObject({ startedThaw: false, refrozen: false });
    const inFridge = (await containerRows(db))[0]!;
    expect(inFridge.thawed_at).toBe(leftFreezer);
    expect(guidanceDates(profile, 'FRIDGE', inFridge)).toMatchObject({
      kind: 'THAWED',
      anchorAt: Date.parse(leftFreezer),
    });
    expect((await ledger(db)).filter(m => m.kind !== 'ADD').map(m => m.kind)).toEqual([
      'MOVE',
      'THAW',
      'MOVE',
    ]);
    await balances(db);
  });

  it('milk that was never frozen moves between the fridge and the counter without a thaw', async () => {
    const { db, clock } = await fixture();
    const counter = await saveLocation(db, clock, { ...ctx, name: 'Counter', kind: 'ROOM' });
    await seedContainer(db, { id: C, amountMl: 118 });
    const out = await moveContainer(db, clock, {
      ...ctx,
      containerId: C,
      toLocationId: counter.locationId,
    });
    const back = await moveContainer(db, clock, { ...ctx, containerId: C, toLocationId: LOCATION });
    for (const r of [out, back]) expect(r).toMatchObject({ startedThaw: false, refrozen: false });
    expect((await containerRows(db))[0]!.thawed_at).toBeNull();
    expect(await ledger(db, 'THAW')).toEqual([]);
  });

  it('a bag refrozen with ice still in it starts a new thaw the next time it leaves the freezer', async () => {
    const { db, clock } = await fixture();
    const frz = await saveLocation(db, clock, { ...ctx, name: 'Kitchen freezer', kind: 'FREEZER' });
    await seedContainer(db, { id: C, amountMl: 118 });
    await moveContainer(db, clock, { ...ctx, containerId: C, toLocationId: frz.locationId });
    await moveContainer(db, clock, { ...ctx, containerId: C, toLocationId: LOCATION });
    const firstThaw = clock.iso();
    clock.advance(60 * 60_000);
    await moveContainer(db, clock, { ...ctx, containerId: C, toLocationId: frz.locationId });
    // back in the freezer the thaw is history: frozen milk is dated from its first freeze
    const frozen = (await containerRows(db))[0]!;
    expect(frozen.thawed_at).toBe(firstThaw);
    expect(guidanceDates(profile, 'FREEZER', frozen).kind).toBe('FREEZER');
    clock.advance(3 * 24 * 60 * 60_000);
    await moveContainer(db, clock, { ...ctx, containerId: C, toLocationId: LOCATION });
    const again = (await containerRows(db))[0]!;
    expect(again.thawed_at).toBe(clock.iso());
    expect(guidanceDates(profile, 'FRIDGE', again)).toMatchObject({
      kind: 'THAWED',
      anchorAt: Date.parse(clock.iso()),
    });
  });

  it('12.5 thaw, then back to a fridge: THAWING with a THAW row, then STORED with thawed_at kept', async () => {
    const { db, clock } = await fixture();
    const frz = await saveLocation(db, clock, { ...ctx, name: 'Kitchen freezer', kind: 'FREEZER' });
    const thaw = await saveLocation(db, clock, { ...ctx, name: 'Thawing', kind: 'THAWED' });
    await seedContainer(db, { id: C, amountMl: 118 });
    await moveContainer(db, clock, { ...ctx, containerId: C, toLocationId: frz.locationId });
    const T0 = (await containerRows(db))[0]!.first_frozen_at;
    clock.advance(60 * 60_000);
    const thawed = await moveContainer(db, clock, {
      ...ctx,
      containerId: C,
      toLocationId: thaw.locationId,
    });
    expect(thawed.thawing).toBe(true);
    expect((await containerRows(db))[0]).toMatchObject({
      status: 'THAWING',
      thawed_at: clock.iso(),
      first_frozen_at: T0,
    });
    expect(await ledger(db, 'THAW')).toHaveLength(1);
    const thawedAt = clock.iso();
    clock.advance(60 * 60_000);
    const fridge = await moveContainer(db, clock, {
      ...ctx,
      containerId: C,
      toLocationId: LOCATION,
    });
    expect(fridge.thawing).toBe(false);
    expect((await containerRows(db))[0]).toMatchObject({
      status: 'STORED',
      thawed_at: thawedAt,
      first_frozen_at: T0,
      location_id: LOCATION,
    });
    await balances(db);
  });

  it('an icy bag back into the freezer (§6f): STORED again, the freeze date untouched', async () => {
    const { db, clock } = await fixture();
    const frz = await saveLocation(db, clock, { ...ctx, name: 'Kitchen freezer', kind: 'FREEZER' });
    const thaw = await saveLocation(db, clock, { ...ctx, name: 'Thawing', kind: 'THAWED' });
    await seedContainer(db, { id: C, amountMl: 118 });
    await moveContainer(db, clock, { ...ctx, containerId: C, toLocationId: frz.locationId });
    const T0 = (await containerRows(db))[0]!.first_frozen_at;
    await moveContainer(db, clock, { ...ctx, containerId: C, toLocationId: thaw.locationId });
    const r = await moveContainer(db, clock, {
      ...ctx,
      containerId: C,
      toLocationId: frz.locationId,
    });
    expect(r).toMatchObject({ refrozen: true, froze: false, keptFreezeDate: false });
    expect((await containerRows(db))[0]).toMatchObject({
      status: 'STORED',
      first_frozen_at: T0,
      location_id: frz.locationId,
    });
  });
});

describe('splitContainer, adjustContainer, discardContainer', () => {
  const C = 'ffffffff-0000-4000-8000-00000000000a';

  it('11.7 splitting a stored container: SPLIT −n / +n, the total unchanged, the child inherits its dates', async () => {
    const { db, clock } = await fixture();
    await seedContainer(db, { id: C, amountMl: 177, pumpedAt: '2026-09-13T20:00:00.000Z' });
    await db.run('update milk_containers set first_frozen_at = ? where id = ?', [
      '2026-09-13T22:00:00.000Z',
      C,
    ]);
    const r = await splitContainer(db, clock, { ...ctx, containerId: C, ml: 59 });
    expect(r.committed).toBe(true);
    const rows = await containerRows(db);
    expect(rows.map(c => [c.id === C ? 'parent' : 'child', c.amount_ml])).toEqual([
      ['parent', 118],
      ['child', 59],
    ]);
    expect(rows.find(c => c.id === r.childContainerId)).toMatchObject({
      initial_ml: 59,
      first_frozen_at: '2026-09-13T22:00:00.000Z',
      location_id: LOCATION,
      status: 'STORED',
    });
    expect((await ledger(db, 'SPLIT')).map(l => l.delta_ml)).toEqual([-59, 59]);
    expect(await db.tx(t => stashTotalMl(t, HOUSEHOLD))).toBe(177);
    await balances(db);
    await expect(splitContainer(db, clock, { ...ctx, containerId: C, ml: 118 })).rejects.toThrow(
      RangeError,
    );
  });

  it('correcting an amount is one ADJUST by the difference; to zero closes the container', async () => {
    const { db, clock } = await fixture();
    await seedContainer(db, { id: C, amountMl: 177 });
    const r = await adjustContainer(db, clock, { ...ctx, containerId: C, amountMl: 150 });
    expect(r.deltaMl).toBe(-27);
    expect((await ledger(db, 'ADJUST')).map(l => l.delta_ml)).toEqual([-27]);
    expect((await containerRows(db))[0]).toMatchObject({ amount_ml: 150, status: 'STORED' });
    await balances(db);
    await adjustContainer(db, clock, { ...ctx, containerId: C, amountMl: 0 });
    expect((await containerRows(db))[0]).toMatchObject({ amount_ml: 0, status: 'USED' });
    await balances(db);
  });

  it('discarding writes the status, the neutral reason and one DISCARD row for what was left (§8)', async () => {
    const { db, clock } = await fixture();
    await seedContainer(db, { id: C, amountMl: 118 });
    const r = await discardContainer(db, clock, { ...ctx, containerId: C, reason: 'UNFINISHED' });
    expect(r).toMatchObject({ committed: true, discardedMl: 118 });
    const row = await db.get<{
      status: string;
      discard_reason: string;
      discarded_at: string;
      amount_ml: number;
    }>('select status, discard_reason, discarded_at, amount_ml from milk_containers where id = ?', [
      C,
    ]);
    expect(row).toEqual({
      status: 'DISCARDED',
      discard_reason: 'UNFINISHED',
      discarded_at: clock.iso(),
      amount_ml: 0,
    });
    expect(await ledger(db, 'DISCARD')).toMatchObject([{ container_id: C, delta_ml: -118 }]);
    expect(await db.tx(t => stashTotalMl(t, HOUSEHOLD))).toBe(0);
    await balances(db);
    // terminal: it cannot be moved, split or discarded again
    await expect(
      discardContainer(db, clock, { ...ctx, containerId: C, reason: null }),
    ).rejects.toThrow(RangeError);
  });
});

describe('the ranking in the draw (MILK_STASH §6b) and the remainder floor (13.4)', () => {
  const FRESH = 'ffffffff-0000-4000-8000-00000000000a';
  const FRIDGE = 'ffffffff-0000-4000-8000-00000000000b';
  const FROZEN = 'ffffffff-0000-4000-8000-00000000000c';
  const PAST = 'ffffffff-0000-4000-8000-00000000000d';

  async function stocked() {
    const f = await fixture();
    const { db, clock } = f;
    const room = await saveLocation(db, clock, { ...ctx, name: 'Counter', kind: 'ROOM' });
    const frz = await saveLocation(db, clock, { ...ctx, name: 'Freezer', kind: 'FREEZER' });
    // oldest pumped first would pick the frozen bag; the ranking picks what is out
    await seedContainer(db, { id: FROZEN, amountMl: 118, pumpedAt: '2026-08-01T08:00:00.000Z' });
    await db.run('update milk_containers set location_id = ?, first_frozen_at = ? where id = ?', [
      frz.locationId,
      '2026-08-01T09:00:00.000Z',
      FROZEN,
    ]);
    await seedContainer(db, { id: FRIDGE, amountMl: 118, pumpedAt: '2026-09-13T08:00:00.000Z' });
    await seedContainer(db, { id: FRESH, amountMl: 74, pumpedAt: '2026-09-14T07:20:00.000Z' });
    await db.run('update milk_containers set location_id = ? where id = ?', [
      room.locationId,
      FRESH,
    ]);
    // past its own 4-day limit in the fridge: listed, never drawn unasked
    await seedContainer(db, { id: PAST, amountMl: 200, pumpedAt: '2026-09-01T08:00:00.000Z' });
    return f;
  }
  const rank = (clock: { now(): number }) => ({ profile, nowMs: clock.now(), timeZone: TZ });

  it('fresh is drawn before the fridge, the fridge before the freezer; a past-limit container never unasked', async () => {
    const { db, clock } = await stocked();
    const r = await logBottleFromStash(db, clock, { ...bottle(148), rank: rank(clock) });
    expect(r.draws).toEqual([
      { containerId: FRESH, ml: 74 },
      { containerId: FRIDGE, ml: 74 },
    ]);
    // a bottle the suggested containers cannot cover is not topped up from the past-limit one
    const big = await logBottleFromStash(db, clock, {
      ...bottle(300),
      startAt: '2026-09-14T09:00:00.000Z',
      rank: rank(clock),
    });
    expect(big.draws.map(d => d.containerId)).toEqual([FRIDGE, FROZEN]);
    expect(big.unaccountedMl).toBe(300 - 44 - 118);
    expect(
      (
        await db.get<{ amount_ml: number }>('select amount_ml from milk_containers where id = ?', [
          PAST,
        ])
      )?.amount_ml,
    ).toBe(200);
    await balances(db);
  });

  it('the container the parent chose comes first, whatever the ranking says', async () => {
    const { db, clock } = await stocked();
    const r = await logBottleFromStash(db, clock, {
      ...bottle(118),
      rank: { ...rank(clock), preferredContainerId: PAST },
    });
    expect(r.draws).toEqual([{ containerId: PAST, ml: 118 }]);
    await balances(db);
  });

  it('13.4 a 121 ml container and a 118 ml bottle: USE −118, ADJUST −3, the container closed', async () => {
    const { db, clock } = await fixture();
    await seedContainer(db, { id: FRIDGE, amountMl: 121 });
    const r = await logBottleFromStash(db, clock, { ...bottle(118), rank: rank(clock) });
    expect(r.draws).toEqual([{ containerId: FRIDGE, ml: 118 }]);
    const rows = await ledger(db);
    // both rows share the write's clock, so the order is by kind here
    expect(
      rows
        .filter(l => l.kind !== 'ADD')
        .map(l => [l.kind, l.delta_ml])
        .sort((a, b) => String(b[0]).localeCompare(String(a[0]))),
    ).toEqual([
      ['USE', -118],
      ['ADJUST', -3],
    ]);
    expect((await containerRows(db))[0]).toMatchObject({ amount_ml: 0, status: 'USED' });
    expect(3).toBeLessThan(MILK_REMAINDER_FLOOR_ML);
    await balances(db);
  });
});
