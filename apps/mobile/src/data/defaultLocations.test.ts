/**
 * ONE FRIDGE, NOT TWO (the sync sweep of 2026-09-24, F1).
 *
 * The server writes a household's default storage places when the household is made, and setup
 * writes them too, so the stash works before the first pull. The two used to be different lists
 * with different ids, so a household whose setup finished before its first pull had eight
 * locations, two of them the default. Now every writer writes core's list with core's ids
 * (`DEFAULT_STORAGE_LOCATIONS`, `seededLocationId`), and the phone's copy is the server's copy.
 */
import { DEFAULT_STORAGE_LOCATIONS, seededLocationId } from '@nibblecue/core';
import { afterEach, describe, expect, it } from 'vitest';
import { MockSyncApi, MockSyncServer } from '../sync/providers/mock';
import { OutboxWorker } from '../sync/worker';
import { HOUSEHOLD, USER, seedHousehold } from '../testing/fixtures';
import { DEFAULT_LOCATIONS, ensureDefaultLocations } from './locations';

const restores: (() => void)[] = [];
afterEach(() => {
  while (restores.length > 0) restores.pop()?.();
});

const ctx = {
  householdId: HOUSEHOLD,
  createdBy: USER,
  deviceId: 'device-1',
  source: 'sheet' as const,
};

describe('the default storage places', () => {
  it('are the same list on the phone as on the servers', () => {
    expect(DEFAULT_LOCATIONS.map(l => [l.kind, l.name, l.short, l.isDefault])).toEqual(
      DEFAULT_STORAGE_LOCATIONS.map(l => [l.kind, l.name, l.short_name, l.is_default]),
    );
  });

  it('written by setup before the first pull, are the server’s own rows — four, one default', async () => {
    const f = await seedHousehold();
    restores.push(f.restoreIds);
    // a fresh household on the phone: nothing pulled yet
    await f.db.run('delete from storage_locations where household_id = ?', [HOUSEHOLD]);
    let tick = 0;
    const server = new MockSyncServer({ now: () => f.clock.now() + ++tick });
    server.addMember({ household_id: HOUSEHOLD, user_id: USER, role: 'OWNER' });
    // the household's own four, as bootstrap_household writes them
    server.seedDefaultLocations(HOUSEHOLD);

    expect(await ensureDefaultLocations(f.db, f.clock, ctx)).toBe(4);
    const local = await f.db.all<{ id: string }>(
      'select id from storage_locations where household_id = ? order by sort_order',
      [HOUSEHOLD],
    );
    expect(local.map(r => r.id)).toEqual(
      DEFAULT_STORAGE_LOCATIONS.map(l => seededLocationId(HOUSEHOLD, l.kind)),
    );

    const worker = new OutboxWorker(
      f.db,
      new MockSyncApi(server, USER),
      { isConnected: () => Promise.resolve(true), onReconnect: () => () => undefined },
      f.clock,
      { analytics: () => undefined as never, onState: () => undefined, rng: () => 0.5 },
    );
    worker.start();
    await worker.flush('manual');
    const unsent = await f.db.all('select 1 from outbox where state != ?', ['SYNCED']);
    expect(unsent).toEqual([]);
    // the server still has four places, one of them the default
    expect(server.rowCount('storage_locations', { household_id: HOUSEHOLD })).toBe(4);
    expect(
      server.rowCount('storage_locations', { household_id: HOUSEHOLD, is_default: true }),
    ).toBe(1);
  });
});
