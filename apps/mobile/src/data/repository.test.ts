/**
 * `commitWrite` — the one-transaction rule, proved (WP4.3; `docs/OFFLINE_SYNC.md` §1).
 *
 * The assertions here are the ones that would let a real log be lost or doubled: a stash bottle
 * is exactly one activity, one detail row, one ledger row and TWO outbox ops in the right order
 * with the right dependency; a throw mid-write leaves nothing behind INCLUDING the dedupe key;
 * `start_at` is the value the caller passed and never the write time; twins are two entries
 * under one outcome; and a unit flip enqueues nothing at all.
 */
import { DEDUPE_WINDOW_MS, deriveOpId } from '@nibblecue/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Db } from '../db/driver';
import {
  CHILD_A,
  CHILD_B,
  HOUSEHOLD,
  USER,
  liveActivities,
  seedContainer,
  seedHousehold,
} from '../testing/fixtures';
import { logActivity, logActivityForChildren } from './activities';
import { deviceId } from './ids';
import { counts, discard, pending, retry } from './outbox';
import { lastAcceptedAt } from './dedupe';
import { commitWrite } from './repository';
import { logBottleFromStash } from './stash';
import { createStore, keys } from './store';

const CONTAINER = 'ffffffff-0000-4000-8000-000000000001';
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

const outbox = (db: Db) =>
  db.all<{
    client_op_id: string;
    entity: string;
    op: string;
    entity_id: string;
    seq: number;
    depends_on: string | null;
    state: string;
    payload: string;
  }>(
    'select client_op_id, entity, op, entity_id, seq, depends_on, state, payload from outbox order by seq',
    [],
  );

