/**
 * THE PARTY HAT'S COLORS, MEASURED (`partyHat.ts`; the owner, 2026-09-26). A hat is decoration and
 * hidden from assistive technology, but a hat nobody can make out on the head it is worn on is a
 * smudge in the one place in the chrome that belongs to the baby — and the eye is the instrument
 * this repository has learned not to trust for that (docs/PREFLIGHT.md). So every part is measured
 * against the part it lies on, and the whole hat against every ground it can be drawn over, in all
 * six schemes and all three themes, at 3:1 (a graphic, WCAG 1.4.11).
 *
 * WHERE THE HAT SITS: its base on the avatar (the brand gradient — a photo is any color and is not
 * measurable, which is what the keyline is for), the rest over the chip's padding (the chip's
 * content material, in both skins, over whatever the bar sits on) and above the chip over the bar
 * itself (the paper, the doodle pattern and the lit ground elsewhere; on Today, the sky of every
 * hour, all the way down its fade into the page).
 */
import { describe, expect, it } from 'vitest';
import { AA_GRAPHIC, composite, contrastRatio, parseColor } from './contrast';
import { groundComposites, patternComposites } from './ground';
import { LIVE_SKY, LIVE_SKY_AMBER, SKY_PHASES } from './liveSky';
import { partyHatColors, type PartyHatColors } from './partyHat';
import { materialBase, SKINS, skinForTheme, surfaceAlphaFor, type SkinName } from './skins';
import {
  brandGradientFor,
  gradients,
  resolvePalette,
  schemes,
  themeNames,
  themes,
  type Palette,
  type SchemeName,
  type ThemeName,
} from './theme';

const SCHEMES = Object.keys(schemes) as SchemeName[];
const SKIN_NAMES = Object.keys(SKINS) as SkinName[];
const FADE = Array.from({ length: 11 }, (_, i) => i / 10);

/** The avatar the hat is worn on: the brand gradient's two stops, as the theme paints them. */
const gradientStops = (theme: ThemeName, scheme: SchemeName): readonly string[] =>
  theme === 'night' ? gradients.night.brand : brandGradientFor(theme, scheme);

/** Everything the bar can be over, on a page with no sky: the paper, the pattern, the lit ground. */
function pageGrounds(theme: ThemeName, p: Palette, skin: SkinName): string[] {
  const tokens = skinForTheme(SKINS[skin], theme);
  return [
    p.paper,
    ...Object.values(patternComposites(p, tokens, theme) ?? {}),
    ...Object.values(groundComposites(p, tokens) ?? {}),
  ];
}

/** Today's sky over those grounds, every stop of every hour, down the fade into the page. */
function skyGrounds(theme: ThemeName, grounds: readonly string[]): string[] {
  const scenes = theme === 'night' ? [LIVE_SKY_AMBER] : SKY_PHASES.map(ph => LIVE_SKY[theme][ph]);
  const out = new Set<string>();
  for (const scene of scenes)
    for (const stop of scene.sky)
      for (const ground of grounds) for (const a of FADE) out.add(composite(ground, stop, a));
  return [...out];
}

/** The chip's content material over one point of what is behind it (Surface.tsx, iOS: it blurs). */
function chipOver(theme: ThemeName, p: Palette, skin: SkinName, under: string): string {
  const material = skinForTheme(SKINS[skin], theme).surface;
  const alpha = surfaceAlphaFor(material, true);
  const base = materialBase(p, material);
  return alpha >= 1 ? composite(p.app, base, 1) : composite(under, base, alpha);
}

interface Case {
  at: string;
  theme: ThemeName;
  scheme: SchemeName;
  p: Palette;
  c: PartyHatColors;
  /** Every opaque color the chip and the bar can be under the hat, labelled. */
  around: readonly [string, string][];
  /** The avatar's own colors: only the cone's base ever lies on a head (components/partyHat.test.ts). */
  head: readonly string[];
}

