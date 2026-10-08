import type { OutboxRow } from '@nibblecue/core';
import { afterEach, describe, expect, it } from 'vitest';
import { logActivity } from '../data/activities';
import { pending as outboxPending } from '../data/outbox';
import { currentSeq } from '../data/seq';
import type { Db } from '../db/driver';
import { CHILD_A, HOUSEHOLD, seedHousehold, USER, type Fixture } from '../testing/fixtures';
import { replayQuarantined } from './replay';

/** A quarantined row exactly as `Quarantine.takeFor` hands it back: JSON, not a class. */
function quarantined(over: Partial<OutboxRow> = {}): OutboxRow {
  return {
    client_op_id: '11111111-0000-4000-8000-000000000001',
    entity: 'activity',
    op: 'CREATE',
    entity_id: '22222222-0000-4000-8000-000000000001',
    household_id: HOUSEHOLD,
    payload: JSON.stringify({ type: 'diaper', client_edited_at: '2026-09-13T22:00:00.000Z' }),
    depends_on: null,
    seq: 41,
    created_at: '2026-09-13T22:00:00.000Z',
    state: 'SENDING',
    attempts: 3,
    next_attempt_at: '2026-09-13T22:05:00.000Z',
    sending_at: '2026-09-13T22:04:00.000Z',
    last_error: 'the request did not complete',
    ...over,
  };
}

let fixture: Fixture | null = null;
afterEach(() => {
  fixture?.restoreIds();
  fixture = null;
});

async function freshDb(): Promise<Db> {
  fixture = await seedHousehold({ idPrefix: 'ffffffff' });
  return fixture.db;
}

describe('replaying a quarantine (docs/ACCOUNTS.md §6.3, WP4 D32)', () => {
  it('keeps the client_op_id, so the server answers duplicate instead of writing a second row', async () => {
    const db = await freshDb();
    const outcome = await replayQuarantined(db, [quarantined()]);
    expect(outcome).toEqual({ replayed: 1, skipped: 0 });
    const rows = await outboxPending(db);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.client_op_id).toBe('11111111-0000-4000-8000-000000000001');
  });

  it('keeps entity_id, household_id, payload, depends_on and created_at exactly', async () => {
    const db = await freshDb();
    const original = quarantined({
      client_op_id: '11111111-0000-4000-8000-000000000002',
      depends_on: '11111111-0000-4000-8000-000000000001',
      entity: 'milk_txn',
    });
    await replayQuarantined(db, [quarantined(), original]);
    const rows = await outboxPending(db);
    const back = rows.find(r => r.client_op_id === original.client_op_id);
    expect(back).toBeDefined();
    expect(back?.entity_id).toBe(original.entity_id);
    expect(back?.household_id).toBe(original.household_id);
    expect(back?.payload).toBe(original.payload);
    expect(back?.depends_on).toBe(original.depends_on);
    // the entry's own age, so "queued since" is still true after signing back in
    expect(back?.created_at).toBe(original.created_at);
  });

  it('resets the row to PENDING with no attempts and nothing left over from the old session', async () => {
    const db = await freshDb();
    await replayQuarantined(db, [quarantined()]);
    const row = (await outboxPending(db))[0];
    expect(row?.state).toBe('PENDING');
    expect(row?.attempts).toBe(0);
    expect(row?.next_attempt_at).toBeNull();
    expect(row?.sending_at).toBeNull();
    expect(row?.last_error).toBeNull();
  });

  it('MINTS FRESH SEQ VALUES, IN THE OLD ORDER, BELOW ANYTHING WRITTEN AFTER THE SIGN-IN', async () => {
    const db = await freshDb();
    const clock = fixture!.clock;
    await replayQuarantined(db, [
      quarantined({ client_op_id: '11111111-0000-4000-8000-00000000000b', seq: 99 }),
      quarantined({ client_op_id: '11111111-0000-4000-8000-00000000000a', seq: 12 }),
    ]);
    const replayed = await outboxPending(db);
    const bySeq = [...replayed].sort((a, b) => a.seq - b.seq);
    // the old numbers are gone; the old ORDER is not
    expect(bySeq.map(r => r.seq)).toEqual([1, 2]);
    expect(bySeq.map(r => r.client_op_id)).toEqual([
      '11111111-0000-4000-8000-00000000000a',
      '11111111-0000-4000-8000-00000000000b',
    ]);

    // and the first thing the parent logs after signing back in sorts AFTER both of them
    await logActivity(db, clock, {
      householdId: HOUSEHOLD,
      createdBy: USER,
      deviceId: null,
      source: 'quicklog',
      childId: CHILD_A,
      type: 'diaper',
      startAt: clock.iso(),
      detail: { kind: 'WET' },
    });
    const all = await outboxPending(db);
    const fresh = all.filter(r => !r.client_op_id.startsWith('11111111'));
    expect(fresh.length).toBeGreaterThan(0);
    for (const row of fresh) {
      expect(row.seq).toBeGreaterThan(2);
    }
    expect(await currentSeq(db)).toBeGreaterThanOrEqual(3);
  });

  it('one server record each: replaying the same file twice queues nothing new', async () => {
    const db = await freshDb();
    const ops = [quarantined()];
    expect(await replayQuarantined(db, ops)).toEqual({ replayed: 1, skipped: 0 });
    expect(await replayQuarantined(db, ops)).toEqual({ replayed: 0, skipped: 1 });
    expect(await outboxPending(db)).toHaveLength(1);
  });

  it('a corrupt blob is counted and skipped, and the rows beside it still come back', async () => {
    const db = await freshDb();
    const outcome = await replayQuarantined(db, [
      quarantined({ client_op_id: '11111111-0000-4000-8000-00000000000c' }),
      { client_op_id: 'not-a-uuid', entity: 'activity' },
      null,
      'a string from an older build',
      quarantined({ client_op_id: '11111111-0000-4000-8000-00000000000d' }),
    ]);
    expect(outcome).toEqual({ replayed: 2, skipped: 3 });
    expect(await outboxPending(db)).toHaveLength(2);
  });

  it('never throws on a file this build cannot read at all, because a sign-in waits on it', async () => {
    const db = await freshDb();
    await expect(replayQuarantined(db, [42, undefined, {}])).resolves.toEqual({
      replayed: 0,
      skipped: 3,
    });
    expect(await outboxPending(db)).toEqual([]);
  });

  it('an empty quarantine is a no-op that touches neither the queue nor the counter', async () => {
    const db = await freshDb();
    expect(await replayQuarantined(db, [])).toEqual({ replayed: 0, skipped: 0 });
    expect(await currentSeq(db)).toBe(0);
  });
});
