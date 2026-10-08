/**
 * The schedule's writes on the local mirror (docs/SCHEDULE_AND_LOCATIONS.md §1–§2;
 * SCHEDULE_LOGIC.md §9): every rule a parent meets on a sheet, with its exact sentence, the
 * rows the mirror holds afterwards, and the ops the server will see — one intent per write,
 * a distinct op per row it fans out to.
 */
import type { RuleFields } from '@nibblecue/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Db } from '../db/driver';
import {
  instanceFor,
  phaseById,
  preferencesOf,
  ruleById,
  rulesOfPhase,
} from '../db/queries/schedule';
import {
  CHILD_A,
  CHILD_B,
  HOUSEHOLD,
  PHASE,
  USER,
  seedHousehold,
  seedPhase,
  seedRule,
} from '../testing/fixtures';
import {
  CurrentPhaseError,
  LastPhaseError,
  PhaseNameError,
  RuleShapeError,
  activatePhase,
  addSeries,
  deletePhase,
  deleteRules,
  duplicatePhase,
  patchRule,
  restoreRules,
  savePhase,
  saveModuleGoal,
  savePreference,
  savePreferences,
  saveRule,
  skipSlot,
} from './schedule';
import { createStore, keys } from './store';

const ctx = { householdId: HOUSEHOLD, createdBy: USER, deviceId: null, source: 'sheet' as const };
const OLD = 'ffffffff-0000-4000-8000-0000000000f2';
const R1 = 'abababab-0000-4000-8000-000000000001';
const R2 = 'abababab-0000-4000-8000-000000000002';
const R3 = 'abababab-0000-4000-8000-000000000003';
const AT = '2026-09-14T08:00:00.000Z';

const restores: (() => void)[] = [];
afterEach(() => {
  while (restores.length > 0) restores.pop()?.();
});

async function fixture() {
  const f = await seedHousehold();
  restores.push(f.restoreIds);
  return f;
}

interface OutboxOp {
  client_op_id: string;
  entity: string;
  op: string;
  entity_id: string;
  payload: string;
  depends_on: string | null;
}
const outboxOps = (db: Db) =>
  db.all<OutboxOp>(
    'select client_op_id, entity, op, entity_id, payload, depends_on from outbox order by seq',
  );
const payloadOf = (o: OutboxOp | undefined): Record<string, unknown> => {
  if (o === undefined) throw new Error('no such op');
  return JSON.parse(o.payload) as Record<string, unknown>;
};
const distinct = (xs: readonly string[]) => new Set(xs).size === xs.length;

/** A 3-hour pump interval the sheet would send; every column named, as the sheet does. */
const draft = (
  over: Partial<RuleFields> = {},
): Omit<RuleFields, 'child_id'> & { child_id?: string | null } => ({
  phase_id: PHASE,
  activity: 'pump',
  care_item_id: null,
  effective_from: '',
  rule_type: 'INTERVAL',
  at_local_time: null,
  every_minutes: 180,
  relative_to: null,
  offset_minutes: null,
  every_days: null,
  target_quantity: null,
  repeat: 'DAILY',
  repeat_days: null,
  reminder_enabled: true,
  remind_user_ids: [USER],
  match_window_minutes: 25,
  match_scope: 'MINUTES',
  miss_after_minutes: 60,
  late_window_minutes: 90,
  night_mode: 'NONE',
  night_from: null,
  night_to: null,
  night_every_minutes: null,
  night_at: null,
  target_per_day: null,
  name: null,
  is_active: true,
  ...over,
});

