/**
 * A SETTINGS OP IS FOUR TABLES, AND NONE OF THEM HAS AN `id`.
 *
 * `settings` is the one outbox entity that does not stand for a table: `moduleSettingChain`,
 * `dayWindowChain`, `notificationPreferenceChain`, `privacyPreferenceChain` and
 * `vaccineTrackingChain` all queue under it and name their real table in the payload (core's
 * `chains.ts`). Its `entity_id` is a uuid v5
 * DERIVED from the household, the table and the row's key (`settingsEntityId`) — an idempotency
 * key, not a column value, and it appears in no table on either side.
 *
 * So a push of one of these must never address the mirror by `id`. On the phone it did, and
 * `prepareAsync` rejected with `no such column: id` — outside the worker's own catch, as an
 * unhandled promise rejection at launch, with the setting left queued for ever.
 */
import {
  graduationSettings,
  HOUSEHOLD_SETTINGS_KEY,
  playtimeGoalMinutes,
  settingsEntityId,
} from '@nibblecue/core';
import { afterEach, describe, expect, it } from 'vitest';
import { createAnalytics } from '../analytics';
import { moduleGoalSettings } from '../db/queries/schedule';
import { logActivity } from '../data/activities';
import { setSharing } from '../data/privacy';
import {
  saveDayWindow,
  saveModuleGoal,
  saveModuleVariant,
  savePreference,
  saveVolumeUnit,
} from '../data/schedule';
import { HOUSEHOLD, USER } from '../testing/fixtures';
import { createSyncHarness, type SyncHarness } from './harness';
import { LOCAL_PRIMARY_KEY } from '../data/repository';
import { OutboxWorker, SETTINGS_TABLES, TABLE_BY_ENTITY } from './worker';

let shared: SyncHarness | null = null;
afterEach(() => {
  shared?.dispose();
  shared = null;
});

async function device(scenario: string): Promise<SyncHarness> {
  const h = await createSyncHarness({ scenario });
  shared = h;
  return h;
}

const ctx = {
  householdId: HOUSEHOLD,
  createdBy: USER,
  deviceId: null,
  source: 'sheet' as const,
};

describe('a settings op flushes', () => {
  it('pushes a module setting without asking the mirror for a column it has not got', async () => {
    const h = await device('settings-module');
    await saveModuleGoal(h.db, h.clock, { ...ctx, activity: 'tummy', minutes: 30 });
    const worker = h.worker();
    worker.start();
    const out = await worker.flush('reconnect');
    expect(out.failed).toBe(0);
    expect(out.synced).toBe(1);
    const queued = await h.db.all<{ n: number }>(
      `select count(*) as n from outbox where state != 'SYNCED'`,
    );
    expect(queued[0]?.n).toBe(0);
  });

  it('pushes a privacy preference, and the entries the switch moved with it', async () => {
    const h = await device('settings-privacy');
    await logActivity(h.db, h.clock, {
      ...ctx,
      type: 'pump',
      startAt: '2026-09-14T09:00:00.000Z',
      quantity: 120,
      canonicalUnit: 'ml',
      detail: { sides: 'BOTH', left_ml: 60, right_ml: 60, total_ml: 120 },
      childId: null,
    });
    const worker = h.worker();
    worker.start();
    await worker.flush('reconnect');
    // the switch and the one session it hides go in one batch: the settings upsert has no `id`
    // column to address and the activity does, and both have to survive the same push
    await setSharing(h.db, h.clock, { ...ctx, moduleId: 'pump', shared: false });
    const out = await worker.flush('reconnect');
    expect(out.failed).toBe(0);
    expect(out.synced).toBe(2);
    const queued = await h.db.all<{ n: number }>(
      `select count(*) as n from outbox where state != 'SYNCED'`,
    );
    expect(queued[0]?.n).toBe(0);
  });

  it('keeps the setting a parent chose, rather than losing it to the failed stamp', async () => {
    const h = await device('settings-kept');
    await saveModuleGoal(h.db, h.clock, { ...ctx, activity: 'tummy', minutes: 30 });
    const worker = h.worker();
    worker.start();
    await worker.flush('reconnect');
    const row = await h.db.get<{ goal_minutes: number | null }>(
      `select goal_minutes from module_settings where household_id = ? and module_id = ?`,
      [HOUSEHOLD, 'tummy'],
    );
    expect(row?.goal_minutes).toBe(30);
  });

  it('pushes every settings table the four chains write', async () => {
    const h = await device('settings-all');
    await saveModuleVariant(h.db, h.clock, { ...ctx, activity: 'tummy', variant: 'playtime' });
    await saveDayWindow(h.db, h.clock, { ...ctx, wake: '07:00', bed: '19:30' });
    await savePreference(h.db, h.clock, {
      ...ctx,
      userId: USER,
      channel: 'PUSH',
      patch: { enabled: true },
    });
    const worker = h.worker();
    worker.start();
    const out = await worker.flush('reconnect');
    expect(out.failed).toBe(0);
    expect(out.synced).toBe(3);
  });

  /**
   * And the table it names is the table that is pulled back. `pullAfterPush` folds the LWW
   * winners of what a push touched back onto the phone; with one table standing in for four, a
   * day-window push asked for `module_settings` — a pull of a table nothing had written, and
   * none of the row that had just gone out.
   */
  it('asks for the table the op wrote, not the entity’s stand-in', async () => {
    const h = await device('settings-pullback');
    await saveDayWindow(h.db, h.clock, { ...ctx, wake: '07:00', bed: '19:30' });
    await saveModuleGoal(h.db, h.clock, { ...ctx, activity: 'tummy', minutes: 30 });
    // the worker is built here rather than taken from the harness, because the claim IS the
    // argument `pullAfterPush` is given and the harness wires that straight to its puller
    const pulled: string[][] = [];
    const worker = new OutboxWorker(h.db, h.api, h.net, h.clock, {
      analytics: createAnalytics(
        () => undefined,
        () => h.clock.now(),
      ).emit,
      onState: () => undefined,
      rng: h.rng,
      pullAfterPush: tables => {
        pulled.push([...tables].sort());
        return Promise.resolve();
      },
    });
    worker.start();
    await worker.flush('reconnect');
    expect(pulled).toEqual([['household_settings', 'module_settings']]);
  });
});

