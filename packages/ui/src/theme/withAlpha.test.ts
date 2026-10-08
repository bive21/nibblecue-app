import { describe, expect, it } from 'vitest';
import { parseColor, withAlpha } from './contrast';

describe('withAlpha — the alpha lives in the color, not in an opacity prop', () => {
  it('produces an rgba string carrying the alpha', () => {
    expect(withAlpha('rgb(255,255,255)', 0.5)).toBe('rgba(255,255,255,0.5)');
  });

  it('multiplies an existing alpha, which is what opacity on that color would have meant', () => {
    // surface is rgba(...,0.86); the glass skin drew it at opacity 0.52
    const out = parseColor(withAlpha('rgba(255,255,255,0.86)', 0.52));
    expect(out.a).toBeCloseTo(0.86 * 0.52, 6);
  });

  it('clamps to [0, 1] rather than emitting an invalid alpha', () => {
    expect(parseColor(withAlpha('rgb(0,0,0)', 2)).a).toBe(1);
    expect(parseColor(withAlpha('rgb(0,0,0)', -1)).a).toBe(0);
  });

  it('is a fixed point at alpha 1', () => {
    expect(parseColor(withAlpha('rgb(10,20,30)', 1))).toEqual({ r: 10, g: 20, b: 30, a: 1 });
  });

  it('round-trips through parseColor', () => {
    const c = parseColor(withAlpha('rgb(90,70,220)', 0.55));
    expect(c).toMatchObject({ r: 90, g: 70, b: 220 });
    expect(c.a).toBeCloseTo(0.55, 6);
  });
});
