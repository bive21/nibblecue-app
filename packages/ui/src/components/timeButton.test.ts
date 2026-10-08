/**
 * A TIME YOU TAP TO CHANGE (`timeButton.ts`, `TimeButton.tsx`; the owner, 2026-09-26: *"let user
 * know that 'at' is clickable"*). The paint is the typed box's well with a clock in the accent, and
 * it is measured here where the control is drawn — on a sheet and on a card on a sheet, blurred
 * and opaque, in every theme × scheme × design: the clock a glyph (3:1) and the time text (4.5:1)
 * on the well. The component is held by tripwires, because this suite has no renderer.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { SCHEME_NAMES } from '../theme/appearance';
import { AA_GRAPHIC, AA_TEXT, composite, contrastRatio } from '../theme/contrast';
import { materialBase, SKINS, skinForTheme, surfaceAlphaFor, type SkinName } from '../theme/skins';
import { hit, resolvePalette, themeNames, type Palette, type ThemeName } from '../theme/theme';
import { typedBoxPaint } from '../theme/typedBox';
import { TIME_BUTTON, timeButtonPaint } from './timeButton';

const here = dirname(fileURLToPath(import.meta.url));
const component = readFileSync(join(here, 'TimeButton.tsx'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
  .replace(/\s+/g, ' ');

/** A sheet, both ways a design paints it, and a card on it, blurred and opaque. */
function grounds(p: Palette, theme: ThemeName): [string, string][] {
  const out: [string, string][] = [];
  for (const skin of Object.keys(SKINS) as SkinName[]) {
    const tokens = skinForTheme(SKINS[skin], theme);
    const base = materialBase(p, tokens.sheet);
    for (const [how, sheet] of [
      ['sheet over paper', composite(p.paper, base, tokens.sheet.alpha)],
      ['opaque sheet', composite(p.app, base, 1)],
    ] as const) {
      out.push([`${skin} ${how}`, sheet]);
      for (const blur of [true, false])
        out.push([
          `${skin} card on the ${how}${blur ? '' : ', opaque'}`,
          composite(sheet, materialBase(p, tokens.surface), surfaceAlphaFor(tokens.surface, blur)),
        ]);
    }
  }
  return out;
}

describe('the time and its clock, on the typed box’s well', () => {
  it('is the well every typeable number stands in, the accent’s clock and the page’s ink', () => {
    for (const theme of themeNames)
      for (const scheme of SCHEME_NAMES) {
        const p = resolvePalette(theme, scheme);
        expect(timeButtonPaint(p)).toEqual({
          fill: typedBoxPaint(p).fill,
          glyph: p.accent,
          text: p.text,
        });
      }
  });

  it('draws the clock at 3:1 and the time at 4.5:1 on the well, wherever the well is', () => {
    const failures: string[] = [];
    let worstClock = Infinity;
    for (const theme of themeNames)
      for (const scheme of SCHEME_NAMES) {
        const p = resolvePalette(theme, scheme);
        const paint = timeButtonPaint(p);
        for (const [where, ground] of grounds(p, theme)) {
          const well = composite(ground, paint.fill);
          const clock = contrastRatio(paint.glyph, well);
          worstClock = Math.min(worstClock, clock);
          if (clock < AA_GRAPHIC) failures.push(`${theme}/${scheme} ${where}: clock ${clock}`);
          const time = contrastRatio(paint.text, well);
          if (time < AA_TEXT) failures.push(`${theme}/${scheme} ${where}: time ${time}`);
        }
      }
    expect(failures).toEqual([]);
    // measured 2026-09-26: the clock 4.39:1 at worst (dark), 4.49 in light, 6.0 in the Night; the
    // time 8.1:1 or better everywhere
    expect(worstClock).toBeGreaterThanOrEqual(4.3);
  });

  it('is a clock a size down from the time beside it, with room either side', () => {
    expect(TIME_BUTTON.glyph).toBeGreaterThanOrEqual(14);
    expect(TIME_BUTTON.glyph).toBeLessThanOrEqual(18);
    expect(TIME_BUTTON.padX).toBeGreaterThan(0);
  });
});

describe('the component (tripwires over TimeButton.tsx)', () => {
  it('is one button at least 44 pt tall, named by the caller and hinted', () => {
    expect(hit.min).toBe(44);
    expect(component).toContain('accessibilityRole="button"');
    expect(component).toContain('accessibilityLabel={accessibilityLabel ?? time}');
    expect(component).toContain('{...(accessibilityHint ? { accessibilityHint } : {})}');
    expect(component).toContain('minHeight: t.hit.min,');
    expect(component.match(/<Pressable/g) ?? []).toHaveLength(1);
  });

  it('stands in the well with the clock before the time, and draws no underline and no edge', () => {
    expect(component).toContain('backgroundColor: paint.fill,');
    expect(component).toContain(
      '<Icon name="clock" size={TIME_BUTTON.glyph} color={paint.glyph} />',
    );
    expect(component).toContain('<Numeric variant="body" ink="text" numberOfLines={1}');
    // a box its row sizes shrinks the time to fit rather than cut it (`fit`, 2026-09-29): the text
    // may give way inside the row, and only when a caller asks for it
    expect(component).toContain(
      '{...(fit === undefined ? {} : { adjustsFontSizeToFit: true, minimumFontScale: fit, style: styles.fit })}',
    );
    expect(component).toContain('fit: { flexShrink: 1 },');
    expect(component).not.toMatch(/textDecoration|borderWidth|borderBottom/);
  });

  it('dims under a press, reduce motion or not, and paints nothing of its own', () => {
    // a dim is the press's feedback, not motion: under reduce motion (or Calm motion) it is the
    // only feedback a press has, so it stays (docs/DESIGN_SYSTEM.md §7, 2026-09-28)
    expect(component).toContain('pressed ? 0.7 : 1');
    expect(component).not.toContain('reduceMotion ? 0.7');
    for (const f of ['TimeButton.tsx', 'timeButton.ts'])
      expect(readFileSync(join(here, f), 'utf8'), f).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(/);
  });
});
