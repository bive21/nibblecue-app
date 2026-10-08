/**
 * THE RUNNING TIMERS' SMALL MOVES — THEIR COLORS, MEASURED (`timerMotion.ts`, 2026-09-26). A ring
 * nobody can see fill is a hold with no answer to "how much longer", and a hint nobody can read is
 * a tap that did nothing, so both are numbers here: in every scheme and every theme, over the stop
 * button's solid surface and over the translucent one a picture shows through. The nap's "z"s are
 * drawn in the picture's own ink and measured against its pixels by the app, which can read the
 * owner's files (`apps/mobile/src/ui/cardArtParts.test.ts`).
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_APPEARANCE, PLUS_APPEARANCE, resolveAppearance, SCHEME_NAMES } from './appearance';
import { PILL_OVER_ART_ALPHA, PILL_UNDER_ART } from './artInk';
import { AA_GRAPHIC, AA_TEXT, composite, contrastRatio, parseColor, withAlpha } from './contrast';
import { SKIN_NAMES } from './skins';
import { themeNames, themes } from './theme';
import { stopHoldColors } from './timerMotion';

/** Every palette a stop button can be painted in: 3 skins × 6 schemes × 3 themes. */
const EVERY = SKIN_NAMES.flatMap(skin =>
  SCHEME_NAMES.flatMap(scheme =>
    themeNames.map(theme => {
      const r = resolveAppearance(
        { ...DEFAULT_APPEARANCE, theme, scheme, skin },
        'light',
        PLUS_APPEARANCE,
      );
      return { at: `${skin}/${scheme}/${theme}`, theme, r };
    }),
  ),
);

/** The two extremes the timer pictures put under a translucent pill (`artInk.ts` says which). */
const BRIGHTEST_UNDER_PILL = PILL_UNDER_ART.brightest;
const DARKEST_UNDER_PILL = PILL_UNDER_ART.darkest;

describe('the hold’s ring can be seen filling, on every stop button', () => {
  it('clears 3:1 on the solid pill — the card’s in Night and the sticky bar’s everywhere', () => {
    const weak: string[] = [];
    for (const { at, theme, r } of EVERY) {
      const c = stopHoldColors(r.palette, theme);
      const v = contrastRatio(c.ring, r.palette.surfaceSolid);
      if (v < AA_GRAPHIC) weak.push(`${at}: ${v.toFixed(2)}`);
    }
    expect(weak).toEqual([]);
  });

  it('clears 3:1 on the pill a picture shows through, over its brightest and darkest pixel', () => {
    const weak: string[] = [];
    for (const { at, theme, r } of EVERY) {
      const c = stopHoldColors(r.palette, theme);
      for (const under of [BRIGHTEST_UNDER_PILL, DARKEST_UNDER_PILL]) {
        const pill = composite(under, withAlpha(r.palette.surfaceSolid, PILL_OVER_ART_ALPHA));
        const v = contrastRatio(c.ring, pill);
        if (v < AA_GRAPHIC) weak.push(`${at} over ${under}: ${v.toFixed(2)}`);
      }
    }
    expect(weak).toEqual([]);
  });

  // A TIMER'S RING IS ITS MODULE'S DEEP COLOR (2026-10-08: the pump's dark green, never the
  // household's scheme): it clears 3:1 on the solid pill and on the one a picture shows through
  it('in each timer’s own deep color, clears 3:1 on every pill', () => {
    const weak: string[] = [];
    for (const { at, theme, r } of EVERY)
      for (const module of ['sleep', 'breastfeed', 'pump', 'tummy'] as const) {
        const c = stopHoldColors(r.palette, theme, module);
        const pills = [
          r.palette.surfaceSolid,
          ...[BRIGHTEST_UNDER_PILL, DARKEST_UNDER_PILL].map(under =>
            composite(under, withAlpha(r.palette.surfaceSolid, PILL_OVER_ART_ALPHA)),
          ),
        ];
        for (const pill of pills) {
          const v = contrastRatio(c.ring, pill);
          if (v < AA_GRAPHIC) weak.push(`${at} ${module} on ${pill}: ${v.toFixed(2)}`);
        }
        if (theme !== 'night') expect(c.ring, at).not.toBe(r.palette.accent);
      }
    expect(weak).toEqual([]);
  });

  it('is told apart from the track it runs over', () => {
    for (const { at, theme, r } of EVERY) {
      const c = stopHoldColors(r.palette, theme);
      const track = composite(r.palette.surfaceSolid, c.track);
      expect(contrastRatio(c.ring, track), at).toBeGreaterThan(
        contrastRatio(track, r.palette.surfaceSolid),
      );
    }
  });

  it('is the household’s color in light and dark, and the amber ink in Night — nothing lit there', () => {
    for (const { at, theme, r } of EVERY) {
      const c = stopHoldColors(r.palette, theme);
      if (theme === 'night') {
        expect(c.ring, at).toBe(themes.night.text);
        // no blue in a dark room: the amber ink's blue is the smallest of its three
        const { r: red, g, b } = parseColor(c.ring);
        expect(b).toBeLessThan(g);
        expect(g).toBeLessThan(red);
      } else expect(c.ring, at).toBe(r.palette.accent);
    }
  });
});

describe('the ring layouts draw the hold in the mark’s own ink, which reads on its disc', () => {
  it('on a gradient card the disc is the solid surface; on a plain one, the brand gradient', () => {
    for (const { at, r } of EVERY) {
      // `onGradient`: the text ink on the solid disc
      expect(contrastRatio(r.palette.text, r.palette.surfaceSolid), at).toBeGreaterThanOrEqual(
        AA_GRAPHIC,
      );
      // plain: the gradient's own ink on the brand gradient, both ends (Night draws no ring there)
      if (r.theme === 'night') continue;
      for (const stop of r.gradient.brand)
        expect(contrastRatio(r.onGradient, stop), `${at} ${stop}`).toBeGreaterThanOrEqual(
          AA_GRAPHIC,
        );
    }
  });
});

describe('"Hold to stop" reads wherever it appears', () => {
  it('is text at 4.5:1 on its own bubble, in every scheme and theme', () => {
    const weak: string[] = [];
    for (const { at, theme, r } of EVERY) {
      const c = stopHoldColors(r.palette, theme);
      const v = contrastRatio(c.hintInk, c.hintGround);
      if (v < AA_TEXT) weak.push(`${at}: ${v.toFixed(2)}`);
      // opaque: nothing under the bubble can change it
      expect(parseColor(c.hintGround).a, at).toBe(1);
      expect(parseColor(c.hintInk).a, at).toBe(1);
    }
    expect(weak).toEqual([]);
  });
});
