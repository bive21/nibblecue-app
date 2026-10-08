/**
 * WHAT A DIAPER HELD, IN ITS OWN COLORS, MEASURED (`diaperKinds.ts`; the owner, 2026-09-26: *"blue
 * for water drop, brown for the poo"*). The drop and the pile are glyphs — 3:1 against what they
 * are drawn on — and they are drawn on the report's card: the design's own surface, over the app's
 * ground, the page and paper, blurred and opaque, and over every point of the lit ground a panel
 * can float on. Every design × scheme × theme.
 *
 * FILLED SINCE 2026-09-27 (the owner: *"make the icon solid with color instead"*). A solid glyph is
 * the same ink over more of the card, and it is judged the same way: a graphic, at the non-text 3:1
 * bar, against every card it can sit on. The pile's grooves are the card showing through, so they
 * bring no new pair.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DEFAULT_APPEARANCE, PLUS_APPEARANCE, resolveAppearance, SCHEME_NAMES } from './appearance';
import { AA_GRAPHIC, composite, contrastRatio, luminance, parseColor } from './contrast';
import {
  DIAPER_GLYPH_INK_OF,
  DIAPER_GLYPH_NAMES,
  diaperGlyphInk,
  diaperGlyphInks,
  POO_BROWN,
  POO_LIFT_DARK,
  type DiaperGlyphName,
} from './diaperKinds';
import { groundComposites } from './ground';
import { materialBase, SKIN_NAMES, surfaceAlphaFor } from './skins';
import { STOOL_DOTS_LIGHT } from './stool';
import { themeNames, themes, type Palette, type ThemeName } from './theme';
import { DIAPER_KIND_GLYPHS, DIAPER_KIND_SOLID_GLYPHS, ICON_PATHS } from '../icons/paths';

const here = dirname(fileURLToPath(import.meta.url));

interface Case {
  at: string;
  theme: ThemeName;
  palette: Palette;
  /** Every card the report can be drawn on here, by name. */
  cards: [string, string][];
}

/** The report's card, everywhere it can be: the surface over each ground, blurred and not. */
function cases(): Case[] {
  const out: Case[] = [];
  for (const skin of SKIN_NAMES)
    for (const scheme of SCHEME_NAMES)
      for (const theme of themeNames) {
        const r = resolveAppearance(
          { ...DEFAULT_APPEARANCE, theme, scheme, skin },
          'light',
          PLUS_APPEARANCE,
        );
        const c = r.palette;
        const s = r.skinTokens;
        const grounds: [string, string][] = [
          ['app', c.app],
          ['page', c.page],
          ['paper', c.paper],
        ];
        // Blurred; at the no-blur alpha a phone without a blur paints; and opaque. The no-blur
        // alpha is the one number to move for Android's glass (skins.ts SURFACE_ALPHA_WITHOUT_BLUR,
        // 1 until 2026-09-29 and 0.76 since), anywhere between the declared alpha and 1, so these
        // inks are held at both ends of its range and never need re-tuning when it moves — the
        // dark lift below was measured at its opaque end.
        const alphas: [string, number][] = [
          ['', surfaceAlphaFor(s.surface, true)],
          [', no blur', surfaceAlphaFor(s.surface, false)],
          [', opaque', 1],
        ];
        const cards: [string, string][] = grounds.flatMap(([g, ground]) =>
          alphas.map(
            ([how, alpha]) =>
              [`on ${g}${how}`, composite(ground, materialBase(c, s.surface), alpha)] as [
                string,
                string,
              ],
          ),
        );
        // the lit ground's panels: over its busiest wash point and over each orb, at its peak and
        // half — as declared (`surfaceOn…`) and at the no-blur alpha, which lets the orbs through
        const lit = groundComposites(c, s);
        if (lit)
          for (const [k, v] of Object.entries(lit)) {
            if (k.startsWith('surfaceOn')) cards.push([`as ${k}`, v]);
            if (k === 'groundMotifMilk' || k.startsWith('orb'))
              cards.push([
                `no blur over ${k}`,
                composite(v, materialBase(c, s.surface), surfaceAlphaFor(s.surface, false)),
              ]);
          }
        out.push({ at: `${skin}/${scheme}/${theme}`, theme, palette: c, cards });
      }
  return out;
}

