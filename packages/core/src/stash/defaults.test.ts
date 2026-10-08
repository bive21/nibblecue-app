import { describe, expect, it } from 'vitest';
import { isUuid } from '../sync/ids';
import { DEFAULT_STORAGE_LOCATIONS, seededLocationId } from './defaults';

describe('the seeded storage locations (ACCOUNTS §5 step 9)', () => {
  it('are the owner’s four, the refrigerator the default (2026-09-17)', () => {
    expect(DEFAULT_STORAGE_LOCATIONS.map(l => [l.kind, l.name])).toEqual([
      ['FRIDGE', 'Refrigerator'],
      ['FREEZER', 'Kitchen freezer'],
      ['DEEP_FREEZER', 'Deep freeze'],
      ['ROOM', 'Counter'],
    ]);
    expect(DEFAULT_STORAGE_LOCATIONS.filter(l => l.is_default).map(l => l.name)).toEqual([
      'Refrigerator',
    ]);
    expect(DEFAULT_STORAGE_LOCATIONS.map(l => l.sort_order)).toEqual([0, 1, 2, 3]);
    // a thawing place is made on demand, and one kind is never seeded twice
    expect(DEFAULT_STORAGE_LOCATIONS.some(l => l.kind === 'THAWED')).toBe(false);
    expect(new Set(DEFAULT_STORAGE_LOCATIONS.map(l => l.kind)).size).toBe(4);
  });
  it('derive stable ids from the household, one per kind', () => {
    const h = 'aaaaaaaa-0000-0000-0000-00000000000a';
    const ids = DEFAULT_STORAGE_LOCATIONS.map(l => seededLocationId(h, l.kind));
    expect(ids.every(isUuid)).toBe(true);
    expect(new Set(ids).size).toBe(4);
    expect(seededLocationId(h, 'FRIDGE')).toBe(seededLocationId(h.toUpperCase(), 'FRIDGE'));
    expect(seededLocationId(h, 'FRIDGE')).not.toBe(
      seededLocationId('bbbbbbbb-0000-0000-0000-00000000000b', 'FRIDGE'),
    );
  });
});
