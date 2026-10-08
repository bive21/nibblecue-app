/**
 * WHAT A DIAPER HELD, IN ITS OWN COLORS — the drop and the pile on Today's report
 * (`DIAPER_KIND_SOLID_GLYPHS` in `icons/paths.ts`; `StatTable`'s `noteParts`). The owner, 2026-09-26:
 * *"the iccon in diapers need to be colored, blue for water drop, brown for the poo."* In `theme/`
 * beside the diaper sheet's color dots (`stool.ts`) and its toggle (`diaper.ts`), for their reason: a
 * picture's colors are measured values, and a component may not write one (eslint).
 *
 * SOLID SINCE 2026-09-27 (the owner: *"make the icon solid with color instead, it looks too
 * similar"*): each glyph is FILLED in its ink now, not outlined, and the inks did not move. A filled
 * glyph is judged as the outline was — a graphic, against the 3:1 non-text bar, on the card it
 * sits on — and the pile's two grooves are open to that card, so they add no pair to measure.
 *
 * THE DROP IS THE WATER'S BLUE: the palette's `cyan`, the ink the water module is drawn in and the
 * blue the diaper toggle's droplets and its wet stripe already are. A color scheme never touches it,
 * so it is the same blue in all six.
 *
 * THE PILE IS THE DIAPER SHEET'S OWN BROWN: the fill of the Brown chip's dot (`stool.ts`), the
 * brown a parent would name. On a light card it is itself — 5.8:1 on white. On a dark card it
 * would disappear (2.7:1), so the dark theme LIFTS it toward white, as the stool dots lift their
 * rims on a dark chip — `POO_LIFT_DARK`, as far as it takes to clear every dark card with room, and
 * no further, so it stays a brown rather than a beige.
 *
 * NIGHT (the amber theme) KEEPS ITS OWN PALETTE and adds no hue to the screen: the drop is the
 * night palette's `cyan` — the water's own ink there, pulled to amber like every hue in that theme
 * — and the pile its `diaper`, the ink of the diapers figure beside it. No blue anywhere (theme.ts
 * usage rule 7), nothing brighter than the words, and the two still told apart by their shapes.
 *
 * NOTHING HERE SAYS ANYTHING ABOUT A BABY. The brown is the same brown whatever was logged — the
 * color a parent picked on the diaper sheet never reaches it — and neither ink is a status color
 * (CLAUDE.md §2 rules 1 and 3). The count beside each glyph and the words a screen reader hears say
 * what happened; the colors only make a drop and a pile quicker to tell apart at arm's length.
 *
 * MEASURED (`diaperKinds.test.ts`; and the matrix in `contrast.test.ts`): each glyph clears 3:1
 * against the report's card in every theme, scheme and design — the card over the app's ground,
 * the page and paper, blurred and opaque, and over every point of the lit ground a panel floats on.
 */
import { composite } from './contrast';
import { STOOL_DOTS_LIGHT } from './stool';
import type { Palette, ThemeName } from './theme';

/** What the report's two diaper glyphs are pictures of, and so the two inks: a drop, a pile. */
export type DiaperGlyphName = 'drop' | 'poo';
export const DIAPER_GLYPH_NAMES: readonly DiaperGlyphName[] = ['drop', 'poo'];

/**
 * The glyphs the report draws (`DIAPER_KIND_SOLID_GLYPHS`), each with the ink of what it is a
 * picture of. The outlines (`drop`, `poo`) are Reports' day strip's, drawn there in the diaper hue,
 * and have no ink here.
 */
export const DIAPER_GLYPH_INK_OF: ReadonlyMap<string, DiaperGlyphName> = new Map<
  string,
  DiaperGlyphName
>([
  ['drop-solid', 'drop'],
  ['poo-solid', 'poo'],
]);

export type DiaperGlyphInks = Readonly<Record<DiaperGlyphName, string>>;

/** The diaper sheet's Brown, as its dot is filled (`stool.ts`): the pile on a light card. */
export const POO_BROWN = STOOL_DOTS_LIGHT.brown.fill;

/**
 * How far the dark theme takes the brown toward white. 0.3 is the least round step that clears
 * 4:1 on the lightest dark card the report can sit on (dark glass over the lit ground), which is
 * room over the 3:1 floor for a glyph drawn at 13 pt; the stool rims' 0.45 would clear it by more
 * and read as a beige.
 */
export const POO_LIFT_DARK = 0.3;

const WHITE = '#FFFFFF';

/** The inks for the theme being painted, from its resolved palette (`useTheme().color`). */
export function diaperGlyphInks(palette: Palette, theme: ThemeName): DiaperGlyphInks {
  if (theme === 'night') return { drop: palette.cyan, poo: palette.diaper };
  return {
    drop: palette.cyan,
    poo: theme === 'dark' ? composite(POO_BROWN, WHITE, POO_LIFT_DARK) : POO_BROWN,
  };
}

/** A report glyph's own ink — the drop's or the pile's — or null for a glyph that has none. */
export const diaperGlyphInk = (inks: DiaperGlyphInks, name: string): string | null => {
  const of = DIAPER_GLYPH_INK_OF.get(name);
  return of === undefined ? null : inks[of];
};
