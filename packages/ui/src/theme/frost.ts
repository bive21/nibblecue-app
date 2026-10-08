/**
 * FROST — the colors of a PICTURE drawn at the edges of a surface (`PlaceRim`; the owner,
 * 2026-09-25, of the "that's cool" list: frozen milk wears frost, *"might not necessarily be
 * useful, but it's cool … Let's try doing everything. I will then review"*). Two weights of it
 * since 2026-09-26, when every storage place got a picture of its own (`theme/placeRim.ts` has
 * the other three): a freezer's rime, and a deep freezer's HEAVIER, bluer one.
 *
 * The stash draws it on a container kept in a freezer: a glaze of ice along each side of the
 * container's row, a few frost ferns growing in from the edge, and a glint or two. It is a
 * decoration and says nothing a parent needs — the row's own words already say where the bag is
 * — so it is hidden from assistive technology and measured here for one promise above all:
 *
 *   EVERYTHING WRITTEN ON THE CARD STILL READS OVER THE FROST AT ITS DENSEST. The frost is drawn
 *   in the host's padding, beside its words and never under them (`frostRim.ts` proves the
 *   geometry), but the palette does not lean on that: every ink a card writes — `text` and
 *   `text2` at 4.5:1, `text3` and the four place hues as marks at 3:1 — is held to its floor over
 *   the glaze where the glaze is thickest, on every ground a card can have, in every skin, scheme
 *   and theme (`frost.test.ts`). So a row that grew into its own padding at 200% type, or a
 *   caller that put the frost somewhere tighter, would still be legible.
 *
 * WHY THESE ARE THE THEME'S AND NOT ONE PICTURE FOR ALL THREE, unlike `sky.ts`. The sky is the
 * control that CHANGES the theme, so it must not change palette half way through its own roll.
 * Frost changes nothing: it sits on a card like any other decoration, so it follows the card —
 * pale ice on the light card, a faint white rime on the dark one, and a dim warm rim in night.
 *
 * NIGHT (the amber theme) is built from the night palette's own roles and nothing else, because
 * that theme "drops blue entirely" (theme.ts, usage rule 7) and ice is blue. And it is still:
 * no glint and no droplet — the rule `StopButton`, `ChildChip` and the sky toggle already follow
 * at 3 a.m., nothing on the screen that is not information, and nothing that moves or shines.
 */
import { parseColor, toHex, withAlpha } from './contrast';
import { themes, type ThemeName } from './theme';

export interface FrostPalette {
  /**
   * The glaze at the very edge, alpha included. It fades to nothing at the inner edge of the
   * host's padding (`GLAZE_STOPS`), so this is its densest.
   */
  glaze: string;
  /** The ferns' ink, alpha included: thin strokes, quieter than any word. */
  fern: string;
  /** The glints. Null in night: nothing shines at 3 a.m. */
  sparkle: string | null;
  /** A droplet's body, and the glint on it. Null in night, where nothing moves. */
  drop: string | null;
  dropGlint: string | null;
  /** The wet line a droplet leaves as it runs. Null in night. */
  trail: string | null;
}

/**
 * THE GLAZE'S PROFILE, edge to inner edge: how much of `glaze` is left at each fraction of the
 * way in. Thick at the edge, a soft shoulder, gone before the words — the way rime gathers on
 * the rim of something taken out of a freezer. One table, read by the drawing and by the tests.
 */
export const GLAZE_STOPS: readonly (readonly [offset: number, strength: number])[] = [
  [0, 1],
  [0.42, 0.62],
  [0.74, 0.24],
  [1, 0],
];

/** How much of the glaze is left `d` of the way out: 0 is the edge, 1 is as far as it reaches. */
export function glazeStrength(d: number): number {
  if (d <= 0) return 1;
  if (d >= 1) return 0;
  for (let i = 1; i < GLAZE_STOPS.length; i += 1) {
    const [x1, y1] = GLAZE_STOPS[i] ?? [1, 0];
    const [x0, y0] = GLAZE_STOPS[i - 1] ?? [0, 1];
    if (d <= x1) return y0 + ((d - x0) / (x1 - x0)) * (y1 - y0);
  }
  return 0;
}

const ICE = '#CEE6FC';

/**
 * THE FROST'S WATER — a droplet, the glint on it and the wet line it leaves — in the two themes
 * that have any (night has none: nothing melts where nothing moves). One set, read by both frosts
 * and by the thawing picture a thaw rests in (`theme/placeRim.ts`), because it is the same water
 * in all three and a color that changed on a motion's last frame would be a flicker.
 */
export const FROST_WATER: Readonly<
  Record<'light' | 'dark', { drop: string; dropGlint: string; trail: string }>
> = {
  light: { drop: '#9CC4EA', dropGlint: '#FFFFFF', trail: withAlpha('#8AB6E0', 0.5) },
  dark: { drop: withAlpha(ICE, 0.55), dropGlint: '#FFFFFF', trail: withAlpha(ICE, 0.3) },
};

