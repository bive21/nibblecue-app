import { describe, expect, it } from 'vitest';
import { DEFAULT_APPEARANCE, PLUS_APPEARANCE, resolveAppearance, SCHEME_NAMES } from './appearance';
import { PILL_OVER_ART_ALPHA, PILL_UNDER_ART } from './artInk';
import {
  AA_GRAPHIC,
  AA_TEXT,
  composite,
  contrastRatio,
  parseColor,
  toHex,
  withAlpha,
} from './contrast';
import { DIAPER_GLYPH_NAMES, diaperGlyphInks } from './diaperKinds';
import { groundComposites, patternComposites } from './ground';
import { materialBase, SKIN_NAMES, surfaceAlphaFor } from './skins';
import { themeNames } from './theme';

describe('the arithmetic', () => {
  it('parses hex and rgba, composites, and reproduces the WCAG reference ratios', () => {
    expect(parseColor('#FFF')).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(parseColor('rgba(255,255,255,0.86)')).toEqual({ r: 255, g: 255, b: 255, a: 0.86 });
    expect(toHex(parseColor('#5a46dc'))).toBe('#5A46DC');
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrastRatio('#777777', '#FFFFFF')).toBeCloseTo(4.48, 2);
    expect(composite('#000000', 'rgba(255,255,255,0.5)')).toBe('#808080');
    expect(composite('#F6F2FE', 'rgba(255,255,255,0.86)')).toBe('#FEFDFF');
  });
});

/**
 * The token gate, extended to what the prototype's rendered sweep measured (DESIGN_SYSTEM.md
 * §12 rule 1, §13 rule 6): every ink on every ground it can land on, for every skin × scheme ×
 * theme — including the translucent surfaces, composited over the app ground at the skin's
 * own alpha, and the category tints at the skin's tint alpha. Zero failures is the gate.
 */
