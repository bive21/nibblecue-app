/**
 * What a pulled page does to the mirror, against the real local schema (`node:sqlite`).
 *
 * Every assertion here is about one of the three ways an apply can be wrong: it can write the
 * same row twice, it can delete a row it was never given authority over, or it can drop a row
 * because its parent has not arrived. The mirror declares no foreign keys precisely so the
 * third cannot happen, and this file is where that is proved rather than asserted in a comment.
 */
import { HOUSEHOLD_SETTINGS_KEY, settingsEntityId } from '@nibblecue/core';
import { afterEach, describe, expect, it } from 'vitest';
import { createStore, keys } from '../data/store';
import type { Db } from '../db/driver';
import { CHILD_A, HOUSEHOLD, LOCATION, USER, seedHousehold } from '../testing/fixtures';
import {
  applyAppend,
  applyDelta,
  applyFull,
  inApplyOrder,
  invalidationKeys,
  resetColumnCache,
  type ApplyContext,
  type ServerRow,
} from './apply';

const PARTNER = 'bbbbbbbb-0000-4000-8000-000000000002';
const ACTIVITY = 'eeee0000-0000-4000-8000-000000000001';
const CONTAINER = 'dddddddd-0000-4000-8000-0000000000c1';
const TIMER = 'cccc1111-0000-4000-8000-000000000001';
const AT = '2026-09-14T08:00:00.000Z';
const LATER = '2026-09-14T09:00:00.000Z';

const ctx = (): ApplyContext => ({ householdId: HOUSEHOLD, userId: USER, serverTime: LATER });

let restore: (() => void) | null = null;

afterEach(() => {
  restore?.();
  restore = null;
  resetColumnCache();
});

async function open(): Promise<Db> {
  const fixture = await seedHousehold();
  restore = fixture.restoreIds;
  return fixture.db;
}

/** An activity exactly as `0010`'s `sync_pull_delta` builds it: the row, plus its detail. */
function serverActivity(over: Partial<ServerRow> = {}): ServerRow {
  return {
    id: ACTIVITY,
    client_op_id: 'eeee0001-0000-4000-8000-000000000001',
    household_id: HOUSEHOLD,
    child_id: CHILD_A,
    type: 'bottle',
    start_at: AT,
    end_at: null,
    quantity: 120,
    canonical_unit: 'ml',
    notes: null,
    is_private: false,
    metadata: {},
    created_by: PARTNER,
    updated_by: PARTNER,
    device_id: null,
    created_at: AT,
    updated_at: AT,
    deleted_at: null,
    details: {
      table: 'bottle_details',
      activity_id: ACTIVITY,
      kind: 'EBM',
      offered_ml: 140,
      consumed_ml: 120,
      from_stash: false,
      container_id: null,
    },
    ...over,
  };
}

