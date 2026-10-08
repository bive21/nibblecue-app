/**
 * A storage place's two colors (docs/DESIGN_SYSTEM.md §23.5): the hue that identifies it and the
 * tint it sits on. One function, so the dot in the total card's legend, the icon square on a
 * location header, the chip in a container sheet and the grid in Storage windows cannot end up
 * showing three different colors for one freezer.
 *
 * WHY THESE ARE PALETTE ROLES AND NOT A `moduleColor` MAPPING. A category hue is overlaid by the
 * household's color scheme — that is what a scheme is for — and these four mean a TEMPERATURE.
 * The stash reads warm to cool and is used in that order (`core` `LOCATION_KIND_ORDER`), so a
 * scheme that made the counter cooler than the deep freezer would have taken away the one thing
 * the sequence is for. `theme.ts` has the measurements; `tools/contrast-check.mjs` holds every
 * pair to 4.5:1 on its own tint, on a card and on the ground, in all three themes, so a place's
 * hue can carry its NAME and not only a dot.
 */
import { composite } from './contrast';
import type { Palette } from './theme';

/** The five `MilkStorageKind` values, as plain strings so core is not imported for a type. */
export type PlaceKind = 'ROOM' | 'FRIDGE' | 'FREEZER' | 'DEEP_FREEZER' | 'THAWED';

export interface PlaceTone {
  /** The hue: the dot, the glyph, the place's own name. */
  fg: string;
  /** The ground it sits on: the icon square, a chip, the show-more button. */
  soft: string;
}

/**
 * THAWING BORROWS THE FRIDGE'S TEAL, and that is a statement rather than a shortcut: a thawing
 * bag IS in the refrigerator — the profile calls the condition "Thawed, in refrigerator" and the
 * Storage windows grid has always drawn that row in the fridge's color. Giving it a fifth hue
 * would say it is a fifth place, when what makes it different is its 24-hour window and not
 * where it is. The location's own name and its window are what tell them apart.
 */
const ROLE: Readonly<Record<PlaceKind, keyof Palette>> = {
  ROOM: 'placeRoom',
  FRIDGE: 'placeFridge',
  FREEZER: 'placeFreezer',
  DEEP_FREEZER: 'placeDeep',
  THAWED: 'placeFridge',
};

/** A place's tone from a resolved palette (`useTheme().color`). Pure, so the admin console and
 *  a test read the same table. */
export function placeTone(palette: Palette, kind: string | null): PlaceTone {
  const role = ROLE[kind as PlaceKind];
  // A household's own kind — or a location whose row has gone from the mirror — takes the
  // neutral text ink rather than a hue it has no claim to. It is still a dot, still labelled.
  if (role === undefined) return { fg: palette.text2, soft: palette.surface2 };
  return { fg: palette[role], soft: palette[`${role}Soft` as keyof Palette] };
}

/* ------------------------------------------------------ the icon square: the hue, full strength */

/**
 * THE SQUARE IS THE PLACE'S HUE, AND EVERY PLACE IS THE SAME STRENGTH (the owner, 2026-09-20,
 * looking at the five of them down the By location list: *"the background color does not make
 * it look very nice. Think about what color would be better and change it"*).
 *
 * IT USED TO BE A RAMP — five steps from a bit over half the hue at the counter to the hue
 * itself at the deep freezer, deepening as the place got colder. Two things were wrong with it,
 * and the second is the one that shows:
 *
 *   * IT SAID WHAT THE HUE ALREADY SAYS. The palette is a temperature to begin with: ochre,
 *     teal, blue, violet, in that order. Encoding the same sequence twice buys nothing, and the
 *     one it costs is consistency — the same drawing on five differently-weighted grounds.
 *   * A HUE AT HALF STRENGTH OVER WHITE IS A MUDDY VERSION OF ITSELF. The counter's ochre at
 *     0.55 is a dull tan, which is the tile the owner's eye went to; the deep freezer at 1.0 is
 *     a clean violet, which is the one that looked right. There is no depth in between that is
 *     not a washed-out version of a color this palette already chose carefully.
 *
 * So there is one depth for all five places, and a thawing bag is the fridge's tone exactly —
 * which is what `ROLE` has always said it is, and the melting-cube drawing is what tells the two
 * apart, as the name under it does.
 *
 * WHAT THE DEPTH IS CAME BACK DOWN ON 2026-09-22 (the owner, with a screenshot of the Locations
 * list: *"change the solid icon background color to lighter color. This one you selected too dark
 * and does not look good"*). It had been 1.0 — the hue itself — and the note above is still right
 * about why the RAMP had to go, but wrong to conclude that the only alternative to a ramp of
 * mid-tones was the hue at full strength. A tenth of the way to the hue is a wash; halfway is the
 * mud the ramp was made of; a quarter is a PASTEL, which is a material this app already uses
 * everywhere — it is what `moduleDiscSwatch` is, and what the owner drew their own reference
 * sheet in.
 *
 * 0.24 measured, not chosen: at that depth the light theme's five squares are #E9D5C5, #C6DDDC,
 * #CCD8EA and #D8D4ED, every one of them still further from the card than the `soft` wash it
 * replaced, and the drawing's own dark outline reads at 9.3:1 or better on all five. It also
 * SWAPS WHICH HALF of the artwork carries the shape, in both directions at once: a tint is a
 * composite over the CARD, so 24% of a deep hue over the light theme's white card is pale and the
 * drawing's dark outline carries it, while the same 24% over the dark and night themes'
 * near-black cards is dark and the white fills do. Exactly the reverse of the full-strength
 * square, and one carrier per theme either way. `places.test.ts` measures every square in every
 * theme rather than trusting a word of this.
 *
 * Still a composite over `surfaceSolid` rather than an alpha, so a square is an opaque color in
 * every theme and the arithmetic stays in one place (DESIGN_SYSTEM §12 rule 1 — the same alpha
 * over a card, a ground and a sheet is three different colors).
 */