describe('savePhase (§1.1, §1.3)', () => {
  it('creates a routine that is not current, with one CREATE op', async () => {
    const { db, clock } = await fixture();
    await seedPhase(db);
    const r = await savePhase(db, clock, { ...ctx, name: '  Four   months ', childId: null });
    expect(r.committed).toBe(true);
    expect(await phaseById(db, r.phaseId)).toMatchObject({
      name: 'Four months',
      child_id: null,
      is_current: 0,
      effective_from: '2026-09-14',
      effective_to: null,
      deleted_at: null,
      rule_count: 0,
    });
    // the current routine is untouched
    expect((await phaseById(db, PHASE))?.is_current).toBe(1);
    const ops = await outboxOps(db);
    expect(ops.map(o => `${o.entity}:${o.op}`)).toEqual(['schedule_phase:CREATE']);
    expect(payloadOf(ops[0])).toMatchObject({ name: 'Four months', is_current: false });
  });

  it('the name is 2–40 characters and unique in its scope, case-insensitive', async () => {
    const { db, clock } = await fixture();
    await seedPhase(db);
    await expect(savePhase(db, clock, { ...ctx, name: 'x', childId: null })).rejects.toThrow(
      PhaseNameError,
    );
    await expect(
      savePhase(db, clock, { ...ctx, name: ' NEWBORN ', childId: null }),
    ).rejects.toThrow('A routine with this name already exists.');
    // a per-child routine is its own scope: the household's "Newborn" does not collide
    const r = await savePhase(db, clock, { ...ctx, name: 'Newborn', childId: CHILD_A });
    expect(r.committed).toBe(true);
    expect(await outboxOps(db)).toHaveLength(1);
  });

  it('makeCurrent closes the outgoing routine in the same write', async () => {
    const { db, clock } = await fixture();
    await seedPhase(db);
    const r = await savePhase(db, clock, {
      ...ctx,
      name: 'Four months',
      childId: null,
      makeCurrent: true,
    });
    expect(await phaseById(db, PHASE)).toMatchObject({
      is_current: 0,
      effective_to: '2026-09-14',
    });
    expect(await phaseById(db, r.phaseId)).toMatchObject({
      is_current: 1,
      effective_from: '2026-09-14',
      effective_to: null,
    });
    const ops = await outboxOps(db);
    expect(ops).toHaveLength(1);
    expect(payloadOf(ops[0])).toMatchObject({ is_current: true, effective_from: '2026-09-14' });
  });

  it('a rename is one UPDATE that says only the name', async () => {
    const { db, clock } = await fixture();
    await seedPhase(db);
    const r = await savePhase(db, clock, {
      ...ctx,
      phaseId: PHASE,
      name: 'Early days',
      childId: null,
    });
    expect(r.phaseId).toBe(PHASE);
    expect((await phaseById(db, PHASE))?.name).toBe('Early days');
    const ops = await outboxOps(db);
    expect(ops.map(o => `${o.entity}:${o.op}`)).toEqual(['schedule_phase:UPDATE']);
    expect(payloadOf(ops[0])).toEqual({ name: 'Early days', client_edited_at: AT });
  });
});

describe('activatePhase (§1.3)', () => {
  it('closes the outgoing routine on the activation date', async () => {
    const { db, clock } = await fixture();
    await seedPhase(db);
    await seedPhase(db, { id: OLD, name: 'Four months', isCurrent: false });
    const r = await activatePhase(db, clock, { ...ctx, phaseId: OLD });
    expect(r.committed).toBe(true);
    expect(await phaseById(db, PHASE)).toMatchObject({ is_current: 0, effective_to: '2026-09-14' });
    expect(await phaseById(db, OLD)).toMatchObject({
      is_current: 1,
      effective_from: '2026-09-14',
      effective_to: null,
    });
    const ops = await outboxOps(db);
    expect(ops.map(o => `${o.entity}:${o.op}:${o.entity_id}`)).toEqual([
      `schedule_phase:UPDATE:${OLD}`,
    ]);
    expect(payloadOf(ops[0])).toMatchObject({ activate: true, activation_date: '2026-09-14' });
  });

  it('never starts before the outgoing routine did', async () => {
    const { db, clock } = await fixture();
    await seedPhase(db, { effectiveFrom: '2026-09-01' });
    await seedPhase(db, { id: OLD, name: 'Four months', isCurrent: false });
    await expect(
      activatePhase(db, clock, { ...ctx, phaseId: OLD, activationDate: '2026-08-15' }),
    ).rejects.toThrow('The new routine cannot start before the current one did.');
    expect(await outboxOps(db)).toHaveLength(0);
    expect((await phaseById(db, PHASE))?.is_current).toBe(1);
  });
});