describe('applyDelta', () => {
  it('applies the same page twice to exactly the same mirror', async () => {
    const db = await open();
    const page = [serverActivity()];
    const first = await db.tx(t => applyDelta(t, 'activities', page, ctx()));
    const before = await db.all<ServerRow>('select * from activities order by id');
    const second = await db.tx(t => applyDelta(t, 'activities', page, ctx()));
    const after = await db.all<ServerRow>('select * from activities order by id');

    expect(first.written).toBe(second.written);
    expect(after).toEqual(before);
    expect(await db.all('select * from bottle_details')).toHaveLength(1);
  });

  it('lands a detail row whose parent activity has not arrived', async () => {
    const db = await open();
    // The mirror declares no foreign keys on purpose: a page applied before its parent's page
    // must not be rejected, because rule 7 does not allow losing the log to arrival order.
    await db.tx(t =>
      applyDelta(
        t,
        'bottle_details',
        [
          {
            activity_id: ACTIVITY,
            kind: 'EBM',
            offered_ml: 90,
            consumed_ml: 90,
            from_stash: false,
          },
        ],
        ctx(),
      ),
    );
    expect(
      await db.get('select activity_id from bottle_details where activity_id = ?', [ACTIVITY]),
    ).toBeDefined();
    expect(await db.get('select id from activities where id = ?', [ACTIVITY])).toBeUndefined();

    // and the parent arriving later does not disturb it
    await db.tx(t => applyDelta(t, 'activities', [serverActivity()], ctx()));
    const detail = await db.get<{ consumed_ml: number }>(
      'select consumed_ml from bottle_details where activity_id = ?',
      [ACTIVITY],
    );
    expect(detail?.consumed_ml).toBe(120);
  });

  it('adopts the server updated_at, and marks the row as no longer queued', async () => {
    const db = await open();
    await db.run(
      `insert into activities (id, client_op_id, household_id, child_id, type, start_at,
        is_private, metadata, created_by, created_at, updated_at, local_synced)
        values (?, ?, ?, ?, 'bottle', ?, 0, '{}', ?, ?, ?, 0)`,
      [ACTIVITY, 'local-op', HOUSEHOLD, CHILD_A, AT, USER, AT, AT],
    );
    await db.tx(t => applyDelta(t, 'activities', [serverActivity({ updated_at: LATER })], ctx()));
    const row = await db.get<{ updated_at: string; local_synced: number }>(
      'select updated_at, local_synced from activities where id = ?',
      [ACTIVITY],
    );
    expect(row?.updated_at).toBe(LATER);
    expect(row?.local_synced).toBe(1);
  });

  it('leaves local_synced at 0 while this device still owes the server an op for the row', async () => {
    const db = await open();
    await db.run(
      `insert into outbox (client_op_id, entity, op, entity_id, household_id, payload, seq,
        created_at, state) values (?, 'activity', 'UPDATE', ?, ?, '{}', 1, ?, 'PENDING')`,
      ['eeee0002-0000-4000-8000-000000000001', ACTIVITY, HOUSEHOLD, AT],
    );
    await db.tx(t => applyDelta(t, 'activities', [serverActivity()], ctx()));
    const row = await db.get<{ local_synced: number }>(
      'select local_synced from activities where id = ?',
      [ACTIVITY],
    );
    expect(row?.local_synced).toBe(0);
  });

  it('reports a conflict when it overwrites a newer local row with nothing queued', async () => {
    const db = await open();
    await db.run(
      `insert into activities (id, client_op_id, household_id, child_id, type, start_at,
        is_private, metadata, created_by, created_at, updated_at, local_synced)
        values (?, ?, ?, ?, 'bottle', ?, 0, '{}', ?, ?, ?, 0)`,
      [ACTIVITY, 'local-op', HOUSEHOLD, CHILD_A, AT, USER, AT, LATER],
    );
    const seen: { table: string; strategy: string }[] = [];
    const outcome = await db.tx(t =>
      applyDelta(t, 'activities', [serverActivity({ updated_at: AT })], {
        ...ctx(),
        onConflict: (table, strategy) => seen.push({ table, strategy }),
      }),
    );
    expect(outcome.conflicts).toBe(1);
    expect(seen).toEqual([{ table: 'activities', strategy: 'delta' }]);
  });

  it('writes a tombstone as an ordinary row that leaves every read and wakes a subscriber', async () => {
    const db = await open();
    await db.tx(t => applyDelta(t, 'activities', [serverActivity()], ctx()));
    const outcome = await db.tx(t =>
      applyDelta(
        t,
        'activities',
        [serverActivity({ deleted_at: LATER, updated_at: LATER })],
        ctx(),
      ),
    );

    const row = await db.get<{ deleted_at: string | null }>(
      'select deleted_at from activities where id = ?',
      [ACTIVITY],
    );
    // still there: the server keeps it, so the mirror keeps it
    expect(row?.deleted_at).toBe(LATER);
    // and gone from every read, which all filter deleted_at is null
    const live = await db.all('select id from activities where deleted_at is null');
    expect(live).toHaveLength(0);

    // the store version moves, so a screen holding the old list re-runs and loses it
    const store = createStore();
    let ran = 0;
    const key = keys.timeline(CHILD_A, 'all');
    store.subscribe(key, () => {
      ran += 1;
    });
    const before = store.version(key);
    expect(outcome.keys).toContain(key);
    store.invalidate(...outcome.keys);
    expect(ran).toBe(1);
    expect(store.version(key)).toBeGreaterThan(before);
  });
});

