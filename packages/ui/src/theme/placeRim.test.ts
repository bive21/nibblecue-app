/**
 * EVERY PLACE'S PICTURE, MEASURED (`placeRim.ts`; the owner, 2026-09-26: *"it should be on every
 * category"*). Frost's two are measured in `frost.test.ts`; this holds the counter's light, the
 * fridge's dew and thawing's meltwater to the same promise, and all five washes to it at once:
 * every word a card writes still reads over a picture's broad layer at its densest, the pictures
 * can be seen and never shout, the warm one is warm and the wet ones are cool, and Night draws a dim
 * rim of its own roles with nothing in it that shines. Numbers, because the eye is the instrument
 * this repository has learned not to trust for contrast (docs/PREFLIGHT.md).
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_APPEARANCE, PLUS_APPEARANCE, resolveAppearance, SCHEME_NAMES } from './appearance';
import { AA_GRAPHIC, AA_TEXT, composite, contrastRatio, parseColor } from './contrast';
import { FROST_WATER, splitAlpha } from './frost';
import { groundComposites } from './ground';
import {
  DEW_PALETTES,
  GLOW_PALETTES,
  GLOW_STOPS,
  MELT_PALETTES,
  MIST_STOPS,
  rimWash,
  SHEEN_STOPS,
  type WashStops,
} from './placeRim';
import type { PlaceKind } from './placeTones';
import { materialBase, SKIN_NAMES } from './skins';
import { themeNames, themes, type ThemeName } from './theme';

/**
 * Every ground a host's content can sit on, for one skin × scheme × theme — `frost.test.ts`'s own
 * list: the card's material over each page ground, the card drawn opaque, `surface2` (a pressed row,
 * the container sheet's head), and under glass the panel over the lit ground at its busiest points.
 */
function cardGrounds(theme: ThemeName, scheme: (typeof SCHEME_NAMES)[number], skin: string) {
  const r = resolveAppearance(
    { ...DEFAULT_APPEARANCE, theme, scheme, skin: skin as never },
    'light',
    PLUS_APPEARANCE,
  );
  const c = r.palette;
  const s = r.skinTokens;
  const panel = (under: string) => composite(under, materialBase(c, s.surface), s.surface.alpha);
  const grounds: Record<string, string> = {
    'card on app': panel(c.app),
    'card on page': panel(c.page),
    'card on paper': panel(c.paper),
    surfaceSolid: c.surfaceSolid,
    surface2: c.surface2,
  };
  const lit = groundComposites(c, s);
  if (lit)
    for (const [name, color] of Object.entries(lit))
      if (name.startsWith('surfaceOn')) grounds[name] = color;
  return { c, grounds };
}

const EVERY = SKIN_NAMES.flatMap(skin =>
  SCHEME_NAMES.flatMap(scheme => themeNames.map(theme => ({ skin, scheme, theme }))),
);
const LOOKS: readonly PlaceKind[] = ['ROOM', 'FRIDGE', 'FREEZER', 'DEEP_FREEZER', 'THAWED'];

/** What a card writes, and the floor each is held to (`frost.test.ts` has why these seven). */
const INKS = [
  ['text', AA_TEXT],
  ['text2', AA_TEXT],
  ['text3', AA_GRAPHIC],
  ['placeRoom', AA_GRAPHIC],
  ['placeFridge', AA_GRAPHIC],
  ['placeFreezer', AA_GRAPHIC],
  ['placeDeep', AA_GRAPHIC],
] as const;

/** Every small piece of the three pictures, by theme: what is drawn, and whether it may be null. */
const pieces = (theme: ThemeName): [string, string | null][] => {
  const d = DEW_PALETTES[theme];
  const g = GLOW_PALETTES[theme];
  const m = MELT_PALETTES[theme];
  return [
    ['dew bead', d.bead],
    ['dew track', d.trail],
    ['light shaft', g.ray],
    ['light mote', g.mote],
    ['meltwater drop', m.drop],
    ['meltwater bead', m.bead],
  ];
};

