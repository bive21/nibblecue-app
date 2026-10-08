/**
 * THE COUNT UNDER THE RECAP (`plusUsage.ts`, 2026-09-28): distinct local days per Plus surface,
 * written once a day, on this phone only. The sentence it becomes is `promptCopy.test.ts`'s.
 */
import { describe, expect, it } from 'vitest';
import { memoryStore, type KeyValueStore } from '../prefs';
import {
  notePlusUse,
  parsePlusUsage,
  PLUS_USES,
  plusUsageCounts,
  plusUsageKey,
  readPlusUsage,
  recordPlusUse,
  serializePlusUsage,
  USAGE_DAYS_KEPT,
  usageDay,
  USE_UNIT,
  type PlusUsage,
} from './plusUsage';

/** A local time on the phone's own calendar, whatever zone the suite runs in. */
const at = (day: number, hour: number, minute = 0): number =>
  new Date(2026, 8, day, hour, minute).getTime();

/** A store that counts its writes, so "once a day" is a number a test can read. */
function countingStore(): KeyValueStore & { writes: number } {
  const inner = memoryStore();
  const store = {
    writes: 0,
    keys: () => inner.keys(),
    get: (k: string) => inner.get(k),
    set: async (k: string, v: string) => {
      store.writes += 1;
      await inner.set(k, v);
    },
    remove: (k: string) => inner.remove(k),
  };
  return store;
}

/** Every test its own record: the process remembers what it has written, as a launch does. */
let n = 0;
const freshKey = (): string => plusUsageKey(`user-${(n += 1)}`, 'household-1');

describe('the day a use is counted on', () => {
  it('is the phone’s own calendar day for every surface but Night', () => {
    expect(usageDay('napOutlook', at(20, 0, 5))).toBe('2026-09-20');
    expect(usageDay('reports', at(20, 23, 59))).toBe('2026-09-20');
    for (const use of PLUS_USES.filter(u => USE_UNIT[u] === 'day'))
      expect(usageDay(use, at(20, 9)), use).toBe('2026-09-20');
  });

  it('counts a night noon to noon, so the 9 p.m. feed and the 2 a.m. one are one night', () => {
    expect(USE_UNIT.night).toBe('night');
    expect(usageDay('night', at(19, 21))).toBe('2026-09-19');
    expect(usageDay('night', at(20, 2))).toBe('2026-09-19');
    expect(usageDay('night', at(20, 11, 59))).toBe('2026-09-19');
    expect(usageDay('night', at(20, 12))).toBe('2026-09-20');
  });
});

