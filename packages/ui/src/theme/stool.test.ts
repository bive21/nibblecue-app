/**
 * THE COLOR DOTS, MEASURED (`stool.ts`; the owner, 2026-09-26: *"Optional: (yellow color icon)
 * yellow, (green color icon) green, etc."*). A dot is seen when its fill or its ring clears 3:1
 * against the chip it sits on — and a resting chip is painted on more than one ground: Paper's solid
 * pill, and Glass's frosted one, which is the scheme's own tint in dark and is opaque where the phone
 * cannot blur. Every dot is measured on every one of them, in every theme and every scheme. Then the
 * rules that keep a dot a color and nothing more: the same fill in light and dark, dimmed in the
 * amber Night, no status color, and nothing to set one apart from another but its fill.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { AA_GRAPHIC, composite, contrastRatio, luminance, parseColor } from './contrast';
import { materialBase, SKIN_NAMES, SKINS, skinForTheme, surfaceAlphaFor } from './skins';
import {
  NIGHT_DOT,
  STOOL_COLORS,
  STOOL_DOTS,
  STOOL_DOTS_DARK,
  STOOL_DOTS_LIGHT,
  STOOL_DOTS_NIGHT,
  stoolColorOf,
  stoolDotsFor,
} from './stool';
import {
  resolvePalette,
  schemes,
  themeNames,
  themes,
  type SchemeName,
  type ThemeName,
} from './theme';

const here = dirname(fileURLToPath(import.meta.url));
const SCHEMES = Object.keys(schemes) as SchemeName[];

/**
 * Every ground a resting chip is painted on (Chip.tsx): Paper's pill is the solid surface; Glass
 * frosts it — its material over the sheet where the phone blurs, and the material alone, opaque,
 * where it cannot (`surfaceAlphaFor`). The sheet under it is the sheet's own material over the page.
 */
function chipGrounds(theme: ThemeName): readonly string[] {
  const out = new Set<string>();
  for (const scheme of SCHEMES) {
    const p = resolvePalette(theme, scheme);
    out.add(p.surfaceSolid);
    for (const name of SKIN_NAMES) {
      const skin = skinForTheme(SKINS[name], theme);
      if (skin.surface.blur === 0) continue;
      const sheet = composite(p.page, materialBase(p, skin.sheet), skin.sheet.alpha);
      const base = materialBase(p, skin.surface);
      for (const canBlur of [true, false])
        out.add(composite(sheet, base, surfaceAlphaFor(skin.surface, canBlur)));
    }
  }
  return [...out];
}

describe('every dot can be seen on the chip it sits on', () => {
  it.each(themeNames)(
    '%s: each dot has a 3:1 edge — its fill or its ring — on every chip ground',
    theme => {
      const grounds = chipGrounds(theme);
      // the amber Night flattens every design (`skinForTheme`): its chip is the one solid ground
      expect(grounds.length).toBeGreaterThanOrEqual(theme === 'night' ? 1 : 2);
      for (const key of STOOL_COLORS) {
        const dot = STOOL_DOTS[theme][key];
        for (const ground of grounds) {
          const byFill = contrastRatio(dot.fill, ground) >= AA_GRAPHIC;
          const byRing = contrastRatio(dot.ring, ground) >= AA_GRAPHIC;
          expect(byFill || byRing, `${key} on ${ground}`).toBe(true);
        }
      }
    },
  );

  it('needs its ring where the owner said it would: a yellow on a light chip, a black on a dark one', () => {
    const light = themes.light.surfaceSolid;
    const dark = themes.dark.surfaceSolid;
    expect(contrastRatio(STOOL_DOTS_LIGHT.yellow.fill, light)).toBeLessThan(AA_GRAPHIC);
    expect(contrastRatio(STOOL_DOTS_LIGHT.yellow.ring, light)).toBeGreaterThanOrEqual(AA_GRAPHIC);
    expect(contrastRatio(STOOL_DOTS_DARK.black.fill, dark)).toBeLessThan(AA_GRAPHIC);
    expect(contrastRatio(STOOL_DOTS_DARK.black.ring, dark)).toBeGreaterThanOrEqual(AA_GRAPHIC);
  });
});

