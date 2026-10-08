/**
 * Choosing a range and a child (CLAUDE.md §4; PRODUCT_SPEC.md §8).
 *
 * The three things that would break this quietly, each asserted rather than assumed: a detail row
 * left behind by the entry it belongs to, the OTHER twin's rows riding along in a one-child
 * export, and a range that holds nothing coming out as a file that claims to hold something.
 */
import { describe, expect, it } from 'vitest';
import { zonedToUtc } from '../today/day';
import { rangeOf } from './range';
import {
  EVENT_DATE_KEYS,
  EVENT_INSTANT_KEYS,
  momentInWindow,
  rowActivityId,
  rowChildId,
  rowMoment,
  scopeExport,
  type ExportScope,
} from './exportScope';

const TZ = 'America/Los_Angeles';
const at = (day: number, h = 9): number => zonedToUtc(TZ, 2026, 9, day, h);
const NOW = at(16, 12);
/** Sep 10 – Sep 16 inclusive, which is the week ending today. */
const WEEK = rangeOf('week', TZ, NOW);
const iso = (ms: number): string => new Date(ms).toISOString();

const scope = (over: Partial<ExportScope> = {}): ExportScope => ({
  window: { fromMs: WEEK.fromMs, toMs: WEEK.toMs },
  childId: null,
  timeZone: TZ,
  ...over,
});

const activity = (id: string, childId: string | null, day: number) => ({
  id,
  household_id: 'house',
  child_id: childId,
  type: 'bottle',
  start_at: iso(at(day)),
  end_at: null,
  created_at: iso(at(1)),
  deleted_at: null,
});

/** A mirror small enough to read and wide enough to carry every rule. */
const MIRROR = {
  activities: [
    activity('in-a', 'emma', 14),
    activity('in-b', 'noah', 15),
    // household-scoped: a pump session belongs to nobody in particular
    { ...activity('in-pump', null, 13), type: 'pump' },
    activity('old', 'emma', 2),
    activity('future', 'emma', 30),
  ],
  bottle_details: [
    { activity_id: 'in-a', consumed_ml: 120 },
    { activity_id: 'in-b', consumed_ml: 90 },
    { activity_id: 'old', consumed_ml: 60 },
  ],
  children: [
    { id: 'emma', household_id: 'house', name: 'Emma', birth_date: '2026-06-01' },
    { id: 'noah', household_id: 'house', name: 'Noah', birth_date: '2026-06-01' },
  ],
  care_items: [
    { id: 'cream', household_id: 'house', name: 'Barrier cream', created_at: iso(at(1)) },
  ],
  milk_inventory_transactions: [
    {
      id: 't1',
      household_id: 'house',
      activity_id: 'in-a',
      delta_ml: -120,
      occurred_at: iso(at(14)),
    },
    { id: 't2', household_id: 'house', activity_id: null, delta_ml: 150, occurred_at: iso(at(3)) },
  ],
  vaccine_records: [
    {
      id: 'v1',
      household_id: 'house',
      child_id: 'emma',
      status: 'GIVEN',
      occurred_on: '2026-09-15',
    },
    {
      id: 'v2',
      household_id: 'house',
      child_id: 'emma',
      status: 'GIVEN',
      occurred_on: '2026-08-15',
    },
    { id: 'v3', household_id: 'house', child_id: 'emma', status: 'PLANNED', occurred_on: null },
    {
      id: 'v4',
      household_id: 'house',
      child_id: 'noah',
      status: 'GIVEN',
      occurred_on: '2026-09-15',
    },
  ],
  households: [{ id: 'house', name: 'Home', created_at: iso(at(1)) }],
};

describe('what a row is, to a range', () => {
  it('reads the instant off the row rather than off a list of table names', () => {
    for (const key of EVENT_INSTANT_KEYS) {
      expect(rowMoment({ [key]: iso(at(14)) })).toEqual({ kind: 'instant', atMs: at(14) });
    }
    for (const key of EVENT_DATE_KEYS) {
      expect(rowMoment({ [key]: '2026-09-14' })).toEqual({ kind: 'day', day: '2026-09-14' });
    }
  });

  it('never treats created_at as the moment: a month-old care item belongs in a month of entries', () => {
    expect(rowMoment({ id: 'cream', created_at: iso(at(1)) })).toEqual({ kind: 'context' });
    expect(momentInWindow({ kind: 'context' }, scope().window, TZ)).toBe(true);
  });

  it('keeps a dated row whose own date is empty — it has not happened, so no window excludes it', () => {
    expect(rowMoment({ occurred_on: null })).toEqual({ kind: 'undated' });
    expect(rowMoment({ start_at: 'not a date' })).toEqual({ kind: 'undated' });
    expect(momentInWindow({ kind: 'undated' }, scope().window, TZ)).toBe(true);
  });

  it('ends the window where the range ends: toMs is exclusive on both kinds of moment', () => {
    const w = scope().window;
    expect(momentInWindow({ kind: 'instant', atMs: w.fromMs }, w, TZ)).toBe(true);
    expect(momentInWindow({ kind: 'instant', atMs: w.toMs - 1 }, w, TZ)).toBe(true);
    expect(momentInWindow({ kind: 'instant', atMs: w.toMs }, w, TZ)).toBe(false);
    expect(momentInWindow({ kind: 'instant', atMs: w.fromMs - 1 }, w, TZ)).toBe(false);
    expect(momentInWindow({ kind: 'day', day: '2026-09-16' }, w, TZ)).toBe(true);
    expect(momentInWindow({ kind: 'day', day: '2026-09-17' }, w, TZ)).toBe(false);
    expect(momentInWindow({ kind: 'day', day: '2026-09-09' }, w, TZ)).toBe(false);
  });

  it('finds the child on a row, and on the children table finds it on the id', () => {
    expect(rowChildId('activities', { child_id: 'emma' })).toBe('emma');
    expect(rowChildId('activities', { child_id: null })).toBe(null);
    expect(rowChildId('children', { id: 'emma' })).toBe('emma');
    expect(rowChildId('households', { id: 'house' })).toBe(null);
  });

  it('follows only activity_id: a reference to an entry is not the row being one', () => {
    expect(rowActivityId({ activity_id: 'in-a' })).toBe('in-a');
    expect(rowActivityId({ matched_activity_id: 'in-a' })).toBe(null);
    expect(rowActivityId({ activity_id: null })).toBe(null);
  });
});

