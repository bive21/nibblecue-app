/**
 * ONE ACTION, SEVERAL WRITES — and every one of them reaches the outbox (the review of
 * 2026-09-23).
 *
 * A rule write, a rule patch, a delete, a restore and the day window each put ONE op in the queue,
 * and that op's `client_op_id` used to be the write's intent itself. The Rule sheet (swapping an
 * interval for set times), Routine (moving every night window with the day) and Schedule from your
 * log all thread ONE intent through several writes — so every write after the first carried an op
 * id already in the queue, `enqueue`'s `insert or ignore` dropped it, and the change lived on this
 * phone alone: the server, the other parent and the pushed reminders never heard of it.
 */
import type { RuleFields } from '@nibblecue/core';
import { afterEach, describe, expect, it } from 'vitest';
import type { Db } from '../db/driver';
import { HOUSEHOLD, PHASE, USER, seedHousehold, seedPhase, seedRule } from '../testing/fixtures';
import { newIntentId } from './ids';
import { commitWrite } from './repository';
import {
  deleteRules,
  patchRule,
  restoreRules,
  saveDayWindow,
  saveModuleGoal,
  saveRule,
} from './schedule';

const ctx = { householdId: HOUSEHOLD, createdBy: USER, deviceId: null, source: 'sheet' as const };
const INTERVAL = 'abababab-0000-4000-8000-0000000000c1';
const OTHER = 'abababab-0000-4000-8000-0000000000c2';

const restores: (() => void)[] = [];
afterEach(() => {
  while (restores.length > 0) restores.pop()?.();
});

const outbox = (db: Db) =>
  db.all<{ client_op_id: string; entity: string; op: string; entity_id: string }>(
    'select client_op_id, entity, op, entity_id from outbox order by seq',
  );

const fixed = (at: string): Omit<RuleFields, 'child_id'> => ({
  phase_id: PHASE,
  activity: 'bottle',
  care_item_id: null,
  effective_from: '',
  rule_type: 'FIXED',
  at_local_time: at,
  every_minutes: null,
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
});

async function seeded() {
  const f = await seedHousehold();
  restores.push(f.restoreIds);
  await seedPhase(f.db);
  await seedRule(f.db, { id: INTERVAL, activity: 'bottle' });
  await seedRule(f.db, { id: OTHER, activity: 'diaper' });
  return f;
}

describe('one intent threaded through several writes', () => {
  it('queues every write, each under its own op id', async () => {
    const { db, clock } = await seeded();
    const intentId = newIntentId();
    // the Rule sheet's swap: the interval goes, two set times come in
    await deleteRules(db, clock, { ...ctx, ruleIds: [INTERVAL], intentId });
    const a = await saveRule(db, clock, { ...ctx, intentId, fields: fixed('07:00') });
    const b = await saveRule(db, clock, { ...ctx, intentId, fields: fixed('11:00') });
    // Routine's day move: a night window patched, the window saved, a goal cleared
    await patchRule(db, clock, { ...ctx, ruleId: OTHER, intentId, patch: { night_to: '06:30' } });
    await saveDayWindow(db, clock, { ...ctx, wake: '06:30', bed: '20:00', intentId });
    await saveModuleGoal(db, clock, { ...ctx, activity: 'tummy', minutes: null, intentId });

    const ops = await outbox(db);
    expect(ops.map(o => `${o.entity} ${o.op}`)).toEqual([
      'schedule_rule DELETE',
      'schedule_rule CREATE',
      'schedule_rule CREATE',
      'schedule_rule UPDATE',
      'settings UPDATE',
      'settings UPDATE',
    ]);
    expect(new Set(ops.map(o => o.client_op_id)).size).toBe(ops.length);
    expect(ops.filter(o => o.op === 'CREATE').map(o => o.entity_id)).toEqual([
      ...a.ruleIds,
      ...b.ruleIds,
    ]);
  });

  it('keeps two different writes to one row apart: a rule patched twice, the day moved twice', async () => {
    const { db, clock } = await seeded();
    const intentId = newIntentId();
    await patchRule(db, clock, { ...ctx, ruleId: OTHER, intentId, patch: { night_to: '06:30' } });
    await patchRule(db, clock, { ...ctx, ruleId: OTHER, intentId, patch: { every_minutes: 150 } });
    await saveDayWindow(db, clock, { ...ctx, wake: '06:30', bed: '20:00', intentId });
    await saveDayWindow(db, clock, { ...ctx, wake: '07:00', bed: '19:30', intentId });
    const ops = await outbox(db);
    expect(ops.map(o => `${o.entity} ${o.op}`)).toEqual([
      'schedule_rule UPDATE',
      'schedule_rule UPDATE',
      'settings UPDATE',
      'settings UPDATE',
    ]);
    expect(new Set(ops.map(o => o.client_op_id)).size).toBe(4);
  });

  it('keeps a replayed write idempotent: the same write under the same intent is one op', async () => {
    const { db, clock } = await seeded();
    const intentId = newIntentId();
    await restoreRules(db, clock, { ...ctx, ruleIds: [INTERVAL], intentId });
    await restoreRules(db, clock, { ...ctx, ruleIds: [INTERVAL], intentId });
    expect(await outbox(db)).toHaveLength(1);
  });

  it('refuses a write whose op id is already queued for a different one', async () => {
    const { db, clock } = await seeded();
    const first = await patchRule(db, clock, {
      ...ctx,
      ruleId: OTHER,
      patch: { every_minutes: 120 },
    });
    const reused = first.opIds[0] ?? '';
    await expect(
      commitWrite(db, clock, {
        intentId: reused,
        source: 'sheet',
        chain: {
          rows: [],
          ops: [
            {
              client_op_id: reused,
              entity: 'schedule_rule',
              op: 'UPDATE',
              entity_id: INTERVAL,
              household_id: HOUSEHOLD,
              payload: { every_minutes: 150 },
              depends_on: null,
            },
          ],
        },
      }),
    ).rejects.toThrow(/already queued/);
    expect(await outbox(db)).toHaveLength(1);
  });
});
