/**
 * THE CONTAINERS CAN BE SEEN, THEIR MILK READ, AND THE CHOSEN ONE TOLD APART (`milkContainers.ts`,
 * `MilkContainerPicker`), in every theme and under every scheme — measured, never eyeballed
 * (docs/PREFLIGHT.md): a line is a graphic (3:1), a word is text (4.5:1), and the chosen tile is
 * told apart by a border AND a check, each of which is measured against what it sits on.
 */
import { describe, expect, it } from 'vitest';
import { AA_GRAPHIC, AA_TEXT, contrastRatio, parseColor } from './contrast';
import {
  MILK_CONTAINER_DARK,
  MILK_CONTAINER_LIGHT,
  MILK_CONTAINER_NIGHT,
  milkContainerPaintFor,
} from './milkContainers';
import { resolvePalette, schemes, themeNames, themes, type SchemeName } from './theme';

const SCHEMES = Object.keys(schemes) as SchemeName[];

describe('the container pictures, in every theme', () => {
  it.each(themeNames)('%s: every color is opaque, so it is measured as it lands', theme => {
    for (const c of Object.values(milkContainerPaintFor(theme))) expect(parseColor(c).a).toBe(1);
  });

  it('the line clears 3:1 on a tile at rest, on a chosen tile under every scheme, and on its glass', () => {
    for (const theme of themeNames) {
      const paint = milkContainerPaintFor(theme);
      for (const scheme of SCHEMES) {
        const p = resolvePalette(theme, scheme);
        for (const ground of [p.surfaceSolid, p.accentSoft])
          expect(contrastRatio(paint.line, ground), `${theme}/${scheme}`).toBeGreaterThanOrEqual(
            AA_GRAPHIC,
          );
      }
      expect(contrastRatio(paint.line, paint.glass), theme).toBeGreaterThanOrEqual(AA_GRAPHIC);
    }
  });

  it('the zip band, the cap and the lid keep their shape: by their outline, or by their own fill', () => {
    for (const theme of themeNames) {
      const paint = milkContainerPaintFor(theme);
      // in light the gold is pale and the ink outline carries it; in dark the gold IS the edge
      const byLine = contrastRatio(paint.line, paint.cap) >= AA_GRAPHIC;
      const byFill = SCHEMES.every(scheme => {
        const p = resolvePalette(theme, scheme);
        return [p.surfaceSolid, p.accentSoft].every(g => contrastRatio(paint.cap, g) >= AA_GRAPHIC);
      });
      expect(byLine || byFill, theme).toBe(true);
    }
  });

  it('the level reads: a 3:1 edge where the milk meets the empty glass', () => {
    for (const theme of themeNames) {
      const paint = milkContainerPaintFor(theme);
      // the line at the surface is drawn on the milk, so it is seen against it
      expect(contrastRatio(paint.surface, paint.milk), theme).toBeGreaterThanOrEqual(AA_GRAPHIC);
      const byFill = contrastRatio(paint.milk, paint.glass) >= AA_GRAPHIC;
      const byLine = contrastRatio(paint.surface, paint.glass) >= AA_GRAPHIC;
      expect(byFill || byLine, theme).toBe(true);
    }
  });

  it('the milk is milk in light and in dark; Night is the night palette’s roles, nothing lit', () => {
    expect(MILK_CONTAINER_LIGHT.milk).toBe(themes.light.milkSoft);
    expect(MILK_CONTAINER_DARK.milk).toBe(themes.light.milkSoft);
    const amber = themes.night;
    const roles = new Set(Object.values(amber));
    for (const c of Object.values(MILK_CONTAINER_NIGHT)) expect(roles.has(c), c).toBe(true);
  });
});

/**
 * THE CHOSEN TILE, NOT BY COLOR ALONE (CLAUDE.md §6): its ground turns `accentSoft`, and it takes an
 * accent border and a check. Each part is measured where it lands.
 */
describe('the chosen tile, under every scheme', () => {
  it('its word is text on either ground, and its border and check are graphics that clear 3:1', () => {
    for (const theme of themeNames)
      for (const scheme of SCHEMES) {
        const p = resolvePalette(theme, scheme);
        const at = `${theme}/${scheme}`;
        for (const ground of [p.surfaceSolid, p.accentSoft])
          expect(contrastRatio(p.text, ground), at).toBeGreaterThanOrEqual(AA_TEXT);
        // the border, against the sheet it sits on and the tile it rings
        expect(contrastRatio(p.accent, p.surfaceSolid), at).toBeGreaterThanOrEqual(AA_GRAPHIC);
        expect(contrastRatio(p.accent, p.accentSoft), at).toBeGreaterThanOrEqual(AA_GRAPHIC);
        // the check: its glyph on its disc
        expect(contrastRatio(p.onAccent, p.accent), at).toBeGreaterThanOrEqual(AA_GRAPHIC);
      }
  });
});