/**
 * LIGHT: ice on a white card. White frost on white is no frost at all, so the rime is a pale
 * ice blue — about 1.2–1.4:1 off the card, which is what frost on a white surface looks like —
 * and the ferns a deeper one, near 2:1, so their shape carries without competing with a word.
 * The glint is the fern's own blue: a white one would vanish on the pale glaze under it.
 */
const LIGHT: FrostPalette = {
  glaze: '#C4DEF6',
  fern: '#8AB6E0',
  sparkle: '#8AB6E0',
  ...FROST_WATER.light,
};

/**
 * DARK: a white rime on a near-black card. The glaze is light, so it is the one layer here that
 * LOWERS a word's contrast rather than raising it — 18% is the most it can take and still leave
 * `text3` and the deep freezer's violet above 3:1 at its thickest (`frost.test.ts` holds the
 * floor). The ferns are brighter, near 5:1, which is still about half of what `text2` has.
 */
const DARK: FrostPalette = {
  glaze: withAlpha(ICE, 0.18),
  fern: withAlpha('#D6EAFC', 0.6),
  sparkle: '#FFFFFF',
  ...FROST_WATER.dark,
};

const amber = themes.night;

/**
 * NIGHT: the palette's quietest ink, `text3`, at a fraction — a warm rim about 1.2:1 off the card
 * and ferns about 2:1, dimmer than any hairline a word sits beside. No glint, no droplet.
 */
const NIGHT: FrostPalette = {
  glaze: withAlpha(amber.text3, 0.16),
  fern: withAlpha(amber.text3, 0.5),
  sparkle: null,
  drop: null,
  dropGlint: null,
  trail: null,
};

export const FROST_PALETTES: Readonly<Record<ThemeName, FrostPalette>> = {
  light: LIGHT,
  dark: DARK,
  night: NIGHT,
};

/* ------------------------------------------------------------- a deep freezer's frost */

/**
 * THE DEEP FREEZER'S FROST IS HEAVIER AND BLUER (the owner, 2026-09-26: every storage place wears
 * its own picture, and the brief for this one was "a heavier, icier frost — more ferns, a bluer
 * rim"). The extra fern each side is geometry (`frostRim.ts`, `DEEP_FROST`); what is here is the
 * ice, and "heavier" is held as a MEASUREMENT: on every card ground, in light and in dark, this
 * glaze stands further off the card than the freezer's does, and its blue leads its red by more
 * (`frost.test.ts`). It gets there on a narrow budget. The glaze is the one layer a word could
 * ever meet, and the freezer's already takes `text3` close to its floor, so the rim cannot simply
 * be made denser — in LIGHT it is a more saturated blue at nearly the same lightness, and in DARK
 * a deeper, bluer ice that lights the card less per point of alpha and so can take more of it.
 *
 * THE WATER IS THE FREEZER'S. A drop, its glint and its wet line are melted ice, and a deep
 * freezer's melt ends on the same thawing picture as a freezer's (`theme/placeRim.ts`,
 * `MELT_PALETTES`), so their colors are one set: a thaw that swapped its drops' color on the last
 * frame would be a flicker.
 */
const DEEP_LIGHT: FrostPalette = {
  glaze: '#BCD9F8',
  fern: '#77A6DE',
  sparkle: '#77A6DE',
  ...FROST_WATER.light,
};

const DEEP_DARK: FrostPalette = {
  glaze: withAlpha('#A8CCFF', 0.22),
  fern: withAlpha('#C3DDFF', 0.66),
  sparkle: '#FFFFFF',
  ...FROST_WATER.dark,
};

/** NIGHT: the same dim rim in `text3`, a little denser, with its third fern. Still no glint. */
const DEEP_NIGHT: FrostPalette = {
  glaze: withAlpha(amber.text3, 0.19),
  fern: withAlpha(amber.text3, 0.56),
  sparkle: null,
  drop: null,
  dropGlint: null,
  trail: null,
};

export const DEEP_FROST_PALETTES: Readonly<Record<ThemeName, FrostPalette>> = {
  light: DEEP_LIGHT,
  dark: DEEP_DARK,
  night: DEEP_NIGHT,
};

/** The frost for the theme being painted. */
export const frostFor = (theme: ThemeName): FrostPalette => FROST_PALETTES[theme];

/** A deep freezer's frost for the theme being painted. */
export const deepFrostFor = (theme: ThemeName): FrostPalette => DEEP_FROST_PALETTES[theme];

/**
 * A color as the two things an SVG gradient stop takes: an opaque `#RRGGBB` and its alpha. A
 * stop's own `stopOpacity` is the one way to fade a gradient that every renderer honors — an
 * alpha written inside `stopColor` is not read everywhere.
 */
export function splitAlpha(color: string): { rgb: string; alpha: number } {
  const c = parseColor(color);
  return { rgb: toHex(c), alpha: c.a };
}
