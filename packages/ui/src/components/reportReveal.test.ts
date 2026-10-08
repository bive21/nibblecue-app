/**
 * REPORTS' FIRST LOOK, FRAME BY FRAME (`reportReveal.ts`; the owner's delight list, 2026-09-26).
 * The columns' rise and the figures' count are walked here the way the native driver and the Text
 * will draw them — every frame of every column read back through `sampleFrame`, every frame of a
 * count through the figure's own formatter — and what only a device can show (the one value on
 * the native driver, the label that never counts) is held by tripwires over the component files.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { sampleFrame } from './keyframes';
import {
  barSink,
  barStagger,
  barWindow,
  countText,
  countValue,
  growFrame,
  growTimeline,
  REVEAL,
  revealDue,
} from './reportReveal';

const here = dirname(fileURLToPath(import.meta.url));
const code = (file: string): string =>
  readFileSync(join(here, file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
    .replace(/\s+/g, ' ');

/** The ranges Reports draws: today, a week, a fortnight, a month — and a long custom one. */
const COUNTS = [1, 7, 14, 24, 30, 90, 730];

describe('the columns: 420 ms each, a beat apart, the wave never long', () => {
  it('beats 35 ms apart on a week and closes to 25 on a month, never outside the two', () => {
    expect(barStagger(1)).toBe(35);
    expect(barStagger(7)).toBe(35);
    expect(barStagger(30)).toBe(25);
    for (let n = 1; n <= 30; n += 1) {
      expect(barStagger(n)).toBeGreaterThanOrEqual(25);
      expect(barStagger(n)).toBeLessThanOrEqual(35);
      if (n > 1) expect(barStagger(n)).toBeLessThanOrEqual(barStagger(n - 1));
    }
  });

  it('keeps a month’s wave for anything longer, so two years of columns land in about a second', () => {
    for (const n of [31, 90, 365, 730]) {
      const { totalMs } = growTimeline(n);
      expect(totalMs).toBeCloseTo(growTimeline(30).totalMs, 6);
    }
    expect(growTimeline(30).totalMs).toBe(29 * 25 + 420);
  });

  it('ends inside the card’s play window, whatever the range', () => {
    for (const n of COUNTS) expect(growTimeline(n).totalMs).toBeLessThan(REVEAL.windowMs);
    expect(growTimeline(0).totalMs).toBe(0);
  });

  it('gives each column its own 420 ms of the chart’s one value, in order, the last ending at 1', () => {
    for (const n of COUNTS) {
      const { totalMs, stagger } = growTimeline(n);
      for (let i = 0; i < n; i += 1) {
        const [a, b] = barWindow(i, n);
        expect((b - a) * totalMs).toBeCloseTo(REVEAL.barMs, 6);
        expect(a * totalMs).toBeCloseTo(i * stagger, 6);
      }
      expect(barWindow(n - 1, n)[1]).toBeCloseTo(1, 9);
    }
  });
});

describe('a column rises out of the baseline, and lands without a bounce', () => {
  const rise = 96;

  it('sits wholly under the baseline before its turn, and wholly in place after it', () => {
    for (const n of COUNTS.slice(0, 5)) {
      for (let i = 0; i < n; i += 1) {
        const f = growFrame(i, n, rise);
        const [a, b] = barWindow(i, n);
        expect(sampleFrame(f, 0)).toBeCloseTo(rise, 6);
        if (a > 0) expect(sampleFrame(f, a / 2)).toBeCloseTo(rise, 6);
        expect(sampleFrame(f, b)).toBeCloseTo(0, 6);
        expect(sampleFrame(f, 1)).toBe(0);
        expect(f.extrapolate).toBe('clamp');
      }
    }
  });

  it('only ever rises — never dips back, never passes its place — on an ease-out', () => {
    const n = 14;
    for (let i = 0; i < n; i += 1) {
      const f = growFrame(i, n, rise);
      let last = Number.POSITIVE_INFINITY;
      for (let k = 0; k <= 400; k += 1) {
        const y = sampleFrame(f, k / 400);
        expect(y).toBeLessThanOrEqual(last + 1e-9);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThanOrEqual(rise);
        last = y;
      }
    }
    // off at speed: a third of the way through its rise, most of the column is up
    expect(barSink(rise, 1 / 3)).toBeLessThan(rise * 0.35);
    expect(barSink(rise, 0)).toBe(rise);
    expect(barSink(rise, 1)).toBe(0);
  });

  it('draws a tall bar exactly as it draws a short one: the same curve, the same time', () => {
    const tall = growFrame(3, 7, 120);
    const short = growFrame(3, 7, 12);
    expect(tall.inputRange).toEqual(short.inputRange);
    tall.outputRange.forEach((y, k) =>
      expect(y / 120).toBeCloseTo((short.outputRange[k] ?? 0) / 12, 9),
    );
  });

  it('hands `interpolate` an input it accepts: strictly increasing, from 0 to 1', () => {
    for (const n of COUNTS) {
      for (const i of [0, Math.floor(n / 2), n - 1]) {
        const f = growFrame(i, n, 40);
        expect(f.inputRange[0]).toBe(0);
        expect(f.inputRange[f.inputRange.length - 1]).toBe(1);
        for (let k = 1; k < f.inputRange.length; k += 1)
          expect(f.inputRange[k] ?? 0).toBeGreaterThan(f.inputRange[k - 1] ?? 0);
        expect(f.outputRange).toHaveLength(f.inputRange.length);
      }
    }
  });
});

