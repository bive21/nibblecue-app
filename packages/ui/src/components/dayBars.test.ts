import { describe, expect, it } from 'vitest';
import { BAR_GAP, BAR_MAX_WIDTH, BAR_RADIUS, columnMax, topRoundedPath } from './dayBarsLayout';

/**
 * The mark specs, as arithmetic. They are fixed across every chart in the app rather than tuned
 * per chart, so they belong in a test: a bar that quietly grew to 40px or gained a rounded
 * baseline is the kind of drift nobody notices until the whole screen reads loud.
 */
describe('a column has a rounded data end and a square baseline', () => {
  it('rounds only the top two corners', () => {
    const d = topRoundedPath(10, 20, 24, 60, BAR_RADIUS);
    // it starts and ends at the BASELINE, with no curve there
    expect(d.startsWith('M10 80')).toBe(true);
    expect(d.endsWith('L34 80 Z')).toBe(true);
    // and exactly two curves, at the top
    expect(d.match(/Q/g)).toHaveLength(2);
  });

  it('never rounds more than the mark can hold', () => {
    // a 3px stub asked for a 4px radius would invert the path
    const stub = topRoundedPath(0, 0, 3, 2, BAR_RADIUS);
    expect(stub).not.toContain('NaN');
    expect(stub).toContain('Q');
    const flat = topRoundedPath(0, 0, 24, 0, BAR_RADIUS);
    expect(flat).not.toContain('NaN');
  });

  it('keeps the two spacers and the cap where the design system put them', () => {
    expect(BAR_GAP).toBe(2);
    expect(BAR_MAX_WIDTH).toBe(24);
    expect(BAR_RADIUS).toBe(4);
  });
});

describe('columnMax — what the one gridline is drawn at', () => {
  it('is the tallest STACK when the series are stacked', () => {
    expect(
      columnMax(
        [
          [1, 5],
          [9, 2],
        ],
        'stacked',
      ),
    ).toBe(10);
  });

  it('is the tallest single BAR when they stand side by side', () => {
    expect(
      columnMax(
        [
          [1, 5],
          [9, 2],
        ],
        'grouped',
      ),
    ).toBe(9);
  });

  it('is 0 for nothing, rather than -Infinity from an empty Math.max', () => {
    expect(columnMax([], 'stacked')).toBe(0);
    expect(columnMax([[]], 'grouped')).toBe(0);
    expect(columnMax([[0, 0]], 'stacked')).toBe(0);
  });

  it('tolerates a short row rather than reading undefined as a height', () => {
    expect(columnMax([[1, 2, 3], [4]], 'stacked')).toBe(5);
  });
});
