/**
 * The tour's ink, measured against the pages it is drawn on.
 *
 * "Way more intense" is not a thing the eye can check in six schemes and three themes on one
 * phone, and it has a failure mode in each direction: too little and the outline is another
 * accent chip, too much and it is a black line in a light theme or a hole in a dark one. So the
 * sweep below is the acceptance test for the owner's sentence, not a smoke test of the helper.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_APPEARANCE, PLUS_APPEARANCE, resolveAppearance, SCHEME_NAMES } from './appearance';
import { AA_GRAPHIC, composite, contrastRatio, parseColor } from './contrast';
import { GLOW_SEED, glowInk, TOUR_DEEPEN, TOUR_INK_FLOOR, tourHalo, tourInk } from './glow';
import { groundComposites } from './ground';
import { materialBase, SKIN_NAMES } from './skins';
import {
  gradients,
  moduleColor,
  resolvePalette,
  schemes,
  themeNames,
  type SchemeName,
  type ThemeName,
} from './theme';

const SCHEMES = Object.keys(schemes) as SchemeName[];

describe('glowInk — the accent, taken much further', () => {
  it('is always further from the page than the accent it came from', () => {
    // the whole point: an outline that is merely the accent is the weight of every chip already
    // on the screen (the owner, 2026-09-18: "way more intense")
    for (const theme of themeNames) {
      for (const scheme of SCHEMES) {
        const p = resolvePalette(theme, scheme);
        const ink = glowInk(p.accent, p.text);
        expect(
          contrastRatio(ink, p.surfaceSolid),
          `${scheme}/${theme}: the tour ink is no stronger than the accent`,
        ).toBeGreaterThan(contrastRatio(p.accent, p.surfaceSolid));
      }
    }
  });

  it('clears the graphic threshold on every scheme, in every theme', () => {
    // a mark is a non-text graphic: 3:1 against what is behind it (DESIGN_SYSTEM §8). The outline
    // is drawn over a card, so surfaceSolid is the worst case rather than the page behind it.
    for (const theme of themeNames) {
      for (const scheme of SCHEMES) {
        const p = resolvePalette(theme, scheme);
        const ink = glowInk(p.accent, p.text);
        expect(
          contrastRatio(ink, p.surfaceSolid),
          `${scheme}/${theme}: the tour outline is not legible on the page`,
        ).toBeGreaterThanOrEqual(AA_GRAPHIC);
      }
    }
  });

  /**
   * THE MARK'S OWN SEED, which is red and not the scheme (2026-09-22 took it off the accent;
   * 2026-09-25 took it from coral to red). The two claims above are about `glowInk` as
   * arithmetic; these are about the color the tour actually draws, and they are the ones that
   * would catch a seed chosen for looks rather than measured.
   */
  it('is the same hue in every scheme, so the mark is never the color it is pointing at', () => {
    for (const theme of themeNames) {
      const inks = new Set(SCHEMES.map(s => tourInk(resolvePalette(theme, s).text)));
      expect(inks.size, `${theme}: the tour ink follows the scheme`).toBe(1);
    }
  });

  it('deepens toward the page’s OWN ink, so dark themes brighten rather than darken', () => {
    // a very dark purple on a dark page is a hole, not a highlight — one expression, both ways.
    // Moving TOWARD the page's ink is what the two directions have in common, so that is what is
    // asserted: the deepened accent is closer to the text color than the accent was.
    for (const theme of themeNames) {
      const p = resolvePalette(theme);
      const ink = glowInk(p.accent, p.text);
      expect(
        contrastRatio(ink, p.text),
        `${theme}: the tour ink did not move toward the page's own ink`,
      ).toBeLessThan(contrastRatio(p.accent, p.text));
      // …and the red does the same: darker than its seed in light, lighter in dark and night
      const red = tourInk(p.text);
      expect(
        contrastRatio(red, p.text),
        `${theme}: the red did not move toward the page ink`,
      ).toBeLessThan(contrastRatio(GLOW_SEED, p.text));
    }
  });
});

/**
 * EVERY GROUND THE MARK CAN SIT ON, in every theme × scheme × skin — the grounds `contrast.test.ts`
 * walks, less the first-run pattern (the tour runs after setup, never over it).
 *
 * The edge band is drawn ON the control's own edge and the bands beyond it over whatever surrounds
 * it, so both families count: the page (the app ground, its washes, the paper ground Supplies and
 * Shopping use, and the lit glass ground with its orbs and motif) and every surface a control is
 * made of (a card over each ground, the tab bar's chrome for the dot, a sheet, the solid and
 * raised surfaces, and the category tints a Log tile is filled with).
 */
