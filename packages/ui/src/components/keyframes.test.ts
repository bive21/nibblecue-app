/**
 * A MOVE AS ITS TURNING POINTS (`keyframes.ts`): the bell's ring and the module icons' moves are
 * written this way, so what is held here is what both lean on — the turning points are reached
 * exactly and never passed, the frames are ones `interpolate` accepts, and `sampleFrame` reads a
 * frame the way the native driver does.
 */
import { describe, expect, it } from 'vitest';
import { KEY_STEPS, keyFrame, keyValue, sampleFrame, type Key } from './keyframes';

const SWING: readonly Key[] = [
  [0, 0],
  [0.2, 12],
  [0.5, -8],
  [0.8, 3],
  [1, 0],
];

describe('a value between turning points', () => {
  it('is exactly the written value at every turning point', () => {
    for (const [at, v] of SWING) expect(keyValue(SWING, at)).toBeCloseTo(v, 12);
  });

  it('never passes either of the two points it runs between', () => {
    for (let i = 1; i < SWING.length; i += 1) {
      const [a, va] = SWING[i - 1] ?? [0, 0];
      const [b, vb] = SWING[i] ?? [1, 0];
      for (let s = 0; s <= 50; s += 1) {
        const v = keyValue(SWING, a + ((b - a) * s) / 50);
        expect(v).toBeGreaterThanOrEqual(Math.min(va, vb) - 1e-9);
        expect(v).toBeLessThanOrEqual(Math.max(va, vb) + 1e-9);
      }
    }
  });

  it('slows into each turning point and leaves it the same way, like a pendulum', () => {
    // a hair either side of the fullest point, the value has barely moved; half way between two
    // points it is moving fastest
    const near = Math.abs(keyValue(SWING, 0.2) - keyValue(SWING, 0.199));
    const mid = Math.abs(keyValue(SWING, 0.35) - keyValue(SWING, 0.349));
    expect(near).toBeLessThan(mid / 10);
  });

  it('holds the first value before the move and the last one after it', () => {
    expect(keyValue(SWING, -1)).toBe(0);
    expect(keyValue(SWING, 2)).toBe(0);
    expect(keyValue([[0.3, 5]], 0)).toBe(5);
  });
});

describe('the frame handed to interpolate', () => {
  const f = keyFrame(SWING);

  it('carries every turning point, strictly in order, one output per input', () => {
    for (const [at, v] of SWING) {
      const i = f.inputRange.indexOf(at);
      expect(i, `t=${at}`).toBeGreaterThan(-1);
      expect(f.outputRange[i]).toBeCloseTo(v, 12);
    }
    expect(f.inputRange.length).toBe(f.outputRange.length);
    for (let i = 1; i < f.inputRange.length; i += 1)
      expect(f.inputRange[i] ?? 0).toBeGreaterThan(f.inputRange[i - 1] ?? 0);
  });

  it('is sampled finely enough that the straight lines between samples read as the curve', () => {
    // every gap is at most one step, so the linear frame never strays far from the eased one
    for (let i = 1; i < f.inputRange.length; i += 1)
      expect((f.inputRange[i] ?? 0) - (f.inputRange[i - 1] ?? 0)).toBeLessThanOrEqual(
        1 / KEY_STEPS + 1e-9,
      );
    for (let s = 0; s <= 400; s += 1) {
      const t = s / 400;
      expect(Math.abs(sampleFrame(f, t) - keyValue(SWING, t)), `t=${t}`).toBeLessThan(0.2);
    }
  });

  it('is clamped unless asked otherwise, and a held value is still two ends', () => {
    expect(f.extrapolate).toBe('clamp');
    expect(keyFrame(SWING, 'extend').extrapolate).toBe('extend');
    const held = keyFrame([[0, 1]]);
    expect(held.inputRange).toEqual([0, 1]);
    expect(held.outputRange).toEqual([1, 1]);
  });
});

describe('reading a frame the way Animated does', () => {
  const f = { inputRange: [0, 1], outputRange: [0, 10], extrapolate: 'clamp' as const };

  it('is straight between its points, and clamped or extended past them', () => {
    expect(sampleFrame(f, 0.25)).toBeCloseTo(2.5, 12);
    expect(sampleFrame(f, 1.5)).toBe(10);
    expect(sampleFrame({ ...f, extrapolate: 'extend' }, 1.5)).toBeCloseTo(15, 12);
    expect(sampleFrame({ ...f, extrapolate: 'extend' }, -0.5)).toBeCloseTo(-5, 12);
  });
});