describe('applyFull (D18)', () => {
  it('removes a timer the server no longer has, because a stop IS a delete', async () => {
    const db = await open();
    await db.run(
      `insert into running_timers (id, household_id, child_id, type, started_at, started_by,
        meta, created_at, updated_at) values (?, ?, ?, 'sleep', ?, ?, '{}', ?, ?)`,
      [TIMER, HOUSEHOLD, CHILD_A, AT, USER, AT, AT],
    );
    const outcome = await db.tx(t => applyFull(t, 'running_timers', [], ctx(), 'household'));
    expect(outcome.removed).toBe(1);
    expect(await db.all('select id from running_timers')).toHaveLength(0);
  });

  it('never removes a timer this device has not pushed yet', async () => {
    const db = await open();
    // Started in airplane mode: a local row plus a PENDING op. The server cannot return it
    // because it does not have it, and a replace that deleted it would take a running timer off
    // the screen mid-nap.
    await db.run(
      `insert into running_timers (id, household_id, child_id, type, started_at, started_by,
        meta, created_at, updated_at) values (?, ?, ?, 'sleep', ?, ?, '{}', ?, ?)`,
      [TIMER, HOUSEHOLD, CHILD_A, AT, USER, AT, AT],
    );
    await db.run(
      `insert into outbox (client_op_id, entity, op, entity_id, household_id, payload, seq,
        created_at, state) values (?, 'timer', 'CREATE', ?, ?, '{}', 1, ?, 'PENDING')`,
      ['eeee0003-0000-4000-8000-000000000001', TIMER, HOUSEHOLD, AT],
    );

    const outcome = await db.tx(t => applyFull(t, 'running_timers', [], ctx(), 'household'));
    expect(outcome.removed).toBe(0);
    expect(await db.all('select id from running_timers')).toHaveLength(1);
  });

  it('preserves is_mom, the one column the server has never heard of', async () => {
    const db = await open();
    await db.run(
      `insert into household_members (household_id, user_id, role, joined_at, is_mom, updated_at)
        values (?, ?, 'OWNER', ?, 1, ?)`,
      [HOUSEHOLD, USER, AT, AT],
    );
    await db.tx(t =>
      applyFull(
        t,
        'household_members',
        [
          {
            household_id: HOUSEHOLD,
            user_id: USER,
            role: 'OWNER',
            joined_at: AT,
            removed_at: null,
            updated_at: LATER,
          },
        ],
        ctx(),
        'household',
      ),
    );
    const row = await db.get<{ is_mom: number; role: string; updated_at: string }>(
      'select is_mom, role, updated_at from household_members where user_id = ?',
      [USER],
    );
    expect(row).toEqual({ is_mom: 1, role: 'OWNER', updated_at: LATER });
  });

  it('stamps the local-only NOT NULL column the server has never heard of', async () => {
    const db = await open();
    // `household_members` has no `updated_at` server-side at all - which is why its strategy is
    // `full` - but the local mirror declares one `not null`. Without a stamp the very first
    // pulled membership fails its insert, and the bootstrap of a new install fails with it.
    await db.tx(t =>
      applyFull(
        t,
        'household_members',
        [
          {
            household_id: HOUSEHOLD,
            user_id: PARTNER,
            role: 'CAREGIVER',
            joined_at: AT,
            removed_at: null,
          },
        ],
        ctx(),
        'household',
      ),
    );
    const row = await db.get<{ updated_at: string; is_mom: number }>(
      'select updated_at, is_mom from household_members where user_id = ?',
      [PARTNER],
    );
    expect(row?.updated_at).toBe(LATER); // the response's server_time: when this device saw it
    expect(row?.is_mom).toBe(0);
  });

  it('leaves another member favorites alone, because the page never contained them', async () => {
    const db = await open();
    const mine = 'fa000001-0000-4000-8000-000000000001';
    const theirs = 'fa000002-0000-4000-8000-000000000002';
    const shared = 'fa000003-0000-4000-8000-000000000003';
    for (const [id, user] of [
      [mine, USER],
      [theirs, PARTNER],
      [shared, null],
    ] as const) {
      await db.run(
        `insert into favorites (id, household_id, user_id, module_id, label, payload, created_at)
          values (?, ?, ?, 'bottle', 'Usual', '{}', ?)`,
        [id, HOUSEHOLD, user, AT],
      );
    }
    // The page is what `favorites_read` would have returned: the caller's own rows and the
    // household-wide ones. The other caregiver's row is not in it and is not the page's to
    // delete.
    const outcome = await db.tx(t =>
      applyFull(
        t,
        'favorites',
        [
          {
            id: mine,
            household_id: HOUSEHOLD,
            user_id: USER,
            module_id: 'bottle',
            label: 'Usual',
            payload: {},
            created_at: AT,
          },
        ],
        ctx(),
        'user',
      ),
    );
    expect(outcome.removed).toBe(1); // the household-wide one really was withdrawn
    const left = await db.all<{ id: string }>('select id from favorites order by id');
    expect(left.map(r => r.id)).toEqual([mine, theirs]);
  });

  it('never removes published guidance, which no household owns', async () => {
    const db = await open();
    await db.run(
      `insert into milk_guidance_profiles (profile, version, effective_date, source, disclaimer,
        conditions, anchors, created_at) values ('US','2026-01','2026-01-01','x','y','[]','[]',?)`,
      [AT],
    );
    const outcome = await db.tx(t => applyFull(t, 'milk_guidance_profiles', [], ctx(), 'global'));
    expect(outcome.removed).toBe(0);
    expect(await db.all('select profile from milk_guidance_profiles')).toHaveLength(1);
  });

  it('scopes a user_window replace to the window the server answered in', async () => {
    const db = await open();
    const inWindow = 'ab000001-0000-4000-8000-000000000001';
    const fired = 'ab000002-0000-4000-8000-000000000002';
    const beyond = 'ab000003-0000-4000-8000-000000000003';
    const serverTime = Date.parse(LATER);
    const rows: [string, string, string | null][] = [
      [inWindow, new Date(serverTime + 3_600_000).toISOString(), null],
      [fired, new Date(serverTime + 3_600_000).toISOString(), LATER],
      [beyond, new Date(serverTime + 30 * 86_400_000).toISOString(), null],
    ];
    for (const [id, fireAt, sentAt] of rows) {
      await db.run(
        `insert into reminders (id, household_id, kind, user_id, fire_at, payload, sent_at,
          created_at) values (?, ?, 'schedule', ?, ?, '{}', ?, ?)`,
        [id, HOUSEHOLD, USER, fireAt, sentAt, AT],
      );
    }
    // An empty page: the server says the caller has no open reminders in the window.
    const outcome = await db.tx(t => applyFull(t, 'reminders', [], ctx(), 'user', 'user_window'));
    expect(outcome.removed).toBe(1);
    const left = await db.all<{ id: string }>('select id from reminders order by id');
    // The one that already fired is the record that it fired; the one beyond the horizon was
    // never in the page's scope.
    expect(left.map(r => r.id)).toEqual([fired, beyond]);
  });
});