describe('duplicatePhase (§1.4)', () => {
  it('copies the phase and every live rule with fresh ids, inert until activated', async () => {
    const { db, clock } = await fixture();
    await seedPhase(db);
    await seedRule(db, { id: R1 });
    await seedRule(db, { id: R2, ruleType: 'FIXED', activity: 'bottle', atLocalTime: '08:30:00' });
    await seedRule(db, { id: R3, deletedAt: AT });
    const r = await duplicatePhase(db, clock, { ...ctx, phaseId: PHASE });
    expect(r.committed).toBe(true);
    expect(r.ruleIds).toHaveLength(2);
    expect(r.ruleIds).not.toContain(R1);
    expect(await phaseById(db, r.phaseId)).toMatchObject({
      name: 'Newborn (copy)',
      is_current: 0,
      rule_count: 2,
    });
    const copies = await rulesOfPhase(db, r.phaseId);
    // rulesOfPhase orders by time, and SQLite sorts a null time first
    expect(copies.map(c => [c.activity, c.rule_type, c.every_minutes, c.at_local_time])).toEqual([
      ['pump', 'INTERVAL', 180, null],
      ['bottle', 'FIXED', null, '08:30'],
    ]);
    expect(copies.every(c => c.remind_user_ids === JSON.stringify([USER]))).toBe(true);
    // the source is untouched
    expect((await phaseById(db, PHASE))?.rule_count).toBe(2);
    const ops = await outboxOps(db);
    expect(ops.map(o => `${o.entity}:${o.op}`)).toEqual([
      'schedule_phase:CREATE',
      'schedule_rule:CREATE',
      'schedule_rule:CREATE',
    ]);
    expect(distinct(ops.map(o => o.client_op_id))).toBe(true);
    // the rules wait for their phase: every rule op depends on the phase op
    expect(ops.slice(1).every(o => o.depends_on === ops[0]?.client_op_id)).toBe(true);
  });
});

describe('deletePhase (§1.5) and its undo', () => {
  it('refuses the current routine, in the sheet’s words', async () => {
    const { db, clock } = await fixture();
    await seedPhase(db);
    await seedPhase(db, { id: OLD, name: 'Four months', isCurrent: false });
    await expect(deletePhase(db, clock, { ...ctx, phaseId: PHASE })).rejects.toThrow(
      CurrentPhaseError,
    );
    await expect(deletePhase(db, clock, { ...ctx, phaseId: PHASE })).rejects.toThrow(
      'Activate another routine first, then delete this one.',
    );
  });

  it('refuses the last routine in its scope', async () => {
    const { db, clock } = await fixture();
    await seedPhase(db, { id: OLD, name: 'Four months', isCurrent: false });
    await expect(deletePhase(db, clock, { ...ctx, phaseId: OLD })).rejects.toThrow(LastPhaseError);
    expect(await outboxOps(db)).toHaveLength(0);
  });

  // the Undo is the write's own (`undoWrite`, from the Plans sheet's toast): the hand-built
  // `restorePhase` this test also drove went on 2026-09-26 with nothing calling it
  it('retires exactly the live rules, and names them on the op', async () => {
    const { db, clock } = await fixture();
    await seedPhase(db);
    await seedPhase(db, { id: OLD, name: 'Four months', isCurrent: false });
    await seedRule(db, { id: R1, phaseId: OLD });
    await seedRule(db, { id: R2, phaseId: OLD, deletedAt: '2026-09-10T00:00:00.000Z' });
    const r = await deletePhase(db, clock, { ...ctx, phaseId: OLD });
    expect(r.ruleIds).toEqual([R1]);
    expect(await phaseById(db, OLD)).toMatchObject({ deleted_at: AT });
    expect(await ruleById(db, R1)).toMatchObject({ deleted_at: AT, is_active: 0 });
    const ops = await outboxOps(db);
    expect(ops.map(o => `${o.entity}:${o.op}`)).toEqual(['schedule_phase:UPDATE']);
    expect(payloadOf(ops[0])).toMatchObject({ deleted_at: AT, rule_ids: [R1] });
    // the rule that was already gone is not retired again
    expect((await ruleById(db, R2))?.deleted_at).toBe('2026-09-10T00:00:00.000Z');
  });
});

