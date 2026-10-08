/**
 * The two local prunes (D30), and the guards that are the reason they are allowed to exist.
 *
 * The first two tests are the guards, written before the prune was: a prune with the wrong
 * predicate is the one code path in this app that deletes a parent's entry outright, and a test
 * that only checks the happy path would pass against exactly that bug.
 */
import { SYNCED_PRUNE_DAYS, TOMBSTONE_PRUNE_DAYS } from '@nibblecue/core';
import { afterEach, describe, expect, it } from 'vitest';
import type { Db } from '../db/driver';
import { CHILD_A, HOUSEHOLD, USER, seedHousehold } from '../testing/fixtures';
import { writeCursor } from './cursors';
import { prune } from './prune';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-09-14T08:00:00.000Z');
const ago = (days: number): string => new Date(NOW - days * DAY).toISOString();

let restore: (() => void) | null = null;

afterEach(() => {
  restore?.();
  restore = null;
});

async function open(): Promise<Db> {
  const fixture = await seedHousehold();
  restore = fixture.restoreIds;
  return fixture.db;
}

/** Say that `activities` has been pulled to completion once, which is guard 1. */
async function markPulled(db: Db, table = 'activities'): Promise<void> {
  await db.tx(t => writeCursor(t, HOUSEHOLD, table, { lastFullSyncAt: ago(1) }));
}

async function addTombstone(db: Db, id: string, deletedAt: string): Promise<void> {
  await db.run(
    `insert into activities (id, client_op_id, household_id, child_id, type, start_at,
      is_private, metadata, created_by, created_at, updated_at, deleted_at, local_synced)
      values (?, ?, ?, ?, 'diaper', ?, 0, '{}', ?, ?, ?, ?, 1)`,
    [id, `op-${id}`, HOUSEHOLD, CHILD_A, ago(200), USER, ago(200), deletedAt, deletedAt],
  );
  await db.run(`insert into diaper_details (activity_id, kind, rash) values (?, 'WET', 0)`, [id]);
}

async function addOutboxRow(
  db: Db,
  clientOpId: string,
  state: string,
  createdAt: string,
  entityId = clientOpId,
): Promise<void> {
  await db.run(
    `insert into outbox (client_op_id, entity, op, entity_id, household_id, payload, seq,
      created_at, state) values (?, 'activity', 'CREATE', ?, ?, '{}', 1, ?, ?)`,
    [clientOpId, entityId, HOUSEHOLD, createdAt, state],
  );
}

describe('the guards', () => {
  it('never prunes a row any outbox row still names, however old the tombstone is', async () => {
    const db = await open();
    await markPulled(db);
    const id = 'aaaa0001-0000-4000-8000-000000000001';
    await addTombstone(db, id, ago(TOMBSTONE_PRUNE_DAYS + 30));
    // The delete has been written locally and is still owed to the server. Pruning the row now
    // would leave an op pointing at nothing, and an undo with nothing to restore.
    await addOutboxRow(db, 'bbbb0001-0000-4000-8000-000000000001', 'PENDING', ago(1), id);

    const outcome = await prune(db, HOUSEHOLD, NOW);
    expect(outcome.tombstones['activities']).toBe(0);
    expect(await db.all('select id from activities where id = ?', [id])).toHaveLength(1);
    expect(await db.all('select activity_id from diaper_details')).toHaveLength(1);
  });

  it('waits for a completed pull of the table before pruning any of its tombstones', async () => {
    const db = await open();
    const id = 'aaaa0002-0000-4000-8000-000000000002';
    await addTombstone(db, id, ago(TOMBSTONE_PRUNE_DAYS + 30));
    // No `sync_state` row: this device has never finished pulling `activities`, so "older than
    // ninety days" would be measured against a mirror that is still filling up.
    const outcome = await prune(db, HOUSEHOLD, NOW);
    expect(outcome.waitingOnPull).toContain('activities');
    expect(outcome.tombstones['activities']).toBeUndefined();
    expect(await db.all('select id from activities')).toHaveLength(1);

    await markPulled(db);
    const second = await prune(db, HOUSEHOLD, NOW);
    expect(second.waitingOnPull).not.toContain('activities');
    expect(second.tombstones['activities']).toBe(1);
  });

  it('keeps FAILED, PENDING and SENDING outbox rows at any age', async () => {
    const db = await open();
    const old = ago(SYNCED_PRUNE_DAYS + 90);
    await addOutboxRow(db, 'cccc0001-0000-4000-8000-000000000001', 'FAILED', old);
    await addOutboxRow(db, 'cccc0002-0000-4000-8000-000000000002', 'PENDING', old);
    await addOutboxRow(db, 'cccc0003-0000-4000-8000-000000000003', 'SENDING', old);
    await addOutboxRow(db, 'cccc0004-0000-4000-8000-000000000004', 'SYNCED', old);

    const outcome = await prune(db, HOUSEHOLD, NOW);
    expect(outcome.outbox).toBe(1);
    const left = await db.all<{ state: string }>('select state from outbox order by state');
    // A FAILED op is a log the server refused; WP4.9's replay is how it gets sent, and a prune
    // that swept it would be the one path in this app that loses an entry.
    expect(left.map(r => r.state)).toEqual(['FAILED', 'PENDING', 'SENDING']);
  });
});

