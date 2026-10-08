/**
 * THE STRIP IS ONE ROW, and these are the two things that make it so.
 *
 * The owner, 2026-09-22, with four places holding milk on one card: *"thaw can be combined with
 * fridge so it remain 1 row… if there is a counter, we need to make it into 4 column, to ensure
 * the strip remains in 1 line/row."* Both halves are arithmetic, so both are measured here
 * rather than looked at.
 */
import { describe, expect, it } from 'vitest';
import { LEGEND_MAX_COLUMNS, legendCells, legendColumns, type LegendPlace } from './legend';

const p = (kind: LegendPlace<string>['kind'], name: string, ml: number): LegendPlace<string> => ({
  kind,
  name,
  ml,
  place: name,
});

/** The four default locations plus a thaw — the most a household can have without adding one. */
const FIVE = [
  p('FRIDGE', 'Fridge', 120),
  p('THAWED', 'Thawing', 120),
  p('FREEZER', 'Freezer', 90),
  p('DEEP_FREEZER', 'Garage', 120),
  p('ROOM', 'Counter', 60),
];

describe('the stash legend', () => {
  it('folds a thaw into the fridge, keeping both numbers', () => {
    const cells = legendCells(FIVE);
    expect(cells.map(c => c.name)).toEqual(['Fridge', 'Freezer', 'Garage', 'Counter']);
    const fridge = cells[0];
    expect(fridge?.ml, 'the fridge’s own milk is the first number').toBe(120);
    expect(fridge?.extraMl, 'the thaw is the second').toBe(120);
    expect(fridge?.totalMl, 'and the bar segment is still the whole shelf').toBe(240);
  });

  it('keeps the fridge where it was, because the strip’s order is the bar’s order', () => {
    const cells = legendCells([p('FREEZER', 'Freezer', 90), ...FIVE.slice(0, 2)]);
    expect(cells.map(c => c.name)).toEqual(['Freezer', 'Fridge']);
  });

  it('adds up several thaws, which a household with two fridges can have', () => {
    const cells = legendCells([
      p('FRIDGE', 'Fridge', 100),
      p('THAWED', 'Thawing', 30),
      p('THAWED', 'Also thawing', 20),
    ]);
    expect(cells).toHaveLength(1);
    expect(cells[0]?.extraMl).toBe(50);
    expect(cells[0]?.totalMl).toBe(150);
  });

  it('leaves a thaw alone when there is no fridge to fold it into', () => {
    const cells = legendCells([p('THAWED', 'Thawing', 40), p('FREEZER', 'Freezer', 90)]);
    expect(cells.map(c => c.name)).toEqual(['Thawing', 'Freezer']);
    expect(cells[0]?.extraMl).toBeNull();
  });

  it('folds nothing when the thaw is empty — an empty place is not shown at all', () => {
    const cells = legendCells([p('FRIDGE', 'Fridge', 100), p('THAWED', 'Thawing', 0)]);
    expect(cells).toHaveLength(1);
    expect(cells[0]?.extraMl, 'no “+ 0 oz” on the fridge').toBeNull();
  });

  /**
   * THE LOAD-BEARING ONE. Four cells at four across is one row; this is what would fail the day
   * a fifth kind is added without the fold being extended to it.
   */
  it('never needs more than four columns for the default locations', () => {
    expect(legendCells(FIVE).length).toBeLessThanOrEqual(LEGEND_MAX_COLUMNS);
    expect(legendColumns(legendCells(FIVE).length)).toBe(4);
  });

  it('sizes the row to what is in it, and wraps at four rather than three beyond that', () => {
    expect(legendColumns(0)).toBe(1); // never a division by zero
    expect(legendColumns(1)).toBe(1);
    expect(legendColumns(3)).toBe(3);
    expect(legendColumns(4)).toBe(4);
    expect(legendColumns(6), 'a household with its own locations wraps at 4').toBe(4);
  });
});
