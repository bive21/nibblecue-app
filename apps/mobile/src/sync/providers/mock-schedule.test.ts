/**
 * The fake's schedule branches, held to what 0014 does (packages/db sync-schedule.test.ts is
 * the truth; where the two disagree the fake is fixed). No materialisation here: a device
 * computes today's slots itself, and instances are the server's rows.
 */
import type { PushOp } from '@nibblecue/core';
import { describe, expect, it } from 'vitest';
import { MockSyncServer } from './mock';

const HH = 'aaaaaaaa-0000-0000-0000-00000000000a';
const DANA = '11111111-1111-1111-1111-111111111111';
const MIA = '33333333-3333-3333-3333-333333333333';
const RUTH = '44444444-4444-4444-4444-444444444444';
const LIAM = 'cccccccc-0000-0000-0000-0000000000e2';
const T0 = '2026-09-14T10:00:00.000Z';
let n = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;

function server(): MockSyncServer {
  const s = new MockSyncServer({ now: () => Date.parse(T0) + n * 1000 });
  s.addMember({ household_id: HH, user_id: DANA, role: 'OWNER' });
  s.addMember({ household_id: HH, user_id: MIA, role: 'CAREGIVER' });
  s.addMember({ household_id: HH, user_id: RUTH, role: 'VIEW_ONLY' });
  return s;
}

const op = (
  entity: PushOp['entity'],
  kind: PushOp['op'],
  id: string,
  payload: Record<string, unknown>,
): PushOp => ({
  client_op_id: uuid(),
  entity,
  op: kind,
  entity_id: id,
  household_id: HH,
  payload: { client_edited_at: T0, ...payload },
});

const one = async (s: MockSyncServer, user: string, o: PushOp) =>
  (await s.push(user, [o])).results[0]!;

describe('phases', () => {
  it('create, activate closes the outgoing one, the delete guards, the undo brings the rules back', async () => {
    const s = server();
    const p1 = uuid();
    const p2 = uuid();
    expect(
      (
        await one(
          s,
          DANA,
          op('schedule_phase', 'CREATE', p1, {
            name: 'Newborn',
            child_id: LIAM,
            effective_from: '2026-06-01',
            is_current: true,
          }),
        )
      ).status,
    ).toBe('applied');
    expect(
      (
        await one(
          s,
          DANA,
          op('schedule_phase', 'CREATE', p2, {
            name: '4 months',
            child_id: LIAM,
            effective_from: '2026-06-10',
            is_current: false,
          }),
        )
      ).status,
    ).toBe('applied');
    const rule = uuid();
    expect(
      (
        await one(
          s,
          DANA,
          op('schedule_rule', 'CREATE', rule, {
            phase_id: p1,
            child_id: LIAM,
            activity: 'bottle',
            rule_type: 'FIXED',
            at_local_time: '09:00',
            remind_user_ids: [DANA, RUTH],
          }),
        )
      ).status,
    ).toBe('applied');
    expect(s.rowsOf('schedule_rules')[0]?.['remind_user_ids']).toEqual([DANA]); // VIEW_ONLY is never in the audience

    expect(
      (
        await one(
          s,
          DANA,
          op('schedule_phase', 'UPDATE', p2, { activate: true, activation_date: '2026-06-15' }),
        )
      ).status,
    ).toBe('applied');
    const rows = s.rowsOf('schedule_phases');
    expect(rows.find(r => r['id'] === p1)).toMatchObject({
      is_current: false,
      effective_to: '2026-06-15',
    });
    expect(rows.find(r => r['id'] === p2)).toMatchObject({
      is_current: true,
      effective_from: '2026-06-15',
      effective_to: null,
    });

    await expect(
      one(s, DANA, op('schedule_phase', 'UPDATE', p2, { deleted_at: T0 })),
    ).resolves.toMatchObject({
      status: 'rejected',
      error: { message: expect.stringMatching(/Activate another routine first/) },
    });
    expect(
      (await one(s, DANA, op('schedule_phase', 'UPDATE', p1, { deleted_at: T0 }))).status,
    ).toBe('applied');
    expect(s.rowsOf('schedule_rules')[0]).toMatchObject({ is_active: false });
    expect(s.rowsOf('schedule_rules')[0]?.['deleted_at']).not.toBeNull();
    await expect(
      one(s, DANA, op('schedule_phase', 'UPDATE', p2, { deleted_at: T0 })),
    ).resolves.toMatchObject({ status: 'rejected' });
    expect(
      (
        await one(
          s,
          DANA,
          op('schedule_phase', 'UPDATE', p1, { deleted_at: null, rule_ids: [rule] }),
        )
      ).status,
    ).toBe('applied');
    expect(s.rowsOf('schedule_rules')[0]).toMatchObject({ is_active: true, deleted_at: null });
    expect((await one(s, MIA, op('schedule_phase', 'UPDATE', p1, { name: 'x' }))).error?.code).toBe(
      'FORBIDDEN',
    );
  });
});

