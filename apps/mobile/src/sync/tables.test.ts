/**
 * The pull table, checked against the two maps it has to agree with: `PULL_STRATEGY` in the
 * local schema (which `packages/db/src/integration/sync-pull.test.ts` pins against
 * `app.sync_pull_strategy`) and `PAGE_SIZES` in `packages/core`.
 *
 * The point of these assertions is that a table added to the mirror without a phase, or given a
 * strategy the server does not serve it with, fails here rather than as an empty page the
 * client commits a cursor over.
 */
import { PAGE_SIZES } from '@nibblecue/core';
import { describe, expect, it } from 'vitest';
import { LOCAL_PRIMARY_KEY } from '../data/repository';
import { MIRRORED_TABLES, PULL_STRATEGY } from '../db/schema';
import { APPLY_ORDER } from './apply';
import { PULL_PHASES, PULL_TABLES, pullTable, tablesOfPhase } from './tables';

const names = PULL_TABLES.map(t => t.name);
const indexOf = (name: string) => names.indexOf(name as (typeof names)[number]);

describe('PULL_TABLES (docs/OFFLINE_SYNC.md §4, D17)', () => {
  /*
    NIBBLECUE PULLS WHAT IT READS (`tables.ts`, 2026-10-08), not every table the mirror holds:
    CuddleCue's guard "covers every mirrored table" becomes "each pulled table is a mirrored
    one, once, with the schema map strategy, and the set is the pinned one", so a table added
    or dropped is a failing test and a decision.
  */
  it('pulls each table at most once, every one a mirrored table, with the schema map strategy', () => {
    expect(new Set(names).size).toBe(names.length);
    for (const entry of PULL_TABLES) {
      expect(Object.keys(PULL_STRATEGY), entry.name).toContain(entry.name);
      expect(entry.strategy, entry.name).toBe(PULL_STRATEGY[entry.name]);
    }
  });

  it('pages at PAGE_SIZES where core names one, and 500 otherwise', () => {
    for (const entry of PULL_TABLES) {
      const expected =
        entry.name in PAGE_SIZES ? PAGE_SIZES[entry.name as keyof typeof PAGE_SIZES] : 500;
      expect(entry.page, entry.name).toBe(expected);
      // The server takes `limit` as a positive integer even for the strategies that ignore it.
      expect(entry.page).toBeGreaterThan(0);
    }
  });

  it('puts everything Today needs in bootstrap and the log in recent, with no history phase', () => {
    expect(tablesOfPhase('bootstrap').map(t => t.name)).toEqual([
      'profiles',
      'households',
      'household_members',
      'children',
      'module_settings',
      // the household's milk unit (0128), which the milk view reads its amounts in
      'household_settings',
      // who's on: a family switch asks about it before it leaves
      'household_duty',
      // NibbleCue's own records (0161): the food profile, custom foods, noticed, the plan's pins
      'nibble_records',
      // the shared shopping list, and the catalog its lines point at (0017)
      'shopping_items',
      'supply_items',
    ]);
    expect(tablesOfPhase('recent').map(t => t.name)).toEqual(['activities']);
    expect(tablesOfPhase('backfill').map(t => t.name)).toEqual([]);
    expect(PULL_PHASES).toEqual(['bootstrap', 'recent', 'backfill']);
  });

  it('scopes every pulled table to the household: NibbleCue pulls no per-viewer or global table (D18)', () => {
    const byScope = (scope: string) =>
      PULL_TABLES.filter(t => t.scope === scope)
        .map(t => t.name)
        .sort();
    expect(byScope('user')).toEqual([]);
    expect(byScope('global')).toEqual([]);
    expect(byScope('household')).toEqual([...names].sort());
  });

  it('orders parents before the rows that point at them', () => {
    expect(indexOf('households')).toBeLessThan(indexOf('household_members'));
    expect(indexOf('children')).toBeLessThan(indexOf('activities'));
    expect(indexOf('children')).toBeLessThan(indexOf('nibble_records'));
    expect(indexOf('supply_items')).toBeGreaterThan(-1);
    expect(indexOf('shopping_items')).toBeGreaterThan(-1);
  });

  it('has an apply order that knows every table it will be handed', () => {
    for (const name of names) expect(APPLY_ORDER, name).toContain(name);
  });

  it('answers by name, and answers nothing for a table this build does not pull', () => {
    expect(pullTable('activities')?.strategy).toBe('delta');
    expect(pullTable('community_threads')).toBeUndefined();
  });

  it('can apply a page of every mirrored table: each has a local primary key', () => {
    // `apply.ts` and `upsertRow` throw on a table absent from LOCAL_PRIMARY_KEY, and they throw
    // inside the transaction. The two list tables shipped without an entry (WP6b, WP6c), so a
    // list write and the first pulled list page both failed. This is the check that was missing.
    for (const table of MIRRORED_TABLES) {
      expect(LOCAL_PRIMARY_KEY[table], table).toBeDefined();
    }
  });
});