export const PLACE_SQUARE_DEPTH = 0.24;

/**
 * THE FLOOR UNDER THE DRAWING, and it is a measurement rather than a taste. What sits on these
 * squares is the owner's own artwork — five fixed-palette illustrations with dark outlines, not
 * the icon set, so nothing inside them recolors with the theme. A ground close to BOTH the
 * outline and the pale fill is the ground that takes the picture away.
 *
 * `places.test.ts` holds every square in every theme to this, either/or: on the light theme's
 * saturated hues the white fills carry the shape (around 6:1) and the outline does not; on the
 * dark and night themes, whose hues are light, it is the other way round. A sixth place, or a
 * hue edited into a mid-tone that loses both, is caught by the tripwire and not by the eye.
 */
export const PLACE_ART_INK = '#12343B';
/** The paper inside the outline — the pale fill that carries the shape on a deep square. */
export const PLACE_ART_PAPER = '#FFFFFF';
export const PLACE_ART_MIN = 4.0;

/**
 * HOW MUCH OF THE HUE A BAND ON THE OWNER'S ARTWORK TAKES (the owner, 2026-09-22, of the stash
 * card's bar and its dots: *"recolor the fridge, freezer, garage color; they are too dark
 * currently, and it does not look nice"*).
 *
 * They were `fg` — the full hue, the ink a place's NAME is set in — and as ink that is exactly
 * right: it is held to 4.5:1 on every ground in every theme so a place can be told by its word
 * and not only by its dot. As a BAND forty points wide on a pale gold picture it is the darkest
 * thing on the screen, which is what the owner is looking at.
 *
 * A band is a graphic, not a word, so the bar it has to clear is WCAG's 3:1 for non-text
 * contrast rather than 4.5 — and it is not even the sole carrier there, because every segment
 * has a named dot and a number under it. 0.8 over white is the lightest tone that still clears
 * 3:1 against the artwork's own gold on all four hues (3.06, 3.06, 3.30, 3.35); 0.76 drops two
 * of them under it. Composited over WHITE rather than over the card, so the four stay their own
 * colors instead of drifting gold.
 */
const PLACE_ON_ART_DEPTH = 0.8;

/**
 * A place's hue as a band or a dot ON ARTWORK — lighter than its ink, and measured for it.
 * A kind this build does not know keeps the neutral it already had.
 */
export function placeOnArt(palette: Palette, kind: string | null): string {
  if (ROLE[kind as PlaceKind] === undefined) return placeTone(palette, kind).fg;
  return composite('#FFFFFF', placeTone(palette, kind).fg, PLACE_ON_ART_DEPTH);
}

/** A place with no kind this build knows: the neutral square it already had, unchanged. */
export function placeSquare(palette: Palette, kind: string | null): string {
  if (ROLE[kind as PlaceKind] === undefined) return placeTone(palette, kind).soft;
  return composite(palette.surfaceSolid, placeTone(palette, kind).fg, PLACE_SQUARE_DEPTH);
}
