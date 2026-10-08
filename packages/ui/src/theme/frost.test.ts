/**
 * FROST, MEASURED (`frost.ts`; the owner, 2026-09-25). A pretty rime can still cost a word its
 * contrast, and the eye is the instrument this repository has learned not to trust for that
 * (docs/PREFLIGHT.md): so what every ink a card writes measures over the frost, how visible the
 * frost itself is, and what night mode is allowed to draw are all numbers here.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_APPEARANCE, PLUS_APPEARANCE, resolveAppearance, SCHEME_NAMES } from './appearance';
import { AA_GRAPHIC, AA_TEXT, composite, contrastRatio, parseColor } from './contrast';
import {
  DEEP_FROST_PALETTES,
  deepFrostFor,
  FROST_PALETTES,
  FROST_WATER,
  frostFor,
  GLAZE_STOPS,
  glazeStrength,
  splitAlpha,
  type FrostPalette,
} from './frost';
import { groundComposites } from './ground';
import { materialBase, SKIN_NAMES } from './skins';
import { themeNames, themes, type ThemeName } from './theme';

/**
 * Every ground a frosted host's content can sit on, for one skin × scheme × theme: the card's
 * material over each page ground a screen can have (the stash is drawn on the paper ground), the
 * card where the platform draws it opaque (`surfaceSolid`), the `surface2` a pressed row and the
 * container sheet's head are filled with, and — under glass — the panel over the lit ground at its
 * busiest points, orbs and all.
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

/**
 * What a card writes, and the floor each is held to: words at 4.5:1, and the marks — `text3`'s
 * chevron and the four places' dots — at WCAG's 3:1 for a graphic that carries meaning.
 */
const INKS = [
  ['text', AA_TEXT],
  ['text2', AA_TEXT],
  ['text3', AA_GRAPHIC],
  ['placeRoom', AA_GRAPHIC],
  ['placeFridge', AA_GRAPHIC],
  ['placeFreezer', AA_GRAPHIC],
  ['placeDeep', AA_GRAPHIC],
] as const;

describe('everything written on the card still reads over the frost at its densest', () => {
  /*
    The frost is drawn in the host's padding, beside its words (`frostRim.ts` proves that). This
    does not lean on it: over the glaze where it is THICKEST — its full color, at the very edge —
    every ink still clears its floor, on every ground, in every skin × scheme × theme. So a word
    that grew into the padding at the largest text size would still be read.
  */
  it('holds every ink to its floor over the glaze, both frosts, 54 appearances × every ground', () => {
    const failures: string[] = [];
    let checks = 0;
    for (const { skin, scheme, theme } of EVERY) {
      const { c, grounds } = cardGrounds(theme, scheme, skin);
      for (const [frost, glaze] of [
        ['freezer', frostFor(theme).glaze],
        ['deep freezer', deepFrostFor(theme).glaze],
      ] as const)
        for (const [name, ground] of Object.entries(grounds)) {
          const frosted = composite(ground, glaze);
          for (const [ink, floor] of INKS) {
            checks += 1;
            const v = contrastRatio(c[ink], frosted);
            if (v < floor)
              failures.push(
                `${skin}/${scheme}/${theme}: ${ink} on ${frost} frost over ${name} = ${v.toFixed(2)}`,
              );
          }
        }
    }
    expect(checks).toBeGreaterThan(4000);
    expect(failures).toEqual([]);
  });

  it('and the glaze is its densest at the edge: nothing of it is thicker anywhere else', () => {
    // the stops start at full strength and only fall, so "the glaze's own color" IS the worst case
    expect(GLAZE_STOPS[0]).toEqual([0, 1]);
    for (let i = 1; i < GLAZE_STOPS.length; i += 1) {
      const [x0, y0] = GLAZE_STOPS[i - 1] ?? [0, 1];
      const [x1, y1] = GLAZE_STOPS[i] ?? [1, 0];
      expect(x1).toBeGreaterThan(x0);
      expect(y1).toBeLessThan(y0);
    }
    expect(GLAZE_STOPS[GLAZE_STOPS.length - 1]).toEqual([1, 0]);
    for (let d = 0; d <= 1; d += 0.01) expect(glazeStrength(d)).toBeLessThanOrEqual(1);
  });
});

