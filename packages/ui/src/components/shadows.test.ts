import { describe, expect, it } from 'vitest';
import { parseColor } from '../theme/contrast';
import { SKINS, type Material } from '../theme/skins';
import { boxShadowFor, SHADOWS, shadowFor, type ShadowKind } from './shadows';

const HUE = '#7A3FBF';
const INK = '#1B1233';
const material = (shadow: Material['shadow']): Material => ({ ...SKINS.glass.surface, shadow });
const KINDS: ShadowKind[] = ['card', 'lift', 'hue'];

describe('shadows — one table, two forms', () => {
  it('has both forms for every kind a material can throw', () => {
    for (const kind of KINDS) {
      expect(SHADOWS[kind].native.elevation).toBeGreaterThan(0);
      expect(SHADOWS[kind].css.length).toBeGreaterThan(0);
    }
  });

  it('draws nothing in night, and nothing for a material without a shadow', () => {
    expect(shadowFor(material('hue'), HUE, true)).toEqual({});
    expect(boxShadowFor(material('hue'), HUE, true, INK)).toEqual({});
    expect(shadowFor(material('none'), HUE, false)).toEqual({});
    expect(boxShadowFor(material('none'), HUE, false, INK)).toEqual({});
  });

  it('native: iOS shadow* in the hue plus an Android elevation', () => {
    expect(shadowFor(material('hue'), HUE, false)).toEqual({
      shadowColor: HUE,
      shadowOpacity: 0.34,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 12 },
      elevation: 4,
    });
  });

  it('box-shadow: never an elevation, never an opaque layer, every layer painted below the box', () => {
    // THE RULE THIS FILE EXISTS FOR. An `elevation` under a translucent fill shows through it as
    // a band (the white box, the octagon); a box-shadow is painted outside the box only. So the
    // translucent form may never carry an elevation, and a shadow with an opaque color would be
    // a second border, not a shadow.
    for (const kind of KINDS) {
      const style = boxShadowFor(material(kind), HUE, false, INK);
      expect(style).not.toHaveProperty('elevation');
      expect(style).not.toHaveProperty('shadowOpacity');
      const layers = style.boxShadow;
      expect(Array.isArray(layers)).toBe(true);
      if (!Array.isArray(layers)) return;
      expect(layers.length).toBe(SHADOWS[kind].css.length);
      for (const layer of layers) {
        expect(layer.offsetX).toBe(0);
        expect(Number(layer.offsetY)).toBeGreaterThan(0);
        expect(Number(layer.blurRadius)).toBeGreaterThan(0);
        const a = parseColor(String(layer.color)).a;
        expect(a).toBeGreaterThan(0);
        expect(a).toBeLessThan(1);
      }
    }
  });

  it('box-shadow: the hue carries the lift and the ink carries the contact layer', () => {
    const style = boxShadowFor(material('hue'), HUE, false, INK);
    const layers = style.boxShadow;
    if (!Array.isArray(layers)) throw new Error('expected layers');
    const [lift, contact] = layers;
    const hue = parseColor(HUE);
    const ink = parseColor(INK);
    expect(parseColor(String(lift?.color))).toMatchObject({ r: hue.r, g: hue.g, b: hue.b });
    expect(parseColor(String(contact?.color))).toMatchObject({ r: ink.r, g: ink.g, b: ink.b });
    // the prototype's §22 lift, verbatim: 0 18px 34px -24px hue@44% (62% until 2026-09-29, when
    // the glass stopped showing its own lift through itself and what was left needed less)
    expect(lift).toMatchObject({ offsetY: 18, blurRadius: 34, spreadDistance: -24 });
    expect(parseColor(String(lift?.color)).a).toBeCloseTo(0.44, 5);
    expect(parseColor(String(contact?.color)).a).toBeCloseTo(0.12, 5);
  });

  it('box-shadow: the long, low shadow stays under the box — every layer is inset by its spread', () => {
    // a negative spread narrower than the blur is what makes the shadow read as a lift beneath
    // the card rather than a halo around it (§22 "long, low"); the contact layer is the one
    // exception and it is small
    for (const kind of KINDS) {
      for (const layer of SHADOWS[kind].css) {
        expect(layer.spread).toBeLessThanOrEqual(0);
        expect(layer.blur + layer.spread).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
