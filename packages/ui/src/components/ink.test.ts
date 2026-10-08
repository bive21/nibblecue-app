import { describe, expect, it } from 'vitest';
import { AA_GRAPHIC, AA_TEXT, contrastRatio } from '../theme/contrast';
import { resolvePalette, schemes, themeNames, type SchemeName } from '../theme/theme';
import { readableInk } from './ink';

describe('readableInk', () => {
  it('keeps the preferred ink when it clears AA text on the fill', () => {
    const light = resolvePalette('light');
    // accent2 on accentSoft is a gate the token test already guarantees
    expect(readableInk(light.accent2, light.accentSoft, light.text)).toBe(light.accent2);
  });

  it('falls back to the text ink when the preferred ink cannot clear AA', () => {
    const light = resolvePalette('light');
    // the pair the rule exists for: amber on its own tint reads as a glyph, not as a word
    expect(contrastRatio(light.milk, light.milkSoft)).toBeLessThan(AA_TEXT);
    expect(readableInk(light.milk, light.milkSoft, light.text)).toBe(light.text);
  });

  it('takes a custom floor for glyph-only controls', () => {
    const light = resolvePalette('light');
    expect(readableInk(light.milk, light.milkSoft, light.text, AA_GRAPHIC)).toBe(light.milk);
  });

  it('never returns an ink under the floor for any category on its tint, in any theme × scheme', () => {
    const cats = ['milk', 'sleep', 'rose', 'diaper', 'olive', 'cyan'] as const;
    for (const theme of themeNames) {
      for (const scheme of Object.keys(schemes) as SchemeName[]) {
        const c = resolvePalette(theme, scheme);
        for (const cat of cats) {
          const fill = c[`${cat}Soft`];
          const ink = readableInk(c[cat], fill, c.text);
          expect(contrastRatio(ink, fill), `${theme}/${scheme}/${cat}`).toBeGreaterThanOrEqual(
            AA_TEXT,
          );
        }
      }
    }
  });
});
