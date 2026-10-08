import { describe, expect, it } from 'vitest';
import { DEFAULT_APPEARANCE, PLUS_APPEARANCE, resolveAppearance, SCHEME_NAMES } from './appearance';
import { composite, contrastRatio, parseColor } from './contrast';
import {
  GROUND_WASH_REF,
  MOTIF_ALPHA_MAX,
  MOTIF_BLEED_MIN_SIZE_K,
  MOTIF_COVERAGE_MAX,
  MOTIF_PLAN,
  MOTIF_READING_BAND,
  MOTIF_STROKE_MAX_PX,
  MOTIF_STROKE_MIN_PX,
  PATTERN_COVERAGE_MAX,
  PATTERN_GLYPHS,
  pattern,
  patternAlpha,
  patternComposites,
  BLOOM_K,
  COOL_K,
  ORB_PLAN,
  WARM_K,
  groundComposites,
  motif,
  motifAlpha,
  motifCoverage,
  orbAlphaAt,
  orbLayer,
  orbs,
  rotatedExtent,
  washAlpha,
  washes,
  type MotifInk,
} from './ground';
import {
  materialBase,
  SKIN_NAMES,
  SKINS,
  skinForTheme,
  surfaceAlphaFor,
  TINT_EDGE,
  tintAlphaFor,
} from './skins';
import { themeNames } from './theme';

/**
 * The ground is a composition, and a composition in a workspace with no renderer is only ever
 * verified by arithmetic. These assertions are the whole verification story for the layer: the
 * alpha ladder, the stroke clamp, non-overlap, the reading band, the bleed rule, the ink budget,
 * the zero-wash identity, and — the owner's actual question — whether it is visibly not flat.
 *
 * The contrast half lives in contrast.test.ts, which composites groundComposites() into its
 * existing matrix. Between them nothing about this layer is asserted by eye.
 */

/** The twelve viewports the composition is verified against: phones, tablets, and landscape. */
const VIEWPORTS: [number, number][] = [
  [320, 568],
  [360, 640],
  [375, 667],
  [390, 844],
  [402, 874],
  [414, 896],
  [430, 932],
  [440, 956],
  [600, 900],
  [744, 1133],
  [834, 1194],
  [932, 430],
];

