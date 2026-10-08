/**
 * The dev build's "server" survives a kill, and a household starts with its four locations —
 * the two things the owner's first device pass of the stash found missing: a fresh, empty fake
 * on every launch, and a Save that sat disabled because nothing had ever seeded a place to put
 * milk (docs/ACCOUNTS.md §5 step 9; docs/reports/WP6.md §2.9).
 */
import { DEFAULT_STORAGE_LOCATIONS, seededLocationId } from '@nibblecue/core';
import { describe, expect, it } from 'vitest';
import { memoryStore, type KeyValueStore } from '../../prefs';
import { MockSyncServer } from './mock';

const H = 'aaaaaaaa-0000-0000-0000-00000000000a';

describe('the mock server persists itself', () => {
  it('a second server on the same store resumes with every table intact', async () => {
    const store = memoryStore();
    const a = new MockSyncServer({ store, storeKey: 'k', now: () => 1_700_000_000_000 });
    a.insertAsOtherDevice('activities', { id: 'act-1', household_id: H, type: 'bottle' });
    a.insertAsOtherDevice('bottle_details', { activity_id: 'act-1', consumed_ml: 118 });
    a.seedDefaultLocations(H);
    await a.save();

    const b = new MockSyncServer({ store, storeKey: 'k' });
    expect(b.rowCount('activities')).toBe(0);
    await b.load();
    expect(b.rowCount('activities')).toBe(1);
    expect(b.rowCount('bottle_details', { activity_id: 'act-1' })).toBe(1);
    expect(b.rowCount('storage_locations', { household_id: H })).toBe(4);
    expect(b.rowsOf('activities')[0]).toEqual(a.rowsOf('activities')[0]);
  });

  it('keeps each reader’s answer to a card, so a reload does not serve it as unanswered', async () => {
    const store = memoryStore();
    const reader = 'bbbbbbbb-0000-4000-8000-00000000000d';
    const a = new MockSyncServer({ store, storeKey: 'k', now: () => 1_700_000_000_000 });
    a.addMember({ household_id: H, user_id: reader, role: 'OWNER' });
    const card = 'dddddddd-0000-4000-8000-00000000ca5d';
    a.insertAsOtherDevice('app_messages', {
      id: card,
      published_at: '2023-11-01T00:00:00.000Z',
      starts_at: '2023-11-01T00:00:00.000Z',
      ends_at: null,
    });
    await a.push(reader, [
      {
        client_op_id: 'eeeeeeee-0000-4000-8000-00000000ca5d',
        entity: 'message_dismissal',
        op: 'CREATE',
        entity_id: card,
        household_id: H,
        payload: { action: 'DISMISSED', client_edited_at: '2023-11-14T22:00:00.000Z' },
      },
    ]);
    expect(a.rowCount('app_message_dismissals')).toBe(1);

    const b = new MockSyncServer({ store, storeKey: 'k' });
    await b.load();
    expect(b.rowsOf('app_message_dismissals')).toEqual(a.rowsOf('app_message_dismissals'));
  });

  it('keys keep two households apart, and an unreadable snapshot is an empty server', async () => {
    const store = memoryStore({ bad: '{not json' });
    const a = new MockSyncServer({ store, storeKey: 'a' });
    a.seedDefaultLocations(H);
    await a.save();
    const other = new MockSyncServer({ store, storeKey: 'other' });
    await other.load();
    expect(other.rowCount('storage_locations')).toBe(0);
    const bad = new MockSyncServer({ store, storeKey: 'bad' });
    await expect(bad.load()).resolves.toBeUndefined();
    expect(bad.rowCount('storage_locations')).toBe(0);
  });

  it('without a store, load and save are no-ops', async () => {
    const s = new MockSyncServer();
    s.seedDefaultLocations(H);
    await expect(s.load()).resolves.toBeUndefined();
    await expect(s.save()).resolves.toBeUndefined();
    expect(s.rowCount('storage_locations')).toBe(4);
  });
});