describe('what the prune does when both guards are satisfied', () => {
  it('removes old SYNCED rows and old tombstones with their detail rows, and nothing newer', async () => {
    const db = await open();
    await markPulled(db);
    const old = 'aaaa0003-0000-4000-8000-000000000003';
    const recent = 'aaaa0004-0000-4000-8000-000000000004';
    await addTombstone(db, old, ago(TOMBSTONE_PRUNE_DAYS + 1));
    await addTombstone(db, recent, ago(TOMBSTONE_PRUNE_DAYS - 1));
    await addOutboxRow(
      db,
      'dddd0001-0000-4000-8000-000000000001',
      'SYNCED',
      ago(SYNCED_PRUNE_DAYS + 1),
    );
    await addOutboxRow(db, 'dddd0002-0000-4000-8000-000000000002', 'SYNCED', ago(1));

    const outcome = await prune(db, HOUSEHOLD, NOW);
    expect(outcome.outbox).toBe(1);
    expect(outcome.tombstones['activities']).toBe(1);
    expect(outcome.details).toBe(1);

    const rows = await db.all<{ id: string }>('select id from activities order by id');
    expect(rows.map(r => r.id)).toEqual([recent]);
    const details = await db.all<{ activity_id: string }>('select activity_id from diaper_details');
    expect(details.map(r => r.activity_id)).toEqual([recent]);
    expect(await db.all('select client_op_id from outbox')).toHaveLength(1);
  });

  it('leaves another household tombstones alone', async () => {
    const db = await open();
    await markPulled(db);
    const other = 'aaaa0005-0000-4000-8000-000000000005';
    await db.run(
      `insert into activities (id, client_op_id, household_id, child_id, type, start_at,
        is_private, metadata, created_by, created_at, updated_at, deleted_at, local_synced)
        values (?, ?, ?, null, 'diaper', ?, 0, '{}', ?, ?, ?, ?, 1)`,
      [
        other,
        `op-${other}`,
        'aaaaaaaa-0000-4000-8000-000000000002',
        ago(200),
        USER,
        ago(200),
        ago(TOMBSTONE_PRUNE_DAYS + 1),
        ago(TOMBSTONE_PRUNE_DAYS + 1),
      ],
    );
    const outcome = await prune(db, HOUSEHOLD, NOW);
    expect(outcome.tombstones['activities']).toBe(0);
    expect(await db.all('select id from activities')).toHaveLength(1);
  });

  it('is a no-op on a fresh install, and says so without writing anything', async () => {
    const db = await open();
    const outcome = await prune(db, HOUSEHOLD, NOW);
    expect(outcome.outbox).toBe(0);
    expect(outcome.details).toBe(0);
    expect(outcome.dedupeKeys).toBe(0);
    expect(outcome.waitingOnPull).toEqual(['activities', 'schedule_rules', 'schedule_phases']);
  });
});