/*
  THE HOUSEHOLD'S MILK UNIT (migration 0128; the owner, 2026-09-26: "make the oz/mL setting
  household-wide, not per person"). One column of the waking window's row, written local-first
  through the same kind of op under the same id — so it shows on this phone at once, offline
  included, and reaches the server (and from there every phone of the household) on the next flush,
  leaving the window alone on both sides.
*/
describe('the household milk unit', () => {
  const unitOnPhone = (h: SyncHarness) =>
    h.db.get<{ volume_unit: string; wake_time: string }>(
      'select volume_unit, wake_time from household_settings where household_id = ?',
      [HOUSEHOLD],
    );

  it('is on the phone the moment it is chosen, with no network, under the row’s one id', async () => {
    const h = await device('settings-volume-offline');
    h.net.connected = false;
    const r = await saveVolumeUnit(h.db, h.clock, { ...ctx, unit: 'ml' });
    expect(r.committed).toBe(true);
    expect(await unitOnPhone(h)).toMatchObject({ volume_unit: 'ml' });
    const ops = await h.db.all<{ entity: string; entity_id: string; payload: string }>(
      `select entity, entity_id, payload from outbox where state != 'SYNCED'`,
    );
    expect(ops).toHaveLength(1);
    expect(ops[0]?.entity).toBe('settings');
    // the waking window's id: a pull that lands before the push cannot put ounces back
    expect(ops[0]?.entity_id).toBe(
      settingsEntityId(HOUSEHOLD, 'household_settings', HOUSEHOLD_SETTINGS_KEY),
    );
    expect(JSON.parse(ops[0]?.payload ?? '{}')).toMatchObject({
      table: 'household_settings',
      volume_unit: 'ml',
    });
    expect(JSON.parse(ops[0]?.payload ?? '{}')).not.toHaveProperty('wake_time');
  });

  it('reaches the server on the next flush, and the window and the unit leave each other alone', async () => {
    const h = await device('settings-volume');
    await saveDayWindow(h.db, h.clock, { ...ctx, wake: '06:30', bed: '20:00' });
    await saveVolumeUnit(h.db, h.clock, { ...ctx, unit: 'ml' });
    expect(await unitOnPhone(h)).toEqual({ volume_unit: 'ml', wake_time: '06:30' });
    const worker = h.worker();
    worker.start();
    const out = await worker.flush('reconnect');
    expect(out.failed).toBe(0);
    expect(h.server.household_settings.find(r => r['household_id'] === HOUSEHOLD)).toMatchObject({
      volume_unit: 'ml',
      wake_time: '06:30',
    });
    // a window moved afterwards keeps the unit, here and there
    await saveDayWindow(h.db, h.clock, { ...ctx, wake: '07:15', bed: '20:00' });
    await worker.flush('reconnect');
    expect(await unitOnPhone(h)).toEqual({ volume_unit: 'ml', wake_time: '07:15' });
    expect(h.server.household_settings.find(r => r['household_id'] === HOUSEHOLD)).toMatchObject({
      volume_unit: 'ml',
      wake_time: '07:15',
    });
  });
});