const everyGround = (theme: ThemeName, scheme: SchemeName, skin: (typeof SKIN_NAMES)[number]) => {
  const r = resolveAppearance(
    { ...DEFAULT_APPEARANCE, theme, scheme, skin },
    'light',
    PLUS_APPEARANCE,
  );
  const c = r.palette;
  const s = r.skinTokens;
  const panel = materialBase(c, s.surface);
  const grounds: Record<string, string> = {
    app: c.app,
    app2: c.app2,
    page: c.page,
    pageWarm: c.pageWarm,
    pageCool: c.pageCool,
    paper: c.paper,
    surface: composite(c.app, panel, s.surface.alpha),
    surfaceOnPage: composite(c.page, panel, s.surface.alpha),
    surfaceOnPaper: composite(c.paper, panel, s.surface.alpha),
    chrome: composite(c.app, materialBase(c, s.chrome), s.chrome.alpha),
    sheet: composite(c.app, materialBase(c, s.sheet), s.sheet.alpha),
    surfaceSolid: c.surfaceSolid,
    surface2: c.surface2,
    surface3: c.surface3,
  };
  /*
    THE CATEGORY TINTS, AND SINCE 2026-10-01 EVERY MODULE'S OWN (the owner: "breastfeeding module is
    also pink-red-ish; making it hard to see"): a Log tile is filled with its module's soft tint
    (`categoryColors`), and the mark's edge is drawn on the tile's own edge, over that fill. The
    module pairs of 2026-09-22 (breastfeed's rose among them) were not walked until then.
  */
  const moduleSofts = [...new Set(Object.values(moduleColor))].map(role => `${role}Soft` as const);
  for (const tint of [
    'accentSoft',
    'milkSoft',
    'sleepSoft',
    'roseSoft',
    'diaperSoft',
    'oliveSoft',
    'cyanSoft',
    ...moduleSofts,
  ] as const) {
    grounds[tint] = composite(c.app, c[tint], s.tintAlpha);
  }
  const lit = groundComposites(c, s);
  if (lit) Object.assign(grounds, lit);
  return { palette: c, grounds };
};

describe('tourInk — red, and legible wherever the tour draws it', () => {
  /**
   * THE OWNER'S TWO WORDS, AS NUMBERS (2026-09-25: *"more easily seen or more intense"*). The mark
   * is a non-text graphic, so 3:1 (WCAG 1.4.11) against what is behind it — and it is held there at
   * the BOTTOM of a breath too, where every band is drawn at `TOUR_INK_FLOOR` of itself: "the low
   * point is still clearly visible" is this assertion.
   */
  it('clears the graphic threshold as the tour draws it, on every ground, at full strength and at the bottom of a breath', () => {
    const failures: string[] = [];
    let checks = 0;
    for (const skin of SKIN_NAMES) {
      for (const scheme of SCHEME_NAMES) {
        for (const theme of themeNames) {
          const { palette, grounds } = everyGround(theme, scheme, skin);
          const ink = tourInk(palette.text);
          for (const [name, ground] of Object.entries(grounds)) {
            const full = contrastRatio(ink, ground);
            const low = contrastRatio(composite(ground, ink, TOUR_INK_FLOOR), ground);
            checks += 2;
            if (full < AA_GRAPHIC)
              failures.push(`${skin}/${scheme}/${theme}: on ${name} ${full.toFixed(2)}:1`);
            if (low < AA_GRAPHIC)
              failures.push(
                `${skin}/${scheme}/${theme}: on ${name} at ${TOUR_INK_FLOOR} ${low.toFixed(2)}:1`,
              );
          }
        }
      }
    }
    // a floor close to the real count, so the sweep cannot quietly stop walking a skin or a ground
    expect(checks).toBeGreaterThanOrEqual(2 * 2 * 6 * 3 * 21);
    expect(failures).toEqual([]);
  });

  it('never breathes lower than the old edge did, and is fully opaque at its strongest', () => {
    // the old edge bottomed out at 0.8 and every band outside it at 0.55 (TourMark, 2026-09-18)
    expect(TOUR_INK_FLOOR).toBeGreaterThan(0.8);
    expect(TOUR_INK_FLOOR).toBeLessThan(1);
  });

  /**
   * "FIND MIDDLE GROUND" (the owner, 2026-09-26: *"the highlight feels too intense, before too soft,
   * now too intense"*). The breath of 2026-09-25 dimmed every band to 85% of itself; the gentler one
   * dims them to 90% — a smaller swing, still a breath (it moves at all), and the gate above holds
   * at its low point.
   */
  it('breathes more gently than the 2026-09-25 mark did, and still visibly', () => {
    expect(TOUR_INK_FLOOR).toBeGreaterThan(0.85);
    expect(TOUR_INK_FLOOR).toBeLessThanOrEqual(0.92);
  });
});

