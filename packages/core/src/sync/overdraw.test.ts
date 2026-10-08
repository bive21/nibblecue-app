/** @SYNC-OVERDRAW — docs/OFFLINE_SYNC.md §5.2 and §9's stash-overdraw row. */
import { describe, expect, it } from 'vitest';
import { deriveOpId } from './ids';
import { rewriteOverdraw } from './overdraw';
import type { PushOp } from './types';

const INTENT = '5f9a1c3e-8b24-4d7a-9e06-1c2b3a4d5e6f';
const HOUSEHOLD = 'aaaaaaaa-0000-0000-0000-00000000000a';
const CONTAINER = 'bbbbbbbb-0000-0000-0000-000000000001';
const ACTIVITY = 'eeeeeeee-0000-0000-0000-000000000001';

const original = (): PushOp => ({
  client_op_id: deriveOpId(INTENT, 'use'),
  entity: 'milk_txn',
  op: 'CREATE',
  entity_id: deriveOpId(INTENT, 'use'),
  household_id: HOUSEHOLD,
  payload: {
    container_id: CONTAINER,
    kind: 'USE',
    delta_ml: -120,
    from_location_id: null,
    to_location_id: null,
    activity_id: ACTIVITY,
    occurred_at: '2026-09-14T13:00:00.000Z',
    created_by: '11111111-1111-1111-1111-111111111111',
    client_edited_at: '2026-09-14T13:00:00.000Z',
  },
});

describe('rewriteOverdraw', () => {
  it('splits the draw into what was there and what was not', () => {
    const [use, adjust] = rewriteOverdraw(original(), 30, INTENT);
    expect(use.payload['kind']).toBe('USE');
    expect(use.payload['delta_ml']).toBe(-30);
    expect(adjust.payload['kind']).toBe('ADJUST');
    expect(adjust.payload['delta_ml']).toBe(-90);
  });

  it('sums to the original delta_ml: the record of what the parent poured survives', () => {
    for (const available of [0, 1, 30, 59, 119]) {
      const [use, adjust] = rewriteOverdraw(original(), available, INTENT);
      expect(Number(use.payload['delta_ml']) + Number(adjust.payload['delta_ml'])).toBe(-120);
    }
  });

  it('keeps both ids derived, so a second rewrite is byte-identical', () => {
    const first = rewriteOverdraw(original(), 30, INTENT);
    const second = rewriteOverdraw(original(), 30, INTENT);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    expect(first[0].client_op_id).toBe(deriveOpId(INTENT, 'use'));
    expect(first[1].client_op_id).toBe(deriveOpId(INTENT, 'adj'));
    expect(first[1].entity_id).toBe(deriveOpId(INTENT, 'adj'));
  });

  it('keeps the USE op’s key even when nothing was left, so the original can never replay', () => {
    const [use, adjust] = rewriteOverdraw(original(), 0, INTENT);
    expect(use.client_op_id).toBe(original().client_op_id);
    expect(use.payload['delta_ml']).toBe(0);
    expect(adjust.payload['delta_ml']).toBe(-120);
  });

  it('leaves the feed alone: same container, same activity, same moment', () => {
    const [use, adjust] = rewriteOverdraw(original(), 30, INTENT);
    for (const op of [use, adjust]) {
      expect(op.household_id).toBe(HOUSEHOLD);
      expect(op.payload['container_id']).toBe(CONTAINER);
      expect(op.payload['activity_id']).toBe(ACTIVITY);
      expect(op.payload['occurred_at']).toBe('2026-09-14T13:00:00.000Z');
    }
  });

  it('orders the compensating row behind the draw it compensates', () => {
    const [use, adjust] = rewriteOverdraw(original(), 30, INTENT);
    expect(adjust.depends_on).toBe(use.client_op_id);
  });

  it('refuses to rewrite what is not an overdraw', () => {
    expect(() => rewriteOverdraw(original(), 120, INTENT)).toThrow(RangeError);
    expect(() => rewriteOverdraw(original(), 500, INTENT)).toThrow(RangeError);
    expect(() => rewriteOverdraw(original(), -1, INTENT)).toThrow(RangeError);
  });

  it('refuses an op that is not a negative integer draw', () => {
    const positive = original();
    positive.payload['delta_ml'] = 120;
    expect(() => rewriteOverdraw(positive, 30, INTENT)).toThrow(TypeError);
    const fractional = original();
    fractional.payload['delta_ml'] = -12.5;
    expect(() => rewriteOverdraw(fractional, 3, INTENT)).toThrow(TypeError);
  });
});