describe('every ink on every ground, 3 skins × 6 schemes × 3 themes', () => {
  const failures: string[] = [];
  let checks = 0;
  for (const skin of SKIN_NAMES) {
    for (const scheme of SCHEME_NAMES) {
      for (const theme of themeNames) {
        const r = resolveAppearance(
          { ...DEFAULT_APPEARANCE, theme, scheme, skin },
          'light',
          PLUS_APPEARANCE,
        );
        const c = r.palette;
        const s = r.skinTokens;
        const grounds: Record<string, string> = {
          app: c.app,
          app2: c.app2,
          page: c.page,
          pageWarm: c.pageWarm,
          pageCool: c.pageCool,
          // each material over the app ground, made of whatever its fill says (dark glass is
          // the scheme's soft tint, not white — skins.ts)
          surface: composite(c.app, materialBase(c, s.surface), s.surface.alpha),
          surfaceOnPage: composite(c.page, materialBase(c, s.surface), s.surface.alpha),
          // and the same panel at the alpha a phone WITHOUT a blur paints it (skins.ts
          // surfaceAlphaFor: 76% in glass since 2026-09-29, where it had been opaque)
          surfaceNoBlur: composite(
            c.app,
            materialBase(c, s.surface),
            surfaceAlphaFor(s.surface, false),
          ),
          chrome: composite(c.app, materialBase(c, s.chrome), s.chrome.alpha),
          sheet: composite(c.app, materialBase(c, s.sheet), s.sheet.alpha),
          surfaceSolid: c.surfaceSolid,
          surface2: c.surface2,
          surface3: c.surface3,
          accentSoft: composite(c.app, c.accentSoft, s.tintAlpha),
          milkSoft: composite(c.app, c.milkSoft, s.tintAlpha),
          sleepSoft: composite(c.app, c.sleepSoft, s.tintAlpha),
          roseSoft: composite(c.app, c.roseSoft, s.tintAlpha),
          diaperSoft: composite(c.app, c.diaperSoft, s.tintAlpha),
          oliveSoft: composite(c.app, c.oliveSoft, s.tintAlpha),
          cyanSoft: composite(c.app, c.cyanSoft, s.tintAlpha),
        };
        // The lit ground (theme/ground.ts) — the washes behind every screen, the glass orbs at
        // their peak and at half, and the content panel over each — composited to opaque colors
        // so every ink above is measured over it for free. `null` on Paper and in night, where
        // the layer does not render — asserting on a layer that is not drawn is a false gate, so
        // the whole group is skipped rather than substituted with `app`.
        const gr = groundComposites(c, s);
        if (gr) Object.assign(grounds, gr);
        /*
          THE FIRST-RUN DOODLE PATTERN (theme/ground.ts `pattern`). It is the one decoration that
          does NOT come from the skin — it draws on Paper too, which is the default household —
          so it is measured separately, over both grounds it can land on: the flat page every
          household gets and the lit one a glass household gets. Every text ink is checked on it
          by the loop below, which is the whole reason the wallpaper is glyphs and arithmetic
          rather than a picture: a picture could not be measured at all.
        */
        const pat = patternComposites(c, s, theme);
        if (pat) Object.assign(grounds, pat);
        const check = (what: string, fg: string, bg: string, min: number) => {
          checks++;
          const v = contrastRatio(fg, bg);
          if (v < min)
            failures.push(`${skin}/${scheme}/${theme}: ${what} = ${v.toFixed(2)}:1 (min ${min})`);
        };
        for (const [name, ground] of Object.entries(grounds)) {
          check(`text on ${name}`, c.text, ground, AA_TEXT);
          check(`text2 on ${name}`, c.text2, ground, AA_TEXT);
          // text3 is a non-text ink only: dividers, disabled glyphs (CONTRAST_FINDINGS.md §4)
          check(`text3 (graphic) on ${name}`, c.text3, ground, AA_GRAPHIC);
        }
        // the accent as an interactive ink on the grounds it is tapped on
        for (const name of ['app', 'page', 'surface', 'surfaceNoBlur', 'chrome', 'sheet'] as const)
          check(`accent2 as label on ${name}`, c.accent2, grounds[name] ?? c.app, AA_TEXT);
        check('onAccent on accent', c.onAccent, c.accent, AA_TEXT);
        // the danger button: white on its own fill token, never on the crit text ink (§12 rule 3)
        check('white on dangerFill', r.onGradient, c.dangerFill, AA_TEXT);
        check('onGradient on brand g1', r.onGradient, r.gradient.brand[0], AA_TEXT);
        check('onGradient on brand g2', r.onGradient, r.gradient.brand[1], AA_TEXT);
        check('accent2 on accentSoft', c.accent2, grounds.accentSoft ?? c.accentSoft, AA_TEXT);
        // a category ink on its own soft tint is a GLYPH or a large numeral (the 32pt icon chip,
        // the 22pt stat value) — 3:1; small words on a tinted tile take the theme inks, which the
        // rows above already hold to 4.5 on every tint (DESIGN_SYSTEM.md §12 rule 6, MOBILE.md §4).
        // The same ink on the page is the row icon and the mini card's border: also a glyph.
        for (const cat of ['milk', 'sleep', 'rose', 'diaper', 'olive', 'cyan'] as const) {
          check(
            `${cat} as glyph/large value on ${cat}Soft`,
            c[cat],
            grounds[`${cat}Soft`] ?? c.app,
            AA_GRAPHIC,
          );
          check(`${cat} as glyph on app`, c[cat], grounds.app ?? c.app, AA_GRAPHIC);
          check(`${cat} as glyph on surface`, c[cat], grounds.surface ?? c.app, AA_GRAPHIC);
          check(
            `${cat} as glyph on surfaceNoBlur`,
            c[cat],
            grounds.surfaceNoBlur ?? c.app,
            AA_GRAPHIC,
          );
        }
        // status inks as text on the app ground and on a card
        for (const st of ['good', 'warn', 'crit'] as const) {
          check(`${st} on app`, c[st], grounds.app ?? c.app, AA_TEXT);
          check(`${st} on surface`, c[st], grounds.surface ?? c.app, AA_TEXT);
          check(`${st} on surfaceNoBlur`, c[st], grounds.surfaceNoBlur ?? c.app, AA_TEXT);
        }
        // Today's report draws a diaper's drop and pile in their own inks (the owner, 2026-09-26:
        // "blue for water drop, brown for the poo"; `diaperKinds.ts`) on its card — glyphs, 3:1,
        // and solid since 2026-09-27: a filled glyph is judged at the same non-text bar
        const glyphs = diaperGlyphInks(c, theme);
        for (const name of DIAPER_GLYPH_NAMES)
          for (const card of ['surface', 'surfaceOnPage', 'surfaceNoBlur'] as const)
            check(
              `diaper ${name} glyph on ${card}`,
              glyphs[name],
              grounds[card] ?? c.app,
              AA_GRAPHIC,
            );
        // The lit ground, where the loops above are hardcoded to app/surface/*Soft and so reach
        // none of it. Merging the composites into `grounds` covers text/text2/text3; these are
        // the rest.
        if (gr) {
          for (const [name, g] of Object.entries(gr)) {
            check(`accent2 as label on ${name}`, c.accent2, g, AA_TEXT);
            check(`accent as glyph on ${name}`, c.accent, g, AA_GRAPHIC);
          }
          // A category hue and a status ink are NEVER inked directly on the ground: milk as a
          // glyph on a motif stroke measures 2.99:1 against a 3.0 floor, and warn measures 3.93:1
          // on the wash. They are measured only where the design actually puts them — on a
          // surface over the ground (every `surfaceOn…` layer: over the busiest wash point and
          // over each orb), on a category tint over it, and for an error on a SOLID one. What
          // keeps them off the ground is a source scan (first-run/ground-usage.test.ts) and the
          // FormError convention, because this file measures inks against grounds and cannot
          // measure a screen against a layout.
          const busy = Object.entries(gr).filter(
            ([k]) => k === 'groundMotifMilk' || k.startsWith('orb'),
          );
          // The `surfaceOn…` layers are the panel at the alpha the table declares — what a phone
          // WITH a blur paints. A phone without one paints the same material at its no-blur alpha
          // (skins.ts surfaceAlphaFor), which is not opaque since 2026-09-29 and so lets the orbs
          // through: every ink a panel carries is measured on that too, over the busiest ground.
          const noBlur = surfaceAlphaFor(s.surface, false);
          const panels = [
            ...Object.entries(gr).filter(([k]) => k.startsWith('surfaceOn')),
            ...busy.map(
              ([k, b]) =>
                [`surfaceNoBlurOn${k}`, composite(b, materialBase(c, s.surface), noBlur)] as [
                  string,
                  string,
                ],
            ),
          ];
          // the words a card carries, on the no-blur panel (the declared ones reach the loop
          // above through `grounds`; these are composited here and nowhere else)
          for (const [pn, p] of panels.filter(([k]) => k.startsWith('surfaceNoBlurOn'))) {
            check(`text on ${pn}`, c.text, p, AA_TEXT);
            check(`text2 on ${pn}`, c.text2, p, AA_TEXT);
            check(`text3 (graphic) on ${pn}`, c.text3, p, AA_GRAPHIC);
            check(`accent2 as label on ${pn}`, c.accent2, p, AA_TEXT);
          }
          // the report's card floats on the lit ground too: the diaper glyphs on every panel
          for (const name of DIAPER_GLYPH_NAMES)
            for (const [pn, p] of panels)
              check(`diaper ${name} glyph on ${pn}`, glyphs[name], p, AA_GRAPHIC);
          for (const cat of ['milk', 'sleep', 'rose', 'diaper', 'olive', 'cyan'] as const) {
            for (const [pn, p] of panels) check(`${cat} glyph on ${pn}`, c[cat], p, AA_GRAPHIC);
            for (const [bn, b] of busy)
              check(
                `${cat} glyph on ${cat}Soft over ${bn}`,
                c[cat],
                composite(b, c[`${cat}Soft`], s.tintAlpha),
                AA_GRAPHIC,
              );
          }
          for (const st of ['good', 'warn', 'crit'] as const) {
            for (const [pn, p] of panels) check(`${st} on ${pn}`, c[st], p, AA_TEXT);
            check(
              `${st} on surfaceSolid (the first-run FormError)`,
              c[st],
              c.surfaceSolid,
              AA_TEXT,
            );
          }
          // The chrome floats over the foot of the page, where the accent orb is, and a sheet
          // opens over whatever is lit beneath it: their label inks over every busy point.
          for (const [bn, b] of busy) {
            for (const [mn, m] of [
              ['chrome', s.chrome],
              ['sheet', s.sheet],
            ] as const) {
              const over = composite(b, materialBase(c, m), m.alpha);
              check(`text on ${mn} over ${bn}`, c.text, over, AA_TEXT);
              check(`text2 on ${mn} over ${bn}`, c.text2, over, AA_TEXT);
              check(`text3 (graphic) on ${mn} over ${bn}`, c.text3, over, AA_GRAPHIC);
              check(`accent2 as label on ${mn} over ${bn}`, c.accent2, over, AA_TEXT);
            }
          }
        }
      }
    }
  }

  it(`passes every check (${checks} run)`, () => {
    // A floor close to the real number, so the ground's ~1,400 checks cannot silently stop
    // running. The old gate was 2,160 against an actual 6,090 — it would have stayed green with
    // two thirds of the matrix switched off.
    expect(checks).toBeGreaterThanOrEqual(6000);
    expect(failures).toEqual([]);
  });
});