const CASES = cases();

/** The least a glyph clears across every card of one theme. */
const worst = (theme: ThemeName, name: DiaperGlyphName): number =>
  Math.min(
    ...CASES.filter(k => k.theme === theme).flatMap(k =>
      k.cards.map(([, card]) => contrastRatio(diaperGlyphInks(k.palette, theme)[name], card)),
    ),
  );

describe('the drop and the pile can be seen on the report’s card', () => {
  it('draws them solid: each filled in the ink it is stroked in', () => {
    for (const name of new Set(Object.values(DIAPER_KIND_SOLID_GLYPHS).flat())) {
      const def = ICON_PATHS[name];
      expect(def.fill, name).toBe('none');
      expect(def.strokeWidth, name).toBe(1.7);
      expect(
        def.elements.every(el => el.type === 'path' && el.fill === 'currentColor'),
        name,
      ).toBe(true);
    }
  });

  it('clears 3:1 for both filled glyphs, in every design, scheme and theme, on every card', () => {
    const failures: string[] = [];
    let checks = 0;
    for (const { at, theme, palette, cards } of CASES) {
      const inks = diaperGlyphInks(palette, theme);
      for (const name of DIAPER_GLYPH_NAMES)
        for (const [where, card] of cards) {
          checks += 1;
          const v = contrastRatio(inks[name], card);
          if (v < AA_GRAPHIC) failures.push(`${at}: ${name} ${where} = ${v.toFixed(2)}:1`);
        }
    }
    // 2 designs × 6 schemes × 3 themes, both glyphs, nine cards each and the lit ground's panels
    expect(checks).toBeGreaterThan(500);
    expect(failures).toEqual([]);
  });

  /**
   * THE ROOM IT WAS MEASURED WITH (2026-09-26), so a palette change that erodes it is seen before it
   * fails: at worst the drop 4.27:1 and the pile 4.99:1 on a light card, 6.38:1 and 4.39:1 on a
   * dark one, 5.70:1 and 7.09:1 in the amber Night.
   */
  it('keeps the room it was measured with', () => {
    expect(worst('light', 'drop')).toBeGreaterThanOrEqual(4.2);
    expect(worst('light', 'poo')).toBeGreaterThanOrEqual(4.9);
    expect(worst('dark', 'drop')).toBeGreaterThanOrEqual(6.3);
    expect(worst('dark', 'poo')).toBeGreaterThanOrEqual(4.3);
    expect(worst('night', 'drop')).toBeGreaterThanOrEqual(5.6);
    expect(worst('night', 'poo')).toBeGreaterThanOrEqual(7.0);
  });

  it('lifts the dark brown the least round step that clears 4:1 on every dark card, no further', () => {
    const darkCards = CASES.filter(k => k.theme === 'dark').flatMap(k => k.cards.map(([, c]) => c));
    const least = (lift: number) =>
      Math.min(...darkCards.map(c => contrastRatio(composite(POO_BROWN, '#FFFFFF', lift), c)));
    expect(least(POO_LIFT_DARK)).toBeGreaterThanOrEqual(4);
    expect(least(POO_LIFT_DARK - 0.05)).toBeLessThan(4);
    // and short of the stool rims' 0.45, which would read as a beige
    expect(POO_LIFT_DARK).toBeLessThan(0.45);
  });
});

