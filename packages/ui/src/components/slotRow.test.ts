import { describe, expect, it } from 'vitest';
import { AA_TEXT, contrastRatio } from '../theme/contrast';
import { resolvePalette, schemes, type SchemeName } from '../theme/theme';
import { moduleSlotPaint } from '../theme/slotPaint';

/**
 * A TIMER'S START CHIPS IN ITS MODULE'S COLORS (the owner, 2026-10-06): the words on a resting chip
 * and on a chosen one read at 4.5:1 or more for every timer, theme and scheme.
 */
describe('a module’s slots keep their words readable', () => {
  for (const theme of ['light', 'dark', 'night'] as const)
    for (const scheme of Object.keys(schemes) as SchemeName[])
      it(`${theme}/${scheme}`, () => {
        const p = resolvePalette(theme, scheme);
        for (const m of ['sleep', 'breastfeed', 'pump', 'tummy'] as const) {
          const c = moduleSlotPaint(p, m, theme);
          expect(contrastRatio(p.text, c.rest), `${m} at rest`).toBeGreaterThanOrEqual(AA_TEXT);
          expect(contrastRatio(c.onInk, c.on), `${m} chosen`).toBeGreaterThanOrEqual(AA_TEXT);
        }
      });
});
