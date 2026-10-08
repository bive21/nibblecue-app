/**
 * A LOG SHEET IN ITS MODULE'S COLOR (the owner, 2026-10-06: *"for all logging already finished, and
 * logging any modules: the color should follow the preset module color, instead of user selection
 * theme color. i think it will look more uniform"*). This reverses the morning's rule ("every log
 * sheet wears the household's color", `modules/index.tsx` has the history): one rule still, the
 * other way round.
 *
 * THE WHOLE ACCENT FAMILY, NOT ONE BUTTON. `ModuleTint` already painted a Save in the module's ink,
 * and on its own that was the clash the scheme rule fixed — a mustard Save under blue chips. So a log
 * sheet re-reads the palette instead (`ModuleTheme`): `accent`, `accent2`, `accentSoft` and
 * `onAccent` become the module's, and every chip, stepper, toggle, slot and link on the sheet follows
 * without a prop on any of them. Grounds, surfaces, lines and text are untouched.
 *
 * MEASURED, NOT PICKED (`moduleAccent.test.ts`, every theme × scheme × module): the fill carries its
 * words at 4.5:1, and `accent2`, the accent as words, reads at 4.5:1 on the wash and on the sheet.
 * SOFT (`moduleSoft` below). NIGHT IS LEFT ALONE: the amber screen collapses every hue on purpose.
 */
import { AA_TEXT, composite, contrastRatio } from './contrast';
import { moduleColor, moduleDisc, moduleDiscSwatch, type Palette, type ThemeName } from './theme';
import type { TintModule } from './moduleButton';

/** The module's ink taken toward `toward` until `ok` holds: the least change that reads. */
function deepen(ink: string, toward: string, ok: (c: string) => boolean): string {
  for (let step = 0; step <= 100; step += 2) {
    const c = composite(ink, toward, step / 100);
    if (ok(c)) return c;
  }
  return toward;
}

/**
 * SOFT, NOT SATURATED (the owner, 2026-10-06, of the first module-colored sheets: "make the color not
 * very red especially for breastfeed … it is too intense still, make it much softer"). The first
 * cut filled the chosen chip and the Save with the module's deep ink under white words, which for
 * breastfeed and diaper read as a red alarm. Now the chosen fill is the module's PASTEL, the disc's
 * own swatch let toward white, with the page's dark words on it; the washes are lighter; and the
 * ink that draws words and glyphs is the module's hue muted toward the text (`deep`). Every pair is
 * measured in `moduleAccent.test.ts`.
 */
export const SOFT_MIX = {
  light: { wash: 0.1, rest: 0.22, edge: 0.5, fill: 0.62 },
  dark: { wash: 0.14, rest: 0.2, edge: 0.4, fill: 0.42 },
} as const;
/** How far the module's ink is taken toward the text for words and glyphs: muted, not loud. */
export const SOFT_DEEP = 0.35;

export interface ModuleSoft {
  /** The soft ground of a group of rows, a badge, a start tile's wash. */
  wash: string;
  /** A resting chip. */
  rest: string;
  /** A resting chip's edge, a start tile's edge. */
  edge: string;
  /** The chosen chip, the Save, the start tile's disc. */
  fill: string;
  /** The words on `fill`: the page's own text. */
  onFill: string;
  /** Words, glyphs and a chosen outline in the module's hue, muted. */
  deep: string;
}

export function moduleSoft(
  palette: Palette,
  module: TintModule,
  theme: 'light' | 'dark',
): ModuleSoft {
  const ink = palette[moduleColor[module]];
  const mix = SOFT_MIX[theme];
  // light: the disc's pastel over the sheet; dark: the bright ink over the dark sheet
  const base = palette.surfaceSolid;
  const hue = theme === 'light' ? moduleDiscSwatch[moduleDisc[module]] : ink;
  const at = (x: number) => composite(base, hue, x);
  const wash = at(mix.wash);
  const fill = deepen(at(mix.fill), base, c => contrastRatio(palette.text, c) >= AA_TEXT);
  const reads = (c: string) =>
    [wash, at(mix.rest), base, palette.page].every(g => contrastRatio(c, g) >= AA_TEXT);
  const deep = deepen(composite(ink, palette.text, SOFT_DEEP), palette.text, reads);
  return { wash, rest: at(mix.rest), edge: at(mix.edge), fill, onFill: palette.text, deep };
}

export function moduleAccentPalette(
  palette: Palette,
  module: TintModule,
  theme: ThemeName,
): Palette {
  if (theme === 'night') return palette;
  const soft = moduleSoft(palette, module, theme);
  const role = moduleColor[module];
  return {
    ...palette,
    accent: soft.fill,
    accent2: soft.deep,
    accentSoft: soft.wash,
    onAccent: soft.onFill,
    // the module's own soft role too, so a group of rows (`SoftGroup`) takes the lighter wash
    [`${role}Soft`]: soft.wash,
  };
}

/**
 * THE ACCENT AS INK — words and glyphs (2026-10-06: an Edit in the pump's pastel was too pale to
 * read). On a log sheet the accent is a pastel FILL; ink drawn in it takes `accent2`, the module's
 * muted deep color, instead. A scheme's accent already reads, and is returned as it is.
 */
export function accentInk(palette: Palette): string {
  return contrastRatio(palette.accent, palette.surfaceSolid) < AA_TEXT
    ? palette.accent2
    : palette.accent;
}
