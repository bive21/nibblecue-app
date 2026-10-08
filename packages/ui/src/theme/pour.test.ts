/**
 * THE POUR SWITCH'S COLORS, MEASURED (`pour.ts`; the owner, 2026-09-27, of setup's "Feeding and
 * milk"). A switch that pours a module's own color is still a switch, and the eye is the instrument
 * this repository has learned not to trust for whether one can be read (docs/PREFLIGHT.md): so the
 * knob against the milk, the knob against the empty track, and the milk against the card it sits
 * on are numbers here, for every way of feeding the page offers, in all six schemes and all three
 * themes, on the grounds a row actually sits on.
 */
import { describe, expect, it } from 'vitest';
import { AA_GRAPHIC, composite, contrastRatio, parseColor } from './contrast';
import { POUR_GLOW, pourColors } from './pour';
import {
  moduleColor,
  resolvePalette,
  schemes,
  themeNames,
  type Palette,
  type SchemeName,
} from './theme';

const EVERY: readonly { at: string; theme: (typeof themeNames)[number]; p: Palette }[] =
  themeNames.flatMap(theme =>
    (Object.keys(schemes) as SchemeName[]).map(scheme => ({
      at: `${theme}/${scheme}`,
      theme,
      p: resolvePalette(theme, scheme),
    })),
  );

/**
 * The feeding step's five switches, by the module each pours: the four ways of feeding and the milk
 * stash under them. The ink is `categoryColors(...).fg`, read straight off the palette here because
 * the provider that exports that helper imports React Native.
 */
const POURED = ['breastfeed', 'pump', 'bottle', 'solids', 'stash'] as const;
const inkOf = (p: Palette, m: (typeof POURED)[number]): string => p[moduleColor[m]];

/** Where a switch row sits: a card (setup's rows), the page, the paper. */
const grounds = (p: Palette): readonly [string, string][] => [
  ['a card', p.surfaceSolid],
  ['the page', p.app],
  ['the paper', p.paper],
];

describe('the knob can be told from its track, full and empty', () => {
  it('full: the card-colored knob on every module’s milk clears 3:1', () => {
    for (const { at, theme, p } of EVERY)
      for (const m of POURED) {
        const c = pourColors(p, inkOf(p, m), theme);
        expect(contrastRatio(c.knobOn, c.milk), `${at} ${m}`).toBeGreaterThanOrEqual(AA_GRAPHIC);
      }
  });

  it('empty: the text2 knob on the line2 track, as the track lands on every ground', () => {
    for (const { at, theme, p } of EVERY) {
      const c = pourColors(p, inkOf(p, 'bottle'), theme);
      for (const [where, ground] of grounds(p))
        expect(
          contrastRatio(c.knobOff, composite(ground, c.trackOff)),
          `${at} on ${where}`,
        ).toBeGreaterThanOrEqual(AA_GRAPHIC);
    }
  });

  it('differs in the knob as well as the track, so no state is a hue alone', () => {
    for (const { at, theme, p } of EVERY)
      for (const m of POURED) {
        const c = pourColors(p, inkOf(p, m), theme);
        expect(c.knobOn, `${at} ${m}`).not.toBe(c.knobOff);
        expect(c.milk, `${at} ${m}`).not.toBe(c.trackOff);
      }
  });

  it('is drawn in opaque inks: nothing on the knob depends on what is under it', () => {
    for (const { at, theme, p } of EVERY) {
      const c = pourColors(p, inkOf(p, 'pump'), theme);
      for (const ink of [c.knobOn, c.knobOff, c.milk]) expect(parseColor(ink).a, at).toBe(1);
    }
  });
});

describe('the milk is the module’s own color, and a full track reads on its card', () => {
  it('pours each module’s own ink, the one that names it on every other surface', () => {
    for (const { at, theme, p } of EVERY)
      for (const m of POURED)
        expect(pourColors(p, inkOf(p, m), theme).milk, `${at} ${m}`).toBe(p[moduleColor[m]]);
  });

  it('stands out from every ground a row sits on, as the part of the control that shows it is on', () => {
    for (const { at, theme, p } of EVERY)
      for (const m of POURED) {
        const c = pourColors(p, inkOf(p, m), theme);
        for (const [where, ground] of grounds(p))
          expect(contrastRatio(c.milk, ground), `${at} ${m} on ${where}`).toBeGreaterThanOrEqual(
            AA_GRAPHIC,
          );
      }
  });
});

describe('the glow', () => {
  it('is the milk at its own soft strength, in light and dark', () => {
    for (const { at, theme, p } of EVERY) {
      if (theme === 'night') continue;
      const c = pourColors(p, inkOf(p, 'breastfeed'), theme);
      expect(c.glow, at).not.toBeNull();
      const glow = parseColor(c.glow ?? '');
      const milk = parseColor(c.milk);
      expect(glow.a, at).toBeCloseTo(POUR_GLOW, 9);
      expect([glow.r, glow.g, glow.b], at).toEqual([milk.r, milk.g, milk.b]);
    }
    expect(POUR_GLOW).toBeLessThan(0.5);
  });

  it('is never drawn in the amber Night, nor on a design that draws no shadows', () => {
    for (const { at, theme, p } of EVERY) {
      const ink = inkOf(p, 'solids');
      if (theme === 'night') expect(pourColors(p, ink, theme).glow, at).toBeNull();
      expect(pourColors(p, ink, theme, false).glow, at).toBeNull();
    }
  });
});

describe('no color of its own', () => {
  it('is the palette’s roles, the milk the caller hands in, and the milk’s own glow', () => {
    for (const { at, theme, p } of EVERY) {
      const own = new Set(Object.values(p));
      const c = pourColors(p, inkOf(p, 'stash'), theme);
      for (const ink of [c.trackOff, c.knobOff, c.knobOn, c.milk])
        expect(own.has(ink), `${at} ${ink}`).toBe(true);
    }
  });
});
