/**
 * The Sleep outlook sun stays yellow, and the next-clock disc stays a purple a parent can
 * see, in every theme. A theme accent would repaint the sun. A white disc would not be the
 * lavender in the reference.
 */
import { describe, expect, it } from 'vitest';
import { contrastRatio } from './contrast';
import { napOutlookMarks } from './napOutlookMarks';
import { themes, type ThemeName } from './theme';

const THEMES: ThemeName[] = ['light', 'dark', 'night'];

describe('the sleep outlook marks', () => {
  it('paints the sun yellow in every theme, not with the accent', () => {
    for (const name of THEMES) {
      const marks = napOutlookMarks(name);
      const palette = themes[name];
      expect(marks.sun, name).toBe('#FDB538');
      expect(marks.sun, name).not.toBe(palette.accent);
      expect(marks.sun, name).not.toBe(palette.accent2);
    }
    // A pale gold disappears on dark and Night paper. This yellow does not.
    // On the light inset the reference itself is a bright yellow on a pale wash, under 3:1,
    // and darkening it would make the olive the owner already rejected.
    expect(contrastRatio(napOutlookMarks('dark').sun, themes.dark.paper)).toBeGreaterThan(3);
    expect(contrastRatio(napOutlookMarks('night').sun, themes.night.paper)).toBeGreaterThan(3);
    expect(contrastRatio(napOutlookMarks('night').sun, themes.night.accentSoft)).toBeGreaterThan(3);
  });

  it('puts a solid moon on a purple disc, not on white and not on the inset wash', () => {
    for (const name of THEMES) {
      const marks = napOutlookMarks(name);
      const palette = themes[name];
      expect(marks.disc, name).not.toBe(palette.surfaceSolid);
      expect(marks.disc, name).not.toBe(palette.accentSoft);
      expect(contrastRatio(marks.moon, marks.disc), name).toBeGreaterThanOrEqual(3);
    }
    // Light and dark share the reference lavender. Night dims it so it is not a lamp,
    // and it still separates from the amber paper.
    expect(napOutlookMarks('light').disc).toBe('#D4D7FD');
    expect(napOutlookMarks('dark').disc).toBe(napOutlookMarks('light').disc);
    expect(napOutlookMarks('night').disc).not.toBe(napOutlookMarks('light').disc);
    expect(contrastRatio(napOutlookMarks('night').disc, themes.night.paper)).toBeGreaterThan(3);
  });
});