describe('the record', () => {
  it('adds a day once, and hands back the same record when it is already there', () => {
    const one = recordPlusUse({}, 'reports', '2026-09-20');
    expect(one).toEqual({ reports: ['2026-09-20'] });
    expect(recordPlusUse(one, 'reports', '2026-09-20')).toBe(one);
    const two = recordPlusUse(one, 'reports', '2026-09-18');
    expect(two.reports).toEqual(['2026-09-18', '2026-09-20']);
    // the other surfaces are untouched
    expect(recordPlusUse(two, 'night', '2026-09-19')).toEqual({
      reports: ['2026-09-18', '2026-09-20'],
      night: ['2026-09-19'],
    });
  });

  it('keeps at most a month of days per surface, dropping the oldest', () => {
    let usage: PlusUsage = {};
    for (let d = 1; d <= USAGE_DAYS_KEPT + 5; d += 1)
      usage = recordPlusUse(usage, 'napOutlook', `2026-08-${String(d).padStart(2, '0')}`);
    expect(usage.napOutlook).toHaveLength(USAGE_DAYS_KEPT);
    expect(usage.napOutlook?.[0]).toBe('2026-08-06');
  });

  it('counts most used first, ties in a fixed order, and leaves unused surfaces out', () => {
    const usage: PlusUsage = {
      night: ['2026-09-19', '2026-09-20'],
      reports: ['2026-09-20'],
      napOutlook: ['2026-09-19', '2026-09-20'],
      glass: [],
    };
    expect(plusUsageCounts(usage)).toEqual([
      { use: 'napOutlook', count: 2 },
      { use: 'night', count: 2 },
      { use: 'reports', count: 1 },
    ]);
    expect(plusUsageCounts({})).toEqual([]);
  });

  it('round-trips through storage, and reads anything doubtful as not used', () => {
    const usage: PlusUsage = { reports: ['2026-09-18', '2026-09-20'], night: ['2026-09-19'] };
    expect(parsePlusUsage(serializePlusUsage(usage))).toEqual(usage);
    expect(parsePlusUsage(null)).toEqual({});
    expect(parsePlusUsage('not json')).toEqual({});
    expect(parsePlusUsage('[]')).toEqual({});
    // a newer version is not guessed at
    expect(parsePlusUsage(JSON.stringify({ v: 2, days: { reports: ['2026-09-20'] } }))).toEqual({});
    // a surface since renamed, a day that is not a day, a repeat: dropped, never trusted
    expect(
      parsePlusUsage(
        JSON.stringify({
          v: 1,
          days: {
            reports: ['2026-09-20', '2026-09-20', 'yesterday', 7, '2026-09-19'],
            weather: ['2026-09-20'],
            night: 'every night',
          },
        }),
      ),
    ).toEqual({ reports: ['2026-09-19', '2026-09-20'] });
  });

  it('is kept per person and per household, because a new household is a new preview', () => {
    expect(plusUsageKey('u1', 'h1')).toBe('plus_usage:u1:h1');
    expect(plusUsageKey('u1', 'h2')).not.toBe(plusUsageKey('u1', 'h1'));
  });
});

describe('writing it: once a day per surface, and never losing one', () => {
  it('writes a surface’s day once however often the surface is drawn', async () => {
    const store = countingStore();
    const key = freshKey();
    for (let i = 0; i < 40; i += 1) await notePlusUse(store, key, 'napOutlook', at(20, 8, i));
    expect(store.writes).toBe(1);
    await notePlusUse(store, key, 'napOutlook', at(21, 8));
    expect(store.writes).toBe(2);
    expect((await readPlusUsage(store, key)).napOutlook).toEqual(['2026-09-20', '2026-09-21']);
  });

  it('keeps both of two surfaces counted in the same frame', async () => {
    const store = memoryStore();
    const key = freshKey();
    await Promise.all([
      notePlusUse(store, key, 'reports', at(20, 9)),
      notePlusUse(store, key, 'napOutlook', at(20, 9)),
      notePlusUse(store, key, 'night', at(20, 2)),
    ]);
    expect(await readPlusUsage(store, key)).toEqual({
      reports: ['2026-09-20'],
      napOutlook: ['2026-09-20'],
      night: ['2026-09-19'],
    });
  });

  it('reads after a write still in flight, never before it', async () => {
    const store = memoryStore();
    const key = freshKey();
    void notePlusUse(store, key, 'stashOrder', at(22, 10));
    expect((await readPlusUsage(store, key)).stashOrder).toEqual(['2026-09-22']);
  });

  it('never throws, and tries the day again after a write that failed', async () => {
    const inner = memoryStore();
    let broken = true;
    const store: KeyValueStore = {
      ...inner,
      set: async (k, v) => {
        if (broken) throw new Error('disk full');
        await inner.set(k, v);
      },
    };
    const key = freshKey();
    await expect(notePlusUse(store, key, 'history', at(20, 9))).resolves.toBeUndefined();
    expect(await readPlusUsage(store, key)).toEqual({});
    broken = false;
    await notePlusUse(store, key, 'history', at(20, 10));
    expect((await readPlusUsage(store, key)).history).toEqual(['2026-09-20']);
  });

  it('keeps two households’ records apart on one phone', async () => {
    const store = memoryStore();
    const first = plusUsageKey('same-person', 'household-a');
    const second = plusUsageKey('same-person', 'household-b');
    await notePlusUse(store, first, 'reports', at(20, 9));
    expect(await readPlusUsage(store, second)).toEqual({});
  });
});
