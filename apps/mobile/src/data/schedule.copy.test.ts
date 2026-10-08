/**
 * A second child starts with the first child's rhythms — or does not (docs/MULTIPLES.md §8).
 * Against the real local schema and the real writers, read back through the query the
 * Schedule tab uses, so a rhythm a twin was promised is a rhythm the tab shows.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { liveRules } from '../db/queries/schedule';
import { CHILD_A, CHILD_B, HOUSEHOLD, USER, seedHousehold } from '../testing/fixtures';
import { copyRulesToChild, ensureCurrentPhase, saveRule } from './schedule';
import { systemClock } from './repository';
import type { WriteContext } from './activities';

const restores: (() => void)[] = [];
afterEach(() => {
  while (restores.length > 0) restores.pop()?.();
});

const WRITE: WriteContext = {
  householdId: HOUSEHOLD,
  createdBy: USER,
  deviceId: null,
  source: 'sheet',
};

async function household() {
  const f = await seedHousehold();
  restores.push(f.restoreIds);
  const phaseId = await ensureCurrentPhase(f.db, systemClock, { ...WRITE, childId: CHILD_A });
  if (phaseId === null) throw new Error('no phase');
  const base = {
    phase_id: phaseId,
    care_item_id: null,
    effective_from: '',
    at_local_time: null,
    every_minutes: null,
    relative_to: null,
    offset_minutes: null,
    every_days: null,
    target_quantity: null,
    repeat: 'DAILY' as const,
    repeat_days: null,
    reminder_enabled: true,
    remind_user_ids: [] as string[],
    match_window_minutes: 45,
    match_scope: 'MINUTES' as const,
    miss_after_minutes: 60,
    late_window_minutes: 30,
    night_mode: 'NONE' as const,
    night_from: null,
    night_to: null,
    night_every_minutes: null,
    night_at: null,
    target_per_day: null,
    name: null,
    is_active: true,
  };
  // Emma: a three-hourly bottle, a fixed 09:00 vitamin on a care item; the house: a pump rule
  await saveRule(f.db, systemClock, {
    ...WRITE,
    childIds: [CHILD_A],
    fields: { ...base, activity: 'bottle', rule_type: 'INTERVAL', every_minutes: 180 },
  });
  await saveRule(f.db, systemClock, {
    ...WRITE,
    childIds: [CHILD_A],
    fields: {
      ...base,
      activity: 'med',
      rule_type: 'FIXED',
      at_local_time: '09:00',
      match_scope: 'DAY',
      care_item_id: 'care-vitamin-d',
      name: 'Vitamin D',
    },
  });
  await saveRule(f.db, systemClock, {
    ...WRITE,
    childIds: [null],
    fields: { ...base, activity: 'pump', rule_type: 'INTERVAL', every_minutes: 150 },
  });
  return f.db;
}

describe('copying one child’s rhythms to another', () => {
  it('gives the twin one rule per rule Emma has, and leaves the household’s pump alone', async () => {
    const db = await household();
    const out = await copyRulesToChild(db, systemClock, {
      ...WRITE,
      fromChildId: CHILD_A,
      toChildId: CHILD_B,
    });
    expect(out.committed).toBe(true);
    expect(out.ruleIds).toHaveLength(2);

    const rules = await liveRules(db, HOUSEHOLD);
    const liam = rules.filter(r => r.child_id === CHILD_B);
    expect(liam.map(r => `${r.activity}:${r.rule_type}`).sort()).toEqual([
      'bottle:INTERVAL',
      'med:FIXED',
    ]);
    // the same numbers, the same times, the same care item — "the same" means the same
    expect(liam.find(r => r.activity === 'bottle')?.every_minutes).toBe(180);
    const vit = liam.find(r => r.activity === 'med');
    expect(vit?.at_local_time?.slice(0, 5)).toBe('09:00');
    expect(vit?.care_item_id).toBe('care-vitamin-d');
    expect(vit?.name).toBe('Vitamin D');
    // Emma's own rules are untouched, and the household still has exactly one pump rule
    expect(rules.filter(r => r.child_id === CHILD_A)).toHaveLength(2);
    expect(rules.filter(r => r.activity === 'pump')).toHaveLength(1);
    expect(rules.filter(r => r.activity === 'pump')[0]?.child_id).toBeNull();
  });

  it('writes nothing twice: a retry, or a toggle tapped twice, adds no rule', async () => {
    const db = await household();
    await copyRulesToChild(db, systemClock, { ...WRITE, fromChildId: CHILD_A, toChildId: CHILD_B });
    const again = await copyRulesToChild(db, systemClock, {
      ...WRITE,
      fromChildId: CHILD_A,
      toChildId: CHILD_B,
    });
    expect(again.committed).toBe(false);
    expect(again.suppressed).toBe(true);
    expect(again.ruleIds).toEqual([]);
    expect((await liveRules(db, HOUSEHOLD)).filter(r => r.child_id === CHILD_B)).toHaveLength(2);
  });

  it('copies only what the new child is missing, so a hand-set rule survives', async () => {
    const db = await household();
    // Liam already has his own bottle interval, set by hand before the copy
    const phaseId = await ensureCurrentPhase(db, systemClock, { ...WRITE, childId: CHILD_B });
    const emma = (await liveRules(db, HOUSEHOLD)).find(
      r => r.child_id === CHILD_A && r.activity === 'bottle',
    );
    if (phaseId === null || emma === undefined) throw new Error('fixture');
    await saveRule(db, systemClock, {
      ...WRITE,
      childIds: [CHILD_B],
      fields: {
        phase_id: phaseId,
        child_id: CHILD_B,
        activity: 'bottle',
        care_item_id: null,
        effective_from: '',
        rule_type: 'INTERVAL',
        at_local_time: null,
        every_minutes: 240,
        relative_to: null,
        offset_minutes: null,
        every_days: null,
        target_quantity: null,
        repeat: 'DAILY',
        repeat_days: null,
        reminder_enabled: true,
        remind_user_ids: [],
        match_window_minutes: 45,
        match_scope: 'MINUTES',
        miss_after_minutes: 60,
        late_window_minutes: 30,
        night_mode: 'NONE',
        night_from: null,
        night_to: null,
        night_every_minutes: null,
        night_at: null,
        target_per_day: null,
        name: null,
        is_active: true,
      },
    });
    const out = await copyRulesToChild(db, systemClock, {
      ...WRITE,
      fromChildId: CHILD_A,
      toChildId: CHILD_B,
    });
    expect(out.ruleIds).toHaveLength(1); // the vitamin only
    const liam = (await liveRules(db, HOUSEHOLD)).filter(r => r.child_id === CHILD_B);
    expect(liam.find(r => r.activity === 'bottle')?.every_minutes).toBe(240);
  });
});