describe('everything written on a card still reads over every picture at its densest', () => {
  /*
    The pictures are drawn in a host's padding, beside its words (`placeRim.ts` proves that
    geometry, and the app proves its cards' own), and this does not lean on it: over each wash where
    it is THICKEST — its full color, on the edge — every ink still clears its floor, on every
    ground, in every skin × scheme × theme. So a word that grew into the padding at the largest text
    size, or a caller that put a picture somewhere tighter, would still be read.
  */
  it('holds every ink to its floor over all five washes, 54 appearances × every card ground', () => {
    const failures: string[] = [];
    let checks = 0;
    for (const { skin, scheme, theme } of EVERY) {
      const { c, grounds } = cardGrounds(theme, scheme, skin);
      for (const look of LOOKS) {
        const wash = rimWash(look, theme).color;
        for (const [name, ground] of Object.entries(grounds)) {
          const washed = composite(ground, wash);
          for (const [ink, floor] of INKS) {
            checks += 1;
            const v = contrastRatio(c[ink], washed);
            if (v < floor)
              failures.push(
                `${skin}/${scheme}/${theme}: ${ink} over the ${look} wash on ${name} = ${v.toFixed(2)}`,
              );
          }
        }
      }
    }
    expect(checks).toBeGreaterThan(10_000);
    expect(failures).toEqual([]);
  });

  it('and every wash is densest on the edge: nothing of it is thicker anywhere else', () => {
    const stops: [string, WashStops][] = [
      ['mist', MIST_STOPS],
      ['glow', GLOW_STOPS],
      ['sheen', SHEEN_STOPS],
      ...LOOKS.map((look): [string, WashStops] => [look, rimWash(look, 'light').stops]),
    ];
    for (const [name, s] of stops) {
      expect(s[0], name).toEqual([0, 1]);
      expect(s[s.length - 1], name).toEqual([1, 0]);
      for (let i = 1; i < s.length; i += 1) {
        expect(s[i]![0], name).toBeGreaterThan(s[i - 1]![0]);
        expect(s[i]![1], name).toBeLessThan(s[i - 1]![1]);
      }
    }
  });
});

describe('the pictures can be seen, and never louder than a word', () => {
  const each = (
    fn: (c: typeof themes.light, ground: string, theme: ThemeName, at: string) => void,
  ) => {
    for (const { skin, scheme, theme } of EVERY) {
      const { c, grounds } = cardGrounds(theme, scheme, skin);
      for (const [name, ground] of Object.entries(grounds))
        fn(c, ground, theme, `${skin}/${scheme}/${theme} ${name}`);
    }
  };

  it('draws a wash that is there to see on every card ground, in light and dark', () => {
    const wrong: string[] = [];
    each((_c, ground, theme, at) => {
      if (theme === 'night') return;
      for (const look of ['ROOM', 'FRIDGE', 'THAWED'] as const) {
        const v = contrastRatio(composite(ground, rimWash(look, theme).color), ground);
        if (v < 1.1) wrong.push(`${at} ${look} ${v.toFixed(3)}`);
      }
    });
    expect(wrong).toEqual([]);
  });

  it('draws beads, drops, shafts and motes that carry their shape, quieter than `text2` beside them', () => {
    const wrong: string[] = [];
    each((c, ground, theme, at) => {
      for (const [name, color] of pieces(theme)) {
        if (color === null) continue;
        const v = contrastRatio(composite(ground, color), ground);
        // a wet track is a line a drop left, meant to be faint; everything else is a shape to see
        if (v < (name === 'dew track' ? 1.25 : 1.4))
          wrong.push(`${at} ${name} faint ${v.toFixed(2)}`);
        if (!(v < contrastRatio(c.text2, ground))) wrong.push(`${at} ${name} loud ${v.toFixed(2)}`);
      }
    });
    expect(wrong).toEqual([]);
  });

  it('draws the counter warm and the water cool, in light and dark', () => {
    for (const theme of ['light', 'dark'] as const) {
      const warm = GLOW_PALETTES[theme];
      for (const color of [warm.glow, warm.ray, warm.mote]) {
        const { r, b } = parseColor(color ?? '');
        expect(r, `${theme} ${color}`).toBeGreaterThan(b);
      }
      const dew = DEW_PALETTES[theme];
      const melt = MELT_PALETTES[theme];
      for (const color of [dew.mist, dew.bead, dew.trail, melt.sheen, melt.drop, melt.bead]) {
        const { r, b } = parseColor(color);
        expect(b, `${theme} ${color}`).toBeGreaterThan(r);
      }
    }
  });

  it('keeps each wash quieter than frost’s glaze: a mist, a glow and a sheen are films, not ice', () => {
    each((_c, ground, theme, at) => {
      if (theme === 'night') return;
      const off = (color: string) => contrastRatio(composite(ground, color), ground);
      const glaze = off(rimWash('FREEZER', theme).color);
      for (const look of ['ROOM', 'FRIDGE', 'THAWED'] as const)
        expect(off(rimWash(look, theme).color), `${at} ${look}`).toBeLessThanOrEqual(glaze + 0.02);
    });
  });
});

