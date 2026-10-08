import type { SetupSeed } from '@nibblecue/core';
import { describe, expect, it } from 'vitest';
import { memoryStore, survivesSignOut } from '../prefs';
import {
  clearPendingSetup,
  loadPendingSetup,
  pendingSetupKey,
  savePendingSetup,
  seedIsEmpty,
} from './pending-setup';

const UID = 'user-1';
const SEED: SetupSeed = {
  intervals: [{ activity: 'bottle', everyMinutes: 180 }],
  setTimes: [],
  bedtime: null,
  cadences: [{ activity: 'bath', everyDays: 2 }],
  timesADay: [{ activity: 'tummy', times: 2 }],
  goals: [],
  quietHours: { from: '22:00', to: '07:00' },
  dayWindow: null,
  volumeUnit: 'ml',
  supplies: [{ category: 'DIAPERS', brand: 'Pampers' }],
  medicines: [{ id: 'm1', name: 'Vitamin D', kind: 'VITAMIN', times: ['08:00'] }],
};

describe('what step 5 asked for, held until there is a household to write it into', () => {
  it('round-trips the whole seed', async () => {
    const store = memoryStore();
    await savePendingSetup(store, UID, SEED);
    expect(await loadPendingSetup(store, UID)).toEqual(SEED);
    await clearPendingSetup(store, UID);
    expect(await loadPendingSetup(store, UID)).toBeNull();
  });

  it('stores nothing at all when the parent chose nothing', async () => {
    const store = memoryStore();
    const empty: SetupSeed = {
      intervals: [],
      setTimes: [],
      bedtime: null,
      cadences: [],
      timesADay: [],
      goals: [],
      quietHours: null,
      dayWindow: null,
      volumeUnit: null,
      supplies: [],
      medicines: [],
    };
    expect(seedIsEmpty(empty)).toBe(true);
    await savePendingSetup(store, UID, empty);
    expect(await store.get(pendingSetupKey(UID))).toBeNull();
    // a milk unit on its own is something to write into the household
    expect(seedIsEmpty({ ...empty, volumeUnit: 'ml' })).toBe(false);
  });

  it('is one user’s, and a sign-out clears it', async () => {
    const store = memoryStore();
    await savePendingSetup(store, UID, SEED);
    expect(await loadPendingSetup(store, 'somebody-else')).toBeNull();
    expect(survivesSignOut(pendingSetupKey(UID))).toBe(false);
  });

  it('drops a module the registry no longer carries rather than failing the whole record', async () => {
    const store = memoryStore();
    await store.set(
      pendingSetupKey(UID),
      JSON.stringify({
        intervals: [
          { activity: 'bottle', everyMinutes: 180 },
          { activity: 'telepathy', everyMinutes: 60 },
        ],
        cadences: [],
        supplies: [
          { category: 'DIAPERS', brand: 'Pampers' },
          { category: 'JETPACKS', brand: 'Acme' },
        ],
        medicines: [],
      }),
    );
    // and a record written before counts existed loads as one with no counts in it, rather than
    // as a corrupt blob to be thrown away — the `timesADay` key is simply absent above
    expect(await loadPendingSetup(store, UID)).toEqual({
      intervals: [{ activity: 'bottle', everyMinutes: 180 }],
      setTimes: [],
      bedtime: null,
      cadences: [],
      timesADay: [],
      goals: [],
      quietHours: null,
      dayWindow: null,
      // a record from before the milk unit was asked: none, which every phone reads as ounces
      volumeUnit: null,
      // and a supply category this build does not know is dropped the same way, rather than
      // seeded onto `OTHER` — a wrong shelf is worse than a missing one
      supplies: [{ category: 'DIAPERS', brand: 'Pampers' }],
      medicines: [],
    });
  });

  /**
   * SOLIDS' MEALS (2026-09-28) ride the record beside their times, and the record keeps its
   * promise to every older and newer build: no meals is times unnamed, a meal this build does not
   * know loses only its name, and its time is still written.
   */
  it('carries solids’ meals, and loses no time to a meal it cannot read', async () => {
    const store = memoryStore();
    const meals: SetupSeed = {
      ...SEED,
      setTimes: [
        {
          activity: 'solids',
          times: ['07:30', '12:00'],
          meals: [
            { meal: 'BREAKFAST', at: '07:30' },
            { meal: 'LUNCH', at: '12:00' },
          ],
        },
      ],
    };
    await savePendingSetup(store, UID, meals);
    expect(await loadPendingSetup(store, UID)).toEqual(meals);
    await store.set(
      pendingSetupKey(UID),
      JSON.stringify({
        ...SEED,
        setTimes: [
          {
            activity: 'solids',
            times: ['07:30', '10:00'],
            meals: [
              { meal: 'BREAKFAST', at: '07:30' },
              { meal: 'ELEVENSES', at: '10:00' },
            ],
          },
        ],
      }),
    );
    expect((await loadPendingSetup(store, UID))?.setTimes).toEqual([
      {
        activity: 'solids',
        times: ['07:30', '10:00'],
        meals: [{ meal: 'BREAKFAST', at: '07:30' }],
      },
    ]);
  });

  it('returns null for a blob it cannot read, rather than throwing on the first frame', async () => {
    const store = memoryStore();
    await store.set(pendingSetupKey(UID), '{not json');
    expect(await loadPendingSetup(store, UID)).toBeNull();
    await store.set(pendingSetupKey(UID), JSON.stringify({ intervals: 'no' }));
    expect(await loadPendingSetup(store, UID)).toBeNull();
  });
});

// (CuddleCue's `SetupSeeder.tsx` and `drainSetup.ts`, which drain this record, are not in NibbleCue:
// its one-page setup keeps no rhythms to file. Their source checks went with them.)