describe('rules, a skip, settings', () => {
  it('an edit names its version: stale is refused with the current row; delete is soft', async () => {
    const s = server();
    const p = uuid();
    await one(
      s,
      DANA,
      op('schedule_phase', 'CREATE', p, { name: 'Routine', child_id: null, is_current: true }),
    );
    const rule = uuid();
    await one(
      s,
      DANA,
      op('schedule_rule', 'CREATE', rule, {
        phase_id: p,
        child_id: null,
        activity: 'pump',
        rule_type: 'INTERVAL',
        every_minutes: 180,
        remind_user_ids: [DANA],
      }),
    );
    const row = s.rowsOf('schedule_rules')[0]!;
    const stale = await one(
      s,
      DANA,
      op('schedule_rule', 'UPDATE', rule, {
        every_minutes: 120,
        expected_updated_at: '2000-01-01T00:00:00.000Z',
      }),
    );
    expect(stale).toMatchObject({
      status: 'rejected',
      error: { code: 'VALIDATION' },
      conflict: { kind: 'rule_stale' },
    });
    expect((stale.conflict as { current: Record<string, unknown> }).current['id']).toBe(rule);
    const ok = await one(
      s,
      DANA,
      op('schedule_rule', 'UPDATE', rule, {
        every_minutes: 120,
        expected_updated_at: String(row['updated_at']),
      }),
    );
    expect(ok.status).toBe('applied');
    expect(row['every_minutes']).toBe(120);
    expect((await one(s, MIA, op('schedule_rule', 'DELETE', rule, {}))).error?.code).toBe(
      'FORBIDDEN',
    );
    expect((await one(s, DANA, op('schedule_rule', 'DELETE', rule, {}))).status).toBe('applied');
    expect(row['deleted_at']).not.toBeNull();
    expect(row['is_active']).toBe(false);
  });

  it('a caregiver skips an instance and its pending reminders are canceled; a done one is a duplicate', async () => {
    const s = server();
    const inst = uuid();
    s.insertAsOtherDevice('schedule_instances', {
      id: inst,
      household_id: HH,
      rule_id: uuid(),
      child_id: null,
      scheduled_for: T0,
      local_date: '2026-09-14',
      status: 'DUE',
    });
    s.insertAsOtherDevice('reminders', {
      id: uuid(),
      household_id: HH,
      instance_id: inst,
      kind: 'schedule',
      user_id: DANA,
      fire_at: T0,
      payload: {},
      sent_at: null,
      cancelled_at: null,
    });
    expect(
      (
        await one(
          s,
          MIA,
          op('schedule_instance', 'UPDATE', inst, { status: 'SKIPPED', skipped_reason: 'asleep' }),
        )
      ).status,
    ).toBe('applied');
    expect(s.rowsOf('schedule_instances')[0]).toMatchObject({
      status: 'SKIPPED',
      skipped_reason: 'asleep',
    });
    expect(s.rowsOf('reminders')[0]?.['cancel_reason']).toBe('skipped');
    expect(
      (await one(s, MIA, op('schedule_instance', 'UPDATE', inst, { status: 'SKIPPED' }))).status,
    ).toBe('duplicate');
    await expect(
      one(s, MIA, op('schedule_instance', 'UPDATE', inst, { status: 'DONE' })),
    ).resolves.toMatchObject({ status: 'rejected' });
    expect(
      (await one(s, RUTH, op('schedule_instance', 'UPDATE', inst, { status: 'SKIPPED' }))).error
        ?.code,
    ).toBe('FORBIDDEN');
  });

  it('settings: a nudge threshold is an admin write and lands on the module row; a preference is the caller’s own', async () => {
    const s = server();
    expect(
      (
        await one(
          s,
          MIA,
          op('settings', 'UPDATE', uuid(), {
            table: 'module_settings',
            module_id: 'bottle',
            nudge_after_minutes: 180,
          }),
        )
      ).error?.code,
    ).toBe('FORBIDDEN');
    expect(
      (
        await one(
          s,
          DANA,
          op('settings', 'UPDATE', uuid(), {
            table: 'module_settings',
            module_id: 'bottle',
            nudge_after_minutes: 180,
          }),
        )
      ).status,
    ).toBe('applied');
    expect(s.rowsOf('module_settings')).toHaveLength(1);
    expect(s.rowsOf('module_settings')[0]).toMatchObject({
      module_id: 'bottle',
      nudge_after_minutes: 180,
      enabled: true,
    });
    expect(
      (
        await one(
          s,
          DANA,
          op('settings', 'UPDATE', uuid(), {
            table: 'module_settings',
            module_id: 'bottle',
            nudge_after_minutes: null,
          }),
        )
      ).status,
    ).toBe('applied');
    expect(s.rowsOf('module_settings')[0]?.['nudge_after_minutes']).toBeNull();
    expect(
      (
        await one(
          s,
          MIA,
          op('settings', 'UPDATE', uuid(), {
            table: 'notification_preferences',
            channel: 'pump',
            quiet_from: '22:00',
            quiet_to: '07:00',
          }),
        )
      ).status,
    ).toBe('applied');
    expect(
      (
        await one(
          s,
          MIA,
          op('settings', 'UPDATE', uuid(), {
            table: 'notification_preferences',
            channel: 'pump',
            sound: false,
          }),
        )
      ).status,
    ).toBe('applied');
    expect(s.rowsOf('notification_preferences')[0]).toMatchObject({
      user_id: MIA,
      channel: 'pump',
      quiet_from: '22:00',
      quiet_to: '07:00',
      sound: false,
      enabled: true,
    });
  });
});