/** HSL, the way a designer reads a swatch: hue in degrees, saturation and lightness 0–1. */
const hsl = (color: string): { h: number; s: number; l: number } => {
  const { r, g, b } = parseColor(color);
  const [R, G, B] = [r / 255, g / 255, b / 255];
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const d = max - min;
  const l = (max + min) / 2;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d !== 0) {
    h = max === R ? ((G - B) / d) % 6 : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
    h = (h * 60 + 360) % 360;
  }
  return { h, s, l };
};

/**
 * RED, AND NOT THE THINGS A RED DRIFTS INTO. A hue near 0° is not enough on its own: the coral
 * this replaced sat at 10° in dark — as a pastel pink. So the pin is three numbers: the hue within
 * 15° of red either side (orange starts past it), a saturation that makes it a color rather than a
 * tint of gray, and a lightness that keeps it off black and off pastel.
 */
const isRed = (color: string): boolean => {
  const { h, s, l } = hsl(color);
  return (h >= 345 || h <= 15) && s >= 0.6 && l >= 0.25 && l <= 0.75;
};

describe('the tour ink is RED in every theme, so it cannot drift back to orange', () => {
  it('reads as red in light, dark and night', () => {
    for (const theme of themeNames) {
      const ink = tourInk(resolvePalette(theme).text);
      const { h, s, l } = hsl(ink);
      expect(
        isRed(ink),
        `${theme}: ${ink} is hue ${h.toFixed(1)}°, saturation ${s.toFixed(2)}, lightness ${l.toFixed(2)}`,
      ).toBe(true);
    }
  });

  it('is a pin that can fail: the coral it replaced is rejected in every theme', () => {
    // #91675F in light (a dusty brown), #F1BDB2 in dark (a pastel), #EDA481 at night (a peach) —
    // the owner's "closer to red" is exactly the distance between these and the line above
    for (const theme of themeNames) {
      const coral = composite('#F8907C', resolvePalette(theme).text, 0.45);
      expect(isRed(coral), `${theme}: the retired coral ${coral} passes as red`).toBe(false);
    }
  });

  it('keeps the seed a full-strength red, a step toward rose, and pulls it less than the accent was', () => {
    // full saturation, because the page's ink supplies the rest and any gray in the seed survives
    // into every theme; a few degrees below 0°, because that is the one direction with room
    // (`GLOW_SEED` has the measurements of the coral and the pink it could not be)
    const seed = hsl(GLOW_SEED);
    expect(seed.s).toBe(1);
    expect(seed.h).toBeGreaterThanOrEqual(345);
    expect(seed.h).toBeLessThan(360);
    expect(TOUR_DEEPEN).toBeGreaterThan(0);
    expect(TOUR_DEEPEN).toBeLessThan(0.45);
  });
});

/**
 * ── THE MIDDLE GROUND, AS A NUMBER (2026-09-26) ─────────────────────────────────────────────────
 *
 * *"The highlight feels too intense, before too soft, now too intense. find middle ground."* A
 * color's intensity is its chroma — how far it is from gray at its own lightness — so the claim is
 * pinned there: in every theme the ink is softer than the pure red of 2026-09-25 and stronger than
 * the coral before it, by a step the eye can see, and still apart from `crit`, the app's "late".
 */
describe('the tour ink sits between the coral that was too soft and the red that was too intense', () => {
  const chroma = (color: string): number => {
    const [, a, b] = lab(color);
    return Math.hypot(a, b);
  };
  const red = (pageInk: string): string => composite('#FF0000', pageInk, 0.4);
  const coral = (pageInk: string): string => composite('#F8907C', pageInk, 0.45);

  it('has less chroma than the red and more than the coral, in every theme', () => {
    for (const theme of themeNames) {
      const p = resolvePalette(theme);
      const ink = tourInk(p.text);
      const now = chroma(ink);
      expect(now, `${theme}: ${ink} is no softer than the red`).toBeLessThan(chroma(red(p.text)));
      expect(now, `${theme}: ${ink} is no stronger than the coral`).toBeGreaterThan(
        chroma(coral(p.text)) + 10,
      );
      // a step the eye can see, not a rounding error: ΔE 10 is two colors side by side, apart
      expect(deltaE(ink, red(p.text)), `${theme}: ${ink} is the same red`).toBeGreaterThan(10);
    }
  });

  it('stays apart from late (crit), which is also a red', () => {
    for (const theme of themeNames) {
      const p = resolvePalette(theme);
      const ink = tourInk(p.text);
      expect(deltaE(ink, p.crit), `${theme}: ${ink} vs crit ${p.crit}`).toBeGreaterThan(12);
    }
  });
});

