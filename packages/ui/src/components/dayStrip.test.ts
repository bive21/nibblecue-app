import { describe, expect, it } from 'vitest';
import {
  axisLabelsShown,
  axisLabelWidth,
  DAY_AXIS_EM,
  DAY_AXIS_LABELS,
  DAY_STRIP,
  DIARY,
  diaryFit,
  marksHeight,
  placeMarks,
  stripBlock,
  stripX,
} from './dayStrip';
import { SHORT_WORD_EM } from './numberBars';

/**
 * A DAY AS A STRIP, as arithmetic (Reports' lead cards, 2026-09-26). The app walks the same
 * functions over the marks and words its cards really draw, at every phone width and text size
 * (`apps/mobile/src/screens/reports/summaryFit.test.ts`); this holds the rules themselves.
 */
const H = 3_600_000;
const DAY = { startMs: 0, endMs: 24 * H };

describe('a moment sits where it happened, on the day’s own length', () => {
  it('runs midnight to midnight across the width', () => {
    expect(stripX(0, DAY, 240)).toBe(0);
    expect(stripX(6 * H, DAY, 240)).toBe(60);
    expect(stripX(24 * H, DAY, 240)).toBe(240);
    // clamped: a moment outside the day is at its nearer end, never off the strip
    expect(stripX(-H, DAY, 240)).toBe(0);
    expect(stripX(30 * H, DAY, 240)).toBe(240);
  });

  it('reads a 25-hour day as 25 hours, so noon is not an hour off', () => {
    const long = { startMs: 0, endMs: 25 * H };
    expect(stripX(12.5 * H, long, 250)).toBe(125);
  });
});

describe('a sleep is a block, and never too small to see', () => {
  it('is its stretch, clipped to the day', () => {
    expect(stripBlock(6 * H, 12 * H, DAY, 240)).toEqual({ x: 60, w: 60 });
    // last night's sleep, from 8 p.m. yesterday, starts at the strip's left end
    expect(stripBlock(-4 * H, 6 * H, DAY, 240)).toEqual({ x: 0, w: 60 });
  });

  it('draws a five-minute nap as a shape, even at the very end of the day', () => {
    const nap = stripBlock(10 * H, 10 * H + 5 * 60_000, DAY, 240);
    expect(nap?.w).toBe(DAY_STRIP.minBlock);
    const late = stripBlock(24 * H - 60_000, 24 * H, DAY, 240);
    expect(late!.x + late!.w).toBeLessThanOrEqual(240);
    expect(late!.w).toBe(DAY_STRIP.minBlock);
  });

  it('has no block for a stretch outside the day, or one with no length', () => {
    expect(stripBlock(-5 * H, -H, DAY, 240)).toBeNull();
    expect(stripBlock(5 * H, 5 * H, DAY, 240)).toBeNull();
  });
});

/** No two marks in one lane overlap, every one is inside the strip, and time order holds per lane. */
function expectClean(xs: number[], widths: number[], track: number) {
  const placed = placeMarks(xs, widths, track);
  for (let lane = 0; lane < DAY_STRIP.lanes; lane += 1) {
    const members = placed
      .map((p, i) => ({ ...p, i, w: widths[i] ?? 0 }))
      .filter(p => p.lane === lane)
      .sort((a, b) => a.x - b.x);
    for (let k = 1; k < members.length; k += 1) {
      const prev = members[k - 1]!;
      const cur = members[k]!;
      expect(cur.x, `lane ${lane}, mark ${cur.i}`).toBeGreaterThanOrEqual(prev.x + prev.w - 1e-9);
      // and the later mark is the later one in time
      expect(xs[cur.i]!).toBeGreaterThanOrEqual(xs[prev.i]!);
    }
  }
  for (const [i, p] of placed.entries()) {
    expect(p.x, `mark ${i}`).toBeGreaterThanOrEqual(0);
    expect(p.x + (widths[i] ?? 0), `mark ${i}`).toBeLessThanOrEqual(track + 1e-9);
    expect(p.lane).toBeLessThan(DAY_STRIP.lanes);
  }
  return placed;
}