describe('a blue drop and a brown pile', () => {
  it('draws the drop in the water’s own blue, the palette’s cyan, in every scheme', () => {
    for (const { palette, theme } of CASES) {
      const inks = diaperGlyphInks(palette, theme);
      expect(inks.drop).toBe(palette.cyan);
      // a scheme never moves it: it is the theme's cyan in all six
      expect(inks.drop).toBe(themes[theme].cyan);
    }
    for (const theme of ['light', 'dark'] as const) {
      const { r, b } = parseColor(themes[theme].cyan);
      expect(b, theme).toBeGreaterThan(r + 60);
    }
  });

  it('draws the pile in the diaper sheet’s own brown, lifted on a dark card and still a brown', () => {
    expect(POO_BROWN).toBe(STOOL_DOTS_LIGHT.brown.fill);
    expect(diaperGlyphInks(themes.light, 'light').poo).toBe(POO_BROWN);
    const dark = diaperGlyphInks(themes.dark, 'dark').poo;
    expect(dark).toBe(composite(POO_BROWN, '#FFFFFF', POO_LIFT_DARK));
    for (const brown of [POO_BROWN, dark]) {
      const { r, g, b } = parseColor(brown);
      // warm and earthy: red over green over blue, and far from a gray
      expect(r, brown).toBeGreaterThan(g);
      expect(g, brown).toBeGreaterThan(b);
      expect(r - b, brown).toBeGreaterThan(55);
    }
  });

  it('is the same two inks in every scheme and design of a theme', () => {
    for (const theme of themeNames) {
      const seen = new Set(
        CASES.filter(k => k.theme === theme).map(k =>
          JSON.stringify(diaperGlyphInks(k.palette, theme)),
        ),
      );
      expect(seen.size, theme).toBe(1);
    }
  });

  it('is never a status color: nothing good, a warning or an alarm', () => {
    const status = new Set(
      themeNames.flatMap(n => {
        const t = themes[n];
        return [t.good, t.warn, t.crit, t.dangerFill].map(c => c.toLowerCase());
      }),
    );
    for (const theme of themeNames)
      for (const ink of Object.values(diaperGlyphInks(themes[theme], theme)))
        expect(status.has(ink.toLowerCase()), `${theme} ${ink}`).toBe(false);
  });

  it('colors exactly the glyphs the report draws for a diaper, and no other', () => {
    // the report draws the solid pair (2026-09-27), each in the ink of what it is a picture of
    const drawn = new Set(Object.values(DIAPER_KIND_SOLID_GLYPHS).flat());
    expect([...drawn].sort()).toEqual([...DIAPER_GLYPH_INK_OF.keys()].sort());
    expect([...new Set(DIAPER_GLYPH_INK_OF.values())].sort()).toEqual(
      [...DIAPER_GLYPH_NAMES].sort(),
    );
    const inks = diaperGlyphInks(themes.light, 'light');
    expect(diaperGlyphInk(inks, 'drop-solid')).toBe(inks.drop);
    expect(diaperGlyphInk(inks, 'poo-solid')).toBe(inks.poo);
    // the same kinds as the outlines, in the same order: a mixed diaper is the pile then the drop
    expect(
      Object.fromEntries(
        Object.entries(DIAPER_KIND_SOLID_GLYPHS).map(([k, v]) => [
          k,
          v.map(n => DIAPER_GLYPH_INK_OF.get(n)),
        ]),
      ),
    ).toEqual(DIAPER_KIND_GLYPHS);
    // the outlines are Reports' day strip's, drawn in its own hue: no ink here, and anything else
    // the table might draw keeps the note's own quiet ink
    for (const other of ['drop', 'poo', 'bottle', 'arrowUp', 'toString'])
      expect(diaperGlyphInk(inks, other), other).toBeNull();
  });
});

describe('the amber Night keeps its own palette', () => {
  const night = themes.night;
  const inks = diaperGlyphInks(night, 'night');

  it('draws both from the night palette’s own roles: the water’s and the diaper figure’s', () => {
    expect(inks.drop).toBe(night.cyan);
    expect(inks.poo).toBe(night.diaper);
  });

  it('puts no blue anywhere (theme.ts usage rule 7), and nothing brighter than its words', () => {
    for (const ink of Object.values(inks)) {
      const { r, b } = parseColor(ink);
      expect(b, ink).toBeLessThanOrEqual(r);
      expect(luminance(ink), ink).toBeLessThanOrEqual(luminance(night.text));
    }
  });
});

describe('the report draws them (tripwires over StatTable.tsx)', () => {
  const table = readFileSync(join(here, '..', 'components', 'StatTable.tsx'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
    .replace(/\s+/g, ' ');

  it('reads the inks for the theme it is painted in, and colors each glyph by its own', () => {
    expect(table).toContain('const glyphInks = diaperGlyphInks(t.color, t.theme);');
    expect(table).toContain('color={diaperGlyphInk(glyphInks, name) ?? t.color.text2}');
  });
});
