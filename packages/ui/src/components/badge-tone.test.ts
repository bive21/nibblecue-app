import { describe, expect, it } from 'vitest';
import { AA_TEXT, contrastRatio } from '../theme/contrast';
import { resolvePalette, schemes, themeNames, type SchemeName } from '../theme/theme';
import { BADGE_TONES, badgeColors, badgeColorsOnSolid } from './badge-tone';

const every = (fn: (theme: (typeof themeNames)[number], scheme: SchemeName) => void) => {
  for (const theme of themeNames)
    for (const scheme of Object.keys(schemes) as SchemeName[]) fn(theme, scheme);
};

describe('badgeColors', () => {
  it('clears AA text contrast for every tone in every theme × scheme', () => {
    every((theme, scheme) => {
      const c = resolvePalette(theme, scheme);
      for (const tone of BADGE_TONES) {
        const { fill, ink } = badgeColors(c, tone);
        expect(contrastRatio(ink, fill), `${theme}/${scheme}/${tone}`).toBeGreaterThanOrEqual(
          AA_TEXT,
        );
      }
    });
  });

  it('never needs the fallback for neutral or accent — those pairs are token-gated', () => {
    every((theme, scheme) => {
      const c = resolvePalette(theme, scheme);
      expect(badgeColors(c, 'neutral').fellBack, `${theme}/${scheme}`).toBe(false);
      expect(badgeColors(c, 'accent').fellBack, `${theme}/${scheme}`).toBe(false);
    });
  });

  it('keeps the tone in the fill when the ink falls back, so the hue is still read', () => {
    every((theme, scheme) => {
      const c = resolvePalette(theme, scheme);
      for (const tone of BADGE_TONES) {
        const r = badgeColors(c, tone);
        if (r.fellBack) {
          expect(r.ink).toBe(c.text);
          expect(r.fill).not.toBe(c.surface2);
        }
      }
    });
  });

  it('paints the neutral tone on surface2 with the secondary ink', () => {
    const c = resolvePalette('light');
    expect(badgeColors(c, 'neutral')).toEqual({ fill: c.surface2, ink: c.text2, fellBack: false });
  });
});

/**
 * THE VACCINE CHIPS' TWO COLORS (the owner, 2026-09-26: red only in the week before a date, "and
 * the rest … a calm color like blue"): `crit` and `info`, on their soft tints wherever a chip sits
 * on a plain surface, and on the solid surface where it sits on the tinted vaccines card. Every
 * one is text, so every one is held to 4.5:1 — in light, dark and the amber Night, every scheme.
 */
describe('the calm and the red chip', () => {
  it('clear AA on their own tints and on the solid surface, in all three themes', () => {
    every((theme, scheme) => {
      const c = resolvePalette(theme, scheme);
      for (const tone of ['info', 'crit'] as const) {
        for (const pair of [badgeColors(c, tone), badgeColorsOnSolid(c, tone)]) {
          expect(
            contrastRatio(pair.ink, pair.fill),
            `${theme}/${scheme}/${tone}`,
          ).toBeGreaterThanOrEqual(AA_TEXT);
        }
      }
    });
  });

  it('keep their own hue as the ink on the solid surface — the card’s red really is red', () => {
    every((theme, scheme) => {
      const c = resolvePalette(theme, scheme);
      expect(badgeColorsOnSolid(c, 'crit')).toEqual({
        fill: c.surfaceSolid,
        ink: c.crit,
        fellBack: false,
      });
      expect(badgeColorsOnSolid(c, 'info')).toEqual({
        fill: c.surfaceSolid,
        ink: c.cyan,
        fellBack: false,
      });
    });
  });

  it('keep the crit ink on the rose tint wherever it clears AA (dark and Night)', () => {
    for (const theme of ['dark', 'night'] as const) {
      const c = resolvePalette(theme);
      expect(badgeColors(c, 'crit'), theme).toEqual({
        fill: c.roseSoft,
        ink: c.crit,
        fellBack: false,
      });
    }
  });

  it('calm is the fixed cool hue: no scheme moves it, and it is never the red', () => {
    for (const theme of themeNames) {
      const reef = badgeColors(resolvePalette(theme, 'reef'), 'info');
      for (const scheme of Object.keys(schemes) as SchemeName[]) {
        const c = resolvePalette(theme, scheme);
        expect(badgeColors(c, 'info'), `${theme}/${scheme}`).toEqual(reef);
        expect(badgeColors(c, 'info').fill).not.toBe(badgeColors(c, 'crit').fill);
        expect(badgeColorsOnSolid(c, 'info').ink).not.toBe(badgeColorsOnSolid(c, 'crit').ink);
      }
    }
  });
});
