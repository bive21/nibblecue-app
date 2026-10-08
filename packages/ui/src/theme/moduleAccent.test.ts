/**
 * A LOG SHEET IN ITS MODULE'S COLOR (`moduleAccent.ts`, the owner, 2026-10-06), measured for every
 * theme × scheme × module: the filled accent carries its words, the accent as words reads on the
 * module's wash and on the sheet, a chip's tint carries the text, and Night is left alone.
 */
import { describe, expect, it } from 'vitest';
import { deriveAccent } from './accent';
import { AA_TEXT, contrastRatio, luminance } from './contrast';
import { accentInk, moduleAccentPalette } from './moduleAccent';
import { moduleColor, resolvePalette, schemes, type SchemeName } from './theme';
import type { TintModule } from './moduleButton';

const MODULES = Object.keys(moduleColor) as TintModule[];

describe('a module’s palette on a log sheet', () => {
  for (const theme of ['light', 'dark'] as const)
    for (const scheme of Object.keys(schemes) as SchemeName[])
      it(`${theme}/${scheme} reads at AA for every module`, () => {
        const base = resolvePalette(theme, scheme);
        for (const m of MODULES) {
          const p = moduleAccentPalette(base, m, theme);
          const a = deriveAccent(p);
          expect(contrastRatio(p.onAccent, p.accent), `${m} fill`).toBeGreaterThanOrEqual(AA_TEXT);
          expect(contrastRatio(a.onAccent, a.accent), `${m} derived`).toBeGreaterThanOrEqual(
            AA_TEXT,
          );
          for (const ground of [p.accentSoft, p.surfaceSolid, p.page])
            expect(contrastRatio(p.accent2, ground), `${m} words`).toBeGreaterThanOrEqual(AA_TEXT);
          expect(contrastRatio(p.text, a.tint), `${m} chip`).toBeGreaterThanOrEqual(AA_TEXT);
          // the scheme barely touches it: only its page can deepen the ink a step or two
          const plain = moduleAccentPalette(resolvePalette(theme), m, theme).accent;
          expect(contrastRatio(p.accent, plain), `${m} across schemes`).toBeLessThan(1.1);
        }
      });

  it('leaves Night’s amber alone', () => {
    const night = resolvePalette('night');
    expect(moduleAccentPalette(night, 'pump', 'night')).toBe(night);
  });

  it('is soft: a pastel fill under dark words and a lighter wash (the owner, 2026-10-06)', () => {
    const light = resolvePalette('light', 'ocean');
    // the pastel of the module's own disc, and its wash lighter than the old soft role
    const pump = moduleAccentPalette(light, 'pump', 'light');
    expect(pump.accentSoft).toBe(pump.pumpSoft);
    expect(luminance(pump.accentSoft)).toBeGreaterThan(luminance(light.pumpSoft));
    const feed = moduleAccentPalette(light, 'breastfeed', 'light');
    // soft, not a red alarm: the chosen fill carries the page's dark words, not white
    expect(feed.onAccent).toBe(light.text);
    expect(luminance(feed.accent)).toBeGreaterThan(0.4);
  });
});

/**
 * WORDS IN THE ACCENT READ IN EVERY THEME (the owner, 2026-10-06: "the Edit … very light … need to
 * be inversed in the dark theme as well, make sure all text easily read in all themes"): a link,
 * Edit or Add bottle drawn in `accentInk` clears 4.5:1 on the sheet and on the wash, on a log sheet
 * in its module's colors and on any other sheet in the household's scheme, light, dark and Night.
 */
describe('accentInk: the accent as words', () => {
  for (const theme of ['light', 'dark', 'night'] as const)
    for (const scheme of Object.keys(schemes) as SchemeName[])
      it(`${theme}/${scheme} reads on the sheet, for the scheme and every module`, () => {
        const base = resolvePalette(theme, scheme);
        const palettes = [base, ...MODULES.map(m => moduleAccentPalette(base, m, theme))];
        for (const p of palettes)
          expect(contrastRatio(accentInk(p), p.surfaceSolid)).toBeGreaterThanOrEqual(AA_TEXT);
        // on a log sheet the dark theme's ink is the light one, the light theme's the deep one
        if (theme === 'dark') {
          const pump = moduleAccentPalette(base, 'pump', theme);
          expect(luminance(accentInk(pump))).toBeGreaterThan(luminance(pump.surfaceSolid));
        }
      });
});