describe('no mark covers another', () => {
  it('puts a mark at its own time when nothing is in the way', () => {
    const placed = expectClean([20, 80, 150], [8, 8, 8], 240);
    expect(placed.map(p => p.x)).toEqual([16, 76, 146]);
    expect(placed.every(p => p.lane === 0)).toBe(true);
  });

  it('lifts a mark a lane rather than moving it, when two are close in time', () => {
    const placed = expectClean([100, 104], [8, 8], 240);
    expect(placed[0]).toEqual({ x: 96, lane: 0 });
    expect(placed[1]).toEqual({ x: 100, lane: 1 });
  });

  it('nudges a third along only when both lanes are taken, and keeps order', () => {
    const placed = expectClean([100, 102, 104], [8, 8, 8], 240);
    expect(placed[2]!.x).toBeGreaterThanOrEqual(placed[0]!.x + 8 + DAY_STRIP.gap);
  });

  it('keeps a cluster at the day’s end inside the strip', () => {
    expectClean([236, 237, 238, 239, 240], [12, 12, 25, 12, 12], 240);
  });

  it('holds a busy day in two lanes on the narrowest phone: seventeen changes, fourteen feeds', () => {
    const track = 250;
    // seventeen changes, some mixed (two glyphs wide), clustered as a newborn's are
    const changes = Array.from({ length: 17 }, (_, i) => (i * track) / 18 + (i % 3) * 2);
    const widths = changes.map((_, i) =>
      i % 4 === 0 ? 2 * DAY_STRIP.glyph + DAY_STRIP.gap : DAY_STRIP.glyph,
    );
    expectClean(changes, widths, track);
    const feeds = Array.from({ length: 14 }, (_, i) => 5 + i * 3.5); // cluster feeding, all morning
    expectClean(
      feeds,
      feeds.map(() => DAY_STRIP.dot),
      track,
    );
  });

  it('spreads a day busier than any real one evenly rather than losing a mark', () => {
    const placed = placeMarks(
      Array.from({ length: 60 }, () => 120),
      Array(60).fill(8),
      240,
    );
    expect(placed).toHaveLength(60);
    for (const p of placed) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(232 + 1e-9);
    }
  });

  it('is as tall as its lanes', () => {
    expect(marksHeight(8, 1)).toBe(8);
    expect(marksHeight(12, 2)).toBe(12 * 2 + DAY_STRIP.laneGap);
  });
});

describe('the hour words fit or are left out, never on top of each other', () => {
  it('names all four where there is room', () => {
    expect(axisLabelsShown(300, 1)).toEqual([true, true, true, true]);
  });

  it('keeps midnight and noon when the four would touch, and none when even two would', () => {
    expect(axisLabelsShown(200, 1.6)).toEqual([true, false, true, false]);
    expect(axisLabelsShown(60, 1.6)).toEqual([false, false, false, false]);
  });

  it('measures its four words by their own widths, and any other by the short-word bound', () => {
    expect(DAY_AXIS_LABELS).toEqual(['12 a.m.', '6 a.m.', 'noon', '6 p.m.']);
    expect(axisLabelWidth('noon')).toBeCloseTo(DAY_AXIS_EM[2] * 12, 9);
    expect(axisLabelWidth('3 p.m.')).toBeCloseTo(6 * SHORT_WORD_EM * 12, 9);
  });
});

describe('a week of sleep, a strip a day', () => {
  it('gives the strip the room the words leave', () => {
    const f = diaryFit(250, ['Mon', 'Tue'], ['13h 20m', '9h 5m'], 1);
    expect(f.text).toBe(1);
    expect(f.strip).toBeCloseTo(250 - f.label - f.total - 2 * DIARY.gap, 9);
    expect(f.strip).toBeGreaterThanOrEqual(DIARY.minStrip);
  });

  it('never squeezes the strip below its floor: the words give instead', () => {
    const f = diaryFit(200, ['Wed'], ['13h 20m'], 1.6);
    expect(f.strip).toBe(DIARY.minStrip);
    expect(f.text).toBeLessThan(1);
    expect(f.label + f.total + f.strip + 2 * DIARY.gap).toBeCloseTo(200, 9);
  });
});