describe('a dot is the color the parent saw, and nothing more', () => {
  it('offers the five colors in the sheet’s order, by their own names', () => {
    expect(STOOL_COLORS).toEqual(['yellow', 'green', 'brown', 'black', 'red']);
    expect(stoolColorOf('Yellow')).toBe('yellow');
    expect(stoolColorOf(' Red ')).toBe('red');
    expect(stoolColorOf('Purple')).toBeNull();
  });

  it('is the same fill in light and in dark, its ring deepened on light and lifted on dark', () => {
    for (const key of STOOL_COLORS) {
      const l = STOOL_DOTS_LIGHT[key];
      const d = STOOL_DOTS_DARK[key];
      expect(d.fill).toBe(l.fill);
      // the ring is the dot's own color, darker on a light chip and lighter on a dark one
      expect(luminance(l.ring)).toBeLessThan(luminance(l.fill));
      expect(luminance(d.ring)).toBeGreaterThan(luminance(d.fill));
    }
    expect(stoolDotsFor('light')).toBe(STOOL_DOTS_LIGHT);
    expect(stoolDotsFor('dark')).toBe(STOOL_DOTS_DARK);
    expect(stoolDotsFor('night')).toBe(STOOL_DOTS_NIGHT);
  });

  it('sets the five apart from each other by their fills alone', () => {
    const fills = STOOL_COLORS.map(k => parseColor(STOOL_DOTS_LIGHT[k].fill));
    for (let i = 0; i < fills.length; i += 1)
      for (let j = i + 1; j < fills.length; j += 1) {
        const [a, b] = [fills[i]!, fills[j]!];
        expect(Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b)).toBeGreaterThan(60);
      }
  });

  it('is no status color: the red is not the palette’s alarm, and no dot is good or a warning', () => {
    const status = new Set(
      themeNames.flatMap(n => {
        const t = themes[n];
        return [t.good, t.warn, t.crit, t.dangerFill].map(c => c.toLowerCase());
      }),
    );
    for (const theme of themeNames)
      for (const key of STOOL_COLORS) {
        const dot = STOOL_DOTS[theme][key];
        expect(status.has(dot.fill.toLowerCase()), `${theme} ${key}`).toBe(false);
        expect(status.has(dot.ring.toLowerCase()), `${theme} ${key}`).toBe(false);
      }
    // and the file reads no status role at all: its colors are its own
    const src = readFileSync(join(here, 'stool.ts'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(src).not.toMatch(/\.(crit|warn|good|dangerFill)\b/);
  });
});

describe('the amber Night: dimmed, ringed in its own ink, no blue', () => {
  it('keeps half of each fill over the night chip, never brighter than the words beside it', () => {
    const amber = themes.night;
    for (const key of STOOL_COLORS) {
      const dot = STOOL_DOTS_NIGHT[key];
      expect(dot.fill).toBe(composite(amber.surfaceSolid, STOOL_DOTS_LIGHT[key].fill, NIGHT_DOT));
      expect(luminance(dot.fill)).toBeLessThan(luminance(amber.text2));
      expect(dot.ring).toBe(amber.text3);
      const { r, b } = parseColor(dot.fill);
      expect(b, key).toBeLessThanOrEqual(r);
    }
  });
});

describe('ColorDot (tripwires over ColorDot.tsx)', () => {
  const src = readFileSync(join(here, '..', 'components', 'ColorDot.tsx'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
  const flat = src.replace(/\s+/g, ' ');

  it('draws the caller’s two colors as a round dot with a ring, and writes none of its own', () => {
    expect(flat).toContain('backgroundColor: fill');
    expect(flat).toContain('borderColor: ring');
    expect(flat).toContain('borderRadius: t.radius.pill');
    expect(flat).toContain('borderWidth: COLOR_DOT.ring');
    expect(src).not.toMatch(/['"`]#[0-9a-fA-F]{3,8}['"`]/);
  });

  it('is a picture inside a control, not a control: assistive technology reads the chip’s word', () => {
    expect(flat).toContain('accessible={false}');
    expect(flat).toContain('importantForAccessibility="no"');
    expect(src).not.toContain('Pressable');
  });

  it('is exported with the design system’s controls', () => {
    expect(readFileSync(join(here, '..', 'components', 'core.ts'), 'utf8')).toContain(
      "export * from './ColorDot';",
    );
    expect(readFileSync(join(here, '..', 'index.ts'), 'utf8')).toContain(
      "export * from './theme/stool';",
    );
  });
});
