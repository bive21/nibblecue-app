/** @SYNC-DEPS — the dependency ordering row of docs/OFFLINE_SYNC.md §9. */
import { describe, expect, it } from 'vitest';
import { selectBatch } from './batch';
import { MAX_BATCH } from './constants';
import type { OutboxRow } from './types';

const uuid = (prefix: string, n: number) =>
  `${prefix.repeat(8).slice(0, 8)}-0000-0000-0000-${String(n).padStart(12, '0')}`;

let seq = 0;
function row(over: Partial<OutboxRow> & Pick<OutboxRow, 'client_op_id' | 'entity_id'>): OutboxRow {
  seq += 1;
  return {
    entity: 'activity',
    op: 'CREATE',
    household_id: uuid('a', 1),
    payload: '{}',
    depends_on: null,
    seq,
    created_at: '2026-09-14T10:00:00.000Z',
    state: 'PENDING',
    attempts: 0,
    next_attempt_at: null,
    sending_at: null,
    last_error: null,
    ...over,
  };
}

const none = () => false;

describe('selectBatch', () => {
  it('walks in seq order regardless of the order it was handed', () => {
    const a = row({ client_op_id: uuid('1', 1), entity_id: uuid('e', 1) });
    const b = row({ client_op_id: uuid('1', 2), entity_id: uuid('e', 2) });
    const c = row({ client_op_id: uuid('1', 3), entity_id: uuid('e', 3) });
    const { batch } = selectBatch([c, a, b], none);
    expect(batch.map(r => r.seq)).toEqual([a.seq, b.seq, c.seq]);
  });

  it('never puts two ops on one entity in flight together', () => {
    const e = uuid('e', 9);
    const create = row({ client_op_id: uuid('2', 1), entity_id: e });
    const update = row({ client_op_id: uuid('2', 2), entity_id: e, op: 'UPDATE' });
    const { batch } = selectBatch([create, update], none);
    expect(batch).toHaveLength(1);
    expect(batch[0]?.client_op_id).toBe(create.client_op_id);
  });

  it('takes a chain whole when the dependency is earlier in the same batch', () => {
    const activity = row({ client_op_id: uuid('3', 1), entity_id: uuid('e', 11) });
    const ledger = row({
      client_op_id: uuid('3', 2),
      entity_id: uuid('e', 12),
      entity: 'milk_txn',
      depends_on: activity.client_op_id,
    });
    const { batch, blocked } = selectBatch([activity, ledger], none);
    expect(batch).toHaveLength(2);
    expect(blocked).toEqual([]);
  });

  it('takes a dependant alone once its dependency is SYNCED', () => {
    const ledger = row({
      client_op_id: uuid('4', 2),
      entity_id: uuid('e', 12),
      entity: 'milk_txn',
      depends_on: uuid('4', 1),
    });
    const { batch } = selectBatch([ledger], id => id === uuid('4', 1));
    expect(batch).toHaveLength(1);
  });

  it('blocks EVERY later op on an entity whose op was skipped for its dependency', () => {
    const entity = uuid('e', 20);
    const blockedCreate = row({
      client_op_id: uuid('5', 1),
      entity_id: entity,
      entity: 'milk_txn',
      depends_on: uuid('5', 0), // never synced, never in this batch
    });
    const laterUpdate = row({
      client_op_id: uuid('5', 2),
      entity_id: entity,
      entity: 'milk_txn',
      op: 'UPDATE',
    });
    const { batch, blocked } = selectBatch([blockedCreate, laterUpdate], none);
    // Without the blocked set the UPDATE would overtake the CREATE it depends on.
    expect(batch).toEqual([]);
    expect(blocked).toEqual([entity]);
  });

  it('lets independent chains interleave rather than stopping the pass', () => {
    const stuck = row({
      client_op_id: uuid('6', 1),
      entity_id: uuid('e', 30),
      depends_on: uuid('6', 0),
    });
    const free1 = row({ client_op_id: uuid('6', 2), entity_id: uuid('e', 31) });
    const free2 = row({ client_op_id: uuid('6', 3), entity_id: uuid('e', 32) });
    const { batch } = selectBatch([stuck, free1, free2], none);
    expect(batch.map(r => r.client_op_id)).toEqual([free1.client_op_id, free2.client_op_id]);
  });

  it('never exceeds MAX_BATCH', () => {
    const rows = Array.from({ length: 300 }, (_, i) =>
      row({ client_op_id: uuid('7', i), entity_id: uuid('f', i) }),
    );
    expect(selectBatch(rows, none).batch).toHaveLength(MAX_BATCH);
    expect(selectBatch(rows, none, { maxBatch: 7 }).batch).toHaveLength(7);
  });

  it('drains 1,000 independent candidates in exactly 20 clean batches of 50', () => {
    const rows = Array.from({ length: 1000 }, (_, i) =>
      row({ client_op_id: uuid('8', i), entity_id: uuid('g', i) }),
    );
    const synced = new Set<string>();
    const seen = new Set<string>();
    let passes = 0;
    let remaining = rows;
    while (remaining.length > 0) {
      const { batch } = selectBatch(remaining, id => synced.has(id));
      expect(batch.length).toBeLessThanOrEqual(MAX_BATCH);
      expect(batch.length).toBeGreaterThan(0);
      for (const r of batch) {
        expect(seen.has(r.client_op_id), 'no op is sent twice').toBe(false);
        seen.add(r.client_op_id);
        synced.add(r.client_op_id);
      }
      remaining = remaining.filter(r => !synced.has(r.client_op_id));
      passes += 1;
    }
    expect(passes).toBe(20);
    expect(seen.size).toBe(1000);
  });
});