describe('applyAppend', () => {
  it('inserts a ledger row once and never updates it, and the balance is the ledger sum', async () => {
    const db = await open();
    await db.run(
      `insert into milk_containers (id, household_id, owner_id, location_id, amount_ml,
        initial_ml, pumped_at, created_by, created_at, updated_at)
        values (?, ?, ?, ?, 120, 150, ?, ?, ?, ?)`,
      [CONTAINER, HOUSEHOLD, USER, LOCATION, AT, USER, AT, AT],
    );
    const ledger: ServerRow[] = [
      {
        id: 'cc000001-0000-4000-8000-000000000001',
        client_op_id: 'cc000001-0000-4000-8000-000000000001',
        household_id: HOUSEHOLD,
        container_id: CONTAINER,
        kind: 'ADD',
        delta_ml: 150,
        occurred_at: AT,
        created_by: USER,
        created_at: AT,
      },
      {
        id: 'cc000002-0000-4000-8000-000000000002',
        client_op_id: 'cc000002-0000-4000-8000-000000000002',
        household_id: HOUSEHOLD,
        container_id: CONTAINER,
        kind: 'USE',
        delta_ml: -30,
        occurred_at: AT,
        created_by: USER,
        created_at: AT,
      },
    ];
    const first = await db.tx(t => applyAppend(t, 'milk_inventory_transactions', ledger, ctx()));
    expect(first.written).toBe(2);

    // A second sight of the same rows, with a changed amount, must change nothing: the ledger
    // is insert-only, and rewriting a row would move a total the server has already agreed to.
    const tampered = ledger.map(r => ({ ...r, delta_ml: 999 }));
    const second = await db.tx(t => applyAppend(t, 'milk_inventory_transactions', tampered, ctx()));
    expect(second.written).toBe(0);

    const sum = await db.get<{ total: number }>(
      'select sum(delta_ml) as total from milk_inventory_transactions where container_id = ?',
      [CONTAINER],
    );
    const container = await db.get<{ amount_ml: number }>(
      'select amount_ml from milk_containers where id = ?',
      [CONTAINER],
    );
    expect(sum?.total).toBe(120);
    expect(container?.amount_ml).toBe(sum?.total);
  });
});

