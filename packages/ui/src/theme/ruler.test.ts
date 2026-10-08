/**
 * THE RULER'S MARKS CAN BE SEEN AND ITS NUMBERS READ (`ruler.ts`), in every theme and every scheme.
 * The eye is the instrument this repository has learned not to trust for this (docs/PREFLIGHT.md),
 * so every mark is a number here: a tick is a graphic (3:1), a label is text (4.5:1), and the needle
 * is a graphic in the scheme's own hue, measured under all six schemes because the scheme is the
 * one thing that changes it.
 */
import { describe, expect, it } from 'vitest';
import { AA_GRAPHIC, AA_TEXT, contrastRatio, parseColor } from './contrast';
import { rulerPaintFor } from './ruler';
import { resolvePalette, schemes, themeNames, type SchemeName } from './theme';

const every = themeNames.flatMap(theme =>
  (Object.keys(schemes) as SchemeName[]).map(scheme => ({
    theme,
    scheme,
    paint: rulerPaintFor(resolvePalette(theme, scheme)),
  })),
);

describe('the ruler, in 3 themes × 6 schemes', () => {
  it('draws on a solid track, so every mark is measured against what it really lands on', () => {
    for (const { theme, scheme, paint } of every)
      expect(parseColor(paint.track).a, `${theme}/${scheme}`).toBe(1);
  });

  it('every tick is a graphic that clears 3:1 on the track', () => {
    for (const { theme, scheme, paint } of every) {
      expect(contrastRatio(paint.minor, paint.track), `${theme}/${scheme}`).toBeGreaterThanOrEqual(
        AA_GRAPHIC,
      );
      expect(contrastRatio(paint.major, paint.track), `${theme}/${scheme}`).toBeGreaterThanOrEqual(
        AA_GRAPHIC,
      );
    }
  });

  it('every label is text that clears 4.5:1 on the track', () => {
    for (const { theme, scheme, paint } of every)
      expect(contrastRatio(paint.label, paint.track), `${theme}/${scheme}`).toBeGreaterThanOrEqual(
        AA_TEXT,
      );
  });

  it('the needle clears 3:1 on the track under every scheme, and a step’s tick stays quieter than a label', () => {
    for (const { theme, scheme, paint } of every) {
      expect(contrastRatio(paint.needle, paint.track), `${theme}/${scheme}`).toBeGreaterThanOrEqual(
        AA_GRAPHIC,
      );
      expect(contrastRatio(paint.minor, paint.track)).toBeLessThanOrEqual(
        contrastRatio(paint.major, paint.track),
      );
    }
  });

  it('the chosen number on a count’s line is text that clears 4.5:1, and stands out from the rest', () => {
    for (const { theme, scheme, paint } of every) {
      expect(contrastRatio(paint.chosen, paint.track), `${theme}/${scheme}`).toBeGreaterThanOrEqual(
        AA_TEXT,
      );
      expect(contrastRatio(paint.chosen, paint.track), `${theme}/${scheme}`).toBeGreaterThan(
        contrastRatio(paint.label, paint.track),
      );
    }
  });

  it('is the theme’s own roles and nothing lit — in Night too', () => {
    for (const { theme, scheme, paint } of every) {
      const p = resolvePalette(theme, scheme);
      expect(paint).toEqual({
        track: p.surface2,
        minor: p.text3,
        major: p.text2,
        label: p.text2,
        needle: p.accent,
        chosen: p.text,
      });
    }
  });
});