describe('commitWrite: one transaction, one outcome (OFFLINE_SYNC §1)', () => {
  it('a stash bottle is 1 activity, 1 bottle_details, 1 USE row and exactly 2 ops', async () => {
    const { db, clock } = await fixture();
    await seedContainer(db, { id: CONTAINER, amountMl: 150 });

    const result = await logBottleFromStash(db, clock, {
      householdId: HOUSEHOLD,
      createdBy: USER,
      deviceId: null,
      source: 'quicklog',
      childId: CHILD_A,
      startAt: TAP,
      consumedMl: 120,
    });

    expect(result.committed).toBe(true);
    expect(await liveActivities(db)).toBe(1);
    expect(
      (await db.all('select * from bottle_details where activity_id = ?', [result.activityId]))
        .length,
    ).toBe(1);
    const ledger = await db.all<{ kind: string; delta_ml: number; container_id: string }>(
      "select kind, delta_ml, container_id from milk_inventory_transactions where kind = 'USE'",
      [],
    );
    expect(ledger).toEqual([{ kind: 'USE', delta_ml: -120, container_id: CONTAINER }]);

    const rows = await outbox(db);
    expect(rows.map(r => [r.entity, r.op, r.seq, r.state])).toEqual([
      ['activity', 'CREATE', 1, 'PENDING'],
      ['milk_txn', 'CREATE', 2, 'PENDING'],
    ]);
    // D5: the detail travels inside the activity op, so there is no third op to depend on
    const [activityOp, ledgerOp] = rows;
    expect(activityOp?.depends_on).toBeNull();
    expect(ledgerOp?.depends_on).toBe(activityOp?.client_op_id);
    expect(ledgerOp?.client_op_id).toBe(deriveOpId(result.intentId, 'use'));
    expect(JSON.parse(activityOp?.payload ?? '{}')).toMatchObject({
      detail: { table: 'bottle_details', consumed_ml: 120, offered_ml: 120, from_stash: true },
    });
  });

  it('start_at is the value passed in, never the moment of the write', async () => {
    const { db, clock } = await fixture();
    clock.advance(4 * 60 * 60 * 1000); // the parent is logging this four hours later
    const out = await logActivity(db, clock, {
      householdId: HOUSEHOLD,
      createdBy: USER,
      deviceId: null,
      source: 'sheet',
      childId: CHILD_A,
      type: 'diaper',
      startAt: TAP,
      detail: { kind: 'WET' },
    });
    const row = await db.get<{ start_at: string; created_at: string }>(
      'select start_at, created_at from activities where id = ?',
      [out.entityIds[0] ?? ''],
    );
    expect(row?.start_at).toBe(TAP);
    expect(row?.created_at).toBe(clock.iso());
  });

  it('a throw mid-write leaves zero rows AND no dedupe key', async () => {
    const { db, clock } = await fixture();
    const boom = new Error('the step after the rows threw');
    await expect(
      commitWrite(db, clock, {
        intentId: 'eeeeeeee-0000-4000-8000-000000000099',
        source: 'sheet',
        dedupe: { key: 'diaper:x:WET', windowMs: DEDUPE_WINDOW_MS },
        chain: {
          rows: [
            {
              table: 'activities',
              row: {
                id: 'eeeeeeee-0000-4000-8000-000000000098',
                client_op_id: 'eeeeeeee-0000-4000-8000-000000000099',
                household_id: HOUSEHOLD,
                child_id: CHILD_A,
                type: 'diaper',
                start_at: TAP,
                created_by: USER,
                created_at: TAP,
                updated_at: TAP,
                metadata: {},
                is_private: false,
              },
            },
          ],
          ops: [],
        },
        inTransaction: () => Promise.reject(boom),
      }),
    ).rejects.toThrow(boom);

    expect(await liveActivities(db)).toBe(0);
    expect((await outbox(db)).length).toBe(0);
    // the guard moved with the write, so the retry the parent makes is not swallowed
    expect(await db.tx(t => lastAcceptedAt(t, 'diaper:x:WET'))).toBeNull();
  });

  it('twins give two activities, per-child derived keys and ONE outcome', async () => {
    const { db, clock } = await fixture();
    const out = await logActivityForChildren(db, clock, {
      householdId: HOUSEHOLD,
      createdBy: USER,
      deviceId: null,
      source: 'sheet',
      type: 'bottle',
      startAt: TAP,
      canonicalUnit: 'ml',
      entries: [
        { childId: CHILD_A, quantity: 90, detail: { consumed_ml: 90 } },
        { childId: CHILD_B, quantity: 120, detail: { consumed_ml: 120 } },
      ],
    });

    expect(out.entityIds).toHaveLength(2);
    expect(await liveActivities(db)).toBe(2);
    const rows = await outbox(db);
    expect(rows.map(r => r.client_op_id)).toEqual([
      deriveOpId(out.intentId, CHILD_A),
      deriveOpId(out.intentId, CHILD_B),
    ]);
    const amounts = await db.all<{ quantity: number }>(
      'select quantity from activities order by quantity',
      [],
    );
    expect(amounts.map(a => a.quantity)).toEqual([90, 120]);
    // one guard per child, both recorded
    expect(await db.tx(t => lastAcceptedAt(t, `bottle:${CHILD_A}:90`))).not.toBeNull();
    expect(await db.tx(t => lastAcceptedAt(t, `bottle:${CHILD_B}:120`))).not.toBeNull();
  });

  it('@SYNC-UNITS 4 oz stores 118 ml, and a display flip enqueues nothing', async () => {
    const { db, clock } = await fixture();
    // The sheet converts at the edge; 4 fl oz is 118 ml in the app's own rounding, and that is
    // what reaches the repository. `commitWrite` never converts.
    const ML_PER_OZ = 29.5735;
    const canonical = Math.round(4 * ML_PER_OZ);
    expect(canonical).toBe(118);

    await logActivity(db, clock, {
      householdId: HOUSEHOLD,
      createdBy: USER,
      deviceId: null,
      source: 'sheet',
      childId: CHILD_A,
      type: 'bottle',
      startAt: TAP,
      quantity: canonical,
      canonicalUnit: 'ml',
      detail: { consumed_ml: canonical },
    });
    const stored = await db.get<{ quantity: number; canonical_unit: string }>(
      'select quantity, canonical_unit from activities limit 1',
      [],
    );
    expect(stored).toEqual({ quantity: 118, canonical_unit: 'ml' });

    const before = (await outbox(db)).length;
    // "the display unit is not an input to commitWrite": flipping it is a preference, not a write
    await db.run(
      'insert into ui_prefs (key, value) values (?, ?) on conflict(key) do update set value = excluded.value',
      ['volume_unit', 'oz'],
    );
    expect((await outbox(db)).length).toBe(before);
    expect(
      (await db.get<{ quantity: number }>('select quantity from activities limit 1', []))?.quantity,
    ).toBe(118);
  });

  it('a suppressed tap writes nothing at all — no row, no op, no client_op_id', async () => {
    const { db, clock } = await fixture();
    const first = await logActivity(db, clock, {
      householdId: HOUSEHOLD,
      createdBy: USER,
      deviceId: null,
      source: 'today',
      childId: CHILD_A,
      type: 'diaper',
      startAt: TAP,
      detail: { kind: 'WET' },
    });
    clock.advance(220);
    const second = await logActivity(db, clock, {
      householdId: HOUSEHOLD,
      createdBy: USER,
      deviceId: null,
      source: 'today',
      childId: CHILD_A,
      type: 'diaper',
      startAt: clock.iso(),
      detail: { kind: 'WET' },
    });
    expect(first.committed).toBe(true);
    expect(second).toMatchObject({ committed: false, suppressed: true, opIds: [], entityIds: [] });
    expect(await liveActivities(db)).toBe(1);
    expect((await outbox(db)).length).toBe(1);
  });

  it('bumps the store keys and nudges the worker only after the commit', async () => {
    const { db, clock } = await fixture();
    const store = createStore();
    const seen: string[] = [];
    store.subscribe(keys.timeline(CHILD_A, 'all'), () => seen.push('timeline'));
    const afterCommit = vi.fn();

    await logActivity(
      db,
      clock,
      {
        householdId: HOUSEHOLD,
        createdBy: USER,
        deviceId: null,
        source: 'today',
        childId: CHILD_A,
        type: 'diaper',
        startAt: TAP,
        detail: { kind: 'WET' },
      },
      { store, afterCommit },
    );
    expect(seen).toEqual(['timeline']);
    expect(afterCommit).toHaveBeenCalledTimes(1);

    // a suppressed write notifies nobody: nothing changed
    clock.advance(100);
    await logActivity(
      db,
      clock,
      {
        householdId: HOUSEHOLD,
        createdBy: USER,
        deviceId: null,
        source: 'today',
        childId: CHILD_A,
        type: 'diaper',
        startAt: clock.iso(),
        detail: { kind: 'WET' },
      },
      { store, afterCommit },
    );
    expect(seen).toEqual(['timeline']);
    expect(afterCommit).toHaveBeenCalledTimes(1);
  });

  it('a replayed chain converges rather than doubling', async () => {
    const { db, clock } = await fixture();
    const input = {
      householdId: HOUSEHOLD,
      createdBy: USER,
      deviceId: null,
      source: 'widget' as const,
      childId: CHILD_A,
      type: 'diaper' as const,
      startAt: TAP,
      detail: { kind: 'WET' },
      intentId: 'eeeeeeee-0000-4000-8000-0000000000a1',
      activityId: 'eeeeeeee-0000-4000-8000-0000000000a2',
    };
    await logActivity(db, clock, input);
    // a process killed between the write and the flush rebuilds the identical chain; the
    // dedupe window has long passed, so only the ids can save it
    clock.advance(60 * 60 * 1000);
    await logActivity(db, clock, input);
    expect(await liveActivities(db)).toBe(1);
    expect((await outbox(db)).length).toBe(1);
  });
});

