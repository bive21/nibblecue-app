/**
 * TODAY'S SKY, MEASURED (`liveSky.ts`; the owner, 2026-09-25). A sky behind the top bar is a new
 * ground under the bar's words, and the eye is the instrument this repository has learned not to
 * trust for that (docs/PREFLIGHT.md): so every word and glyph the bar puts on the sky is measured
 * here over every color the sky can be — both stops of every phase, in light and in dark, and all
 * the way down the fade into the page, over every ground the page itself can be under it.
 *
 * WHAT SITS ON IT, and how much of the sky reaches each thing:
 *   - the BELL: a glyph in `text2` on a circle of the raw `surface` token, which is translucent in
 *     every skin and every theme (IconButton.tsx) — so the sky shows through it everywhere;
 *   - the CHILD CHIP: its name in `text`, its age and chevron in `text2`, on the skin's content
 *     material. Paper's is opaque and the sky never reaches the words; Glass's is 52% white in
 *     light and 70% of the scheme's soft tint in dark, over a blur of what is behind it — so the
 *     sky shows through it on iOS, in every color scheme;
 *   - the PHONE'S STATUS BAR: its clock and battery, in black on light and white on dark
 *     (`statusBarStyleFor`), straight on the sky.
 * The sync chip and the badges are opaque fills of their own, and the account avatar is the
 * brand gradient: none of them is ever on the sky. The mark is the owner's artwork, a logo, which
 * no contrast rule covers (WCAG 1.4.3 and 1.4.11 exempt logos); no star is ever drawn near it.
 */
import { describe, expect, it } from 'vitest';
import { statusBarStyleFor } from './appearance';
import { AA_GRAPHIC, AA_TEXT, composite, contrastRatio, parseColor } from './contrast';
import { groundComposites, patternComposites } from './ground';
import { LIVE_SKY, LIVE_SKY_AMBER, liveSkyFor, SKY_PHASES, type LiveSkyScene } from './liveSky';
import { materialBase, SKINS, skinForTheme, surfaceAlphaFor, type SkinName } from './skins';
import { resolvePalette, schemes, themes, type SchemeName } from './theme';

const SCHEMES = Object.keys(schemes) as SchemeName[];
const SKIN_NAMES = Object.keys(SKINS) as SkinName[];
/** The fade into the page, every twentieth of the way: a blend can measure worse than its ends. */
const FADE = Array.from({ length: 21 }, (_, i) => i / 20);

/** Every opaque ground the page can be under the bar, for one theme, scheme and skin. */
function pageGrounds(theme: 'light' | 'dark', scheme: SchemeName, skin: SkinName): string[] {
  const palette = resolvePalette(theme, scheme);
  const tokens = skinForTheme(SKINS[skin], theme);
  return [
    palette.paper,
    ...Object.values(patternComposites(palette, tokens, theme) ?? {}),
    ...Object.values(groundComposites(palette, tokens) ?? {}),
  ];
}

/** Every color the sky can put under the bar: each stop of the sky over each ground, down the fade. */
function underTheBar(scene: LiveSkyScene, grounds: readonly string[]): string[] {
  const out = new Set<string>();
  for (const stop of scene.sky)
    for (const ground of grounds) for (const a of FADE) out.add(composite(ground, stop, a));
  return [...out];
}

/** The child chip's fill over one point of the sky, as Surface.tsx paints it on iOS (it blurs). */
function chipFill(theme: 'light' | 'dark', scheme: SchemeName, skin: SkinName, under: string) {
  const palette = resolvePalette(theme, scheme);
  const material = skinForTheme(SKINS[skin], theme).surface;
  const alpha = surfaceAlphaFor(material, true);
  const base = materialBase(palette, material);
  // an opaque panel is composited over `app` and never sees the sky; a translucent one does
  return alpha >= 1 ? composite(palette.app, base, 1) : composite(under, base, alpha);
}

interface Worst {
  ratio: number;
  where: string;
}
const track = (w: Worst, ratio: number, where: string): Worst =>
  ratio < w.ratio ? { ratio, where } : w;

describe('every word and glyph on the bar reads on the sky, fade and all', () => {
  for (const theme of ['light', 'dark'] as const) {
    for (const phase of SKY_PHASES) {
      it(`${theme}, ${phase}: the chip, the bell and the status bar clear 4.5:1`, () => {
        let chipName: Worst = { ratio: Infinity, where: '' };
        let chipAge: Worst = { ratio: Infinity, where: '' };
        let bell: Worst = { ratio: Infinity, where: '' };
        let status: Worst = { ratio: Infinity, where: '' };
        const ink = statusBarStyleFor(theme) === 'dark' ? '#000000' : '#FFFFFF';
        for (const scheme of SCHEMES) {
          const palette = resolvePalette(theme, scheme);
          // the day sky is the scheme's own (2026-10-06): every scheme's sky is measured
          const scene = liveSkyFor(theme, phase, palette.accent);
          for (const skin of SKIN_NAMES) {
            for (const under of underTheBar(scene, pageGrounds(theme, scheme, skin))) {
              const where = `${scheme}/${skin} over ${under}`;
              const chip = chipFill(theme, scheme, skin, under);
              chipName = track(chipName, contrastRatio(palette.text, chip), where);
              chipAge = track(chipAge, contrastRatio(palette.text2, chip), where);
              // the bell's circle is the raw token over whatever is behind it, in every skin
              const circle = composite(under, palette.surface);
              bell = track(bell, contrastRatio(palette.text2, circle), where);
              status = track(status, contrastRatio(ink, under), where);
            }
          }
        }
        expect(chipName.ratio, chipName.where).toBeGreaterThanOrEqual(AA_TEXT);
        expect(chipAge.ratio, chipAge.where).toBeGreaterThanOrEqual(AA_TEXT);
        // a glyph needs 3:1; the bell is held to the text floor because it can
        expect(bell.ratio, bell.where).toBeGreaterThanOrEqual(AA_TEXT);
        expect(status.ratio, status.where).toBeGreaterThanOrEqual(AA_TEXT);
      });
    }
  }

  it('amber night: the flat ground keeps the bar’s words where the theme already has them', () => {
    const palette = themes.night;
    for (const stop of LIVE_SKY_AMBER.sky) {
      for (const a of FADE) {
        const under = composite(palette.paper, stop, a);
        // every surface is flattened to opaque in night (skinForTheme), but the bell's circle is
        // still the raw, translucent token
        expect(contrastRatio(palette.text2, composite(under, palette.surface))).toBeGreaterThan(
          AA_TEXT,
        );
        expect(contrastRatio('#FFFFFF', under)).toBeGreaterThan(AA_TEXT);
      }
    }
  });
});

