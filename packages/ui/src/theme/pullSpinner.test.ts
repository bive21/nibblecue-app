/**
 * THE REFRESH SPINNER'S COLORS, MEASURED (`pullSpinner.ts`). The spinner says "working", which is a
 * graphic a parent has to see (WCAG 1.4.11, 3:1): on Android's own disc, and on everything a page
 * can be under iOS's — the paper, the doodle pattern and the lit ground of every skin — in all six
 * schemes and all three themes.
 */
import { describe, expect, it } from 'vitest';
import { AA_GRAPHIC, contrastRatio, parseColor } from './contrast';
import { groundComposites, patternComposites } from './ground';
import { pullSpinnerColors } from './pullSpinner';
import { SKINS, skinForTheme, type SkinName } from './skins';
import { resolvePalette, schemes, themeNames, themes, type SchemeName } from './theme';

const SCHEMES = Object.keys(schemes) as SchemeName[];
const SKIN_NAMES = Object.keys(SKINS) as SkinName[];

describe('the refresh spinner', () => {
  it('reads on its disc and on every ground a page can put under it, at 3:1', () => {
    for (const theme of themeNames)
      for (const scheme of SCHEMES) {
        const p = resolvePalette(theme, scheme);
        const c = pullSpinnerColors(p, theme);
        const at = `${theme}/${scheme}`;
        expect(contrastRatio(c.ink, c.disc), `${at} on the disc`).toBeGreaterThanOrEqual(
          AA_GRAPHIC,
        );
        for (const skin of SKIN_NAMES) {
          const tokens = skinForTheme(SKINS[skin], theme);
          const grounds = [
            p.paper,
            ...Object.values(patternComposites(p, tokens, theme) ?? {}),
            ...Object.values(groundComposites(p, tokens) ?? {}),
          ];
          for (const g of grounds)
            expect(contrastRatio(c.ink, g), `${at}/${skin} on ${g}`).toBeGreaterThanOrEqual(
              AA_GRAPHIC,
            );
        }
      }
  });

  it('is opaque, and in the amber Night warm and never the scheme’s accent', () => {
    for (const scheme of SCHEMES) {
      const p = resolvePalette('night', scheme);
      const c = pullSpinnerColors(p, 'night');
      expect(c.ink).toBe(themes.night.text2);
      expect(c.ink).not.toBe(p.accent2);
      const { r, b, a } = parseColor(c.ink);
      expect(b).toBeLessThanOrEqual(r);
      expect(a).toBe(1);
    }
  });

  it('is the tab bar’s current-tab ink by day and in dark', () => {
    for (const theme of ['light', 'dark'] as const)
      for (const scheme of SCHEMES) {
        const p = resolvePalette(theme, scheme);
        expect(pullSpinnerColors(p, theme)).toEqual({ ink: p.accent2, disc: p.surfaceSolid });
      }
  });
});
