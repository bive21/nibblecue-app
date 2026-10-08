/**
 * THE TYPED BOX CAN BE FOUND (`typedBox.ts`), on every ground a typeable number is drawn on, in
 * 3 themes × 6 schemes × 3 skins — measured, because the eye is the instrument this repository has
 * learned not to trust (docs/PREFLIGHT.md), and never more so than for a fill this soft. Since
 * 2026-09-26 the box is a soft well with no edge (the owner, of the edge before it: *"the border on
 * it feels not very nice"*), so what is held is the well itself: a step off every ground, soft
 * enough to stay a step, with the number and its unit readable as text on it; and the focused edge,
 * the one line it ever draws, at the graphic floor.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { SCHEME_NAMES } from './appearance';
import { AA_GRAPHIC, AA_TEXT, composite, contrastRatio, parseColor } from './contrast';
import { materialBase, SKINS, skinForTheme, surfaceAlphaFor, type SkinName } from './skins';
import { resolvePalette, type Palette, type ThemeName } from './theme';
import { TYPED_FILL_ALPHA, TYPED_FILL_STEP, typedBoxPaint } from './typedBox';

const THEMES: readonly ThemeName[] = ['light', 'dark', 'night'];
const SKIN_LIST = Object.keys(SKINS) as SkinName[];
const here = dirname(fileURLToPath(import.meta.url));
const readout = readFileSync(join(here, '../components/StepReadout.tsx'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\s+/g, ' ');

/** A soft step, not a slab: the most the well may stand off any ground. */
const SOFT = 1.35;

/**
 * Every ground a box is drawn on, both ways a skin can paint it (blurred on iOS; on Android, with
 * no blur, the sheet opaque and a card at its no-blur alpha — `Surface.tsx`), with the page under
 * a translucent sheet taken as the paper and the app ground:
 *
 *   the sheet itself          a compact row, the round pair on the pump sheet, a ruler's header
 *   a card on the sheet       the box stepper's card, the round stepper's pill
 *   a measurement's box       the growth sheet's panels (`surface2`): the pounds and ounces on it,
 *                             and the box stepper's card inside one
 */
function grounds(p: Palette, theme: ThemeName): { name: string; color: string }[] {
  const out: { name: string; color: string }[] = [];
  for (const skin of SKIN_LIST) {
    const tokens = skinForTheme(SKINS[skin], theme);
    const base = materialBase(p, tokens.sheet);
    const sheets = [
      composite(p.paper, base, tokens.sheet.alpha),
      composite(p.paper, base, 1),
      composite(p.app, base, 1),
    ];
    for (const sheet of sheets) {
      out.push({ name: `${skin} sheet`, color: sheet });
      out.push({ name: `${skin} measurement box`, color: p.surface2 });
      const card = materialBase(p, tokens.surface);
      for (const under of [sheet, p.surface2])
        for (const blur of [true, false])
          out.push({
            name: `${skin} card (${blur ? 'blurred' : 'no blur'})`,
            color: composite(under, card, surfaceAlphaFor(tokens.surface, blur)),
          });
    }
  }
  return out;
}

const every = (fn: (p: Palette, where: string, theme: ThemeName) => void) => {
  for (const theme of THEMES)
    for (const scheme of SCHEME_NAMES)
      fn(resolvePalette(theme, scheme), `${theme}/${scheme}`, theme);
};

