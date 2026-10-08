/**
 * THE NIGHT LIGHT'S COLORS, MEASURED (`nightLight.ts`; the owner, 2026-09-25). A night light is a
 * promise about a dark room: warm, dim, never the white of a lit screen. So the heart of the light
 * — the brightest pixel it has — is measured at every level a drag or an accessibility step can
 * reach, and the one line of words at its foot is measured on the ground it sits on.
 */
import { describe, expect, it } from 'vitest';
import { AA_TEXT, contrastRatio, luminance, parseColor } from './contrast';
import {
  NIGHT_LIGHT,
  NIGHT_LIGHT_AMBER,
  NIGHT_LIGHT_CEILING,
  nightLightCore,
  nightLightFor,
  warmthOf,
  type NightLightScene,
} from './nightLight';
import { composite } from './contrast';
import { themes } from './theme';

const SETS: readonly [string, NightLightScene][] = [
  ['light and dark', NIGHT_LIGHT],
  ['amber night', NIGHT_LIGHT_AMBER],
];
/** Every hundredth of the range, and past both ends, which the clamp has to hold too. */
const LEVELS = [-1, -0.01, ...Array.from({ length: 101 }, (_, i) => i / 100), 1.01, 2, Number.NaN];

describe('it never goes blue-white, and never white', () => {
  it.each(SETS)('%s: the heart stays warm and under the ceiling at every level', (_, scene) => {
    for (const level of LEVELS) {
      const core = nightLightCore(scene, level);
      const warmth = warmthOf(core);
      expect(warmth.blueOverRed, `${level} ${core}`).toBeLessThanOrEqual(
        NIGHT_LIGHT_CEILING.blueOverRed,
      );
      expect(warmth.greenOverRed, `${level} ${core}`).toBeLessThanOrEqual(
        NIGHT_LIGHT_CEILING.greenOverRed,
      );
      expect(luminance(core), `${level} ${core}`).toBeLessThanOrEqual(
        NIGHT_LIGHT_CEILING.luminance,
      );
    }
  });

  it.each(SETS)('%s: the heart is the brightest pixel the light has', (_, scene) => {
    // each halo is darker than its core and only ever fades toward the ground
    for (const glow of [scene.dim, scene.bright])
      expect(luminance(glow.halo)).toBeLessThan(luminance(glow.core));
    expect(luminance(scene.ground)).toBeLessThan(luminance(scene.dim.halo));
  });

  it('is a long way from white even at its brightest', () => {
    for (const [, scene] of SETS) {
      const top = nightLightCore(scene, 1);
      expect(contrastRatio(top, '#FFFFFF')).toBeGreaterThan(1.5);
    }
  });
});

describe('the level does what the finger says', () => {
  it.each(SETS)('%s: brighter at every step up, never dimmer', (_, scene) => {
    let last = -1;
    for (let i = 0; i <= 100; i += 1) {
      const l = luminance(nightLightCore(scene, i / 100));
      expect(l, `${i}%`).toBeGreaterThanOrEqual(last);
      last = l;
    }
  });

  it.each(SETS)('%s: more golden at the top than at the bottom, an ember below', (_, scene) => {
    // "bright/warm": the ember is red-orange and the top of the range gold. Measured at the ends
    // and the middle rather than per step, because each step is rounded to a whole channel value
    // and a hundredth of the range moves the ratio less than that rounding does
    const gold = (level: number) => warmthOf(nightLightCore(scene, level)).greenOverRed;
    expect(gold(1)).toBeGreaterThan(gold(0));
    expect(gold(0.5)).toBeGreaterThan(gold(0) - 0.01);
    expect(gold(0.5)).toBeLessThan(gold(1) + 0.01);
  });

  it.each(SETS)('%s: the dimmest ember is still a light you can see by', (_, scene) => {
    expect(contrastRatio(nightLightCore(scene, 0), scene.ground)).toBeGreaterThanOrEqual(2);
    // and the ground is a dark room, not a gray one
    expect(luminance(scene.ground)).toBeLessThan(0.005);
  });

  it('holds a level past either end to that end', () => {
    for (const [, scene] of SETS) {
      expect(nightLightCore(scene, -3)).toBe(nightLightCore(scene, 0));
      expect(nightLightCore(scene, 7)).toBe(nightLightCore(scene, 1));
    }
  });
});

describe('the one line of words', () => {
  it.each(SETS)('%s: clears 4.5:1 on the ground it sits on', (_, scene) => {
    expect(parseColor(scene.hint).a).toBe(1);
    expect(contrastRatio(scene.hint, scene.ground)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it.each(SETS)('%s: is quieter than the light itself at its dimmest', (_, scene) => {
    // the words are for the first look; the light is the thing in the room
    expect(luminance(scene.hint)).toBeGreaterThan(luminance(scene.dim.core));
    expect(luminance(scene.hint)).toBeLessThan(luminance(nightLightCore(scene, 1)));
  });
});

describe('amber night: the night palette’s own light', () => {
  const own = new Set(Object.values(themes.night).map(c => c.toLowerCase()));
  const n = themes.night;

  it('builds every color from the night palette’s roles, or a blend of two of them', () => {
    const s = NIGHT_LIGHT_AMBER;
    for (const c of [s.ground, s.bright.core, s.bright.halo, s.hint])
      expect(own.has(c.toLowerCase()), c).toBe(true);
    expect(s.dim.core).toBe(composite(n.page, n.accent, 0.4));
    expect(s.dim.halo).toBe(composite(n.page, n.accent, 0.12));
  });

  it('is drawn when the app is painted night, and the plain light everywhere else', () => {
    expect(nightLightFor('night')).toBe(NIGHT_LIGHT_AMBER);
    expect(nightLightFor('light')).toBe(NIGHT_LIGHT);
    expect(nightLightFor('dark')).toBe(NIGHT_LIGHT);
  });

  it('puts no blue in either light, anywhere (theme.ts usage rule 7)', () => {
    for (const [, s] of SETS)
      for (const c of [s.ground, s.dim.core, s.dim.halo, s.bright.core, s.bright.halo, s.hint]) {
        const { r, b } = parseColor(c);
        expect(b, c).toBeLessThan(r);
      }
  });
});