/** sRGB → CIE Lab → ΔE76. Twelve lines rather than a dependency (COLLABORATION.md §"lockfile"). */
const toLab = (hex: string): [number, number, number] => {
  const c = parseColor(hex);
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const [r, g, b] = [lin(c.r), lin(c.g), lin(c.b)];
  // D65 white point
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const x = f((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047);
  const y = f((0.2126 * r + 0.7152 * g + 0.0722 * b) / 1.0);
  const z = f((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
};
const deltaE76 = (a: string, b: string): number => {
  const [l1, a1, b1] = toLab(a);
  const [l2, a2, b2] = toLab(b);
  return Math.sqrt((l1 - l2) ** 2 + (a1 - a2) ** 2 + (b1 - b2) ** 2);
};

/** Every skin × scheme × theme, resolved exactly as the app resolves it. */
const everyAppearance = () =>
  SKIN_NAMES.flatMap(skin =>
    SCHEME_NAMES.flatMap(scheme =>
      themeNames.map(theme => ({
        // spread FIRST: resolveAppearance returns its own skin/scheme/theme, and the labels below
        // are the ones asked for, which is what a failure message needs to name
        ...resolveAppearance(
          { ...DEFAULT_APPEARANCE, theme, scheme, skin },
          'light',
          PLUS_APPEARANCE,
        ),
        asked: { skin, scheme, theme },
      })),
    ),
  );

describe('ground — the wash is off completely when the skin says so', () => {
  it('returns nothing at all at groundWash 0', () => {
    expect(washAlpha(0, WARM_K)).toBe(0);
    expect(motifAlpha(0)).toBe(0);
    expect(washes(390, 844, 0)).toEqual([]);
    expect(motif(390, 844, 0)).toEqual([]);
  });

  it('gives Paper no ground, and night no ground on any skin', () => {
    // This is the whole of D2: Paper is "flat, quiet, high contrast" and night is §22's "nothing
    // on the screen that is not information". Neither needs a theme check in the ground, because
    // skins.ts and skinForTheme already carry the decision.
    expect(SKINS.paper.groundWash).toBe(0);
    expect(
      groundComposites(
        resolveAppearance(DEFAULT_APPEARANCE, 'light', PLUS_APPEARANCE).palette,
        SKINS.paper,
      ),
    ).toBe(null);
    for (const skin of SKIN_NAMES) {
      const r = resolveAppearance(
        { ...DEFAULT_APPEARANCE, theme: 'night', skin },
        'light',
        PLUS_APPEARANCE,
      );
      expect(skinForTheme(SKINS[skin], 'night').groundWash, `${skin} in night`).toBe(0);
      expect(groundComposites(r.palette, r.skinTokens), `${skin} in night`).toBe(null);
    }
  });
});

describe('ground — the orbs are glass only, soft-tinted, and at the edges', () => {
  it('draws four under glass and none under Paper or night', () => {
    expect(orbs(390, 844, SKINS.glass.orbAlpha)).toHaveLength(4);
    expect(orbs(390, 844, SKINS.paper.orbAlpha)).toEqual([]);
    expect(skinForTheme(SKINS.glass, 'night').orbAlpha).toBe(0);
    // Dark keeps them — the owner's note was about dark glass looking like nothing — but far
    // dimmer, because a `*Soft` token is a LIGHT color and the same alpha that warms a light page
    // is a bright band on a near-black one. Both numbers are the reference's (`.orbs .blob`).
    expect(SKINS.glass.orbAlpha).toBe(0.58);
    expect(skinForTheme(SKINS.glass, 'dark').orbAlpha).toBe(0.13);
    expect(skinForTheme(SKINS.glass, 'light').orbAlpha).toBe(SKINS.glass.orbAlpha);
  });

  it('paints the soft tint tokens, never a raw hue (a raw hue fails warn on a panel over it)', () => {
    for (const o of ORB_PLAN) expect(o.token.endsWith('Soft'), o.key).toBe(true);
  });

  it('crosses an edge with every disc, at every viewport, so an orb reads as light and not a sticker', () => {
    for (const [W, H] of VIEWPORTS) {
      for (const o of orbs(W, H, 1)) {
        expect(o.cx - o.r < 0 || o.cx + o.r > W, `${o.key} at ${W}x${H}`).toBe(true);
        expect(o.cy).toBeGreaterThan(0);
        expect(o.cy).toBeLessThan(H);
      }
    }
  });

  it('has a profile that starts at the peak, never rises, and is gone at its reach', () => {
    for (const o of orbs(390, 844, 1)) {
      expect(orbAlphaAt(o, 0)).toBe(1);
      expect(orbAlphaAt(o, o.reach)).toBe(0);
      let prev = 1;
      for (let d = 0; d <= o.reach; d += 1) {
        const a = orbAlphaAt(o, d);
        expect(a).toBeLessThanOrEqual(prev + 1e-9);
        prev = a;
      }
      // flat inside the disc's core — a blurred disc is a plateau, not a spike
      expect(orbAlphaAt(o, Math.max(0, o.r - 44) * 0.5)).toBe(1);
    }
  });

  it('hands the matrix a peak, a half and a panel over each, under a spelling both sides share', () => {
    const r = resolveAppearance(
      { ...DEFAULT_APPEARANCE, skin: 'glass', theme: 'light' },
      'light',
      PLUS_APPEARANCE,
    );
    const g = groundComposites(r.palette, r.skinTokens)!;
    for (const o of ORB_PLAN) {
      const name = orbLayer(o.key);
      expect(name).toBe(`orb${o.key[0]!.toUpperCase()}${o.key.slice(1)}`);
      for (const k of [name, `${name}Half`, `surfaceOn${name[0]!.toUpperCase()}${name.slice(1)}`])
        expect(g[k], k).toMatch(/^#[0-9A-F]{6}$/);
    }
    // AND THE PEAK IS NEVER THE TINT TOKEN ITSELF. `orbStops` is flat inside `r − blur`, so at a
    // peak of 1 the core of a disc does not tint the ground, it replaces it — the page there was
    // exactly `roseSoft`, which is also what a breastfeed tile is filled with and what dark glass
    // is made of, so the object and the ground behind it measured the same hex: 1.000:1, ΔE 0.00.
    // This is the assertion that would have caught it, and it is the shape of CONTRAST_FINDINGS
    // §5b — the reference and the app disagreeing about how one ground layer is painted.
    expect(g.orbRose).not.toBe(r.palette.roseSoft);
    for (const o of ORB_PLAN)
      expect(g[orbLayer(o.key)], o.key).not.toBe(r.palette[o.token as keyof typeof r.palette]);
    // AND PAPER HAS NO GROUND AT ALL. This used to name Soft, which washed without orbs; Soft
    // was removed on 2026-09-18 and Paper — `groundWash: 0`, `orbAlpha: 0` — is the flat one.
    // `groundComposites` returns null for it, which is stronger than "no orb keys": there is
    // nothing to composite, so a screen under Paper paints `app` and nothing else.
    expect(
      groundComposites(
        r.palette,
        resolveAppearance({ ...DEFAULT_APPEARANCE, skin: 'paper' }, 'light', PLUS_APPEARANCE)
          .skinTokens,
      ),
    ).toBe(null);
  });
});

describe('ground — the alpha ladder is the published table', () => {
  // 0.12 was Soft's wash and Soft is gone (2026-09-18); the ladder itself is unchanged, and
  // these are still the published numbers for a skin that washes at 0.12
  it('is exactly these numbers at a 0.12 wash', () => {
    expect(GROUND_WASH_REF).toBe(0.12);
    expect(washAlpha(0.12, WARM_K)).toBeCloseTo(0.432, 9);
    expect(washAlpha(0.12, COOL_K)).toBeCloseTo(0.36, 9);
    expect(washAlpha(0.12, BLOOM_K)).toBeCloseTo(0.216, 9);
    expect(motifAlpha(0.12)).toBeCloseTo(0.09, 9);
  });

  it('never lets Glass draw a louder motif than Soft', () => {
    expect(washAlpha(0.22, WARM_K)).toBeCloseTo(0.792, 9);
    expect(washAlpha(0.22, COOL_K)).toBeCloseTo(0.66, 9);
    expect(washAlpha(0.22, BLOOM_K)).toBeCloseTo(0.396, 9);
    // 0.22 × 0.75 = 0.165, clamped back to the ceiling the contrast gate measured
    expect(motifAlpha(0.22)).toBeCloseTo(MOTIF_ALPHA_MAX, 9);
  });

  it('keeps every alpha in range for any groundWash a future skin might set', () => {
    for (let w = 0; w <= 1.0001; w += 0.01) {
      for (const g of washes(390, 844, w)) {
        expect(g.alpha, `wash ${g.key} at ${w}`).toBeGreaterThanOrEqual(0);
        expect(g.alpha, `wash ${g.key} at ${w}`).toBeLessThanOrEqual(1);
      }
      expect(motifAlpha(w)).toBeGreaterThanOrEqual(0);
      expect(motifAlpha(w)).toBeLessThanOrEqual(MOTIF_ALPHA_MAX);
    }
  });

  it('draws exactly three washes, in order, from the three ground tokens and nothing else', () => {
    const g = washes(390, 844, GROUND_WASH_REF);
    expect(g.map(x => x.key)).toEqual(['warm', 'cool', 'bloom']);
    // NOT 'accent', which costs the status inks their headroom (warn measures 3.93:1 on the
    // prototype's raw accent at 16%), and NOT 'accentSoft' either, which was the first fix for
    // that and brought a second bug with it: `accentSoft` is what an accent-tinted CARD is filled
    // with, so the ground and the object on it were the same color (ΔE 0.35, below the threshold
    // at which two large fields differ at all). Every wash is now a `page*` token, whose only job
    // is to be a ground. A well-meaning port back to either would silently break a gate, so all
    // three are asserted by name.
    expect(g.map(x => x.token)).toEqual(['pageWarm', 'pageCool', 'page']);
    for (const x of g) expect(String(x.token).startsWith('page'), String(x.token)).toBe(true);
  });
});

describe('ground — the motif is drawn, not scratched', () => {
  it('hands Icon a strokeWidth that really renders the width it promises', () => {
    // The honest half. Asserting that renderedStroke() lands inside [MIN, MAX] would be the clamp
    // asserting itself — true for any inputs, including a motif plan that had been destroyed. What
    // is a real invariant is the ROUND TRIP: Icon draws in 24-unit space, so the width that
    // reaches the screen is strokeWidth * size / 24, and that must equal renderedStroke(size).
    // A wrong conversion here is exactly the bug that would make a 227px glyph draw a 16px marker.
    for (const [w, h] of VIEWPORTS) {
      for (const m of motif(w, h, GROUND_WASH_REF)) {
        expect((m.strokeWidth * m.size) / 24, `${m.key} at ${w}×${h}`).toBeCloseTo(
          m.renderedStroke,
          9,
        );
      }
    }
  });

  it('actually needs the clamp — the sprite default would draw a marker', () => {
    // The assertion that would catch a destroyed plan: the clamp has to be DOING something. The
    // sprite's own 1.7 stroke is not non-scaling, so on the large glyphs it renders far outside
    // the band, which is the whole reason this arithmetic exists.
    const big = motif(375, 667, GROUND_WASH_REF).filter(m => m.size > 100);
    expect(big.length).toBeGreaterThanOrEqual(3);
    for (const m of big) {
      const spriteDefault = (1.7 * m.size) / 24;
      expect(spriteDefault, `${m.key} unclamped`).toBeGreaterThan(MOTIF_STROKE_MAX_PX);
      expect(m.renderedStroke).toBeLessThanOrEqual(MOTIF_STROKE_MAX_PX + 1e-9);
      expect(m.renderedStroke).toBeGreaterThanOrEqual(MOTIF_STROKE_MIN_PX - 1e-9);
    }
  });

  it('never overlaps two glyphs, at any of the twelve viewports', () => {
    // The load-bearing assertion. Two overlapping glyphs double the ink, which is exactly what
    // would make the single flat composite in contrast.test.ts an optimistic measurement rather
    // than an honest one.
    for (const [w, h] of VIEWPORTS) {
      const specs = motif(w, h, GROUND_WASH_REF);
      const box = (m: (typeof specs)[number]) => {
        const side = rotatedExtent(m.size, m.rotate);
        return { l: m.cx - side / 2, r: m.cx + side / 2, t: m.cy - side / 2, b: m.cy + side / 2 };
      };
      for (let i = 0; i < specs.length; i++) {
        for (let j = i + 1; j < specs.length; j++) {
          const a = box(specs[i]!);
          const b = box(specs[j]!);
          const hit = a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
          expect(hit, `${specs[i]!.key} overlaps ${specs[j]!.key} at ${w}×${h}`).toBe(false);
        }
      }
    }
  });

  it('keeps the reading band clear', () => {
    // Where the step track, the eyebrow and the H1 land at 1× type. It is the one concession the
    // composition makes to dynamic type; at 200% a wrapped paragraph WILL cross a glyph, and the
    // contrast gate rather than the layout is what protects that case.
    const [lo, hi] = MOTIF_READING_BAND;
    for (const [w, h] of VIEWPORTS) {
      for (const m of motif(w, h, GROUND_WASH_REF)) {
        const inBand = m.cy >= lo * h && m.cy <= hi * h;
        expect(inBand, `${m.key} sits in the reading band at ${w}×${h}`).toBe(false);
      }
    }
  });

  it('bleeds every large glyph off an edge', () => {
    // What keeps babyface, moon and bottle a texture rather than three stickers.
    for (const [w, h] of VIEWPORTS) {
      const specs = motif(w, h, GROUND_WASH_REF);
      for (let i = 0; i < specs.length; i++) {
        const m = specs[i]!;
        if (MOTIF_PLAN[i]!.sizeK <= MOTIF_BLEED_MIN_SIZE_K) continue;
        const side = rotatedExtent(m.size, m.rotate);
        const crosses =
          m.cx - side / 2 < 0 || m.cx + side / 2 > w || m.cy - side / 2 < 0 || m.cy + side / 2 > h;
        expect(crosses, `${m.key} does not bleed at ${w}×${h}`).toBe(true);
      }
    }
  });

  it('stays inside the ink budget at every viewport, not just the two convenient ones', () => {
    for (const [w, h] of VIEWPORTS) {
      const cover = motifCoverage(motif(w, h, GROUND_WASH_REF), w, h);
      expect(cover, `coverage at ${w}×${h}`).toBeLessThanOrEqual(MOTIF_COVERAGE_MAX);
    }
  });

  it('is four glyphs, and a fifth fails this test', () => {
    // The budget alone does not forbid one: a small enough glyph fits under any area ceiling, and
    // at the old 0.065 there was room for a whole extra face. The composition is hand-tuned and
    // verified non-overlapping at twelve viewports, so growing it is a deliberate act that should
    // have to re-run that verification rather than slip in under a limit.
    expect(MOTIF_PLAN.length).toBe(4);
  });

  it('uses two inks and only two', () => {
    const inks = new Set(MOTIF_PLAN.map(p => p.ink));
    expect([...inks].sort()).toEqual(['milk', 'sleep']);
    // a compile-time assertion that the union is closed: accent costs headroom, text fails outright
    const allowed: MotifInk[] = ['milk', 'sleep'];
    expect(allowed).toHaveLength(2);
    // @ts-expect-error 'accent' is not a MotifInk — the ground carries no accent and no category hue
    const notAllowed: MotifInk = 'accent';
    expect(notAllowed).toBe('accent');
  });
});

describe('ground — it is visibly not flat (the owner asked for this, so it is measured)', () => {
  it('puts the motif above the threshold of perception everywhere it renders', () => {
    let worst = Infinity;
    let where = '';
    for (const a of everyAppearance()) {
      const g = groundComposites(a.palette, a.skinTokens);
      if (!g) continue;
      for (const [name, c] of [
        ['milk', g.groundMotifMilk],
        ['sleep', g.groundMotifSleep],
      ] as [string, string][]) {
        const d = deltaE76(c, g.ground);
        if (d < worst) {
          worst = d;
          where = `${a.asked.skin}/${a.asked.scheme}/${a.asked.theme} ${name}`;
        }
      }
    }
    // ΔE 2.3 is the classic just-noticeable difference; 5 is comfortably above it
    expect(worst, `weakest motif at ${where}`).toBeGreaterThanOrEqual(5.0);
  });

  it('makes the wash itself perceptible, which it was not while the bloom was a panel token', () => {
    // This used to assert the opposite — `< 2.0`, ΔE below the just-noticeable difference — and
    // recorded it as a fact the motif had to make up for: "the page tokens are simply not far
    // from `app` in the dark schemes, so a wash built only from them cannot answer 'not just
    // solid-boring color'". It was measuring the wrong wash. The bloom was `accentSoft`, and in a
    // dark scheme `accentSoft` is a near-black tint barely off `app`, which is why the stack
    // landed on top of the ground it started from. `page` is the token whose job this is, and the
    // same three washes now move the ground more than twice the JND in the very scheme that was
    // the counter-example. The motif still earns its place; it is no longer carrying the layer.
    // Named glass, not Soft: Soft was the washed-but-orbless skin this test used, and it was
    // removed on 2026-09-18. `ground` is the WASH stack alone — the orbs are their own layers
    // above it — so measuring it under glass measures exactly what this test is about.
    const r = resolveAppearance(
      { ...DEFAULT_APPEARANCE, theme: 'dark', scheme: 'slate', skin: 'glass' },
      'light',
      PLUS_APPEARANCE,
    );
    const g = groundComposites(r.palette, r.skinTokens);
    expect(g).not.toBe(null);
    expect(deltaE76(g!.ground, r.palette.app)).toBeGreaterThan(2.3);
  });

  /**
   * THE GATE THAT WAS MISSING, and the reason three screens shipped flat.
   *
   * Every ink is measured against every ground it can land on (contrast.test.ts, ~6,000 checks).
   * Nothing measured the OBJECT against the ground — whether a card, a list group or a category
   * tile is a different color from the page it floats on. It was not, in places: a dark glass
   * panel over the accent orb measured `#2B2358` on `#2B2358` and a rose Quick tile over the rose
   * orb `#FCE1EC` on `#FCE1EC`. Both are 1.000:1 and ΔE 0.00 — an object that is not there — and
   * the owner read all of it on an Android phone as the milk stash, the shopping list and the
   * Quick tiles having "no contrast" with the background.
   *
   * IT IS MEASURED IN ΔE AND NOT IN A CONTRAST RATIO, which is the trap this file exists to avoid
   * (docs/CONTRAST_FINDINGS.md: eight ways a number here has been wrong). A WCAG ratio is a
   * function of luminance alone, so two colors of different hue at the same lightness measure
   * 1.000:1 while being plainly different objects — `#1D2A43` on `#152D38` does. A ratio cannot
   * tell "the same color" from "the same brightness", and only one of those is a defect.
   *
   * BOTH PLATFORMS. `canBlur` false is Android, where there is no BlurView and the material takes
   * its no-blur numbers — a panel at 76%, a tint opaque (skins.ts surfaceAlphaFor / tintAlphaFor);
   * true is iOS. The owner's phone is the one the declared alphas do not describe, so gating only
   * the declared numbers would have measured the platform that was not complaining. This is the
   * gate that holds the 76%: a panel translucent enough to show the ground is still a JND off it.
   */
  it('keeps every panel and every category tile a different color from the ground under it', () => {
    const JND = 2.3;
    const failures: string[] = [];
    let checks = 0;
    let worst = { d: Infinity, what: '' };
    for (const a of everyAppearance()) {
      const g = groundComposites(a.palette, a.skinTokens);
      if (!g) continue;
      const c = a.palette;
      // the grounds a panel actually floats on: the wash stack, the motif band, each orb at its
      // peak and at half. Not the `surfaceOn…` layers, which are a panel over a ground already.
      const under = Object.entries(g).filter(
        ([k]) => !k.startsWith('surfaceOn') && !k.startsWith('accentSoftOn'),
      );
      for (const canBlur of [true, false]) {
        const base = materialBase(c, a.skinTokens.surface);
        const panelAlpha = surfaceAlphaFor(a.skinTokens.surface, canBlur);
        const tintAlpha = tintAlphaFor(a.skinTokens, canBlur);
        for (const [name, ground] of under) {
          // An object separates by its FILL or by its BOUNDARY, so the measure is the better of
          // the two. A neutral panel has only a fill worth measuring — its edge is a 15% line or
          // a hairline of white light, neither of which marks anything — so it is held to the
          // fill alone.
          // A tinted one carries its category at the edge as well (skins.ts TINT_EDGE), and it
          // has to: a scheme's `accentSoft` and a theme's `pageCool` are near neighbours in Ocean
          // and Slate, so an accent tile on the cool wash is the same blue at any opacity (ΔE
          // 0.54, the weakest fill in the matrix) and only its edge tells it from the page.
          const objects: [string, string, string | null][] = [
            ['the panel', composite(ground, base, panelAlpha), null],
            ...(['milk', 'sleep', 'rose', 'diaper', 'olive', 'cyan', 'accent'] as const).map(
              cat => {
                const fill = composite(ground, c[`${cat}Soft`], tintAlpha);
                const edge = composite(fill, c[cat], TINT_EDGE);
                return [`a ${cat} tile`, fill, edge] as [string, string, string];
              },
            ),
          ];
          for (const [what, fill, edge] of objects) {
            checks++;
            const d = Math.max(deltaE76(fill, ground), edge === null ? 0 : deltaE76(edge, ground));
            const where = `${a.asked.skin}/${a.asked.scheme}/${a.asked.theme} ${what} on ${name} (${ground} vs ${fill}, blur ${canBlur})`;
            if (d < worst.d) worst = { d, what: where };
            if (d < JND) failures.push(`ΔE ${d.toFixed(2)} — ${where}`);
          }
        }
      }
    }
    expect(checks).toBeGreaterThan(2000);
    expect(failures, `weakest: ΔE ${worst.d.toFixed(2)} at ${worst.what}`).toEqual([]);
  });
});

/**
 * THE MODEL CHECK — the assertion that makes every other contrast number in this change honest.
 *
 * `groundComposites()` hands the token matrix ONE flat color per layer, composited at the wash's
 * FULL alpha. What `Ground.tsx` actually paints is a radial gradient falling from that alpha at its
 * center to nothing at its `fade` offset, and the three washes overlap in different combinations
 * across the screen. So the matrix measures a point, and the screen is a field.
 *
 * That is only sound if the measured point is the worst one, and it is not obvious that it is:
 * contrast is monotone in luminance, but luminance is a CONVEX function of the sRGB channels, so
 * the darkest point of a set of blended colors need not be one of the corners the matrix checks.
 * It can be interior — and interior is exactly where three overlapping washes live.
 *
 * So this samples the real field on a grid, reproducing SVG's own gradient interpolation (offset is
 * the normalized elliptical radius; the last stop extends outward), composites the washes in paint
 * order, adds the motif ink wherever a glyph's BOX covers the sample — strictly more ink than the
 * stroke actually lays down — and checks every ink at every sample in every skin x scheme x theme.
 *
 * It is honest about what it is: it encodes the SVG gradient specification rather than calling a
 * renderer, so it verifies the MODEL and not the pixels. The device pass is still owed.
 */
const sampleGround = (
  palette: Parameters<typeof groundComposites>[0],
  skin: Parameters<typeof groundComposites>[1],
  width: number,
  height: number,
  x: number,
  y: number,
): string => {
  const w = skin.groundWash;
  let ground = palette.app;
  for (const g of washes(width, height, w)) {
    const r = Math.sqrt(((x - g.cx) / g.rx) ** 2 + ((y - g.cy) / g.ry) ** 2);
    const k = r >= g.fade ? 0 : 1 - r / g.fade;
    if (k > 0) ground = composite(ground, palette[g.token] as string, g.alpha * k);
  }
  // the orbs, in paint order after the washes, at the alpha the profile gives this distance
  for (const o of orbs(width, height, skin.orbAlpha)) {
    const a = orbAlphaAt(o, Math.hypot(x - o.cx, y - o.cy));
    if (a > 0) ground = composite(ground, palette[o.token] as string, a);
  }
  for (const m of motif(width, height, w)) {
    const side = rotatedExtent(m.size, m.rotate);
    const covered =
      x >= m.cx - side / 2 && x <= m.cx + side / 2 && y >= m.cy - side / 2 && y <= m.cy + side / 2;
    if (covered) ground = composite(ground, palette[m.ink] as string, motifAlpha(w));
  }
  return ground;
};

describe('ground — the flat composites the matrix gates are the worst case on the real field', () => {
  it('finds no sampled point worse than what is already measured', () => {
    const [W, H] = [390, 844];
    const STEP = 26;
    const failures: string[] = [];
    let samples = 0;
    let worstText2 = Infinity;
    let gateWorstText2 = Infinity;
    const grid = (Math.floor(W / STEP) + 1) * (Math.floor(H / STEP) + 1);
    const lit = everyAppearance().filter(
      a => a.skinTokens.groundWash > 0 || a.skinTokens.orbAlpha > 0,
    );
    const expectedSamples = lit.length * grid;
    for (const a of lit) {
      const c = a.palette;
      for (const layer of Object.values(groundComposites(c, a.skinTokens)!))
        gateWorstText2 = Math.min(gateWorstText2, contrastRatio(c.text2, layer));
      const panelBase = materialBase(c, a.skinTokens.surface);
      const panelAlpha = a.skinTokens.surface.alpha;
      const tintAlpha = a.skinTokens.tintAlpha;
      for (let x = 0; x <= W; x += STEP) {
        for (let y = 0; y <= H; y += STEP) {
          const g = sampleGround(c, a.skinTokens, W, H, x, y);
          samples++;
          // the inks that sit directly on the page
          const pairs: [string, string, string, number][] = [
            ['text', c.text, g, 4.5],
            ['text2', c.text2, g, 4.5],
            ['text3', c.text3, g, 3.0],
            ['accent2', c.accent2, g, 4.5],
          ];
          // and the ones that sit on a panel, or on a category tint, over this same point —
          // a status word on a card, a category glyph in a chip
          const panel = composite(g, panelBase, panelAlpha);
          for (const st of ['good', 'warn', 'crit'] as const)
            pairs.push([`${st} on the panel`, c[st], panel, 4.5]);
          for (const cat of ['milk', 'sleep', 'rose', 'diaper', 'olive', 'cyan'] as const) {
            pairs.push([`${cat} glyph on the panel`, c[cat], panel, 3.0]);
            pairs.push([
              `${cat} glyph on ${cat}Soft`,
              c[cat],
              composite(g, c[`${cat}Soft`], tintAlpha),
              3.0,
            ]);
          }
          for (const [name, ink, bg, min] of pairs) {
            const v = contrastRatio(ink, bg);
            if (name === 'text2' && v < worstText2) worstText2 = v;
            if (v < min)
              failures.push(
                `${a.asked.skin}/${a.asked.scheme}/${a.asked.theme} ${name} at (${x},${y}) = ${v.toFixed(2)}:1 (min ${min})`,
              );
          }
        }
      }
    }
    // DERIVED, not a magic number: it was `> 10_000` and sized for three skins, so removing one
    // failed a test about coverage for a reason that had nothing to do with coverage. Every
    // combination the loops above walk, times the points sampled in each.
    expect(samples).toBe(expectedSamples);
    expect(failures).toEqual([]);
    // The claim in words, and its one honest exception. Before the orbs the field measured
    // 5.22:1 against the flat corners' 4.94:1 — the gate was stricter than the paint. With the
    // orbs the field measures 4.86:1 against the corners' 4.93:1: on the shoulder of an orb,
    // where its tint blends with the warm wash at a middle alpha, the composite sits 0.06 below
    // either corner (luminance is convex in the channels, so a blend can land below both of its
    // ends). That is why THIS test gates the field directly (`failures` above, at 4.5 and 3.0)
    // rather than trusting the corners alone; the corners stay within a tenth of it.
    expect(worstText2).toBeGreaterThanOrEqual(gateWorstText2 - 0.1);
    expect(worstText2).toBeGreaterThanOrEqual(4.85);
  });
});

/**
 * THE FIRST-RUN DOODLE PATTERN (the owner, 2026-09-21, with a picture: *"during the whole
 * onboarding process, make the background this attached. it is the same color but added some
 * icons related to babies"*).
 *
 * It is the app's own glyphs rather than the picture, which is what makes these claims possible at
 * all: a PNG has no cells to measure, no ink to composite and no way to follow six schemes. Every
 * claim here is one of the reasons it is arithmetic.
 */
describe('the first-run doodle pattern', () => {
  const W = 390;
  const H = 844;

  it('covers the page, in a scatter rather than a grid', () => {
    const specs = pattern(W, H);
    // thirty-six on a 390x844 phone since 2026-09-22, where it was twenty (`PATTERN_COLS`)
    expect(specs.length).toBeGreaterThan(30);
    /*
      NOTHING LINES UP INTO A LIST, and the measure of that is a RUN rather than a coincidence.
      This used to demand that every glyph's rounded x be unique, which held only while the field
      was sparse: at four columns two of thirty-six land on the same point by chance, which is
      not a column a parent could read — three in a vertical line is. So the claim is now the one
      it always meant, and it is stricter in the way that matters (it looks at the whole run, not
      at pairs) and looser in the way that does not (it forgives a 1pt collision).
    */
    const byColumn = new Map<number, number>();
    for (const s of specs)
      byColumn.set(Math.round(s.cx), (byColumn.get(Math.round(s.cx)) ?? 0) + 1);
    expect(Math.max(...byColumn.values())).toBeLessThan(3);
    // and it is still a scatter overall rather than a lattice with jitter on top
    expect(byColumn.size).toBeGreaterThan(specs.length * 0.85);
    // and the whole height is used — the lowest glyph reaches the bottom third
    expect(Math.max(...specs.map(s => s.cy))).toBeGreaterThan(H * 0.66);
  });

  it('is the same pattern every render, and a different one per size', () => {
    expect(pattern(W, H)).toEqual(pattern(W, H));
    expect(pattern(W, H).length).not.toBe(pattern(W, H * 2).length);
    expect(pattern(0, 0)).toEqual([]);
  });

  /**
   * THE OWNER'S OWN COMPLAINT ABOUT THE WHEEL, APPLIED HERE BEFORE IT HAPPENS: overlapping glyphs
   * read as a smudge. The jitter is bounded by the room each cell has, so two boxes can never
   * meet — measured against the ROTATED extent, which is strictly larger than the box itself.
   */
  it('never lets two glyphs overlap, rotation and all', () => {
    const specs = pattern(W, H);
    for (let i = 0; i < specs.length; i += 1) {
      for (let j = i + 1; j < specs.length; j += 1) {
        const a = specs[i]!;
        const b = specs[j]!;
        // two axis-aligned boxes miss each other when they are clear on EITHER axis
        const need = (rotatedExtent(a.size, a.rotate) + rotatedExtent(b.size, b.rotate)) / 2;
        const clear =
          Math.abs(a.cx - b.cx) >= need - 0.001 || Math.abs(a.cy - b.cy) >= need - 0.001;
        expect(clear, `${a.key} (${a.cx.toFixed(0)},${a.cy.toFixed(0)}) vs ${b.key}`).toBe(true);
      }
    }
  });

  it('stays inside the ink budget', () => {
    const specs = pattern(W, H);
    expect(motifCoverage(specs, W, H)).toBeLessThan(PATTERN_COVERAGE_MAX);
    // …and a wide phone is not a denser page: coverage is a fraction, so it barely moves
    expect(motifCoverage(pattern(430, 932), 430, 932)).toBeLessThan(PATTERN_COVERAGE_MAX);
  });

  /**
   * THE NURSERY, NOT THE CLINIC (CLAUDE.md §2 rules 1–3). A parent must not be able to read a
   * medicine, a temperature, a growth curve or a schedule out of the wallpaper. The filled glyphs
   * are out for a different reason: at this scale a filled shape renders as a blob.
   */
  it('draws no clinical glyph, and nothing that fills', () => {
    const banned = [
      'med',
      'temp',
      'growth',
      'chart',
      'cal',
      'sliders',
      'grid',
      'lock',
      'more',
      'play',
      'stop',
      'pause',
    ];
    for (const g of PATTERN_GLYPHS) expect(banned, g).not.toContain(g);
    for (const s of pattern(W, H)) expect(banned, s.key).not.toContain(s.glyph);
  });

  it('draws nothing at all in night, and carries its own alpha in the other two', () => {
    const night = resolveAppearance(
      { ...DEFAULT_APPEARANCE, theme: 'night' },
      'light',
      PLUS_APPEARANCE,
    );
    expect(patternAlpha('night')).toBe(0);
    expect(patternComposites(night.palette, night.skinTokens, 'night')).toBe(null);
    expect(patternAlpha('light')).toBeGreaterThan(0);
    // dark carries more: a light ink at the light alpha is invisible on a near-black page
    expect(patternAlpha('dark')).toBeGreaterThan(patternAlpha('light'));
    // and it is never as loud as the hero motif's measured ceiling
    expect(patternAlpha('dark')).toBeLessThanOrEqual(MOTIF_ALPHA_MAX + 0.02);
  });

  /**
   * THE CLAIM THAT MATTERS: a parent reads setup THROUGH this. Every text ink over every pattern
   * ink, on both grounds it can land on, in every skin × scheme × theme. `contrast.test.ts`
   * measures the same composites as part of the full matrix; this states the rule where the
   * pattern is defined, so a change to its alpha fails here first.
   */
  it('keeps every word legible over it, in every scheme and theme', () => {
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
          const layers = patternComposites(r.palette, r.skinTokens, r.theme);
          if (!layers) continue;
          for (const [name, bg] of Object.entries(layers)) {
            for (const ink of ['text', 'text2'] as const) {
              checks += 1;
              const v = contrastRatio(r.palette[ink], bg);
              if (v < 4.5)
                failures.push(`${skin}/${scheme}/${theme} ${ink} on ${name} = ${v.toFixed(2)}:1`);
            }
          }
        }
      }
    }
    expect(checks).toBeGreaterThan(100);
    expect(failures).toEqual([]);
  });
});