describe('the outbox rows themselves (OFFLINE_SYNC §2.1)', () => {
  it('"Retry now" clears the attempt count, the backoff and the send stamp', async () => {
    const { db, clock } = await fixture();
    const out = await logActivity(db, clock, {
      householdId: HOUSEHOLD,
      createdBy: USER,
      deviceId: null,
      source: 'today',
      childId: CHILD_A,
      type: 'diaper',
      startAt: TAP,
      detail: { kind: 'WET' },
    });
    const id = out.opIds[0] ?? '';
    await db.run(
      `update outbox set state = 'FAILED', attempts = 10, next_attempt_at = ?, sending_at = ?, last_error = 'CONFLICT'`,
      [clock.iso(), clock.iso()],
    );

    expect(await db.tx(t => retry(t, id))).toBe(true);
    const row = (await outbox(db))[0];
    expect(row?.state).toBe('PENDING');
    const full = await db.get<{
      attempts: number;
      next_attempt_at: string | null;
      sending_at: string | null;
    }>('select attempts, next_attempt_at, sending_at from outbox where client_op_id = ?', [id]);
    expect(full).toEqual({ attempts: 0, next_attempt_at: null, sending_at: null });
  });

  it('"Discard" drops the OPERATION and keeps the parents entry', async () => {
    const { db, clock } = await fixture();
    const out = await logActivity(db, clock, {
      householdId: HOUSEHOLD,
      createdBy: USER,
      deviceId: null,
      source: 'today',
      childId: CHILD_A,
      type: 'diaper',
      startAt: TAP,
      detail: { kind: 'WET' },
    });
    expect(await db.tx(t => discard(t, out.opIds[0] ?? ''))).toBe(true);
    expect(await outbox(db)).toEqual([]);
    // the row stays, unsynced, forever if need be: nothing deletes a log to tidy a queue
    expect(await liveActivities(db)).toBe(1);
    expect(
      (await db.get<{ local_synced: number }>('select local_synced from activities', []))
        ?.local_synced,
    ).toBe(0);
  });

  it('counts every unsent state, which is what the chip reads', async () => {
    const { db, clock } = await fixture();
    for (const [type, kind] of [
      ['diaper', 'WET'],
      ['diaper', 'DIRTY'],
      ['diaper', 'MIXED'],
    ] as const) {
      clock.advance(4000);
      await logActivity(db, clock, {
        householdId: HOUSEHOLD,
        createdBy: USER,
        deviceId: null,
        source: 'today',
        childId: CHILD_A,
        type,
        startAt: clock.iso(),
        detail: { kind },
      });
    }
    const ids = (await outbox(db)).map(r => r.client_op_id);
    await db.run(`update outbox set state = 'SENDING' where client_op_id = ?`, [ids[0] ?? '']);
    await db.run(`update outbox set state = 'SYNCED' where client_op_id = ?`, [ids[1] ?? '']);
    expect(await db.tx(t => counts(t))).toEqual({
      pending: 1,
      sending: 1,
      synced: 1,
      failed: 0,
      unsent: 2,
    });
    expect((await db.tx(t => pending(t))).map(r => r.state).sort()).toEqual(['PENDING', 'SENDING']);
  });
});

describe('the device id', () => {
  it('is minted once and kept, so "which phone wrote this" survives a relaunch', async () => {
    const { db } = await fixture();
    const first = await deviceId(db);
    expect(first).toMatch(/^[0-9a-f-]{36}$/);
    expect(await deviceId(db)).toBe(first);
    const stored = await db.get<{ value: string }>(
      "select value from ui_prefs where key = 'device_id'",
      [],
    );
    expect(stored?.value).toBe(first);
  });
});
