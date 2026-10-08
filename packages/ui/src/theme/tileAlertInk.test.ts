import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_APPEARANCE,
  PLUS_APPEARANCE,
  QUICK_SHAPES,
  resolveAppearance,
  SCHEME_NAMES,
} from './appearance';
import { AA_TEXT, composite, contrastRatio, parseColor } from './contrast';
import { groundComposites, patternComposites } from './ground';
import { SKIN_NAMES, tintAlphaFor, type SkinName } from './skins';
import { moduleColor, themeNames, type Palette, type ThemeName } from './theme';
import { ALERT_PILL_ALPHA, deepenedInk, tileAlertInk } from './tileAlertInk';

/**
 * THE DUE AND LATE WORDS ON A LOG TILE, held to 4.5:1 on every ground they land on, in every skin,
 * scheme, theme, tint and shape, on both platforms (the Glass review, 2026-10-01: a late word at
 * 3.55:1 in its own red pill, 4.12:1 on an iPhone capsule over the sleep band, 3.79:1 under a
 * bubble on the same band). The grounds are listed here on their own terms, not read back from
 * the helper, so a helper that forgot one would fail rather than agree with itself.
 */

const resolved = (skin: SkinName, scheme: string, theme: ThemeName) =>
  resolveAppearance(
    { ...DEFAULT_APPEARANCE, skin, scheme: scheme as never, theme },
    'light',
    PLUS_APPEARANCE,
  );

/** Every category a tile can wear, and More, as `tileGlass.test.ts` lists them. */
const tilesOf = (c: Palette) => [
  ...[...new Set(Object.values(moduleColor))].map(role => ({
    name: role,
    soft: c[`${role}Soft` as keyof Palette] as string,
  })),
  { name: 'more', soft: c.surface2 },
];

/** The page under a tile: plain grounds, the paper, washes, orbs, motif bands, the doodles. */
const pageOf = (c: Palette, a: ReturnType<typeof resolved>, theme: ThemeName) => {
  const page: Record<string, string> = {
    app: c.app,
    app2: c.app2,
    page: c.page,
    pageWarm: c.pageWarm,
    pageCool: c.pageCool,
    paper: c.paper,
  };
  for (const [k, v] of Object.entries(groundComposites(c, a.skinTokens) ?? {}))
    if (!k.startsWith('surfaceOn') && !k.startsWith('accentSoftOn')) page[k] = v;
  Object.assign(page, patternComposites(c, a.skinTokens, theme) ?? {});
  return page;
};

/** HSV hue in degrees; `null` for a gray, which has none to keep. */
const hueOf = (hex: string): number | null => {
  const { r, g, b } = parseColor(hex);
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  if (max === 0 || d / max < 0.15) return null;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
};
const hueGap = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));

describe('a Log tile’s due and late words', () => {
  const failures: string[] = [];
  const drifted: string[] = [];
  let checks = 0;
  let kept = 0;
  let deepened = 0;
  for (const skin of SKIN_NAMES)
    for (const scheme of SCHEME_NAMES)
      for (const theme of themeNames) {
        const a = resolved(skin, scheme, theme);
        const c = a.palette;
        const page = pageOf(c, a, theme);
        for (const tile of tilesOf(c))
          for (const [level, token] of [
            ['late', c.crit],
            ['due', c.warn],
          ] as const)
            for (const shape of QUICK_SHAPES) {
              const ink = tileAlertInk({
                ink: token,
                soft: tile.soft,
                shape,
                palette: c,
                skin: a.skinTokens,
                theme,
              });
              if (ink === token) kept++;
              else deepened++;
              // the iPhone (a blur under the tint) and Android (none), one ink for both
              for (const canBlur of [true, false]) {
                const where = `${skin}/${scheme}/${theme} ${shape} ${tile.name} ${level}${canBlur ? ' (blur)' : ''}`;
                // the pebble's pill is opaque; the capsule is its tint, over the page where it blurs;
                // the bubble's words are on the page itself
                const grounds: Record<string, string> =
                  shape === 'pebble'
                    ? { pill: composite(tile.soft, token, ALERT_PILL_ALPHA) }
                    : shape === 'bubble'
                      ? page
                      : tintAlphaFor(a.skinTokens, canBlur) >= 1
                        ? { tint: tile.soft }
                        : Object.fromEntries(
                            Object.entries(page).map(([k, g]) => [
                              `tint over ${k}`,
                              composite(g, tile.soft, tintAlphaFor(a.skinTokens, canBlur)),
                            ]),
                          );
                for (const [gn, ground] of Object.entries(grounds)) {
                  checks++;
                  const v = contrastRatio(ink, ground);
                  if (v < AA_TEXT) failures.push(`${where} on ${gn}: ${v.toFixed(2)}:1`);
                }
                const before = hueOf(token);
                const after = hueOf(ink);
                if (before !== null && (after === null || hueGap(before, after) > 3))
                  drifted.push(`${where}: ${token} → ${ink}`);
              }
            }
      }

  it(`clear 4.5:1 on every ground they land on (${checks} checks)`, () => {
    // a floor near the real count, so the matrix cannot quietly stop running
    expect(checks).toBeGreaterThan(20_000);
    expect(failures).toEqual([]);
  });

  it('keep the alert hue: a late word is still red and a due word still amber', () => {
    expect(drifted).toEqual([]);
  });

  it('are the token itself wherever the token already reads', () => {
    // both happen: the fix is not a blanket darkening
    expect(kept).toBeGreaterThan(0);
    expect(deepened).toBeGreaterThan(0);
  });
});

describe('deepenedInk', () => {
  it('returns the ink untouched when it clears every ground, or when there is none', () => {
    expect(deepenedInk('#000000', ['#FFFFFF'])).toBe('#000000');
    expect(deepenedInk('#D9534F', [])).toBe('#D9534F');
  });

  it('goes toward black on a light ground and toward white on a dark one, no further than needed', () => {
    const onLight = deepenedInk('#E8746F', ['#F4E3E2']);
    expect(contrastRatio(onLight, '#F4E3E2')).toBeGreaterThanOrEqual(AA_TEXT);
    expect(parseColor(onLight).r).toBeLessThan(parseColor('#E8746F').r);
    const onDark = deepenedInk('#B5403B', ['#2A1E1D']);
    expect(contrastRatio(onDark, '#2A1E1D')).toBeGreaterThanOrEqual(AA_TEXT);
    expect(parseColor(onDark).g).toBeGreaterThan(parseColor('#B5403B').g);
    // one 2% step short of the answer would not have cleared: it is the least deepening
    const step = Array.from({ length: 50 }, (_, s) => s).find(
      s => composite('#E8746F', '#000000', s / 50) === onLight,
    );
    expect(step).toBeGreaterThan(0);
    const short = composite('#E8746F', '#000000', (step! - 1) / 50);
    expect(contrastRatio(short, '#F4E3E2')).toBeLessThan(AA_TEXT);
  });
});

describe('QuickAction sets its due and late words in that ink (tripwire)', () => {
  const src = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '../components/QuickAction.tsx'),
    'utf8',
  );
  it('on the bubble, the pebble and the capsule alike', () => {
    // the subline (bubble and pebble) and the capsule's second row
    expect(src.split('{...alertWords}').length - 1).toBe(2);
    expect(src).not.toContain('ink={alertTextInk}');
  });
  it('with the pill tinted at the alpha the helper measures', () => {
    expect(src).toContain('alertInk ? ALERT_PILL_ALPHA : 0.14');
  });
});