describe('the frost can be seen, and never louder than a word', () => {
  const each = (
    fn: (p: FrostPalette, c: typeof themes.light, ground: string, at: string) => void,
  ) => {
    for (const { skin, scheme, theme } of EVERY) {
      const { c, grounds } = cardGrounds(theme, scheme, skin);
      for (const [name, ground] of Object.entries(grounds)) {
        fn(frostFor(theme), c, ground, `${skin}/${scheme}/${theme} ${name}`);
        fn(deepFrostFor(theme), c, ground, `deep ${skin}/${scheme}/${theme} ${name}`);
      }
    }
  };

  it('draws a glaze that is there to see, on every card ground', () => {
    each((p, _c, ground, at) => {
      expect(contrastRatio(composite(ground, p.glaze), ground), at).toBeGreaterThanOrEqual(1.15);
    });
  });

  it('draws ferns that carry their shape, and stay quieter than the quietest word beside them', () => {
    each((p, c, ground, at) => {
      const fern = contrastRatio(composite(ground, p.fern), ground);
      expect(fern, at).toBeGreaterThanOrEqual(1.5);
      // frost is a picture, not a word: never as loud as `text2` on the same card
      expect(fern, at).toBeLessThan(contrastRatio(c.text2, ground));
    });
  });

  it('shows a glint where one is drawn: on the glaze it sits on', () => {
    each((p, _c, ground, at) => {
      if (p.sparkle === null) return;
      const glazed = composite(ground, p.glaze);
      expect(contrastRatio(composite(glazed, p.sparkle), glazed), at).toBeGreaterThanOrEqual(1.4);
    });
  });

  it('draws droplets that can be seen running down the card', () => {
    each((p, _c, ground, at) => {
      if (p.drop === null) return;
      expect(contrastRatio(composite(ground, p.drop), ground), at).toBeGreaterThanOrEqual(1.4);
    });
  });

  it('draws ice as ice in light and dark: every color of it is cool', () => {
    for (const theme of ['light', 'dark'] as const)
      for (const p of [FROST_PALETTES[theme], DEEP_FROST_PALETTES[theme]])
        for (const color of [p.glaze, p.fern, p.drop, p.trail]) {
          const { r, b } = parseColor(color ?? '');
          expect(b, `${theme} ${color}`).toBeGreaterThan(r);
        }
  });
});

/**
 * A DEEP FREEZER'S FROST IS HEAVIER AND BLUER (the owner, 2026-09-26), and both words are held as
 * measurements rather than as a description of two hexes: on every card ground it stands further
 * off the card than a freezer's, its ferns are drawn deeper, and its blue leads its red by more.
 */
describe('a deep freezer’s frost is heavier and bluer than a freezer’s', () => {
  it('stands further off every card ground, rim and ferns, in light and dark', () => {
    const wrong: string[] = [];
    for (const { skin, scheme, theme } of EVERY) {
      if (theme === 'night') continue;
      const { grounds } = cardGrounds(theme, scheme, skin);
      const [f, d] = [frostFor(theme), deepFrostFor(theme)];
      for (const [name, ground] of Object.entries(grounds)) {
        const off = (color: string) => contrastRatio(composite(ground, color), ground);
        if (!(off(d.glaze) > off(f.glaze))) wrong.push(`${skin}/${scheme}/${theme} ${name}: rim`);
        if (!(off(d.fern) > off(f.fern) - 0.05))
          wrong.push(`${skin}/${scheme}/${theme} ${name}: ferns`);
      }
    }
    expect(wrong).toEqual([]);
  });

  it('is bluer: its rim’s blue leads its red by more than a freezer’s', () => {
    for (const theme of ['light', 'dark'] as const) {
      const lead = (color: string) => {
        const { r, b } = parseColor(color);
        return b - r;
      };
      expect(lead(DEEP_FROST_PALETTES[theme].glaze)).toBeGreaterThan(
        lead(FROST_PALETTES[theme].glaze),
      );
    }
  });

  it('melts into the same water: a drop, its glint and its line are one set in both frosts', () => {
    for (const theme of ['light', 'dark'] as const)
      for (const p of [FROST_PALETTES[theme], DEEP_FROST_PALETTES[theme]]) {
        expect(p.drop).toBe(FROST_WATER[theme].drop);
        expect(p.dropGlint).toBe(FROST_WATER[theme].dropGlint);
        expect(p.trail).toBe(FROST_WATER[theme].trail);
      }
  });
});