describe('applyDelta — the shared lists (WP6b, WP6c)', () => {
  const ITEM = 'dddddddd-0000-4000-8000-0000000000e1';
  const TASK = 'dddddddd-0000-4000-8000-0000000000e2';

  it('lands a shopping line and a chore as the bootstrap phase delivers them', async () => {
    const db = await open();
    const item: ServerRow = {
      id: ITEM,
      household_id: HOUSEHOLD,
      title: 'Diapers, size 2',
      qty: 2,
      note: null,
      store: null,
      checked_at: null,
      checked_by: null,
      created_by: PARTNER,
      created_at: AT,
      updated_at: AT,
      deleted_at: null,
      client_op_id: 'eeee0003-0000-4000-8000-000000000001',
    };
    const task: ServerRow = {
      id: TASK,
      household_id: HOUSEHOLD,
      title: 'Wash bottles',
      at_local_time: '21:00:00',
      repeat: 'DAILY',
      assigned_to: null,
      last_done_on: null,
      last_done_by: null,
      last_done_at: null,
      created_by: PARTNER,
      created_at: AT,
      updated_at: AT,
      deleted_at: null,
      client_op_id: 'eeee0003-0000-4000-8000-000000000002',
    };
    const lines = await db.tx(t => applyDelta(t, 'shopping_items', [item], ctx()));
    const chores = await db.tx(t => applyDelta(t, 'household_tasks', [task], ctx()));

    expect(lines.written).toBe(1);
    expect(chores.written).toBe(1);
    // and each page names the key the screens watch, so the strip repaints on arrival
    expect(lines.keys).toEqual([keys.shopping(HOUSEHOLD)]);
    expect(chores.keys).toEqual([keys.tasks(HOUSEHOLD)]);
    expect(await db.get('select title, qty from shopping_items where id = ?', [ITEM])).toEqual({
      title: 'Diapers, size 2',
      qty: 2,
    });
    expect(
      await db.get('select title, at_local_time from household_tasks where id = ?', [TASK]),
    ).toEqual({ title: 'Wash bottles', at_local_time: '21:00:00' });
  });
});

describe('apply order', () => {
  it('puts a parent before the rows that point at it, whatever order the response arrived in', () => {
    expect(
      inApplyOrder(['milk_inventory_transactions', 'activities', 'children', 'milk_containers']),
    ).toEqual(['children', 'activities', 'milk_containers', 'milk_inventory_transactions']);
    expect(inApplyOrder(['schedule_instances', 'schedule_rules', 'schedule_phases'])).toEqual([
      'schedule_phases',
      'schedule_rules',
      'schedule_instances',
    ]);
  });
});