describe('saveRule (§2.1, §2.5)', () => {
  it('"Both" writes one rule per child under one intent, a distinct op each', async () => {
    const { db, clock } = await fixture();
    await seedPhase(db);
    const r = await saveRule(db, clock, {
      ...ctx,
      childIds: [CHILD_A, CHILD_B],
      fields: draft({
        activity: 'bottle',
        rule_type: 'FIXED',
        at_local_time: '08:00',
        every_minutes: null,
      }),
    });
    expect(r.committed).toBe(true);
    expect(r.ruleIds).toHaveLength(2);
    const rows = await rulesOfPhase(db, PHASE);
    expect(rows.map(x => x.child_id)).toEqual([CHILD_A, CHILD_B]);
    expect(rows.map(x => x.at_local_time)).toEqual(['08:00', '08:00']);
    expect(rows.every(x => x.remind_user_ids === JSON.stringify([USER]))).toBe(true);
    expect(rows.every(x => x.effective_from === AT && x.updated_at === AT)).toBe(true);
    const ops = await outboxOps(db);
    expect(ops.map(o => `${o.entity}:${o.op}`)).toEqual([
      'schedule_rule:CREATE',
      'schedule_rule:CREATE',
    ]);
    expect(distinct(ops.map(o => o.client_op_id))).toBe(true);
    expect(payloadOf(ops[0])).toMatchObject({ child_id: CHILD_A, at_local_time: '08:00' });
  });

  it('a malformed rule is refused before anything is written', async () => {
    const { db, clock } = await fixture();
    await seedPhase(db);
    await expect(
      saveRule(db, clock, { ...ctx, fields: draft({ every_minutes: 10 }) }),
    ).rejects.toThrow(RuleShapeError);
    await expect(
      saveRule(db, clock, { ...ctx, fields: draft({ every_minutes: 10 }) }),
    ).rejects.toThrow('An interval is between 30 minutes and 12 hours.');
    await expect(
      saveRule(db, clock, {
        ...ctx,
        fields: draft({ rule_type: 'FIXED', at_local_time: null, every_minutes: null }),
      }),
    ).rejects.toThrow('A fixed item needs a time of day.');
    expect(await rulesOfPhase(db, PHASE)).toHaveLength(0);
    expect(await outboxOps(db)).toHaveLength(0);
  });

  it('an edit names the version it saw and never carries the activity', async () => {
    const { db, clock } = await fixture();
    await seedPhase(db);
    const created = await saveRule(db, clock, { ...ctx, fields: draft() });
    const ruleId = created.ruleIds[0] ?? '';
    clock.advance(60_000);
    const r = await saveRule(db, clock, {
      ...ctx,
      ruleId,
      // the sheet cannot change what the item IS; a stray activity is dropped, not applied
      fields: draft({ every_minutes: 120, activity: 'bottle' }),
    });
    expect(r.ruleIds).toEqual([ruleId]);
    expect(await ruleById(db, ruleId)).toMatchObject({
      activity: 'pump',
      every_minutes: 120,
      updated_at: '2026-09-14T08:01:00.000Z',
    });
    const ops = await outboxOps(db);
    expect(ops.map(o => `${o.entity}:${o.op}`)).toEqual([
      'schedule_rule:CREATE',
      'schedule_rule:UPDATE',
    ]);
    const p = payloadOf(ops[1]);
    // the row's version is the phone's own stamp (its CREATE is still queued), so the edit
    // continues the phone's own sequence and names no version (`editBase`, the sweep's P2)
    expect(p).toMatchObject({ every_minutes: 120, expected_updated_at: null });
    expect(p).not.toHaveProperty('activity');
    expect(p).not.toHaveProperty('care_item_id');
  });
});