describe('thawing is the frost’s own water', () => {
  it('rests the very drops, glints and lines a thaw ran, so its last frame is this picture', () => {
    for (const theme of ['light', 'dark'] as const) {
      const melt = MELT_PALETTES[theme];
      expect(melt.drop).toBe(FROST_WATER[theme].drop);
      expect(melt.dropGlint).toBe(FROST_WATER[theme].dropGlint);
      expect(melt.trail).toBe(FROST_WATER[theme].trail);
    }
  });
});

describe('Night: a dim rim in the night palette’s own roles, and nothing that shines', () => {
  const own = new Set(Object.values(themes.night).map(c => splitAlpha(c).rgb.toLowerCase()));

  it('has no highlight, no glint and no sunbeam at all — the counter keeps its rim, not its light', () => {
    expect(DEW_PALETTES.night.highlight).toBeNull();
    expect(MELT_PALETTES.night.highlight).toBeNull();
    expect(MELT_PALETTES.night.dropGlint).toBeNull();
    expect(GLOW_PALETTES.night.ray).toBeNull();
    expect(GLOW_PALETTES.night.mote).toBeNull();
    // and light and dark have every one of them
    for (const theme of ['light', 'dark'] as const) {
      expect(DEW_PALETTES[theme].highlight).not.toBeNull();
      expect(GLOW_PALETTES[theme].ray).not.toBeNull();
      expect(GLOW_PALETTES[theme].mote).not.toBeNull();
      expect(MELT_PALETTES[theme].dropGlint).not.toBeNull();
    }
  });

  it('builds every color from a night role at a fraction, and puts no blue in any', () => {
    const night: string[] = [
      ...Object.values(DEW_PALETTES.night),
      ...Object.values(GLOW_PALETTES.night),
      ...Object.values(MELT_PALETTES.night),
    ].filter((x): x is string => typeof x === 'string');
    expect(night.length).toBeGreaterThanOrEqual(8);
    for (const color of night) {
      const { rgb, alpha } = splitAlpha(color);
      expect(own.has(rgb.toLowerCase()), color).toBe(true);
      expect(alpha, color).toBeLessThan(1);
      const { r, b } = parseColor(color);
      expect(b, color).toBeLessThanOrEqual(r);
    }
  });

  it('stays dim: every wash barely off the card, every piece under the quietest word', () => {
    for (const scheme of SCHEME_NAMES)
      for (const skin of SKIN_NAMES) {
        const { c, grounds } = cardGrounds('night', scheme, skin);
        for (const [name, ground] of Object.entries(grounds)) {
          const at = `${skin}/${scheme} ${name}`;
          for (const look of LOOKS)
            expect(
              contrastRatio(composite(ground, rimWash(look, 'night').color), ground),
              `${at} ${look}`,
            ).toBeLessThanOrEqual(1.35);
          for (const [piece, color] of pieces('night')) {
            if (color === null) continue;
            const v = contrastRatio(composite(ground, color), ground);
            expect(v, `${at} ${piece}`).toBeLessThanOrEqual(2.5);
            expect(v, `${at} ${piece}`).toBeLessThan(contrastRatio(c.text3, ground));
          }
        }
      }
  });
});

describe('each picture follows the theme it is painted in', () => {
  it('has one set per theme, and a wash for every place in each', () => {
    for (const set of [DEW_PALETTES, GLOW_PALETTES, MELT_PALETTES])
      expect(new Set(themeNames.map(t => set[t])).size).toBe(3);
    for (const theme of themeNames) {
      expect(rimWash('ROOM', theme)).toEqual({
        color: GLOW_PALETTES[theme].glow,
        stops: GLOW_STOPS,
      });
      expect(rimWash('FRIDGE', theme)).toEqual({
        color: DEW_PALETTES[theme].mist,
        stops: MIST_STOPS,
      });
      expect(rimWash('THAWED', theme)).toEqual({
        color: MELT_PALETTES[theme].sheen,
        stops: SHEEN_STOPS,
      });
    }
  });

  it('splits every wash into the opaque ink and alpha a gradient stop takes, losing nothing', () => {
    for (const theme of themeNames)
      for (const look of LOOKS) {
        const { color } = rimWash(look, theme);
        const { rgb, alpha } = splitAlpha(color);
        expect(rgb).toMatch(/^#[0-9A-F]{6}$/);
        for (const ground of ['#FFFFFF', '#000000', themes[theme].surfaceSolid])
          expect(composite(ground, rgb, alpha)).toBe(composite(ground, color));
      }
  });
});