describe('night: a still rim in the night palette’s own roles, and nothing that shines', () => {
  const nights = [frostFor('night'), deepFrostFor('night')];
  const own = new Set(Object.values(themes.night).map(c => splitAlpha(c).rgb.toLowerCase()));

  it('draws no glint and no droplet at all', () => {
    for (const night of nights) {
      expect(night.sparkle).toBeNull();
      expect(night.drop).toBeNull();
      expect(night.dropGlint).toBeNull();
      expect(night.trail).toBeNull();
    }
  });

  it('builds the rim and the ferns from a night role at a fraction, and puts no blue in either', () => {
    // theme.ts usage rule 7: night "drops blue entirely", and ice is blue
    for (const night of nights)
      for (const color of [night.glaze, night.fern]) {
        const { rgb, alpha } = splitAlpha(color);
        expect(own.has(rgb.toLowerCase()), color).toBe(true);
        expect(alpha).toBeLessThan(1);
        const { r, b } = parseColor(color);
        expect(b, color).toBeLessThanOrEqual(r);
      }
  });

  it('stays dim: the rim barely off the card, and the ferns under a third of the way to a word', () => {
    for (const night of nights)
      for (const scheme of SCHEME_NAMES)
        for (const skin of SKIN_NAMES) {
          const { c, grounds } = cardGrounds('night', scheme, skin);
          for (const [name, ground] of Object.entries(grounds)) {
            const at = `${skin}/${scheme} ${name}`;
            expect(contrastRatio(composite(ground, night.glaze), ground), at).toBeLessThanOrEqual(
              1.35,
            );
            const fern = contrastRatio(composite(ground, night.fern), ground);
            expect(fern, at).toBeLessThanOrEqual(2.5);
            expect(fern, at).toBeLessThan(contrastRatio(c.text3, ground));
          }
        }
  });
});

describe('the frost follows the theme it is painted in', () => {
  it('has one set per theme, and hands back the painted one', () => {
    for (const theme of themeNames) {
      expect(frostFor(theme)).toBe(FROST_PALETTES[theme]);
      expect(deepFrostFor(theme)).toBe(DEEP_FROST_PALETTES[theme]);
    }
    expect(new Set(themeNames.map(t => frostFor(t))).size).toBe(3);
    expect(new Set(themeNames.map(t => deepFrostFor(t))).size).toBe(3);
  });

  it('splits a color into the opaque ink and alpha a gradient stop takes, losing nothing', () => {
    for (const theme of themeNames) {
      const { glaze } = FROST_PALETTES[theme];
      const { rgb, alpha } = splitAlpha(glaze);
      expect(rgb).toMatch(/^#[0-9A-F]{6}$/);
      for (const ground of ['#FFFFFF', '#000000', themes[theme].surfaceSolid])
        expect(composite(ground, rgb, alpha)).toBe(composite(ground, glaze));
    }
  });

  it('reads the glaze’s profile the drawing reads: full at the edge, gone at its reach', () => {
    expect(glazeStrength(0)).toBe(1);
    expect(glazeStrength(1)).toBe(0);
    for (const [offset, strength] of GLAZE_STOPS)
      expect(glazeStrength(offset)).toBeCloseTo(strength, 10);
    for (let d = 0.01; d <= 1; d += 0.01)
      expect(glazeStrength(d)).toBeLessThanOrEqual(glazeStrength(d - 0.01));
  });
});