describe('the fake answers a push only once it has kept it (the sync sweep’s M2)', () => {
  const USER_ID = 'bbbbbbbb-0000-4000-8000-000000000001';
  const OP = 'cccccccc-0000-4000-8000-000000000001';

  it('writes the snapshot before the answer goes back, as a real server commits first', async () => {
    const inner = memoryStore();
    let written = false;
    // a slow disk: the answer must wait for it
    const store: KeyValueStore = {
      keys: () => inner.keys(),
      get: k => inner.get(k),
      remove: k => inner.remove(k),
      set: async (k, v) => {
        await new Promise(r => setTimeout(r, 5));
        await inner.set(k, v);
        written = true;
      },
    };
    const server = new MockSyncServer({ store, storeKey: 'k' });
    server.addMember({ household_id: H, user_id: USER_ID, role: 'OWNER' });
    await server.push(USER_ID, [
      {
        client_op_id: OP,
        entity: 'location',
        op: 'CREATE',
        entity_id: 'dddddddd-0000-4000-8000-000000000001',
        household_id: H,
        payload: { name: 'Fridge', kind: 'FRIDGE', client_edited_at: '2026-09-24T08:00:00.000Z' },
      },
    ]);
    // the answer came back only after the disk had the snapshot — whatever the op's outcome,
    // what the fake holds at that moment is on the disk
    expect(written).toBe(true);
    const again = new MockSyncServer({ store: inner, storeKey: 'k' });
    await again.load();
    expect(again.rowCount('household_members', { user_id: USER_ID })).toBe(1);
  });

  it('a write that failed never stops the next one', async () => {
    const inner = memoryStore();
    let fail = false;
    const store: KeyValueStore = {
      keys: () => inner.keys(),
      get: k => inner.get(k),
      remove: k => inner.remove(k),
      set: async (k, v) => {
        if (fail) {
          fail = false;
          throw new Error('disk full');
        }
        await inner.set(k, v);
      },
    };
    const server = new MockSyncServer({ store, storeKey: 'k' });
    fail = true;
    await expect(server.save()).rejects.toThrow('disk full');
    // the next write still happens, and carries everything
    server.seedDefaultLocations(H);
    await server.save();
    const again = new MockSyncServer({ store: inner, storeKey: 'k' });
    await again.load();
    expect(again.rowCount('storage_locations', { household_id: H })).toBe(4);
  });

  it('a snapshot the phone cannot read back is an empty server, not a sync that never starts', async () => {
    const inner = memoryStore();
    const store: KeyValueStore = {
      keys: () => inner.keys(),
      get: () => Promise.reject(new Error('Row too big to fit into CursorWindow')),
      set: (k, v) => inner.set(k, v),
      remove: k => inner.remove(k),
    };
    const server = new MockSyncServer({ store, storeKey: 'k' });
    await expect(server.load()).resolves.toBeUndefined();
    expect(server.rowCount('storage_locations')).toBe(0);
  });
});

describe('a household starts with the four default locations (ACCOUNTS §5 step 9)', () => {
  it('seeds bootstrap_household’s rows once, with stable ids, and never twice', () => {
    const s = new MockSyncServer();
    s.seedDefaultLocations(H);
    s.seedDefaultLocations(H);
    const rows = s.rowsOf('storage_locations').filter(r => r['household_id'] === H);
    // the owner's four (2026-09-17), the list every writer uses since 2026-09-24
    expect(rows.map(r => r['kind'])).toEqual(['FRIDGE', 'FREEZER', 'DEEP_FREEZER', 'ROOM']);
    expect(rows.map(r => r['id'])).toEqual(
      DEFAULT_STORAGE_LOCATIONS.map(l => seededLocationId(H, l.kind)),
    );
    expect(rows.filter(r => r['is_default'] === true).map(r => r['name'])).toEqual([
      'Refrigerator',
    ]);
    expect(rows.every(r => r['deleted_at'] === null)).toBe(true);
  });

  it('leaves a household that already has a location alone, even a retired one', () => {
    const s = new MockSyncServer();
    s.insertAsOtherDevice('storage_locations', {
      id: 'loc-1',
      household_id: H,
      name: 'Old fridge',
      kind: 'FRIDGE',
      deleted_at: '2026-01-01T00:00:00.000Z',
    });
    s.seedDefaultLocations(H);
    expect(s.rowCount('storage_locations', { household_id: H })).toBe(1);
  });
});
