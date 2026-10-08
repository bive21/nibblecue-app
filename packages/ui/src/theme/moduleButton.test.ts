/**
 * THE LOG BUTTONS IN THE MODULE'S COLOR, MEASURED (`moduleButton.ts`; the owner, 2026-09-26:
 * *"perhaps it will look better if it's in the module's color instead"*). Every module a log sheet
 * can tint, in 3 themes × 6 schemes × 3 skins: the label clears the target on the fill, the fill is
 * the module's own hue deepened and never another module's, Night is left to the amber theme, and
 * the Save's check and the waiting mark — drawn in the label's ink — clear what they need. And the
 * one soft button (the owner, the same day: *"the red color is too intimidating like in diaper,
 * make the red a little softer"*): a coral, lighter and quieter than the deep red it replaces,
 * whose edge or fill parts it from every sheet it can be drawn on.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loaderInks } from '../components/logoLoader';
import { DEFAULT_APPEARANCE, PLUS_APPEARANCE, resolveAppearance, SCHEME_NAMES } from './appearance';
import { AA_GRAPHIC, AA_TEXT, composite, contrastRatio, parseColor } from './contrast';
import {
  deepInk,
  isTintModule,
  MODULE_BUTTON_EDGE,
  MODULE_BUTTON_LABEL,
  moduleButtonPaint,
  SOFT_BUTTON,
  SOFT_FILL_DEPTH,
  type TintModule,
} from './moduleButton';
import { materialBase, SKINS, skinForTheme, type SkinName } from './skins';
import {
  moduleColor,
  moduleDiscSwatch,
  resolvePalette,
  schemes,
  themeNames,
  themes,
  type SchemeName,
} from './theme';

const here = dirname(fileURLToPath(import.meta.url));
const flat = (rel: string): string =>
  readFileSync(join(here, rel), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
    .replace(/\s+/g, ' ');

const MODULES = Object.keys(moduleColor) as TintModule[];
const SKIN_LIST = Object.keys(SKINS) as SkinName[];

/** Every way a log sheet's button can be drawn: theme × scheme × skin × module. */
const every = themeNames.flatMap(theme =>
  SCHEME_NAMES.flatMap(scheme =>
    SKIN_LIST.flatMap(skin =>
      MODULES.map(module => {
        const r = resolveAppearance(
          { ...DEFAULT_APPEARANCE, theme, scheme, skin },
          'light',
          PLUS_APPEARANCE,
        );
        return { at: `${theme}/${scheme}/${skin}/${module}`, theme, r, module };
      }),
    ),
  ),
);

describe('a log sheet’s primary button, in the module’s own color', () => {
  it('labels it at the target on its fill, and the target is over AA', () => {
    expect(MODULE_BUTTON_LABEL).toBeGreaterThan(AA_TEXT);
    let drawn = 0;
    for (const { at, theme, module } of every) {
      const paint = moduleButtonPaint(module, theme);
      if (paint === null) continue;
      expect(parseColor(paint.fill).a, at).toBe(1);
      expect(contrastRatio(paint.ink, paint.fill), at).toBeGreaterThanOrEqual(MODULE_BUTTON_LABEL);
      drawn += 1;
    }
    // light and dark, every scheme, every skin, every module
    expect(drawn).toBe(2 * SCHEME_NAMES.length * SKIN_LIST.length * MODULES.length);
  });

  it('is the module’s own ink, deepened only as far as the label needs', () => {
    for (const module of MODULES) {
      const role = moduleColor[module];
      const ink = themes.light[role];
      const fill = deepInk(role);
      // every module but a soft one is drawn in exactly this, with the white label and no edge
      if (SOFT_BUTTON[role] === undefined)
        expect(moduleButtonPaint(module, 'light'), module).toEqual({
          fill,
          ink: themes.light.onAccent,
          edge: null,
        });
      // an ink that already carries the label is used as it is
      if (contrastRatio(themes.light.onAccent, ink) >= MODULE_BUTTON_LABEL)
        expect(fill, module).toBe(ink);
      // and a deepened one keeps its hue family: the dominant channel is the ink's own
      const a = parseColor(ink);
      const b = parseColor(fill);
      const top = (c: { r: number; g: number; b: number }) =>
        c.r >= c.g && c.r >= c.b ? 'r' : c.g >= c.b ? 'g' : 'b';
      expect(top(b), module).toBe(top(a));
    }
  });

  it('is the same deep fill in light and dark, and none in the amber Night', () => {
    for (const module of MODULES) {
      expect(moduleButtonPaint(module, 'light')).toEqual(moduleButtonPaint(module, 'dark'));
      expect(moduleButtonPaint(module, 'night'), module).toBeNull();
    }
  });

  it('keeps the modules a log sheet opens apart from one another', () => {
    const sheets: TintModule[] = [
      'bottle',
      'breastfeed',
      'pump',
      'diaper',
      'sleep',
      'solids',
      'med',
      'temp',
      'tummy',
      'bath',
    ];
    const fills = new Set(sheets.map(m => moduleButtonPaint(m, 'light')?.fill));
    expect(fills.size).toBe(sheets.length);
  });

  it('draws the Save’s check and the waiting mark in the label’s ink, clear on the fill', () => {
    for (const { at, theme, r, module } of every) {
      const paint = moduleButtonPaint(module, theme);
      if (paint === null) continue;
      // the check is drawn in the label's ink: a graphic at 3:1, and it gets the text's 4.5
      expect(contrastRatio(paint.ink, paint.fill), at).toBeGreaterThanOrEqual(AA_TEXT);
      expect(
        contrastRatio(loaderInks(r.palette, theme, paint.ink).mark ?? '', paint.fill),
        at,
      ).toBeGreaterThanOrEqual(AA_GRAPHIC);
    }
  });

  it('knows which ids it can tint', () => {
    expect(isTintModule('pump')).toBe(true);
    expect(isTintModule('growth')).toBe(true);
    expect(isTintModule('nothing')).toBe(false);
  });
});