describe('the range', () => {
  const scoped = scopeExport(MIRROR, scope());

  it('keeps the entries inside it and drops the ones outside', () => {
    expect(scoped.tables['activities']?.map(r => r['id'])).toEqual(['in-a', 'in-b', 'in-pump']);
    expect(scoped.activities).toBe(3);
  });

  it('takes each detail row with its own entry and leaves the orphans behind', () => {
    expect(scoped.tables['bottle_details']?.map(r => r['activity_id'])).toEqual(['in-a', 'in-b']);
  });

  it('judges a stash transaction on its own moment, so the ledger still reconciles by date', () => {
    expect(scoped.tables['milk_inventory_transactions']?.map(r => r['id'])).toEqual(['t1']);
  });

  it('compares a local date as a date: an immunisation record carries no instant', () => {
    expect(scoped.tables['vaccine_records']?.map(r => r['id'])).toEqual(['v1', 'v3', 'v4']);
  });

  it('keeps every context table whole, so the file still names the people in it', () => {
    expect(scoped.tables['children']).toHaveLength(2);
    expect(scoped.tables['care_items']).toHaveLength(1);
    expect(scoped.tables['households']).toHaveLength(1);
  });

  it('leaves no table out: a narrowed export has the same shape as the whole one', () => {
    expect(Object.keys(scoped.tables).sort()).toEqual(Object.keys(MIRROR).sort());
  });

  it('counts what is actually in the file', () => {
    const rows = Object.values(scoped.tables).reduce((n, list) => n + list.length, 0);
    expect(scoped.rows).toBe(rows);
  });
});

describe('one child', () => {
  const scoped = scopeExport(MIRROR, scope({ childId: 'emma' }));

  it('exports that child and not the sibling', () => {
    expect(scoped.tables['activities']?.map(r => r['id'])).toEqual(['in-a', 'in-pump']);
    expect(scoped.tables['vaccine_records']?.map(r => r['id'])).toEqual(['v1', 'v3']);
  });

  it('keeps a household row that names no child — a pump session is nobody’s in particular', () => {
    expect(scoped.tables['activities']?.some(r => r['id'] === 'in-pump')).toBe(true);
  });

  it('narrows the children table too, or it would not be an export of one child', () => {
    expect(scoped.tables['children']?.map(r => r['id'])).toEqual(['emma']);
  });

  it('leaves the sibling’s details behind with the sibling’s entries', () => {
    expect(scoped.tables['bottle_details']?.map(r => r['activity_id'])).toEqual(['in-a']);
  });
});

describe('a range that holds nothing', () => {
  // a week that ended before this household logged anything
  const empty = scopeExport(
    MIRROR,
    scope({ window: { fromMs: at(1), toMs: at(2) }, childId: 'emma' }),
  );

  it('comes out empty rather than full', () => {
    expect(empty.activities).toBe(0);
    expect(empty.tables['activities']).toEqual([]);
    expect(empty.tables['bottle_details']).toEqual([]);
    expect(empty.tables['milk_inventory_transactions']).toEqual([]);
  });

  it('still names the child and the household, so the file is readable rather than a husk', () => {
    expect(empty.tables['children']?.map(r => r['id'])).toEqual(['emma']);
    expect(empty.tables['households']).toHaveLength(1);
    expect(empty.rows).toBeGreaterThan(0);
  });

  it('keeps the planned immunisation, which has no date to be outside the range', () => {
    expect(empty.tables['vaccine_records']?.map(r => r['id'])).toEqual(['v3']);
  });
});

describe('the whole record', () => {
  it('is what a scope of everything returns — the paid export can never hold more than the free one', () => {
    const all = scopeExport(MIRROR, scope({ window: { fromMs: 0, toMs: at(31) } }));
    for (const [table, rows] of Object.entries(MIRROR)) {
      expect(all.tables[table]).toHaveLength(rows.length);
    }
  });

  it('never invents a table the document did not have', () => {
    expect(Object.keys(scopeExport({}, scope()).tables)).toEqual([]);
  });
});