/*
  A ROW FROM THE OTHER PARENT'S PHONE REACHES THE VIEWS THAT HOLD EVERY BABY (2026-09-24). It bumped
  its own child's keys only, so Today on "Both", the log on "Both" and the meal history never
  re-read for it, and one baby's Today never re-read for a pulled pump. A local write already
  bumped the household key; the pulled one does now too.
*/
describe('what a pulled activity refreshes', () => {
  it('bumps the household-wide keys as well as its own child’s', () => {
    const child = 'cccccccc-0000-4000-8000-0000000000e1';
    const bumped = invalidationKeys('activities', { child_id: child, type: 'solids' }, ctx());
    expect(bumped).toContain(keys.timeline(child, 'all'));
    expect(bumped).toContain(keys.timeline(null, 'all'));
    expect(bumped).toContain(keys.household(HOUSEHOLD));
    // and a household row (a pump) reaches every baby's Today through the same key
    const pump = invalidationKeys('activities', { child_id: null, type: 'pump' }, ctx());
    expect(pump).toContain(keys.household(HOUSEHOLD));
  });
});

/**
 * A SETTINGS CHANGE THIS PHONE HAS NOT SENT IS NOT THE PULL'S TO UNDO (the handoff audit's L2, at
 * its root). Settings rows have composite keys and their ops a DERIVED entity id, so the guard
 * that protects a pending timer never matched a pending setting: a pull that landed between a
 * module switched on and its push put the server's older row back, or swept the new one away.
 */
describe('a settings row with its change still on the way', () => {
  const MODULE_OP = 'eeee0009-0000-4000-8000-000000000001';
  async function withPendingModule(db: Db, state: string) {
    await db.run(
      `insert into module_settings (household_id, module_id, enabled, quick_enabled, updated_at, created_at)
        values (?, 'vaccine', 1, 0, ?, ?)`,
      [HOUSEHOLD, LATER, LATER],
    );
    await db.run(
      `insert into outbox (client_op_id, entity, op, entity_id, household_id, payload, seq,
        created_at, state) values (?, 'settings', 'UPDATE', ?, ?, '{}', 1, ?, ?)`,
      [
        MODULE_OP,
        settingsEntityId(HOUSEHOLD, 'module_settings', 'vaccine'),
        HOUSEHOLD,
        LATER,
        state,
      ],
    );
  }
  const serverRow = (enabled: boolean): ServerRow => ({
    household_id: HOUSEHOLD,
    module_id: 'vaccine',
    enabled,
    quick_enabled: false,
    created_at: AT,
    updated_at: AT,
  });
  const enabledNow = async (db: Db) =>
    (
      await db.get<{ enabled: number }>(
        `select enabled from module_settings where household_id = ? and module_id = 'vaccine'`,
        [HOUSEHOLD],
      )
    )?.enabled ?? null;

  it('keeps the phone’s change when the server’s older row arrives before the push', async () => {
    const db = await open();
    await withPendingModule(db, 'PENDING');
    await db.tx(t => applyFull(t, 'module_settings', [serverRow(false)], ctx(), 'household'));
    expect(await enabledNow(db)).toBe(1);
  });

  it('never sweeps a settings row the server has not been sent yet', async () => {
    const db = await open();
    await withPendingModule(db, 'SENDING');
    const outcome = await db.tx(t => applyFull(t, 'module_settings', [], ctx(), 'household'));
    expect(outcome.removed).toBe(0);
    expect(await enabledNow(db)).toBe(1);
  });

  it('lets the server’s row in once the change is answered — or refused', async () => {
    for (const state of ['SYNCED', 'FAILED']) {
      resetColumnCache();
      const db = await open();
      await withPendingModule(db, state);
      await db.tx(t => applyFull(t, 'module_settings', [serverRow(false)], ctx(), 'household'));
      expect(await enabledNow(db), state).toBe(0);
      restore?.();
      restore = null;
    }
  });
});