describe('the typed box, in 3 themes × 6 schemes × 3 skins', () => {
  it('stands a step off every ground it lands on — and stays a soft step', () => {
    every((p, where, theme) => {
      const { fill } = typedBoxPaint(p);
      for (const g of grounds(p, theme)) {
        const well = composite(g.color, fill);
        const step = contrastRatio(well, g.color);
        expect(step, `${where} ${g.name}`).toBeGreaterThanOrEqual(TYPED_FILL_STEP);
        expect(step, `${where} ${g.name}`).toBeLessThanOrEqual(SOFT);
      }
    });
  });

  it('holds the number and its unit as text on the well, wherever the well is', () => {
    every((p, where, theme) => {
      const { fill } = typedBoxPaint(p);
      for (const g of grounds(p, theme)) {
        const well = composite(g.color, fill);
        expect(contrastRatio(p.text, well), `${where} ${g.name} number`).toBeGreaterThanOrEqual(
          AA_TEXT,
        );
        expect(contrastRatio(p.text2, well), `${where} ${g.name} unit`).toBeGreaterThanOrEqual(
          AA_TEXT,
        );
      }
    });
  });

  it('is at its softest the unit allows: one hundredth more and the unit would fail somewhere', () => {
    let worst = Infinity;
    every((p, _where, theme) => {
      for (const g of grounds(p, theme)) {
        const heavier = composite(g.color, p.text, TYPED_FILL_ALPHA + 0.01);
        worst = Math.min(worst, contrastRatio(p.text2, heavier));
      }
    });
    expect(worst).toBeLessThan(AA_TEXT);
  });

  it('draws its focused edge (a number being typed) at 3:1 against the well and the ground round it', () => {
    every((p, where, theme) => {
      const paint = typedBoxPaint(p);
      for (const g of grounds(p, theme)) {
        const edge = composite(g.color, paint.focus);
        expect(contrastRatio(edge, g.color), `${where} ${g.name}`).toBeGreaterThanOrEqual(
          AA_GRAPHIC,
        );
        expect(
          contrastRatio(edge, composite(g.color, paint.fill)),
          `${where} ${g.name}`,
        ).toBeGreaterThanOrEqual(AA_GRAPHIC);
      }
    });
  });

  it('is the theme’s own ink and accent, nothing lit — and no blue in the Night', () => {
    every((p, _where, theme) => {
      const paint = typedBoxPaint(p);
      const ink = parseColor(paint.fill);
      const text = parseColor(p.text);
      expect([ink.r, ink.g, ink.b]).toEqual([text.r, text.g, text.b]);
      expect(ink.a).toBeCloseTo(TYPED_FILL_ALPHA, 9);
      expect(paint.focus).toBe(p.accent);
      if (theme === 'night') expect(ink.b).toBeLessThanOrEqual(ink.r);
    });
  });
});

/**
 * THE STEPPERS WITH NOTHING ROUND THEM (2026-09-30): the round pair's white pill and the primary
 * number's card are gone, so the box and the circles stand on the sheet itself, in light, dark and
 * the amber Night. The box on the sheet is the first test above (`grounds` has the sheet in every
 * skin); what is added here is the drawn − and +, a graphic, on its circle there.
 */
describe('the steppers on the sheet itself', () => {
  const sheets = (p: Palette, theme: ThemeName) =>
    grounds(p, theme).filter(g => g.name.endsWith(' sheet'));

  /**
   * THE MARK IS WHAT MUST BE SEEN. In dark glass the sheet's own material is the scheme's soft tint
   * (`materialBase`), the circles' own color, so there a circle is the sheet and the − or + on it is
   * the whole control, as it was on the card that stood under it before: the mark is held at the
   * graphic floor on every sheet, the circle is not asked to stand apart.
   */
  it('draws the − and + at 3:1 on their circles, on every sheet', () => {
    every((p, where, theme) => {
      for (const g of sheets(p, theme)) {
        const circle = composite(g.color, p.accentSoft);
        expect(contrastRatio(p.accent2, circle), `${where} ${g.name} glyph`).toBeGreaterThanOrEqual(
          AA_GRAPHIC,
        );
        // and the mark stands off the sheet round the circle too, where the two are the same
        expect(
          contrastRatio(p.accent2, g.color),
          `${where} ${g.name} ground`,
        ).toBeGreaterThanOrEqual(AA_GRAPHIC);
      }
    });
  });

  it('keeps the box a soft step off the sheet, its number and unit readable, with no card under it', () => {
    every((p, where, theme) => {
      const { fill } = typedBoxPaint(p);
      for (const g of sheets(p, theme)) {
        const well = composite(g.color, fill);
        expect(contrastRatio(well, g.color), `${where} ${g.name}`).toBeGreaterThanOrEqual(
          TYPED_FILL_STEP,
        );
        expect(contrastRatio(p.text, well), `${where} ${g.name} number`).toBeGreaterThanOrEqual(
          AA_TEXT,
        );
        expect(contrastRatio(p.text2, well), `${where} ${g.name} unit`).toBeGreaterThanOrEqual(
          AA_TEXT,
        );
      }
    });
  });
});

describe('StepReadout.tsx draws it, where a device is the only witness', () => {
  it('has no edge at rest, and draws the focused one inside the box’s air', () => {
    expect(readout).toContain('const edge = focused ? TYPED_BOX.focus : 0;');
    expect(readout).toContain('borderWidth: edge,');
    expect(readout).toContain('paddingHorizontal: TYPED_BOX.padX - edge,');
    // its height is what it sits beside (the circles, a ruler's strip), so the edge can only be inside
    expect(readout).toContain('minHeight: shape.height,');
    expect(readout).toContain('backgroundColor: paint.fill,');
    expect(readout).not.toContain('text3');
  });
});
