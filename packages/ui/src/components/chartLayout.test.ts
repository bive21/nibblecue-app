import { describe, expect, it } from 'vitest';
import { areaPoints, chartLayout, polylinePoints, type ChartPoint } from './chartLayout';

const day = 86_400_000;
const series = (vs: number[]): ChartPoint[] => vs.map((v, i) => ({ t: i * day, v }));

describe('chartLayout', () => {
  const g = chartLayout(series([4, 8, 2, 6, 0, 10, 7]), { width: 300, height: 112 });

  it('puts the dashed gridline at the real maximum, with 20% of air above it', () => {
    expect(g.max).toBe(10);
    expect(g.scaleMax).toBeCloseTo(12);
    const tallest = g.bars[5];
    expect(tallest?.y).toBeCloseTo(g.maxY);
    expect(g.maxY).toBeGreaterThan(16); // never inside the label room
  });

  it('keeps every bar inside the plot and on the baseline', () => {
    for (const b of g.bars) {
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.x + b.w).toBeLessThanOrEqual(300 + 1e-9);
      expect(b.y + b.h).toBeCloseTo(g.baselineY);
      expect(b.y).toBeGreaterThanOrEqual(16 - 1e-9);
    }
    expect(g.barWidth).toBeLessThanOrEqual(26);
  });

  it('a logged zero is a 2px stub, distinct from nothing drawn', () => {
    expect(g.bars[4]?.h).toBe(0);
    const tiny = chartLayout(series([0.01, 100]), { width: 300, height: 112 });
    expect(tiny.bars[0]?.h).toBe(2);
  });

  it('the current period defaults to the last and is the only one flagged', () => {
    expect(g.currentIndex).toBe(6);
    expect(g.bars.filter(b => b.current).map(b => b.index)).toEqual([6]);
    const mid = chartLayout(series([1, 2, 3]), { width: 300, height: 112, currentIndex: 1 });
    expect(mid.bars.map(b => b.current)).toEqual([false, true, false]);
    const wild = chartLayout(series([1, 2, 3]), { width: 300, height: 112, currentIndex: 99 });
    expect(wild.currentIndex).toBe(2);
  });

  it('labels the current bar only when it is not already the maximum', () => {
    expect(g.labelCurrent).toBe(true);
    const atMax = chartLayout(series([1, 2, 9]), { width: 300, height: 112 });
    expect(atMax.labelCurrent).toBe(false);
  });

  it('ticks every point up to eight, then every ceil(n/7)th', () => {
    expect(g.tickIndexes).toEqual([0, 1, 2, 3, 4, 5, 6]);
    const month = chartLayout(series(Array.from({ length: 30 }, (_, i) => i)), {
      width: 300,
      height: 112,
    });
    expect(month.tickIndexes).toEqual([0, 5, 10, 15, 20, 25]);
    expect(month.tickIndexes.length).toBeLessThanOrEqual(8);
  });

  it('an empty or all-zero series still has a baseline and a sane scale', () => {
    const empty = chartLayout([], { width: 300, height: 112 });
    expect(empty.bars).toEqual([]);
    expect(empty.currentIndex).toBe(-1);
    expect(empty.max).toBe(1);
    expect(empty.labelCurrent).toBe(false);
    const zeros = chartLayout(series([0, 0, 0]), { width: 300, height: 112 });
    expect(zeros.max).toBe(1);
    expect(zeros.bars.every(b => b.h === 0)).toBe(true);
    expect(Number.isFinite(zeros.maxY)).toBe(true);
    const junk = chartLayout(
      [
        { t: 0, v: Number.NaN },
        { t: 1, v: -4 },
      ],
      { width: 300, height: 112 },
    );
    expect(junk.bars.every(b => b.h === 0)).toBe(true);
  });

  it('line vertices sit at slot centers; the area closes along the baseline', () => {
    expect(g.points).toHaveLength(7);
    expect(g.points[0]?.x).toBeCloseTo(300 / 14);
    expect(polylinePoints([{ x: 1.26, y: 2 }])).toBe('1.3,2.0');
    const area = areaPoints(g.points, g.baselineY);
    expect(area.startsWith(`${g.points[0]?.x.toFixed(1)},${g.baselineY.toFixed(1)}`)).toBe(true);
    expect(area.endsWith(`${g.points[6]?.x.toFixed(1)},${g.baselineY.toFixed(1)}`)).toBe(true);
    expect(areaPoints([], 10)).toBe('');
  });
});
