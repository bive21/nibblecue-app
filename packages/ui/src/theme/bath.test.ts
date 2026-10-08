/**
 * THE BATH TOGGLE'S PICTURE, MEASURED (`bath.ts`; the owner, 2026-09-25). The words against the
 * wall they are written on, the ghost and the water's surface against the wall and the water, the
 * duck against both, and the foam that says "washed" at rest against both — every one a number
 * here, in every theme, measured as it lands where a color carries its own alpha.
 */
import { describe, expect, it } from 'vitest';
import {
  BATH_PICTURE,
  BATH_PICTURE_DARK,
  BATH_PICTURE_LIGHT,
  BATH_PICTURE_NIGHT,
  bathPictureFor,
  type BathPicture,
} from './bath';
import { AA_GRAPHIC, AA_TEXT, composite, contrastRatio, parseColor } from './contrast';
import { moduleDiscSwatch, themes, themeNames } from './theme';

const SETS: readonly [string, BathPicture][] = themeNames.map(n => [n, BATH_PICTURE[n]]);
/** The two grounds anything in the picture can sit on, the water as the lip leaves it. */
const grounds = (p: BathPicture): readonly string[] => [p.wall, composite(p.water, p.lip)];

describe('the words are text, written on the wall', () => {
  it.each(SETS)('%s: both words clear 4.5:1 on the wall, and the other one is quieter', (_, p) => {
    for (const ink of [p.word, p.quiet]) {
      expect(parseColor(ink).a).toBe(1);
      expect(contrastRatio(ink, p.wall)).toBeGreaterThanOrEqual(AA_TEXT);
    }
    expect(contrastRatio(p.quiet, p.wall)).toBeLessThan(contrastRatio(p.word, p.wall));
  });

  it('writes them in the theme’s own text pair, on the bath module’s own soft tint', () => {
    for (const name of themeNames) {
      const p = BATH_PICTURE[name];
      expect(p.word).toBe(themes[name].text);
      expect(p.quiet).toBe(themes[name].text2);
      expect(p.wall).toBe(themes[name].bathSoft);
    }
  });
});

describe('the marks can be seen', () => {
  it.each(SETS)('%s: the ghost clears 3:1 on the wall and on the water it floats on', (_, p) => {
    for (const ground of grounds(p))
      expect(contrastRatio(p.ghost, ground), ground).toBeGreaterThanOrEqual(AA_GRAPHIC);
  });

  it.each(SETS)('%s: the water’s surface clears 3:1 against the wall and the water', (_, p) => {
    for (const ground of [p.wall, p.water])
      expect(contrastRatio(p.line, ground), ground).toBeGreaterThanOrEqual(AA_GRAPHIC);
  });

  it.each(SETS)(
    '%s: the duck has a 3:1 edge on the wall and the water — body or outline',
    (_, p) => {
      for (const ground of grounds(p)) {
        const byBody = contrastRatio(p.duck, ground) >= AA_GRAPHIC;
        const byEdge = contrastRatio(p.duckEdge, ground) >= AA_GRAPHIC;
        expect(byBody || byEdge, ground).toBe(true);
      }
      // and its eye can be seen on it
      expect(contrastRatio(p.eye, p.duck)).toBeGreaterThanOrEqual(AA_GRAPHIC);
    },
  );

  it.each(SETS)('%s: a bubble has a 3:1 edge on the wall and the water — fill or rim', (_, p) => {
    // the foam is what says "washed" at rest; a rising bubble crosses the wall on its way out
    for (const ground of grounds(p)) {
      const landed = composite(ground, p.bubble);
      const byFill = contrastRatio(landed, ground) >= AA_GRAPHIC;
      const byRim = contrastRatio(p.bubbleEdge, ground) >= AA_GRAPHIC;
      expect(byFill || byRim, ground).toBe(true);
    }
  });
});

describe('one bath, in the theme it is painted in', () => {
  it('takes the water module’s blue for the water, and the owner’s gold for the duck', () => {
    for (const name of ['light', 'dark'] as const) {
      const p = BATH_PICTURE[name];
      expect(p.line).toBe(themes[name].cyan);
      expect(p.duck).toBe(moduleDiscSwatch.feed);
    }
    expect(BATH_PICTURE_DARK.water).toBe(themes.dark.cyanSoft);
    // in light, the pale tint alone would vanish into the wall: a little of the ink goes in
    expect(BATH_PICTURE_LIGHT.water).toBe(composite(themes.light.cyanSoft, themes.light.cyan, 0.1));
    expect(bathPictureFor('light')).toBe(BATH_PICTURE_LIGHT);
    expect(bathPictureFor('dark')).toBe(BATH_PICTURE_DARK);
    expect(bathPictureFor('night')).toBe(BATH_PICTURE_NIGHT);
  });

  it('draws the water over the duck’s keel as the water, only let through', () => {
    for (const p of [BATH_PICTURE_LIGHT, BATH_PICTURE_DARK, BATH_PICTURE_NIGHT]) {
      const lip = parseColor(p.lip);
      const water = parseColor(p.water);
      expect([lip.r, lip.g, lip.b]).toEqual([water.r, water.g, water.b]);
      expect(lip.a).toBeGreaterThan(0);
      expect(lip.a).toBeLessThan(1);
    }
  });
});

describe('the amber Night: its own roles, rims for foam, nothing lit', () => {
  const own = new Set(Object.values(themes.night).map(c => c.toLowerCase()));
  const p = BATH_PICTURE_NIGHT;
  const opaque = [
    p.wall,
    p.water,
    p.line,
    p.word,
    p.quiet,
    p.ghost,
    p.duck,
    p.duckEdge,
    p.beak,
    p.eye,
    p.bubbleEdge,
    p.ripple,
  ];

  it('draws the bath from the night palette’s roles, or a blend of two of them', () => {
    for (const c of opaque) expect(own.has(c.toLowerCase()), c).toBe(true);
    expect(p.wing).toBe(composite(themes.night.feed, themes.night.feedSoft, 0.3));
  });

  it('puts no blue anywhere (theme.ts usage rule 7)', () => {
    for (const c of [...opaque, p.wing]) {
      const { r, b } = parseColor(c);
      expect(b, c).toBeLessThanOrEqual(r);
    }
  });

  it('lights nothing: no highlight on the duck, and the foam is rims with no fill', () => {
    expect(p.shine).toBeNull();
    expect(parseColor(p.bubble).a).toBe(0);
  });
});