/**
 * THE STOP PILL OVER A PICTURE. At `PILL_OVER_ART_ALPHA` of its solid surface the pill lets the
 * owner's drawing through, and the mark and caption on it keep the text ink — so the ink has to
 * clear AA over whatever the picture puts under the pill, composited through the surface. The
 * two extremes the timer pictures can produce are white itself — the new double pump's flanges
 * reach the pill's corner (2026-09-26; it was the old sleeping cloud, 0.79) — and a pixel as dark
 * as the mother's hair (0.04); `PILL_UNDER_ART` holds both, the app measures the shipped pictures
 * against them, and both are held here in every skin, scheme and theme, because in dark the
 * surface is dark and the ink is light, and it is the BRIGHT pixel that erodes it.
 */
describe('the stop pill lets the picture through and stays readable', () => {
  const BRIGHTEST_UNDER_PILL = PILL_UNDER_ART.brightest;
  const DARKEST_UNDER_PILL = PILL_UNDER_ART.darkest;
  it('text ink clears AA on the pill over the brightest and the darkest pixel, every theme', () => {
    const failures: string[] = [];
    for (const skin of SKIN_NAMES)
      for (const scheme of SCHEME_NAMES)
        for (const theme of themeNames) {
          const r = resolveAppearance(
            { ...DEFAULT_APPEARANCE, theme, scheme, skin },
            'light',
            PLUS_APPEARANCE,
          );
          for (const under of [BRIGHTEST_UNDER_PILL, DARKEST_UNDER_PILL]) {
            const pill = composite(under, withAlpha(r.palette.surfaceSolid, PILL_OVER_ART_ALPHA));
            const v = contrastRatio(r.palette.text, pill);
            if (v < AA_TEXT)
              failures.push(
                `${skin}/${scheme}/${theme}: text on pill over ${under} = ${v.toFixed(2)}:1`,
              );
          }
        }
    expect(failures).toEqual([]);
  });
});
