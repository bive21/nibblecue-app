/**
 * THE BELL SWITCH'S COLORS, MEASURED (`bell.ts`; the owner, 2026-09-25). A charming switch can
 * still be a switch nobody can read, and the eye is the instrument this repository has learned not
 * to trust for that (docs/PREFLIGHT.md): so the knob against its track, the bell against its knob
 * and the "z"s against the ground they drift over are numbers here — in all six schemes and all
 * three themes, on the grounds a row actually sits on.
 */
import { describe, expect, it } from 'vitest';
import { bellColors } from './bell';
import { AA_GRAPHIC, AA_TEXT, composite, contrastRatio, parseColor } from './contrast';
import { resolvePalette, schemes, themeNames, type Palette, type SchemeName } from './theme';

const EVERY: readonly { at: string; p: Palette }[] = themeNames.flatMap(theme =>
  (Object.keys(schemes) as SchemeName[]).map(scheme => ({
    at: `${theme}/${scheme}`,
    p: resolvePalette(theme, scheme),
  })),
);

/** Where a switch row sits: a card (the Reminders page, setup's boxes), the page, the paper. */
const grounds = (p: Palette): readonly [string, string][] => [
  ['a card', p.surfaceSolid],
  ['the page', p.app],
  ['the paper', p.paper],
];

describe('the knob can be told from its track, on and off', () => {
  it('on: the onAccent knob on the accent track', () => {
    for (const { at, p } of EVERY) {
      const c = bellColors(p);
      expect(contrastRatio(c.knobOn, c.trackOn), at).toBeGreaterThanOrEqual(AA_GRAPHIC);
    }
  });

  it('off: the text2 knob on the line2 track, as the track lands on every ground', () => {
    // `line2` is translucent, so the track is measured over what shows through it
    for (const { at, p } of EVERY) {
      const c = bellColors(p);
      for (const [where, ground] of grounds(p))
        expect(
          contrastRatio(c.knobOff, composite(ground, c.trackOff)),
          `${at} on ${where}`,
        ).toBeGreaterThanOrEqual(AA_GRAPHIC);
    }
  });

  it('differs in the knob as well as the track, so no state is a hue alone', () => {
    for (const { at, p } of EVERY) {
      const c = bellColors(p);
      expect(c.knobOn, at).not.toBe(c.knobOff);
      expect(c.trackOn, at).not.toBe(c.trackOff);
    }
  });
});

describe('the bell can be seen on the knob it rides', () => {
  it('on either knob, in either state, as a mark (3:1)', () => {
    for (const { at, p } of EVERY) {
      const c = bellColors(p);
      expect(contrastRatio(c.bellOn, c.knobOn), `${at} on`).toBeGreaterThanOrEqual(AA_GRAPHIC);
      expect(contrastRatio(c.bellOff, c.knobOff), `${at} off`).toBeGreaterThanOrEqual(AA_GRAPHIC);
    }
  });

  it('is drawn in opaque inks: nothing on the knob depends on what is under it', () => {
    for (const { at, p } of EVERY) {
      const c = bellColors(p);
      for (const ink of [c.knobOn, c.knobOff, c.bellOn, c.bellOff])
        expect(parseColor(ink).a, at).toBe(1);
    }
  });
});

describe('the "z"s read on the ground they drift over', () => {
  it('clear 3:1 as marks on every ground — and in fact the 4.5:1 of text', () => {
    for (const { at, p } of EVERY) {
      const c = bellColors(p);
      for (const [where, ground] of grounds(p)) {
        const r = contrastRatio(c.z, ground);
        expect(r, `${at} on ${where}`).toBeGreaterThanOrEqual(AA_GRAPHIC);
        expect(r, `${at} on ${where}`).toBeGreaterThanOrEqual(AA_TEXT);
      }
    }
  });
});

describe('no color of its own', () => {
  it('is the palette’s roles and nothing else, so night is the night palette’s', () => {
    for (const { at, p } of EVERY) {
      const own = new Set(Object.values(p));
      for (const ink of Object.values(bellColors(p)))
        expect(own.has(ink), `${at} ${ink}`).toBe(true);
    }
  });
});