describe('patchRule, deleteRules, restoreRules (§2.3, §9)', () => {
  it('an interval change writes every_minutes against the row’s version', async () => {
    const { db, clock } = await fixture();
    await seedPhase(db);
    await seedRule(db, { id: R1 });
    clock.advance(60_000);
    // the rhythm sheet's interval change (`setInterval`, a wrapper nothing called, went 2026-09-26)
    const r = await patchRule(db, clock, { ...ctx, ruleId: R1, patch: { every_minutes: 150 } });
    expect(r.committed).toBe(true);
    expect(await ruleById(db, R1)).toMatchObject({
      every_minutes: 150,
      updated_at: '2026-09-14T08:01:00.000Z',
    });
    const ops = await outboxOps(db);
    expect(payloadOf(ops[0])).toEqual({
      every_minutes: 150,
      expected_updated_at: AT,
      client_edited_at: '2026-09-14T08:01:00.000Z',
    });
    // a pause is the same shape — and, made on top of the chip's own unsent edit, it names no
    // version: '08:01' is this phone's stamp, a version the server never had (the sweep's P2)
    await patchRule(db, clock, { ...ctx, ruleId: R1, patch: { is_active: false } });
    expect((await ruleById(db, R1))?.is_active).toBe(0);
    expect(payloadOf((await outboxOps(db))[1])).toMatchObject({
      is_active: false,
      expected_updated_at: null,
    });
  });

  it('a delete of several is one intent; the undo restores them without a version check', async () => {
    const { db, clock } = await fixture();
    await seedPhase(db);
    await seedRule(db, { id: R1 });
    await seedRule(db, { id: R2, ruleType: 'FIXED', activity: 'bottle' });
    const d = await deleteRules(db, clock, { ...ctx, ruleIds: [R1, R2] });
    expect(d.committed).toBe(true);
    expect(await rulesOfPhase(db, PHASE)).toHaveLength(0);
    expect(await ruleById(db, R1)).toMatchObject({ deleted_at: AT, is_active: 0 });
    let ops = await outboxOps(db);
    expect(ops.map(o => `${o.entity}:${o.op}`)).toEqual([
      'schedule_rule:DELETE',
      'schedule_rule:DELETE',
    ]);
    expect(distinct(ops.map(o => o.client_op_id))).toBe(true);

    clock.advance(60_000);
    const u = await restoreRules(db, clock, { ...ctx, ruleIds: [R1, R2] });
    expect(u.committed).toBe(true);
    expect(await rulesOfPhase(db, PHASE)).toHaveLength(2);
    expect(await ruleById(db, R2)).toMatchObject({ deleted_at: null, is_active: 1 });
    ops = await outboxOps(db);
    expect(ops.slice(2).map(o => `${o.entity}:${o.op}`)).toEqual([
      'schedule_rule:UPDATE',
      'schedule_rule:UPDATE',
    ]);
    expect(payloadOf(ops[2])).toMatchObject({
      deleted_at: null,
      is_active: true,
      expected_updated_at: null,
    });
    expect(distinct(ops.map(o => o.client_op_id))).toBe(true);
  });
});

describe('addSeries (§9 "a set of times")', () => {
  it('lays out FIXED rules from first, every, last — per child, one intent', async () => {
    const { db, clock } = await fixture();
    await seedPhase(db);
    const r = await addSeries(db, clock, {
      ...ctx,
      phaseId: PHASE,
      childIds: [CHILD_A, CHILD_B],
      activity: 'bottle',
      from: '08:00',
      everyMinutes: 180,
      to: '14:00',
      reminderEnabled: true,
      remindUserIds: [USER],
      targetQuantity: 150,
    });
    expect(r.committed).toBe(true);
    expect(r.times).toEqual(['08:00', '11:00', '14:00']);
    expect(r.ruleIds).toHaveLength(6);
    const rows = await rulesOfPhase(db, PHASE);
    expect(rows).toHaveLength(6);
    expect(rows.every(x => x.rule_type === 'FIXED' && x.activity === 'bottle')).toBe(true);
    expect(rows.filter(x => x.child_id === CHILD_A).map(x => x.at_local_time)).toEqual([
      '08:00',
      '11:00',
      '14:00',
    ]);
    expect(rows.every(x => x.target_quantity === 150)).toBe(true);
    const ops = await outboxOps(db);
    expect(ops).toHaveLength(6);
    expect(ops.every(o => o.entity === 'schedule_rule' && o.op === 'CREATE')).toBe(true);
    expect(distinct(ops.map(o => o.client_op_id))).toBe(true);
  });

  it('refuses a last time before the first', async () => {
    const { db, clock } = await fixture();
    await seedPhase(db);
    await expect(
      addSeries(db, clock, {
        ...ctx,
        phaseId: PHASE,
        childIds: [null],
        activity: 'bottle',
        from: '20:00',
        everyMinutes: 180,
        to: '08:00',
        reminderEnabled: false,
        remindUserIds: [],
      }),
    ).rejects.toThrow(RuleShapeError);
    expect(await outboxOps(db)).toHaveLength(0);
  });
});

