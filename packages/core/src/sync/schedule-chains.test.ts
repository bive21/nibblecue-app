import { describe, expect, it } from 'vitest';
import {
  dayWindowChain,
  instanceSkipChain,
  moduleSettingChain,
  notificationPreferenceChain,
  phaseCreateChain,
  phaseUpdateChain,
  ruleCreateChain,
  ruleDeleteChain,
  ruleUpdateChain,
  settingsEntityId,
  type RuleFields,
} from './chains';
import { isUuid } from './ids';

const base = {
  intentId: '9c5f2b1e-6a34-4d8f-b7e0-1a2c3d4e5f61',
  householdId: 'aaaaaaaa-0000-0000-0000-00000000000a',
  createdBy: '11111111-1111-1111-1111-111111111111',
  deviceId: null,
  clientEditedAt: '2026-06-10T16:30:00.000Z',
};
const rule: RuleFields = {
  phase_id: 'eeeeeeee-0000-0000-0000-000000000001',
  child_id: null,
  activity: 'pump',
  care_item_id: null,
  effective_from: base.clientEditedAt,
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
  remind_user_ids: ['11111111-1111-1111-1111-111111111111'],
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
};

describe('schedule chains (WP7)', () => {
  it('a phase CREATE carries its fields and activation; a series of rules derive their op ids', () => {
    const c = phaseCreateChain({
      ...base,
      phaseId: 'p1',
      phase: {
        name: ' Newborn routine ',
        childId: null,
        effectiveFrom: '2026-06-10',
        isCurrent: true,
      },
    });
    expect(c.ops[0]).toMatchObject({
      entity: 'schedule_phase',
      op: 'CREATE',
      entity_id: 'p1',
      payload: { name: 'Newborn routine', is_current: true },
    });
    expect(c.rows[0]?.row).toMatchObject({
      is_current: true,
      effective_to: null,
      deleted_at: null,
    });
    const a = ruleCreateChain({ ...base, ruleId: 'r1', rule, tag: 'series:07:00' });
    const b = ruleCreateChain({ ...base, ruleId: 'r2', rule, tag: 'series:10:00' });
    expect(a.ops[0]?.client_op_id).not.toBe(b.ops[0]?.client_op_id);
    expect(a.ops[0]?.client_op_id).toBe(
      ruleCreateChain({ ...base, ruleId: 'r1', rule, tag: 'series:07:00' }).ops[0]?.client_op_id,
    );
    expect(a.ops[0]?.payload).toMatchObject({
      every_minutes: 180,
      client_edited_at: base.clientEditedAt,
    });
  });

  it('a rule UPDATE names the version it edited; a DELETE is soft on both sides', () => {
    const u = ruleUpdateChain({
      ...base,
      ruleId: 'r1',
      patch: { every_minutes: 120 },
      expectedUpdatedAt: '2026-06-10T10:00:00.000Z',
    });
    expect(u.ops[0]?.payload).toEqual({
      every_minutes: 120,
      expected_updated_at: '2026-06-10T10:00:00.000Z',
      client_edited_at: base.clientEditedAt,
    });
    expect(u.rows[0]?.row).toEqual({ id: 'r1', every_minutes: 120 });
    expect(() =>
      ruleUpdateChain({ ...base, ruleId: 'r1', patch: {}, expectedUpdatedAt: null }),
    ).toThrow(/names no column/);
    const d = ruleDeleteChain({ ...base, ruleId: 'r1' });
    expect(d.ops[0]).toMatchObject({ entity: 'schedule_rule', op: 'DELETE' });
    expect(d.rows[0]?.row).toEqual({ id: 'r1', deleted_at: base.clientEditedAt, is_active: false });
  });

  it('a phase patch records the rules an undo brings back, and refuses to say nothing', () => {
    const p = phaseUpdateChain({
      ...base,
      phaseId: 'p1',
      patch: { deleted_at: null, rule_ids: ['r1', 'r2'] },
    });
    expect(p.ops[0]?.payload).toMatchObject({ deleted_at: null, rule_ids: ['r1', 'r2'] });
    expect(() => phaseUpdateChain({ ...base, phaseId: 'p1', patch: {} })).toThrow(/says nothing/);
    expect(() => phaseUpdateChain({ ...base, phaseId: 'p1', patch: { name: 'x' } })).toThrow(
      /2 to 40/,
    );
  });

  it('a skip is the one client write on an instance', () => {
    const s = instanceSkipChain({ ...base, instanceId: 'i1', reason: 'asleep' });
    expect(s.ops[0]).toMatchObject({
      entity: 'schedule_instance',
      op: 'UPDATE',
      payload: { status: 'SKIPPED', skipped_reason: 'asleep' },
    });
  });

  it('settings ops derive a stable entity id from what they name', () => {
    const m = moduleSettingChain({
      ...base,
      moduleId: 'bottle',
      patch: { nudge_after_minutes: 180 },
    });
    expect(isUuid(m.ops[0]?.entity_id ?? '')).toBe(true);
    expect(m.ops[0]?.entity_id).toBe(
      settingsEntityId(base.householdId, 'module_settings', 'bottle'),
    );
    expect(m.ops[0]?.payload).toMatchObject({
      table: 'module_settings',
      module_id: 'bottle',
      nudge_after_minutes: 180,
    });
    const n = notificationPreferenceChain({
      ...base,
      userId: '11111111-1111-1111-1111-111111111111',
      channel: 'bottle',
      patch: { quiet_from: '22:00', quiet_to: '07:00' },
    });
    expect(n.ops[0]?.payload).toMatchObject({
      table: 'notification_preferences',
      channel: 'bottle',
      quiet_from: '22:00',
    });
    expect(n.ops[0]?.entity_id).not.toBe(m.ops[0]?.entity_id);
  });

  it('the day window is one row per household, addressed by a constant key', () => {
    const w = dayWindowChain({ ...base, wake: '08:00', bed: '21:00' });
    expect(w.ops[0]?.entity).toBe('settings');
    expect(w.ops[0]?.op).toBe('UPDATE');
    expect(w.ops[0]?.payload).toMatchObject({
      table: 'household_settings',
      wake_time: '08:00',
      bed_time: '21:00',
    });
    expect(w.rows[0]).toEqual({
      table: 'household_settings',
      row: { household_id: base.householdId, wake_time: '08:00', bed_time: '21:00' },
    });
    // The whole point of a constant key: two phones editing the window in the same minute
    // resolve to ONE upsert on one row, not two rows racing. Different wake time, same id.
    const later = dayWindowChain({ ...base, wake: '06:30', bed: '21:00' });
    expect(later.ops[0]?.entity_id).toBe(w.ops[0]?.entity_id);
    expect(isUuid(w.ops[0]?.entity_id ?? '')).toBe(true);
    // and a different household is a different row
    const other = dayWindowChain({
      ...base,
      householdId: 'bbbbbbbb-0000-0000-0000-00000000000b',
      wake: '08:00',
      bed: '21:00',
    });
    expect(other.ops[0]?.entity_id).not.toBe(w.ops[0]?.entity_id);
  });
});
