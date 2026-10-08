import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  ALL,
  loggingForOptions,
  otherChild,
  plusChildFields,
  savePlan,
  selectionFor,
  stashAllowed,
  stashFeedOptions,
} from './save';

const emma = { id: 'emma' };
const liam = { id: 'liam' };

describe('savePlan — which children one Save writes for', () => {
  it('writes for the selected child', () => {
    expect(
      savePlan('bottle', { children: [emma, liam], selectedId: 'liam', isAll: false }),
    ).toEqual({
      kind: 'one',
      childId: 'liam',
    });
  });

  it('fans out to every child on Both, one entry each, never one merged row', () => {
    expect(savePlan('diaper', { children: [emma, liam], selectedId: null, isAll: true })).toEqual({
      kind: 'each',
      childIds: ['emma', 'liam'],
    });
  });

  it('collapses Both to one entry when there is only one child', () => {
    expect(savePlan('diaper', { children: [emma], selectedId: null, isAll: true })).toEqual({
      kind: 'one',
      childId: 'emma',
    });
  });

  it('ignores the chip for a household-scoped module: pump has no child', () => {
    expect(savePlan('pump', { children: [emma, liam], selectedId: 'liam', isAll: false })).toEqual({
      kind: 'one',
      childId: null,
    });
  });

  it('falls back to the first child when the selection names nobody known', () => {
    expect(savePlan('bath', { children: [emma, liam], selectedId: 'gone', isAll: false })).toEqual({
      kind: 'one',
      childId: 'emma',
    });
  });

  it('refuses to invent a child', () => {
    expect(savePlan('bath', { children: [], selectedId: null, isAll: false })).toEqual({
      kind: 'nobody',
    });
  });

  it('allows the stash path for exactly one baby', () => {
    expect(stashAllowed({ kind: 'one', childId: 'emma' })).toBe(true);
    expect(stashAllowed({ kind: 'each', childIds: ['emma', 'liam'] })).toBe(false);
    expect(stashAllowed({ kind: 'nobody' })).toBe(false);
  });
});

/**
 * WHO A POURED BOTTLE IS FOR (2026-09-22). `StashSaveSheet` read
 * `isAll ? children[0] : child ?? children[0]`, so in a twin household — where Both is the
 * DEFAULT view — every pour was logged against the first twin and the toast named them. The
 * chips have no Both because one container feeds one baby, and no default because the bar's
 * Both is not an answer.
 */
describe('a stash feed picks one baby and never guesses', () => {
  const kids = [
    { id: 'emma', name: 'Emma' },
    { id: 'liam', name: 'Liam' },
  ];

  it('offers one chip per child and no Both, unlike the quick bottle sheet', () => {
    expect(stashFeedOptions(kids)).toEqual([
      { value: 'emma', label: 'Emma' },
      { value: 'liam', label: 'Liam' },
    ]);
    // the quick sheet's bottle CAN be two bottles, so it carries the extra chip
    expect(loggingForOptions('bottle', kids, 'Both').map(o => o.value)).toContain(ALL);
    expect(stashFeedOptions(kids).map(o => o.value)).not.toContain(ALL);
  });

  it('asks nothing of a household with one child, or none', () => {
    expect(stashFeedOptions([{ id: 'emma', name: 'Emma' }])).toEqual([]);
    expect(stashFeedOptions([])).toEqual([]);
  });

  // (no stash-save sheet in NibbleCue to read the options: CuddleCue's milk stash UI was not carried over)
});