describe('a figure counts up in its own words and lands on its own value', () => {
  const oz = (ml: number) => `${String(Math.round((ml / 29.5735) * 10) / 10)} oz`;
  const mins = (m: number) => {
    const h = Math.floor(Math.round(m) / 60);
    const r = Math.round(m) % 60;
    return h === 0 ? `${r}m` : r === 0 ? `${h}h` : `${h}h ${r}m`;
  };
  const oneDecimal = (n: number) => n.toFixed(1);
  const whole = (n: number) => String(Math.round(n));

  /** Every frame a 600 ms count at 60 fps can draw, and a few between. */
  const frames = Array.from({ length: 121 }, (_, k) => k / 120);

  it('starts on the figure’s own zero and ends on exactly its own words for the value', () => {
    expect(countText(133, 0, oz, 1)).toBe('0 oz');
    expect(countText(133, 1, oz, 1)).toBe(oz(133));
    expect(countText(750, 0, mins, 1)).toBe('0m');
    expect(countText(750, 1, mins, 1)).toBe('12h 30m');
    expect(countText(4.5, 0, oneDecimal, 0.1)).toBe('0.0');
    expect(countText(4.5, 1, oneDecimal, 0.1)).toBe('4.5');
    expect(countText(7, 0, whole, 1)).toBe('0');
    expect(countText(7, 1, whole, 1)).toBe('7');
  });

  it('never shows a place the figure does not have — “4.4999” cannot be drawn', () => {
    for (const u of frames) {
      const tenths = countValue(4.5, u, 0.1);
      expect(Number(tenths.toFixed(1))).toBe(tenths);
      expect(countText(4.5, u, oneDecimal, 0.1)).toMatch(/^\d+\.\d$/);
      const count = countValue(7, u, 1);
      expect(Number.isInteger(count)).toBe(true);
    }
  });

  it('only ever counts up, and never past the value before landing on it', () => {
    for (const [target, step] of [
      [4.5, 0.1],
      [133, 1],
      [750, 1],
      [3, 1],
    ] as const) {
      let last = -1;
      for (const u of frames) {
        const v = countValue(target, u, step);
        expect(v).toBeGreaterThanOrEqual(last);
        expect(v).toBeLessThanOrEqual(target);
        last = v;
      }
      expect(countValue(target, 1, step)).toBe(target);
    }
  });

  it('eases out: most of the way there early, the last steps slow', () => {
    expect(countValue(100, 0.25)).toBeGreaterThan(50);
    expect(countValue(100, 0.9)).toBeGreaterThan(99);
  });

  it('leaves a figure that is not a number alone', () => {
    expect(countText(Number.NaN, 0.5, n => String(n))).toBe('NaN');
  });
});

describe('when a card has come into view', () => {
  const H = 800;

  it('is due once its top is above the line 80% of the way down, and it has not gone off the top', () => {
    expect(revealDue({ y: 600, height: 300 }, H)).toBe(true);
    expect(revealDue({ y: 660, height: 300 }, H)).toBe(false);
    // scrolled past: its foot is under the bar at the top
    expect(revealDue({ y: -400, height: 480 }, H)).toBe(false);
    // taller than the window, straddling it
    expect(revealDue({ y: -200, height: 1400 }, H)).toBe(true);
  });

  it('is never due for a box not yet laid out, or a window not yet measured', () => {
    expect(revealDue({ y: 100, height: 0 }, H)).toBe(false);
    expect(revealDue({ y: 100, height: 200 }, 0)).toBe(false);
  });
});

describe('the components: one value on the native driver, a label that never counts', () => {
  const progress = code('useRevealProgress.ts');
  const count = code('CountUp.tsx');
  const bars = code('DayBars.tsx');

  it('runs a chart’s entrance as one linear value on the native driver', () => {
    expect(progress).toContain('useNativeDriver: true');
    expect(progress).toContain('easing: Easing.linear');
    expect(progress).toContain('const still = motionStill(t.reduceMotion, t.theme);');
  });

  it('plays only on the way from hold to play, and never again', () => {
    expect(progress).toContain("if (begun.current || reveal === 'hold') return;");
    expect(count).toContain("if (phase.current !== 'waiting' || reveal === 'hold') return;");
  });

  it('gives a screen reader the final value from the first frame', () => {
    expect(count).toContain('accessibilityLabel={final}');
    expect(count).toContain('const final = format(value);');
  });

  it('writes the value at once under reduce motion and in the amber Night', () => {
    expect(count).toContain('const still = motionStill(t.reduceMotion, t.theme);');
  });

  it('clips each column at the baseline and moves it, at rest unless a card asks', () => {
    expect(bars).toContain("reveal = 'rest',");
    expect(bars).toContain("column: { position: 'absolute', top: 0, overflow: 'hidden' }");
    expect(bars).toContain('transform: [{ translateY: sink }]');
  });
});
