import { describe, expect, it } from 'vitest';
import type { ModuleId } from '../modules/module-registry';
import {
  DEFAULT_QUICK_ROW_PREFS,
  logRow,
  quickRow,
  quickRowFrom,
  quickRowWith,
  TODAY_QUICK_SLOTS,
  todayQuickTiles,
} from './setup';

const ENABLED = ['bottle', 'breastfeed', 'pump', 'diaper', 'sleep'] as const;

describe('the Quick row a household chose', () => {
  it('is the registry order until it says otherwise', () => {
    expect(quickRowWith(ENABLED)).toEqual(quickRow(ENABLED));
    expect(quickRowWith(ENABLED, DEFAULT_QUICK_ROW_PREFS)).toEqual(quickRow(ENABLED));
  });

  it('puts what it placed first, then everything enabled since, in registry order', () => {
    expect(quickRowWith(ENABLED, { order: ['sleep', 'diaper'], hidden: [] })).toEqual([
      'sleep',
      'diaper',
      'bottle',
      'breastfeed',
      'pump',
    ]);
  });

  it('leaves out what it hid, and the hidden one keeps its place if it comes back', () => {
    const prefs = { order: ['sleep', 'diaper'] as const, hidden: ['pump'] as const };
    expect(quickRowWith(ENABLED, { order: [...prefs.order], hidden: [...prefs.hidden] })).toEqual([
      'sleep',
      'diaper',
      'bottle',
      'breastfeed',
    ]);
    expect(quickRowWith(ENABLED, { order: ['pump', 'sleep'], hidden: [] })[0]).toBe('pump');
  });

  it('forgets a position for a module that is no longer on', () => {
    expect(quickRowWith(['bottle', 'sleep'], { order: ['pump', 'sleep'], hidden: [] })).toEqual([
      'sleep',
      'bottle',
    ]);
  });

  it('never invents a module the household does not have, and never repeats one', () => {
    const row = quickRowWith(ENABLED, { order: ['sleep', 'sleep', 'water'], hidden: [] });
    expect(new Set(row).size).toBe(row.length);
    expect(row).not.toContain('water');
  });
});

/**
 * The 5-slot number is a PRESET, not a ceiling (the owner, 2026-09-16: "you should be able to
 * have more than 6 boxes … and it would just create a new row"). Today used to slice the row
 * after `quickRowWith` had already honored the household's arrangement, so switching a sixth
 * module on in Edit → changed nothing and the sheet read as if it edited something else.
 */
describe('the tiles Today draws', () => {
  // MORE LOG-ROW MODULES THAN THE PRESET DRAWS, which is the whole point of the fixture: with
  // `TODAY_QUICK_SLOTS` at six, six loggable modules would make "the preset" and "everything"
  // the same list and these tests would pass without proving anything.
  const MANY = [
    'bottle',
    'breastfeed',
    'pump',
    'diaper',
    'sleep',
    'solids',
    'growth',
    'temp',
    'bath',
    'tummy',
    'med',
  ] as const;

  it('shows the preset number to a household that has never touched the row', () => {
    expect(todayQuickTiles(MANY)).toHaveLength(TODAY_QUICK_SLOTS);
    expect(todayQuickTiles(MANY, DEFAULT_QUICK_ROW_PREFS)).toEqual(
      quickRow(MANY).slice(0, TODAY_QUICK_SLOTS),
    );
  });

  it('shows exactly what a household arranged, however many that is', () => {
    const order: ModuleId[] = ['solids', 'sleep'];
    const ordered = todayQuickTiles(MANY, { order, hidden: [] });
    expect(ordered).toEqual(quickRowWith(MANY, { order, hidden: [] }));
    expect(ordered.length).toBeGreaterThan(TODAY_QUICK_SLOTS);
    expect(ordered.slice(0, 2)).toEqual(order);
  });

  it('honors a hide even when that is the only thing it changed', () => {
    const hidden = todayQuickTiles(MANY, { order: [], hidden: ['pump'] });
    expect(hidden).not.toContain('pump');
    expect(hidden.length).toBe(logRow(MANY).length - 1);
  });

  it('never draws fewer than the household has, and never repeats one', () => {
    const few = ['bottle', 'diaper'] as const;
    expect(todayQuickTiles(few)).toEqual(logRow(few));
    const tiles = todayQuickTiles(MANY, { order: ['solids', 'solids', 'sleep'], hidden: [] });
    expect(new Set(tiles).size).toBe(tiles.length);
  });

  /**
   * The Care strip is the section directly under Log and carries a cell for each of these three
   * already (the owner, 2026-09-16: "turn off the options to show for bath, tummytime, and
   * medicine, since they are already available in the 'care' module right under it", then "i
   * still see tummy time and bath module in log edit"). Without the filter this household's
   * default five would be bottle, medicine, growth, temperature, tummy time — two of them drawn
   * twice on one screen.
   *
   * TEMPERATURE IS NOT ONE OF THEM and belongs on Log ("baby care is only for 3: bath, tummy
   * time, and medicine"): a temperature is a measurement, not a routine you can be late for.
   */
  it('leaves the Care modules to the Care strip, and gives no way to put one on Log', () => {
    const care = ['bottle', 'med', 'tummy', 'bath', 'growth', 'temp'] as const;
    expect(quickRow(care).slice(0, TODAY_QUICK_SLOTS)).toContain('med');
    expect(logRow(care)).toEqual(['bottle', 'growth', 'temp']);
    expect(todayQuickTiles(care)).toEqual(['bottle', 'growth', 'temp']);
    for (const id of ['med', 'tummy', 'bath'] as const) {
      // still loggable from the "+" grid, which is what `quickRow` is for
      expect(quickRow(care)).toContain(id);
    }
  });

  it('cannot be talked into one by a stored preference either', () => {
    const care = ['bottle', 'med', 'tummy', 'bath', 'growth', 'temp'] as const;
    // an order naming a Care module — an old device's write, or a hand-edited blob
    const tiles = todayQuickTiles(care, { order: ['med', 'bath', 'bottle'], hidden: [] });
    expect(tiles).toEqual(['bottle', 'growth', 'temp']);
    // and the editor's own round trip drops it rather than storing it
    expect(quickRowFrom(logRow(care), ['bottle', 'med'] as ModuleId[]).order).not.toContain('med');
  });
});

