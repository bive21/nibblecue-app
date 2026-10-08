import { describe, expect, it } from 'vitest';
import { BAR_MAX_WIDTH } from './dayBarsLayout';
import { LEAD_FIGURE, leadFigureFit, leadFigureWidth } from './leadFigure';
import { barHeight, barNumberWidth, NUMBER_BARS, numberBarsFit } from './numberBars';

/**
 * A SMALL BAR WITH ITS NUMBER WRITTEN ON IT, and the big number on Reports' lead cards, as
 * arithmetic (2026-09-26). The app walks them over the figures its cards really write
 * (`apps/mobile/src/screens/reports/summaryFit.test.ts`); this holds the rules.
 */
const WEEK_TICKS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

describe('a bar is DayBars’ own mark', () => {
  it('is never wider than 24, and leaves its band air', () => {
    const wide = numberBarsFit({ width: 700, labels: ['8'], ticks: ['Mon'], scale: 1 });
    expect(wide.bar).toBe(BAR_MAX_WIDTH);
    const week = numberBarsFit({
      width: 250,
      labels: Array(7).fill('8'),
      ticks: WEEK_TICKS,
      scale: 1,
    });
    expect(week.bar).toBeLessThan(week.band);
    expect(week.bar).toBeCloseTo(week.band * NUMBER_BARS.share, 9);
  });

  it('draws any value at least a stub tall, and nothing for none', () => {
    expect(barHeight(1, 40)).toBe(Math.max(NUMBER_BARS.minBar, NUMBER_BARS.plot / 40));
    expect(barHeight(0.01, 1000)).toBe(NUMBER_BARS.minBar);
    expect(barHeight(40, 40)).toBe(NUMBER_BARS.plot);
    expect(barHeight(null, 40)).toBe(0);
    expect(barHeight(0, 40)).toBe(0);
    expect(barHeight(5, 0)).toBe(0);
  });
});

describe('a number fits its bar: drawn smaller, then short, never cut', () => {
  it('draws a week of counts at full size on the narrowest phone', () => {
    const f = numberBarsFit({
      width: 250,
      labels: Array(7).fill('14'),
      ticks: WEEK_TICKS,
      scale: 1,
    });
    expect(f.number).toBe(1);
    expect(f.short).toBe(false);
    expect(f.tick).toBe(1);
  });

  it('switches a length to its short form only when the full one would be too small', () => {
    const labels = ['13h 20m', '12h 55m', '13h 5m', '14h', '13h 40m'];
    const short = ['13h', '13h', '13h', '14h', '14h'];
    const roomy = numberBarsFit({ width: 364, labels, short, ticks: labels, scale: 1 });
    expect(roomy.short).toBe(false);
    const tight = numberBarsFit({ width: 250, labels, short, ticks: labels, scale: 1.6 });
    expect(tight.short).toBe(true);
    expect(tight.number).toBeGreaterThanOrEqual(NUMBER_BARS.floor);
  });

  it('goes short before a number would be drawn under 8.5 pt, at the smallest text too', () => {
    // a week of quarter-ounce totals on a 375 phone at the smallest text a reader can pick: the
    // full form fits at 0.82 of its size, above the share, but that is 8.4 pt
    const labels = Array(7).fill('11.25 oz');
    const short = Array(7).fill('11.25');
    const width = 375 - 2 * 18 - 2 * 14 - 2;
    const long = numberBarsFit({ width, labels, ticks: WEEK_TICKS, scale: 0.85 });
    expect(long.number).toBeGreaterThanOrEqual(NUMBER_BARS.floor);
    expect(NUMBER_BARS.size * 0.85 * long.number).toBeLessThan(NUMBER_BARS.minPt);
    const f = numberBarsFit({ width, labels, short, ticks: WEEK_TICKS, scale: 0.85 });
    expect(f.short).toBe(true);
    expect(NUMBER_BARS.size * 0.85 * f.number).toBeGreaterThanOrEqual(NUMBER_BARS.minPt);
  });

  it('keeps every number the same size: the widest decides', () => {
    const f = numberBarsFit({
      width: 140,
      labels: ['8', '12', '9'],
      ticks: ['a', 'b', 'c'],
      scale: 1.6,
    });
    const band = 140 / 3 - 2 * NUMBER_BARS.pad;
    expect(barNumberWidth('12') * 1.6 * f.number).toBeLessThanOrEqual(band + 1e-9);
  });
});

describe('the big number on the lead cards', () => {
  it('draws its digits big and its letters small', () => {
    // "13h 20m": four digits at 31, and h, a space and m at 12, all mono
    expect(leadFigureWidth('13h 20m')).toBeCloseTo(
      0.6 * (4 * LEAD_FIGURE.big + 3 * LEAD_FIGURE.small),
      9,
    );
    expect(leadFigureWidth('7')).toBeCloseTo(0.6 * LEAD_FIGURE.big, 9);
  });

  it('stays one line in a 320 pt phone’s text column at the largest text, without giving', () => {
    // the column: the phone, less the Screen's gutter, the card's padding and the picture beside it
    const column = 320 - 2 * 18 - 2 * 14 - 40;
    for (const v of ['17h 45m', '1250 ml', '48 oz', '14'])
      expect(leadFigureFit(column, v, 1.6), v).toBe(1);
  });
});