describe('skipSlot (SCHEDULE_LOGIC §3)', () => {
  const SLOT = '2026-09-14T15:00:00.000Z';

  it('without the server’s instance, a local-only SKIPPED row and no op', async () => {
    const { db, clock } = await fixture();
    await seedPhase(db);
    await seedRule(db, { id: R1, childId: CHILD_A });
    const r = await skipSlot(db, clock, {
      ...ctx,
      ruleId: R1,
      scheduledForMs: Date.parse(SLOT),
      reason: 'Asleep',
    });
    expect(r.committed).toBe(true);
    expect(await instanceFor(db, R1, SLOT)).toMatchObject({ status: 'SKIPPED' });
    expect(
      await db.get('select child_id, skipped_reason, local_date from schedule_instances', []),
    ).toEqual({ child_id: CHILD_A, skipped_reason: 'Asleep', local_date: '2026-09-14' });
    expect(await outboxOps(db)).toHaveLength(0);
  });

  it('with the server’s instance, the skip travels as an UPDATE on it', async () => {
    const { db, clock } = await fixture();
    await seedPhase(db);
    await seedRule(db, { id: R1 });
    const I1 = 'cdcdcdcd-0000-4000-8000-000000000001';
    await db.run(
      `insert into schedule_instances
         (id, household_id, rule_id, child_id, scheduled_for, local_date, status, created_at, updated_at)
       values (?, ?, ?, null, ?, '2026-09-14', 'UPCOMING', ?, ?)`,
      [I1, HOUSEHOLD, R1, SLOT, AT, AT],
    );
    await skipSlot(db, clock, {
      ...ctx,
      ruleId: R1,
      scheduledForMs: Date.parse(SLOT),
      reason: null,
    });
    expect(await instanceFor(db, R1, SLOT)).toEqual({ id: I1, status: 'SKIPPED' });
    const ops = await outboxOps(db);
    expect(ops.map(o => `${o.entity}:${o.op}:${o.entity_id}`)).toEqual([
      `schedule_instance:UPDATE:${I1}`,
    ]);
    expect(payloadOf(ops[0])).toMatchObject({ status: 'SKIPPED', skipped_reason: null });
  });
});

describe('savePreference (NOTIFICATIONS §6)', () => {
  it('upserts the viewer’s row for a channel', async () => {
    const { db, clock } = await fixture();
    const r = await savePreference(db, clock, {
      ...ctx,
      userId: USER,
      channel: 'pump',
      patch: { sound: false, quiet_from: '22:00', quiet_to: '07:00' },
    });
    expect(r.committed).toBe(true);
    expect(await preferencesOf(db, HOUSEHOLD, USER)).toEqual([
      { channel: 'pump', enabled: 1, sound: 0, vibrate: 1, quiet_from: '22:00', quiet_to: '07:00' },
    ]);
    // a second write patches the same row
    await savePreference(db, clock, {
      ...ctx,
      userId: USER,
      channel: 'pump',
      patch: { enabled: false },
    });
    expect(await preferencesOf(db, HOUSEHOLD, USER)).toMatchObject([{ enabled: 0, sound: 0 }]);
    const ops = await outboxOps(db);
    expect(ops.map(o => `${o.entity}:${o.op}`)).toEqual(['settings:UPDATE', 'settings:UPDATE']);
    expect(payloadOf(ops[0])).toMatchObject({
      table: 'notification_preferences',
      channel: 'pump',
      sound: false,
      quiet_from: '22:00',
    });
    expect(distinct(ops.map(o => o.client_op_id))).toBe(true);
  });
});

/**
 * ONE TAP, ONE WRITE (the owner, 2026-09-26: "there is a delay when adjusting quiet hours"). Quiet
 * hours go on every channel; the page used to commit them one channel at a time, and everything
 * that listens — the planner, Today, the sync engine — heard once per channel.
 */