/**
 * The round trip the editor depends on. It shipped broken: the sheet listed every available
 * module while Today drew the first five, so the first switch persisted the sheet's view and four
 * modules nobody had chosen appeared on Log.
 */
describe('what the editor writes is what Today draws', () => {
  // MORE LOG-ROW MODULES THAN THE PRESET DRAWS, which is the whole point of the fixture: with
  // `TODAY_QUICK_SLOTS` at six, six loggable modules would make "the preset" and "everything"
  // the same list and these tests would pass without proving anything.
  const MANY = [
    'bottle',
    'breastfeed',
    'pump',
    'diaper',
    'sleep',
    'solids',
    'growth',
    'temp',
    'bath',
    'tummy',
    'med',
  ] as const;
  const available = logRow(MANY);

  it('round-trips any membership exactly, in order', () => {
    for (const shown of [
      available,
      available.slice(0, 5),
      available.slice(0, 5).filter(id => id !== 'pump'),
      ['solids', 'sleep', 'bottle'] as const,
      [] as const,
    ]) {
      expect(todayQuickTiles(MANY, quickRowFrom(available, [...shown]))).toEqual([...shown]);
    }
  });

  it('turning ONE tile off leaves every other tile exactly where it was', () => {
    const before = todayQuickTiles(MANY);
    const after = todayQuickTiles(
      MANY,
      quickRowFrom(
        available,
        before.filter(id => id !== 'pump'),
      ),
    );
    expect(after).toEqual(before.filter(id => id !== 'pump'));
    // the bug: the others came ON. There must be no tile in `after` that was not in `before`.
    expect(after.filter(id => !before.includes(id))).toEqual([]);
  });

  it('turning one ON adds exactly that one, at the end', () => {
    const before = todayQuickTiles(MANY);
    const extra = available.find(id => !before.includes(id));
    expect(extra).toBeDefined();
    const after = todayQuickTiles(MANY, quickRowFrom(available, [...before, extra as never]));
    expect(after).toEqual([...before, extra]);
  });

  it('stores a complete membership: the ORDER is every available module, `hidden` the off ones', () => {
    // `order` carries the whole list rather than only what is on, so a row keeps its position
    // while it is switched off and comes back where the household put it (the owner, 2026-09-16:
    // "cannot sort"). `quickRowWith` filters `hidden` out at the end, so an id in both is simply
    // not drawn — which is what makes the two safe to overlap.
    const prefs = quickRowFrom(available, available.slice(0, 3));
    expect([...prefs.order].sort()).toEqual([...available].sort());
    expect([...prefs.hidden].sort()).toEqual([...available.slice(3)].sort());
    expect(quickRowWith(MANY, prefs)).toEqual(available.slice(0, 3));
  });

  it('keeps a switched-off row in the order it was given, so turning it back on restores it', () => {
    const listed = [available[2], available[0], available[1], ...available.slice(3)] as ModuleId[];
    const off = quickRowFrom(available, [listed[0] as ModuleId], listed);
    expect(off.order).toEqual(listed);
    // switched on again with the same list, it lands back in second place rather than at the end
    const on = quickRowFrom(available, [listed[0], listed[1]] as ModuleId[], listed);
    expect(quickRowWith(MANY, on)).toEqual([listed[0], listed[1]]);
  });

  it('drops an id that is not available rather than storing it', () => {
    // `stash` is a real module and never a Quick tile (`quickLog: false`), so it is exactly the
    // kind of id a stale device could send up
    const listed: ModuleId[] = ['bottle', 'stash'];
    const prefs = quickRowFrom(available, listed, listed);
    expect(prefs.order).toEqual(['bottle', ...available.filter(id => id !== 'bottle')]);
    expect(prefs.order).not.toContain('stash');
  });
});
