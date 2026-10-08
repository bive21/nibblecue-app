/**
 * THE BATH TOGGLE'S PICTURE — its colors, per theme (`BathToggle`; the owner, 2026-09-25, of the
 * bath sheet's "Hair — Washed / Not washed": "yes" sends a few bubbles up). In `theme/` beside the
 * sky's and the bottle's, for their reason: a picture's colors are measured values, and a
 * component may not write one (eslint).
 *
 * It follows the theme, as the bottle does, and takes a role wherever a role will do:
 *
 *   - the WALL above the water is the bath module's soft tint (`bathSoft`), so the bath's toggle
 *     wears the bath's hue;
 *   - the WATER is the water module's `cyanSoft` (a little deeper in light, where the pale tint
 *     alone would vanish into the wall) with a `cyan` line at its surface;
 *   - the words are the theme's `text` and `text2`, written on the wall and never on the water;
 *   - the DUCK is the owner's butter gold (`moduleDiscSwatch.feed`), outlined in the feed ink in
 *     light, where gold on a pale wall has no edge of its own; its beak is a toy's orange, the one
 *     color here that is no role, because the palette has no orange a duck's beak could wear.
 *
 * WHAT IS MEASURED (`bath.test.ts`): both words clear 4.5:1 on the wall; the ghost at the empty end
 * clears 3:1 on the wall and on the water it floats on; the water's surface clears 3:1 against the
 * wall and the water; the duck has a 3:1 edge on both — its body or its outline; and a bubble has a
 * 3:1 edge on both — its fill or its rim — so the foam that says "washed" at rest can be seen.
 *
 * NIGHT (the amber theme): the night palette's roles and nothing else, and nothing lit — the foam
 * is drawn as rims with no fill, the duck has no highlight, and the water is the palette's own
 * `surface3` under a `text3` line. It is also where nothing moves (`pictureStill`).
 */
import { composite, withAlpha } from './contrast';
import { moduleDiscSwatch, themes, type ThemeName } from './theme';

export interface BathPicture {
  /** The pill above the water, where the words are written. */
  wall: string;
  /** The water along the pill's foot, and the line at its surface. */
  water: string;
  line: string;
  /** The water drawn OVER the duck's keel, so it floats in the water rather than on a line. */
  lip: string;
  /** The chosen stop's word, and the other stop's: text, 4.5:1 on the wall. */
  word: string;
  quiet: string;
  /** The outline duck (and bubbles) at the stop the knob is not at: a mark, 3:1. */
  ghost: string;
  /** The duck. */
  duck: string;
  duckEdge: string;
  beak: string;
  eye: string;
  wing: string;
  /** The light on the duck's head and in each bubble; null where nothing may be lit. */
  shine: string | null;
  /** A bubble: its fill (with its own alpha) and its rim. */
  bubble: string;
  bubbleEdge: string;
  /** The ripples beside the duck while it moves. */
  ripple: string;
}

const BUTTER = moduleDiscSwatch.feed;
/** A rubber duck's beak. See the header: the palette has no orange for it. */
const BEAK = '#F7973B';
const WHITE = '#FFFFFF';

const light = themes.light;
const dark = themes.dark;
const amber = themes.night;

const LIGHT_WATER = composite(light.cyanSoft, light.cyan, 0.1);

export const BATH_PICTURE_LIGHT: BathPicture = {
  wall: light.bathSoft,
  water: LIGHT_WATER,
  line: light.cyan,
  lip: withAlpha(LIGHT_WATER, 0.6),
  word: light.text,
  quiet: light.text2,
  ghost: light.text3,
  duck: BUTTER,
  duckEdge: light.feed,
  beak: BEAK,
  eye: light.text,
  wing: composite(BUTTER, light.feed, 0.22),
  shine: withAlpha(WHITE, 0.85),
  bubble: withAlpha(WHITE, 0.92),
  bubbleEdge: light.cyan,
  ripple: light.cyan,
};

export const BATH_PICTURE_DARK: BathPicture = {
  wall: dark.bathSoft,
  water: dark.cyanSoft,
  line: dark.cyan,
  lip: withAlpha(dark.cyanSoft, 0.6),
  word: dark.text,
  quiet: dark.text2,
  ghost: dark.text3,
  duck: BUTTER,
  // gold on a dark wall is its own edge; the outline is only the toy's seam
  duckEdge: dark.feedSoft,
  beak: BEAK,
  eye: dark.page,
  wing: composite(BUTTER, dark.feedSoft, 0.22),
  shine: withAlpha(WHITE, 0.85),
  bubble: withAlpha(dark.text, 0.88),
  bubbleEdge: dark.cyan,
  ripple: dark.cyan,
};

/**
 * The amber theme's bath: the bath module's night tint for the wall, the palette's `surface3` for
 * the water, the feed module's night ink for the duck, and every mark in `text3`. The foam is rims
 * without fill and nothing has a highlight: at 3 a.m. nothing on this screen is lit.
 */
export const BATH_PICTURE_NIGHT: BathPicture = {
  wall: amber.bathSoft,
  water: amber.surface3,
  line: amber.text3,
  lip: withAlpha(amber.surface3, 0.6),
  word: amber.text,
  quiet: amber.text2,
  ghost: amber.text3,
  duck: amber.feed,
  duckEdge: amber.feedSoft,
  beak: amber.milk,
  eye: amber.page,
  wing: composite(amber.feed, amber.feedSoft, 0.3),
  shine: null,
  bubble: withAlpha(amber.text3, 0),
  bubbleEdge: amber.text3,
  ripple: amber.text3,
};

export const BATH_PICTURE: Readonly<Record<ThemeName, BathPicture>> = {
  light: BATH_PICTURE_LIGHT,
  dark: BATH_PICTURE_DARK,
  night: BATH_PICTURE_NIGHT,
};

/** The bath's colors for the theme being painted. */
export const bathPictureFor = (theme: ThemeName): BathPicture => BATH_PICTURE[theme];