describe('savePreferences: the same patch on many channels, in one write', () => {
  const CHANNELS = ['bottle', 'pump', 'sleep', 'med'];

  it('writes every channel’s row, one op each, in one commit that is heard once', async () => {
    const { db, clock } = await fixture();
    const store = createStore();
    let prefsHeard = 0;
    let outboxHeard = 0;
    store.subscribe(keys.prefs(HOUSEHOLD, USER), () => (prefsHeard += 1));
    store.subscribe(keys.outbox(), () => (outboxHeard += 1));
    const afterCommit = vi.fn();

    const r = await savePreferences(
      db,
      clock,
      {
        ...ctx,
        userId: USER,
        channels: [...CHANNELS, 'pump'], // a repeat is written once
        patch: { quiet_from: '21:30', quiet_to: '06:45' },
      },
      { store, afterCommit },
    );

    expect(r.committed).toBe(true);
    expect(prefsHeard).toBe(1);
    expect(outboxHeard).toBe(1);
    expect(afterCommit).toHaveBeenCalledTimes(1);
    const rows = await preferencesOf(db, HOUSEHOLD, USER);
    expect(rows.map(p => p.channel).sort()).toEqual([...CHANNELS].sort());
    for (const p of rows) expect(p).toMatchObject({ quiet_from: '21:30', quiet_to: '06:45' });

    const ops = await outboxOps(db);
    expect(ops).toHaveLength(CHANNELS.length);
    expect(ops.every(o => o.entity === 'settings' && o.op === 'UPDATE')).toBe(true);
    expect(distinct(ops.map(o => o.client_op_id))).toBe(true);
    expect(ops.map(o => payloadOf(o)['channel']).sort()).toEqual([...CHANNELS].sort());
  });

  it('is the same ops when the same tap is replayed, never a second set', async () => {
    const { db, clock } = await fixture();
    const intentId = 'cdcdcdcd-0000-4000-8000-000000000001';
    const input = {
      ...ctx,
      userId: USER,
      channels: CHANNELS,
      patch: { quiet_from: null, quiet_to: null },
      intentId,
    };
    const first = await savePreferences(db, clock, input);
    const again = await savePreferences(db, clock, input);
    expect(again.opIds).toEqual(first.opIds);
    expect(await outboxOps(db)).toHaveLength(CHANNELS.length);
  });

  it('writes nothing, and wakes nothing, for no channel at all', async () => {
    const { db, clock } = await fixture();
    const store = createStore();
    let heard = 0;
    store.subscribe(keys.outbox(), () => (heard += 1));
    const r = await savePreferences(
      db,
      clock,
      { ...ctx, userId: USER, channels: [], patch: { enabled: false } },
      { store },
    );
    expect(r.committed).toBe(false);
    expect(heard).toBe(0);
    expect(await outboxOps(db)).toHaveLength(0);
  });
});

describe('saveModuleGoal (migration 0097)', () => {
  const goalOf = async (db: Db) =>
    (
      await db.all<{ goal_minutes: number | null }>(
        'select goal_minutes from module_settings where household_id = ? and module_id = ?',
        [HOUSEHOLD, 'tummy'],
      )
    )[0]?.goal_minutes;

  it('writes the household’s daily goal onto the module’s own row and queues one settings op', async () => {
    const { db, clock } = await fixture();
    const r = await saveModuleGoal(db, clock, { ...ctx, activity: 'tummy', minutes: 15 });
    expect(r.committed).toBe(true);
    expect(await goalOf(db)).toBe(15);
    // and clears it with null — a setting is changed by changing it back
    await saveModuleGoal(db, clock, { ...ctx, activity: 'tummy', minutes: null });
    expect(await goalOf(db)).toBeNull();
    const ops = await outboxOps(db);
    expect(ops.map(o => `${o.entity}:${o.op}`)).toEqual(['settings:UPDATE', 'settings:UPDATE']);
    expect(payloadOf(ops[0])).toMatchObject({
      table: 'module_settings',
      module_id: 'tummy',
      goal_minutes: 15,
    });
    expect(payloadOf(ops[1])).toMatchObject({ table: 'module_settings', goal_minutes: null });
    expect(distinct(ops.map(o => o.client_op_id))).toBe(true);
  });

  it('refuses a goal outside the column’s own bound before anything is written', async () => {
    const { db, clock } = await fixture();
    await expect(
      saveModuleGoal(db, clock, { ...ctx, activity: 'tummy', minutes: 0 }),
    ).rejects.toThrow(RangeError);
    await expect(
      saveModuleGoal(db, clock, { ...ctx, activity: 'tummy', minutes: 7.5 }),
    ).rejects.toThrow(RangeError);
    expect(await outboxOps(db)).toEqual([]);
  });
});