describe('WP5.6 — multiples (MULTIPLES §2, §3; D15)', () => {
  const kids = [
    { id: 'emma', name: 'Emma' },
    { id: 'liam', name: 'Liam' },
  ];

  it('never fans out a single-child module, even on Both', () => {
    expect(savePlan('temp', { children: kids, selectedId: null, isAll: true })).toEqual({
      kind: 'one',
      childId: 'emma',
    });
    expect(savePlan('growth', { children: kids, selectedId: 'liam', isAll: true })).toEqual({
      kind: 'one',
      childId: 'liam',
    });
  });

  it('offers the shortcut only for a fan-out module with exactly one other child', () => {
    expect(otherChild('bottle', kids, 'emma')).toEqual({ id: 'liam', name: 'Liam' });
    expect(otherChild('growth', kids, 'emma')).toBeNull();
    expect(otherChild('bottle', [...kids, { id: 'noor', name: 'Noor' }], 'emma')).toBeNull();
    expect(otherChild('bottle', kids, null)).toBeNull();
    expect(otherChild('pump', kids, 'emma')).toBeNull();
  });

  it('builds the Logging-for row: chips per child plus Both where the module fans out', () => {
    expect(loggingForOptions('bottle', kids, 'Both').map(o => o.label)).toEqual([
      'Emma',
      'Liam',
      'Both',
    ]);
    expect(loggingForOptions('growth', kids, 'Both').map(o => o.label)).toEqual(['Emma', 'Liam']);
    expect(loggingForOptions('pump', kids, 'Both')).toEqual([]);
    expect(loggingForOptions('bottle', [kids[0]!], 'Both')).toEqual([]);
  });

  it('reads a row value back into a selection', () => {
    expect(selectionFor(ALL)).toEqual({ selectedId: null, isAll: true });
    expect(selectionFor('liam')).toEqual({ selectedId: 'liam', isAll: false });
  });
});

/**
 * "+ LIAM" AFTER AN ENTRY WITH AN END (the audits of 2026-09-24, care C1 and feeding C6). The copy
 * took `now` as its start and kept the original end, so a 90-minute nap was copied as an entry
 * ending four seconds before it began — 0 minutes on Today, and refused by the server for good
 * (`activity_time_sane`), so Liam's entry never left the phone. The copy of an event is the same
 * event; the copy of a point entry is still "now", which is when the parent taps it.
 */
describe('the + Liam copy keeps an event whole', () => {
  const NOW = Date.parse('2026-09-14T08:00:04.000Z');

  it('gives an entry with an end the same start and end', () => {
    const nap = {
      type: 'sleep' as const,
      startAt: '2026-09-14T06:30:00.000Z',
      endAt: '2026-09-14T08:00:00.000Z',
      quantity: 90,
      detail: { kind: 'NAP' },
    };
    const copy = plusChildFields(nap, NOW);
    expect(copy.startAt).toBe(nap.startAt);
    expect(copy.endAt).toBe(nap.endAt);
    expect(Date.parse(copy.endAt) - Date.parse(copy.startAt)).toBe(90 * 60_000);
    expect(copy).toEqual(nap);
  });

  it('gives a point entry the current time, as the shortcut always has', () => {
    const bottle = { type: 'bottle' as const, startAt: '2026-09-14T07:00:00.000Z', quantity: 120 };
    expect(plusChildFields(bottle, NOW).startAt).toBe(new Date(NOW).toISOString());
    const noEnd = { ...bottle, endAt: null };
    expect(plusChildFields(noEnd, NOW).startAt).toBe(new Date(NOW).toISOString());
  });

  it('never carries a timer id: a second entry with one is read as a duplicate stop', () => {
    const fed = {
      startAt: '2026-09-14T07:00:00.000Z',
      endAt: '2026-09-14T07:20:00.000Z',
      metadata: { timer_id: 't1', source: 'sheet' },
    };
    expect(plusChildFields(fed, NOW).metadata).toEqual({ source: 'sheet' });
    // the original is not touched
    expect(fed.metadata).toEqual({ timer_id: 't1', source: 'sheet' });
  });

  it('is what the sheet writes the copy with', () => {
    const src = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), 'useQuickWrite.ts'),
      'utf8',
    );
    expect(src).toContain('...plusChildFields(fields, Date.now()),');
    expect(src).not.toMatch(/startAt: new Date\(Date\.now\(\)\)\.toISOString\(\)/);
  });
});