const CASES: readonly Case[] = themeNames.flatMap(theme =>
  SCHEMES.map(scheme => {
    const p = resolvePalette(theme, scheme);
    const around: [string, string][] = [];
    for (const skin of SKIN_NAMES) {
      const page = pageGrounds(theme, p, skin);
      const bar = [...page, ...skyGrounds(theme, page)];
      for (const under of bar) {
        around.push([`the bar (${skin})`, under]);
        around.push([`the chip (${skin})`, chipOver(theme, p, skin, under)]);
      }
    }
    const head = gradientStops(theme, scheme);
    return {
      at: `${theme}/${scheme}`,
      theme,
      scheme,
      p,
      c: partyHatColors(p, theme),
      around,
      head,
    };
  }),
);

/** The hat's edge on `ground`: the keyline, or the part itself where the keyline melts into it. */
const edge = (c: PartyHatColors, part: string, ground: string): number =>
  Math.max(contrastRatio(c.halo, ground), contrastRatio(part, ground));

describe('each part reads on the part it lies on', () => {
  it('the bands on the cone, and the cone and the pom-pom on their keyline, at 3:1', () => {
    for (const { at, c } of CASES) {
      expect(contrastRatio(c.stripe, c.cone), `${at} bands`).toBeGreaterThanOrEqual(AA_GRAPHIC);
      expect(contrastRatio(c.cone, c.halo), `${at} cone`).toBeGreaterThanOrEqual(AA_GRAPHIC);
      expect(contrastRatio(c.pom, c.halo), `${at} pom-pom`).toBeGreaterThanOrEqual(AA_GRAPHIC);
    }
  });

  it('is drawn in opaque inks: nothing in the hat depends on what is under it', () => {
    for (const { at, c } of CASES)
      for (const ink of [c.cone, c.stripe, c.pom, c.halo]) expect(parseColor(ink).a, at).toBe(1);
  });
});

describe('the hat reads on everything it can be worn over', () => {
  /**
   * BY ONE OF ITS TWO EDGES. Where the ground is far from the chip's surface — the gradient, a dark
   * sky — the keyline is the edge; where it is near it — the chip itself, the paper, a pale sky —
   * the keyline melts into it and the cone and the pom-pom are the edge. Either way 3:1.
   */
  it('by its keyline or by its own colors, at 3:1, in every theme, scheme, skin and sky', () => {
    for (const { at, c, around } of CASES) {
      let worst = { ratio: Infinity, where: '' };
      for (const [where, g] of around)
        for (const part of [c.cone, c.pom]) {
          const ratio = edge(c, part, g);
          if (ratio < worst.ratio) worst = { ratio, where: `${where} ${g}` };
        }
      expect(worst.ratio, `${at}: ${worst.where}`).toBeGreaterThanOrEqual(AA_GRAPHIC);
    }
  });

  it('parts from the avatar it sits on, whose gradient is the same accent as the hat', () => {
    for (const { at, c, head } of CASES)
      for (const stop of head)
        expect(edge(c, c.cone, stop), `${at} on ${stop}`).toBeGreaterThanOrEqual(AA_GRAPHIC);
  });
});

describe('the amber Night', () => {
  it('draws the hat from the night palette’s own inks, and never from a scheme’s accent', () => {
    const night = themes.night;
    const own = new Set(Object.values(night).map(v => v.toLowerCase()));
    for (const scheme of SCHEMES) {
      const p = resolvePalette('night', scheme);
      const c = partyHatColors(p, 'night');
      for (const ink of [c.cone, c.stripe, c.pom, c.halo]) {
        expect(own.has(ink.toLowerCase()), `${scheme} ${ink}`).toBe(true);
        expect(ink, scheme).not.toBe(p.accent);
        expect(ink, scheme).not.toBe(p.accent2);
      }
    }
  });

  it('keeps it warm: no ink in it is bluer than it is red', () => {
    const c = partyHatColors(themes.night, 'night');
    for (const ink of [c.cone, c.stripe, c.pom, c.halo]) {
      const { r, b } = parseColor(ink);
      expect(b, ink).toBeLessThanOrEqual(r);
    }
  });

  it('is the household’s own color by day and in dark', () => {
    for (const theme of ['light', 'dark'] as const)
      for (const scheme of SCHEMES) {
        const p = resolvePalette(theme, scheme);
        const c = partyHatColors(p, theme);
        expect(c.cone).toBe(p.accent2);
        expect(c.stripe).toBe(p.onAccent);
        expect(c.pom).toBe(p.accent);
        expect(c.halo).toBe(p.surfaceSolid);
      }
  });
});