describe('Button.tsx and ModuleTint.tsx, where a device is the only witness', () => {
  const button = flat('../components/Button.tsx');
  const tint = flat('../components/ModuleTint.tsx');

  it('tints only the primary variant, and only inside a ModuleTint', () => {
    expect(button).toContain('const modulePaint = useModuleButtonPaint();');
    expect(button).toContain("const tinted = variant === 'primary' ? modulePaint : null;");
    expect(tint).toContain("if (module === null || t.theme === 'night') return null;");
    expect(tint).toContain('return { fill: soft.fill, ink: soft.onFill, edge: null };');
  });

  it('fills a tinted button with the deep ink, labels it in its ink, and draws no gradient over it', () => {
    expect(button).toContain(
      'tinted !== null ? { backgroundColor: tinted.fill, ...(tinted.edge !== null ? { borderColor: tinted.edge, borderWidth: MODULE_BUTTON_EDGE } : {}), }',
    );
    expect(button).toContain('tinted !== null ? tinted.ink');
    expect(button).toContain("{variant === 'primary' && tinted === null ? ( <LinearGradient");
    // the check and the loader take the same ink as the words, so a Save still ticks
    expect(button).toContain('color={ink} ring={0}');
    expect(button).toContain('<LogoLoader variant="small" tint={ink} />');
  });
});

/**
 * THE DIAPER'S BUTTON IS SOFT (the owner, 2026-09-26: *"the red color is too intimidating like in
 * diaper, make the red a little softer, other color looks fine so far"*). Its deep ink was a jewel
 * red under white words — a Delete button's look — so it is a coral under oxblood words now: the
 * TYPE moved, not only the fill (the prototype's block 59). Measured: lighter and quieter than the
 * red it replaces, still its module's hue, the words at the same target as every other module's,
 * and parted from every sheet it can be drawn on by its edge or its fill.
 */
