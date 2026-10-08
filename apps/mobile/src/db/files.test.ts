import { describe, expect, it } from 'vitest';
import { dbFileFor, householdDbName, isLocalDbName } from './files';
import { LOCAL_DB_NAME } from './schema';

describe('a file per family', () => {
  it('lets the first family keep the original file, unrenamed', () => {
    expect(dbFileFor('home', null)).toEqual({ name: LOCAL_DB_NAME, adopts: true });
    expect(dbFileFor('home', 'home')).toEqual({ name: LOCAL_DB_NAME, adopts: false });
  });

  it('gives every other family a file of its own', () => {
    expect(dbFileFor('sit', 'home')).toEqual({ name: householdDbName('sit'), adopts: false });
    expect(householdDbName('sit')).not.toBe(LOCAL_DB_NAME);
  });

  it('opens the original file before any family is known, adopting nothing', () => {
    expect(dbFileFor(null, null)).toEqual({ name: LOCAL_DB_NAME, adopts: false });
    expect(dbFileFor(null, 'home')).toEqual({ name: LOCAL_DB_NAME, adopts: false });
  });

  it('knows its own files and nothing else', () => {
    expect(isLocalDbName(LOCAL_DB_NAME)).toBe(true);
    expect(isLocalDbName(householdDbName('3f1c2a9e-0000-4000-8000-000000000001'))).toBe(true);
    expect(isLocalDbName('other.db')).toBe(false);
    expect(isLocalDbName('cuddlecue-x.db-wal')).toBe(false);
  });
});