/**
 * THE HOUSEHOLD'S MILK UNIT, CHANGED ON THIS PHONE AND NOT YET SENT (migration 0128). It is a
 * column of the waking window's one row and its op carries the row's one id
 * (`HOUSEHOLD_SETTINGS_KEY`), so a pull that lands before the push keeps milliliters on the screen
 * rather than putting the server's ounces back — and every screen re-reads the unit when the row
 * does arrive (`keys.volumeUnit`).
 */
describe('the household milk unit with its change still on the way', () => {
  const UNIT_OP = 'eeee0010-0000-4000-8000-000000000001';
  const unitNow = async (db: Db) =>
    (
      await db.get<{ volume_unit: string }>(
        'select volume_unit from household_settings where household_id = ?',
        [HOUSEHOLD],
      )
    )?.volume_unit ?? null;

  it('keeps the phone’s unit when the server’s older row arrives first, and wakes every screen', async () => {
    const db = await open();
    await db.run(
      `insert into household_settings (household_id, volume_unit, updated_at) values (?, 'ml', ?)`,
      [HOUSEHOLD, LATER],
    );
    await db.run(
      `insert into outbox (client_op_id, entity, op, entity_id, household_id, payload, seq,
        created_at, state) values (?, 'settings', 'UPDATE', ?, ?, '{}', 1, ?, 'PENDING')`,
      [
        UNIT_OP,
        settingsEntityId(HOUSEHOLD, 'household_settings', HOUSEHOLD_SETTINGS_KEY),
        HOUSEHOLD,
        LATER,
      ],
    );
    const older: ServerRow = {
      household_id: HOUSEHOLD,
      wake_time: '07:00:00',
      bed_time: '19:30:00',
      volume_unit: 'oz',
      updated_at: AT,
    };
    await db.tx(t => applyFull(t, 'household_settings', [older], ctx(), 'household'));
    expect(await unitNow(db)).toBe('ml');
    // and nothing sweeps it before the server has it
    const outcome = await db.tx(t => applyFull(t, 'household_settings', [], ctx(), 'household'));
    expect(outcome.removed).toBe(0);
    expect(await unitNow(db)).toBe('ml');
    // a pulled row wakes the screens that read the unit, and the ones that read the window
    expect(invalidationKeys('household_settings', older, ctx())).toEqual([
      keys.dayWindow(HOUSEHOLD),
      keys.volumeUnit(HOUSEHOLD),
    ]);
  });
});

/**
 * A ROW THE MIRROR ALREADY HOLDS IS NOT WRITTEN AGAIN, AND WAKES NO SCREEN (2026-09-27). Every
 * pass re-reads a little on purpose — a delta table from its cursor less the lag, a `full` table
 * whole — and every row of it was rewritten and handed its cache keys whether it had changed or
 * not (`sync/idle.test.ts` counts what that cost an idle household). These hold the comparison to
 * the one direction that is safe: a row that moved at all, in its own columns or in its detail,
 * or that stopped being queued, is written exactly as before.
 */