describe('the one soft button: the diaper’s coral', () => {
  const SOFT = MODULES.filter(m => SOFT_BUTTON[moduleColor[m]] !== undefined);
  /** The red the diaper's button was until 2026-09-26: its ink deepened until white sat on it. */
  const WAS = deepInk('diaper');

  it('is the diaper’s, and the note’s that wears its hue — and nobody else’s', () => {
    expect(SOFT_BUTTON).toEqual({ diaper: 'diaper' });
    expect([...SOFT].sort()).toEqual(['diaper', 'note']);
    expect(moduleButtonPaint('note', 'light')).toEqual(moduleButtonPaint('diaper', 'light'));
  });

  it('is the owner’s coral swatch a quarter of the way to the ink, under an oxblood of that ink', () => {
    const paint = moduleButtonPaint('diaper', 'light');
    expect(paint).not.toBeNull();
    if (paint === null) return;
    expect(SOFT_FILL_DEPTH).toBe(0.25);
    expect(paint.fill).toBe(composite(moduleDiscSwatch.diaper, themes.light.diaper, 0.25));
    expect(paint.fill).toBe('#F98E7D');
    expect(paint.ink).toBe('#690E00');
    // the edge is the words' own ink, drawn a finished path tile's width inside the button
    expect(paint.edge).toBe(paint.ink);
    expect(MODULE_BUTTON_EDGE).toBe(1.5);
    // the words clear the target every module's do, and white is no longer asked to sit on it
    expect(contrastRatio(paint.ink, paint.fill)).toBeGreaterThanOrEqual(MODULE_BUTTON_LABEL);
    expect(contrastRatio(themes.light.onAccent, paint.fill)).toBeLessThan(AA_TEXT);
    // what it replaced, for the record: the deep red under white
    expect(WAS).toBe('#CC2207');
  });

  it('is softer than the red it replaces: lighter, and no longer a block that shouts off white', () => {
    const paint = moduleButtonPaint('diaper', 'light');
    if (paint === null) throw new Error('no paint');
    const lum = (hex: string) => (contrastRatio(hex, '#000000') - 1) / 20;
    // nearly three times the light the jewel red had, and less than half its weight on a white sheet
    expect(lum(paint.fill)).toBeGreaterThan(2.5 * lum(WAS));
    expect(contrastRatio(paint.fill, '#FFFFFF')).toBeLessThan(contrastRatio(WAS, '#FFFFFF') / 2);
    // and still the diaper's hue: red leads both the fill and the words, as it led the ink
    for (const c of [paint.fill, paint.ink, WAS]) {
      const { r, g, b } = parseColor(c);
      expect(r, c).toBeGreaterThan(g);
      expect(r, c).toBeGreaterThan(b);
    }
  });

  /**
   * THE CONTROL'S BOUNDARY, 3:1 (WCAG 1.4.11), against every ground a sheet is painted on: each
   * skin's sheet material at its own alpha over each page a sheet can float on, and opaque (Android),
   * in light and dark, in every scheme. The deep buttons' white words carry them; a coral this light
   * needs its edge on a light sheet and has its fill on a dark one — this holds that one or the other
   * is always there.
   */
  it('is parted from every sheet it can be drawn on, by its edge or by its fill', () => {
    let grounds = 0;
    for (const theme of ['light', 'dark'] as const)
      for (const scheme of Object.keys(schemes) as SchemeName[]) {
        const p = resolvePalette(theme, scheme);
        for (const skin of SKIN_LIST) {
          const sheet = skinForTheme(SKINS[skin], theme).sheet;
          const base = materialBase(p, sheet);
          for (const under of [p.paper, p.page, p.app])
            for (const alpha of [sheet.alpha, 1]) {
              const ground = composite(under, base, alpha);
              for (const module of SOFT) {
                const paint = moduleButtonPaint(module, theme);
                if (paint === null || paint.edge === null) throw new Error(`${module}: no edge`);
                const at = `${theme}/${scheme}/${skin} over ${under} at ${alpha}: ${module}`;
                expect(
                  Math.max(contrastRatio(paint.edge, ground), contrastRatio(paint.fill, ground)),
                  at,
                ).toBeGreaterThanOrEqual(AA_GRAPHIC);
                // and the edge is not a line lost against the fill it rims
                expect(contrastRatio(paint.edge, paint.fill), at).toBeGreaterThanOrEqual(
                  AA_GRAPHIC,
                );
              }
              grounds += 1;
            }
        }
      }
    expect(grounds).toBe(2 * Object.keys(schemes).length * SKIN_LIST.length * 3 * 2);
  });
});

describe('BottomSheet.tsx: a Save pinned to the foot keeps its module’s color', () => {
  /**
   * The owner, 2026-09-26: *"breastfeed already finish still at the theme color … sleeping alreayd
   * finish also still follow theme color"*. Every "Already finished" form pins its Save to the
   * sheet's foot, which the sheet draws outside the body's `ModuleTint`; the foot now reads the tint
   * where the node is made and puts it back round it.
   */
  const sheet = flat('../components/BottomSheet.tsx');
  const tint = flat('../components/ModuleTint.tsx');

  it('reads the tint where the Save is made and carries it to the foot', () => {
    expect(tint).toContain(
      'export function useModuleTint(): TintModule | null { return useContext(ModuleTintContext); }',
    );
    expect(sheet).toContain("import { ModuleTheme, useModuleTint } from './ModuleTint';");
    expect(sheet).toContain('const tint = useModuleTint();');
    expect(sheet).toContain(
      'slot?.put(id, tint === null ? children : <ModuleTheme module={tint}>{children}</ModuleTheme>);',
    );
    // drawn in place, where there is no sheet, it is already inside whatever tint it was made in
    expect(sheet).toContain('return slot === null ? <>{children}</> : null;');
  });
});