/*
  THE PLAYTIME SWITCH CARRIES ITS GOAL (the owner, 2026-09-26: "understood, then goals need to be
  increased if anything to 3 hours a day (user still can change) based on the WHO report").
  Graduating writes the word, the published three hours and the kept tummy-time goal in ONE op;
  switching back writes the kept goal back. The phone predicts the kept goal in its own mirror so an
  offline switch back finds it; the server keeps its own from its own row (0127) and the pull after
  the push settles the phone on the server's.
*/
describe('the Playtime switch carries its goal, and the tummy-time goal comes back', () => {
  const switchTo = async (h: SyncHarness, on: boolean) => {
    const now = await moduleGoalSettings(h.db, HOUSEHOLD, 'tummy');
    const next = graduationSettings(now, on, playtimeGoalMinutes());
    if (next === null) return null;
    await saveModuleVariant(h.db, h.clock, {
      ...ctx,
      activity: 'tummy',
      variant: next.variant,
      goalMinutes: next.goalMinutes,
      baseGoalMinutes: next.baseGoalMinutes,
    });
    return now;
  };
  const serverRow = (h: SyncHarness) =>
    h.server.module_settings.find(
      r => r['household_id'] === HOUSEHOLD && r['module_id'] === 'tummy',
    );

  it('sets three hours, keeps the tummy-time goal, and puts it back — on both sides', async () => {
    const h = await device('settings-graduation');
    await saveModuleGoal(h.db, h.clock, { ...ctx, activity: 'tummy', minutes: 30 });
    const worker = h.worker();
    worker.start();
    await worker.flush('reconnect');

    // offline: the switch lands in the mirror at once, word and goals together
    h.net.connected = false;
    await switchTo(h, true);
    expect(await moduleGoalSettings(h.db, HOUSEHOLD, 'tummy')).toEqual({
      variant: 'playtime',
      goalMinutes: 180,
      baseGoalMinutes: 30,
    });
    // one op, not two: the word and its goal can never land apart
    const queued = await h.db.all<{ n: number }>(
      `select count(*) as n from outbox where state = 'PENDING'`,
    );
    expect(queued[0]?.n).toBe(1);

    // back online: the server has the same row, its kept goal from its own history
    h.net.connected = true;
    expect((await worker.flush('reconnect')).failed).toBe(0);
    expect(serverRow(h)).toMatchObject({
      variant: 'playtime',
      goal_minutes: 180,
      base_goal_minutes: 30,
    });

    // switching back puts the thirty minutes back, and both sides forget the kept goal
    await switchTo(h, false);
    expect(await moduleGoalSettings(h.db, HOUSEHOLD, 'tummy')).toEqual({
      variant: null,
      goalMinutes: 30,
      baseGoalMinutes: null,
    });
    expect((await worker.flush('reconnect')).failed).toBe(0);
    expect(serverRow(h)).toMatchObject({
      variant: null,
      goal_minutes: 30,
      base_goal_minutes: null,
    });
  });

  it('keeps the server’s kept goal, not a phone’s guess, and the phone takes it back', async () => {
    const h = await device('settings-graduation-race');
    await saveModuleGoal(h.db, h.clock, { ...ctx, activity: 'tummy', minutes: 15 });
    const worker = h.worker();
    worker.start();
    await worker.flush('reconnect');
    // a phone that raced another guessed wrong about the goal it was replacing
    await saveModuleVariant(h.db, h.clock, {
      ...ctx,
      activity: 'tummy',
      variant: 'playtime',
      goalMinutes: 180,
      baseGoalMinutes: 60,
    });
    expect((await worker.flush('reconnect')).failed).toBe(0);
    expect(serverRow(h)).toMatchObject({ goal_minutes: 180, base_goal_minutes: 15 });
    // the pull after the push brings the server's answer home
    expect(await moduleGoalSettings(h.db, HOUSEHOLD, 'tummy')).toMatchObject({
      baseGoalMinutes: 15,
    });
  });

  it('refuses a goal the column would refuse, before anything is written', async () => {
    const h = await device('settings-graduation-bound');
    await expect(
      saveModuleVariant(h.db, h.clock, {
        ...ctx,
        activity: 'tummy',
        variant: 'playtime',
        goalMinutes: 300,
      }),
    ).rejects.toThrow(RangeError);
  });
});

/**
 * AND THE SAME MISTAKE CANNOT BE MADE BY A NEW ENTITY. `markRowSynced` stamps
 * `update <table> set updated_at = ? where id = ?`, which is only sound for a table whose whole
 * primary key IS `id`. Two tables were already exempt for their own reasons and said so in
 * prose; the four settings tables were not, and the prose was the only thing standing between
 * the map and a SQL error at launch.
 */
describe('the worker only stamps a row it can address by one id', () => {
  /** The two the function returns early for, each for a reason of its own. */
  const EXEMPT = new Set(['milk_inventory_transactions', 'storage_locations']);

  it('gives every entity a table keyed by `id`, or an exemption', () => {
    for (const [entity, table] of Object.entries(TABLE_BY_ENTITY)) {
      if (table === null || EXEMPT.has(table)) continue;
      expect(LOCAL_PRIMARY_KEY[table], `${entity} → ${table}`).toEqual(['id']);
    }
  });

  it('and none of the four settings tables is one of them, which is why they are skipped', () => {
    for (const table of SETTINGS_TABLES) {
      const pk = LOCAL_PRIMARY_KEY[table];
      expect(pk, table).toBeDefined();
      expect(pk, table).not.toEqual(['id']);
      expect(pk?.[0], table).toBe('household_id');
    }
  });
});
