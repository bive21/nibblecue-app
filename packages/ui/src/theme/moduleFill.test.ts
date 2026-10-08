/**
 * A CARD PAINTED IN ITS MODULE'S COLOR, measured against the two things it has to survive: the
 * page it floats on and the ink that sits on it.
 *
 * The owner, 2026-09-22, about the milk stash: *"Color on milk stash page box shouldn't follow
 * theme, it make it very similar to background. The color for milk stash should be yellow-gold.
 * Like in the main page."* Both halves of that are measurable, and both were true — a 5% wash of
 * the scheme's accent over `surfaceSolid` lands at 1.03:1 against a light page, because the page
 * is a warm cream and 5% of anything on white is a warm cream too.
 *
 * So this file is the acceptance test for that sentence rather than a smoke test of the helper:
 * the fill is the SAME in all six color schemes, it is far enough off the page to read as a
 * card, and the ordinary page ink on it clears AA everywhere.
 */
import { describe, expect, it } from 'vitest';
import { AA_TEXT, contrastRatio } from './contrast';
import { moduleCardFill, resolvePalette, schemes, themeNames, type SchemeName } from './theme';

const SCHEMES = Object.keys(schemes) as SchemeName[];

describe('a module card’s fill', () => {
  it('does not follow the color scheme — a stash is gold in all six', () => {
    for (const theme of themeNames) {
      const fills = new Set(
        SCHEMES.map(s => moduleCardFill(resolvePalette(theme, s), 'stash', theme)),
      );
      expect(fills.size, `${theme}: the stash card follows the scheme`).toBe(1);
    }
  });

  it('lifts off the page it floats on, which a 5% accent wash did not', () => {
    for (const theme of themeNames) {
      for (const s of SCHEMES) {
        const p = resolvePalette(theme, s);
        const fill = moduleCardFill(p, 'stash', theme);
        expect(
          contrastRatio(fill, p.paper),
          `${s}/${theme}: the card is the same color as the page`,
        ).toBeGreaterThan(1.05);
      }
    }
  });

  it('carries the page’s own ink at AA, in every theme and scheme', () => {
    for (const theme of themeNames) {
      for (const s of SCHEMES) {
        const p = resolvePalette(theme, s);
        const fill = moduleCardFill(p, 'stash', theme);
        expect(contrastRatio(p.text, fill), `${s}/${theme}: text`).toBeGreaterThanOrEqual(AA_TEXT);
        expect(contrastRatio(p.text2, fill), `${s}/${theme}: text2`).toBeGreaterThanOrEqual(
          AA_TEXT,
        );
      }
    }
  });

  /**
   * AND IT IS THE MODULE'S HUE, not a color this helper invented: in light the fill is a step of
   * the reference disc, so it is warmer than the neutral card it came from — which is the whole
   * of "yellow-gold" as something a test can check.
   */
  it('is warmer than the plain card it is a tint of', () => {
    const p = resolvePalette('light', 'reef');
    const fill = moduleCardFill(p, 'stash', 'light');
    const [r, , b] = [1, 3, 5].map(i => parseInt(fill.slice(i, i + 2), 16)) as [
      number,
      number,
      number,
    ];
    expect(r, 'the stash fill is not warm').toBeGreaterThan(b);
  });
});