/** CIE L*a*b* (D65), for the one question contrast cannot answer: are two colors the same color? */
const lab = (color: string): [number, number, number] => {
  const { r, g, b } = parseColor(color);
  const lin = (v: number): number => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const [R, G, B] = [lin(r), lin(g), lin(b)];
  const f = (t: number): number => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116);
  const x = f((0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047);
  const y = f(0.2126 * R + 0.7152 * G + 0.0722 * B);
  const z = f((0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
};
const deltaE = (a: string, b: string): number => {
  const [l1, a1, b1] = lab(a);
  const [l2, a2, b2] = lab(b);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
};

describe('the mark is never the color it is pointing at (2026-09-22)', () => {
  /**
   * WHY THE SEED LEFT THE ACCENT, AS A NUMBER. Contrast says whether a mark can be seen; it cannot
   * say whether it can be told apart from the chips and buttons around it, which is a question of
   * hue and chroma. ΔE 20 is two colors nobody would call the same. The coral failed it: at night
   * it was ΔE 6.6 from the Clay scheme's `accent2`, the same peach as every button on that page.
   */
  it('stays well apart from every scheme’s accents, in every theme', () => {
    const near: string[] = [];
    for (const theme of themeNames) {
      for (const scheme of SCHEMES) {
        const p = resolvePalette(theme, scheme);
        const ink = tourInk(p.text);
        for (const role of ['accent', 'accent2'] as const) {
          const d = deltaE(ink, p[role]);
          if (d < 20)
            near.push(`${scheme}/${theme}: ${ink} vs ${role} ${p[role]} ΔE ${d.toFixed(1)}`);
        }
      }
    }
    expect(near).toEqual([]);
  });
});

/**
 * ── THE GLOW ON A RUNNING CARD (2026-10-01) ─────────────────────────────────────────────────────
 *
 * The owner, on step 1 with a breastfeed started: *"the red module doesnt breath enough and
 * breastfeeding module is also pink-red-ish; making it hard to see."* The mark on a running timer's
 * stop keeps its red edge on the pill and breathes its glow, which lies on the card, in the page's
 * own solid surface (`tourHalo`). The running cards' own pictures are walked in the app, beside the
 * measurements of them (`apps/mobile/src/tour/glow.test.ts`); their gradients, which every card is
 * drawn on under its picture, are walked here.
 */
describe('tourHalo — the glow on a running card, in the page’s own surface', () => {
  it('is the solid surface in every theme and scheme, so it is never a new color', () => {
    for (const theme of themeNames) {
      for (const scheme of SCHEMES) {
        const p = resolvePalette(theme, scheme);
        expect(tourHalo(p), `${scheme}/${theme}`).toBe(p.surfaceSolid);
      }
    }
  });

  it('never runs into the red edge beside it: 3:1 apart at full strength and at the bottom of a breath', () => {
    for (const theme of themeNames) {
      for (const scheme of SCHEMES) {
        const p = resolvePalette(theme, scheme);
        const ink = tourInk(p.text);
        const halo = tourHalo(p);
        expect(contrastRatio(ink, halo), `${scheme}/${theme}`).toBeGreaterThanOrEqual(AA_GRAPHIC);
        expect(
          contrastRatio(composite(halo, ink, TOUR_INK_FLOOR), halo),
          `${scheme}/${theme} at the floor`,
        ).toBeGreaterThanOrEqual(AA_GRAPHIC);
      }
    }
  });

  /**
   * EVERY RUNNING CARD'S OWN COLORS — the rose of a breastfeed, the milk of a pump, the indigo of a
   * nap and of tummy time, both ends of each — and the red beside them. At the card's foot, where its
   * stop is (the gradient runs to the bottom right), the red is under ΔE 31 from the rose in light and
   * under 26 in dark: the reason the glow there could not be seen. The halo is more than 50 from
   * every stop of every card, two colors nobody would call the same twice over.
   */
  it('stands well off every running card’s gradient, where the red does not off the rose', () => {
    const cards = ['rose', 'milk', 'sleep'] as const;
    for (const theme of ['light', 'dark'] as const) {
      const p = resolvePalette(theme);
      const ink = tourInk(p.text);
      const halo = tourHalo(p);
      for (const card of cards) {
        for (const stop of gradients[theme][card]) {
          expect(deltaE(halo, stop), `${theme} ${card} ${stop}`).toBeGreaterThan(50);
        }
      }
      // the measured failure, so the change is pinned to it: the red on the rose, under the stop
      const foot = gradients[theme].rose[1];
      expect(deltaE(ink, foot), `${theme} rose ${foot}`).toBeLessThan(31);
      expect(deltaE(halo, foot), `${theme} rose ${foot}`).toBeGreaterThan(2 * deltaE(ink, foot));
    }
  });
});