describe('a page the mirror already holds', () => {
  type Tx = Parameters<Parameters<Db['tx']>[0]>[0];
  /** The same transaction, noting the table of every statement that writes a row. */
  const writesIn = (t: Tx, seen: string[]): Tx => ({
    run: (sql, params) => {
      const m = /^\s*(?:update|insert into|insert or ignore into|delete from)\s+(\w+)/i.exec(sql);
      if (m?.[1] !== undefined) seen.push(m[1]);
      return t.run(sql, params);
    },
    all: (sql, params) => t.all(sql, params),
    get: (sql, params) => t.get(sql, params),
  });

  it('writes nothing and names no key when every row and its detail are already held', async () => {
    const db = await open();
    const page = [serverActivity()];
    const first = await db.tx(t => applyDelta(t, 'activities', page, ctx()));
    const seen: string[] = [];
    const again = await db.tx(t => applyDelta(writesIn(t, seen), 'activities', page, ctx()));
    expect(seen).toEqual([]);
    expect(again.keys).toEqual([]);
    // the outcome still says what the server sent
    expect(again.written).toBe(first.written);
  });

  it('writes a row that moved in one column, and names its keys', async () => {
    const db = await open();
    await db.tx(t => applyDelta(t, 'activities', [serverActivity()], ctx()));
    const seen: string[] = [];
    const moved = await db.tx(t =>
      applyDelta(
        writesIn(t, seen),
        'activities',
        [serverActivity({ notes: 'spit up a little', updated_at: LATER })],
        ctx(),
      ),
    );
    expect(seen).toContain('activities');
    expect(moved.keys).toContain(keys.timeline(CHILD_A, 'all'));
    const row = await db.get<{ notes: string }>('select notes from activities where id = ?', [
      ACTIVITY,
    ]);
    expect(row?.notes).toBe('spit up a little');
  });

  it('writes an activity whose detail alone moved — the row, the detail and the keys', async () => {
    const db = await open();
    await db.tx(t => applyDelta(t, 'activities', [serverActivity()], ctx()));
    const detail = { ...(serverActivity()['details'] as ServerRow), consumed_ml: 90 };
    const seen: string[] = [];
    const moved = await db.tx(t =>
      applyDelta(writesIn(t, seen), 'activities', [serverActivity({ details: detail })], ctx()),
    );
    expect(seen).toEqual(expect.arrayContaining(['activities', 'bottle_details']));
    expect(moved.keys).toContain(keys.todayTotals(CHILD_A));
    const held = await db.get<{ consumed_ml: number }>(
      'select consumed_ml from bottle_details where activity_id = ?',
      [ACTIVITY],
    );
    expect(held?.consumed_ml).toBe(90);
  });

  it('writes a row the server has just answered for, so it stops reading as queued', async () => {
    const db = await open();
    await db.tx(t => applyDelta(t, 'activities', [serverActivity()], ctx()));
    // the same values, as a write made on this phone and not yet acknowledged would hold them
    await db.run('update activities set local_synced = 0 where id = ?', [ACTIVITY]);
    const seen: string[] = [];
    await db.tx(t => applyDelta(writesIn(t, seen), 'activities', [serverActivity()], ctx()));
    expect(seen).toContain('activities');
    const row = await db.get<{ local_synced: number }>(
      'select local_synced from activities where id = ?',
      [ACTIVITY],
    );
    expect(row?.local_synced).toBe(1);
  });

  it('leaves a settings page it already holds alone — the members’ own stamp is not news', async () => {
    const db = await open();
    const member: ServerRow = {
      household_id: HOUSEHOLD,
      user_id: PARTNER,
      role: 'CAREGIVER',
      joined_at: AT,
      removed_at: null,
    };
    const module: ServerRow = {
      household_id: HOUSEHOLD,
      module_id: 'bottle',
      enabled: true,
      quick_enabled: true,
      quick_position: 1,
      created_at: AT,
      updated_at: AT,
    };
    await db.tx(t => applyFull(t, 'household_members', [member], ctx(), 'household'));
    await db.tx(t => applyFull(t, 'module_settings', [module], ctx(), 'household'));
    // the next pass, half a minute on: the same rows, a new server time for the stamp
    const later = { ...ctx(), serverTime: '2026-09-14T09:00:30.000Z' };
    const seen: string[] = [];
    const members = await db.tx(t =>
      applyFull(writesIn(t, seen), 'household_members', [member], later, 'household'),
    );
    const modules = await db.tx(t =>
      applyFull(writesIn(t, seen), 'module_settings', [module], later, 'household'),
    );
    expect(seen).toEqual([]);
    expect([...members.keys, ...modules.keys]).toEqual([]);
    // and a real change to either still lands
    await db.tx(t =>
      applyFull(t, 'household_members', [{ ...member, role: 'PARENT' }], later, 'household'),
    );
    const role = await db.get<{ role: string }>(
      'select role from household_members where user_id = ?',
      [PARTNER],
    );
    expect(role?.role).toBe('PARENT');
  });
});