describe('it is a tint of the page, not a banner', () => {
  it('keeps every light sky within 1.4:1 of the paper, and every dark one within 1.8:1', () => {
    for (const phase of SKY_PHASES) {
      for (const stop of LIVE_SKY.light[phase].sky)
        expect(contrastRatio(stop, themes.light.paper), `light ${phase} ${stop}`).toBeLessThan(1.4);
      for (const stop of LIVE_SKY.dark[phase].sky)
        expect(contrastRatio(stop, themes.dark.paper), `dark ${phase} ${stop}`).toBeLessThan(1.8);
    }
  });

  it('keeps the light skies light and the dark skies dark, as the status bar’s ink needs', () => {
    // the phone draws its clock in the THEME's ink, so the hour may not flip the lightness
    for (const phase of SKY_PHASES) {
      for (const stop of LIVE_SKY.light[phase].sky)
        expect(contrastRatio(stop, '#000000'), stop).toBeGreaterThan(
          contrastRatio(stop, '#FFFFFF'),
        );
      for (const stop of LIVE_SKY.dark[phase].sky)
        expect(contrastRatio(stop, '#FFFFFF'), stop).toBeGreaterThan(
          contrastRatio(stop, '#000000'),
        );
    }
  });

  it('draws every sky opaque: the fade into the page is the band’s, never the colors’', () => {
    for (const theme of ['light', 'dark'] as const)
      for (const phase of SKY_PHASES)
        for (const stop of LIVE_SKY[theme][phase].sky) expect(parseColor(stop).a).toBe(1);
  });
});

describe('the hour is in the hue', () => {
  const warm = (c: string) => parseColor(c).r > parseColor(c).b;

  it('ends dawn and dusk warm at the horizon, and keeps day and night blue', () => {
    for (const theme of ['light', 'dark'] as const) {
      const s = LIVE_SKY[theme];
      expect(warm(s.dawn.sky[1]), `${theme} dawn`).toBe(true);
      expect(warm(s.dusk.sky[1]), `${theme} dusk`).toBe(true);
      for (const stop of [...s.day.sky, ...s.night.sky]) expect(warm(stop), stop).toBe(false);
    }
  });

  it('gives each phase a sky of its own', () => {
    for (const theme of ['light', 'dark'] as const) {
      const all = SKY_PHASES.map(p => LIVE_SKY[theme][p].sky.join());
      expect(new Set(all).size).toBe(SKY_PHASES.length);
    }
  });
});

describe('the stars: a few, at night, visible and quiet', () => {
  it('shines only at night', () => {
    for (const theme of ['light', 'dark'] as const)
      for (const phase of SKY_PHASES)
        expect(LIVE_SKY[theme][phase].star !== null, `${theme} ${phase}`).toBe(phase === 'night');
  });

  it('clears 3:1 on its sky, and stays below the chip’s own words there', () => {
    for (const theme of ['light', 'dark'] as const) {
      const scene = LIVE_SKY[theme].night;
      const star = scene.star ?? '';
      const palette = themes[theme];
      for (const stop of scene.sky) {
        const landed = composite(stop, star);
        const ratio = contrastRatio(landed, stop);
        expect(ratio, `${theme} ${stop}`).toBeGreaterThanOrEqual(AA_GRAPHIC);
        // the words beside it are the brightest thing on the bar; a star never outshines them
        expect(ratio, `${theme} ${stop}`).toBeLessThan(contrastRatio(palette.text, stop));
      }
    }
  });
});

describe('amber night: one flat dark ground, from the night palette, for every hour', () => {
  it('is the same flat sky at every phase, with no stars', () => {
    for (const phase of SKY_PHASES) expect(liveSkyFor('night', phase)).toBe(LIVE_SKY_AMBER);
    expect(LIVE_SKY_AMBER.star).toBeNull();
    expect(LIVE_SKY_AMBER.sky[0]).toBe(LIVE_SKY_AMBER.sky[1]);
  });

  it('is the night palette’s own darkest ground: a role, warm, and darker than the page', () => {
    const own = new Set(Object.values(themes.night).map(c => c.toLowerCase()));
    const ground = LIVE_SKY_AMBER.sky[0];
    expect(own.has(ground.toLowerCase())).toBe(true);
    expect(ground).toBe(themes.night.page);
    const { r, b } = parseColor(ground);
    expect(b).toBeLessThanOrEqual(r);
  });

  it('follows the painted theme everywhere else', () => {
    for (const phase of SKY_PHASES) {
      expect(liveSkyFor('light', phase)).toBe(LIVE_SKY.light[phase]);
      expect(liveSkyFor('dark', phase)).toBe(LIVE_SKY.dark[phase]);
    }
  });
});
