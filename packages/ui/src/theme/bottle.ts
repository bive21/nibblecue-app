/**
 * THE BOTTLE TOGGLE'S PICTURE — its colors, per theme (`BottleToggle`; the owner, 2026-09-25, of
 * the bottle sheet's "Finished it / Some left": the bottle DRAINS). They live here, in `theme/`,
 * beside the sky's (`sky.ts`), because a picture's colors are measured values and a component may
 * not write one (eslint).
 *
 * UNLIKE THE SKY, THIS PICTURE FOLLOWS THE THEME. The sky had to hold still because the switch it
 * is drawn on is what repaints the app; this toggle repaints nothing, so it is drawn in the theme
 * the sheet is in, and built from that theme's own roles wherever a role will do:
 *
 *   - the pill is the FEED module's soft tint (`feedSoft`), so the bottle's toggle wears the
 *     bottle's hue, as its tile on Today does;
 *   - the words are the theme's `text` and `text2`, the segmented control's own pair;
 *   - the bottle is outlined in the feed ink and its collar is the owner's butter gold — the
 *     bottle module's disc on the owner's color reference (`moduleDiscSwatch.feed`);
 *   - THE MILK IS THE MILK'S, the same in light and in dark, the way a picture of milk is milk
 *     whatever the room is painted: breast milk in the palette's own `milkSoft`, formula a warmer
 *     ivory, water the pale `cyanSoft` of the water module. The tint follows the sheet's Type and
 *     is NEVER the only signal: the Type control above says it in words.
 *
 * WHAT IS MEASURED (`bottle.test.ts`), because a picture that cannot be read is not a control:
 *
 *   - both words are text and clear 4.5:1 on the pill, and the quiet one is quieter than the
 *     chosen one;
 *   - the ghost at the empty end is a mark and clears 3:1 on the pill;
 *   - the bottle's outline clears 3:1 on the pill and on its own glass, so its shape is there at
 *     every stop of the move;
 *   - THE LEVEL READS, for every milk in every theme: where the milk meets the empty glass there is
 *     a 3:1 edge — the milk against the glass, or the line drawn at its surface against both.
 *
 * NIGHT (the amber theme) GETS ITS OWN SET from the night palette's roles and nothing else — no
 * blue, no highlight down the glass, nothing lit: the rule `sky.ts` keeps. The three milks
 * collapse into one there, as every hue in that theme collapses toward amber; the words beside the
 * Type control still say which it is.
 */
import { composite, withAlpha } from './contrast';
import { moduleDiscSwatch, themes, type ThemeName } from './theme';

/** What is in the bottle, as the picture draws it. */
export type BottleMilk = 'breast' | 'formula' | 'water';
export const BOTTLE_MILKS: readonly BottleMilk[] = ['breast', 'formula', 'water'];

export interface BottlePicture {
  /** The pill. */
  ground: string;
  /** The chosen stop's word, and the other stop's: text, 4.5:1 on the pill. */
  word: string;
  quiet: string;
  /** The outline bottle at the stop the knob is not at: a mark, 3:1 on the pill. */
  ghost: string;
  /** The bottle's empty glass, its outline, its collar, its teat and its graduations. */
  glass: string;
  outline: string;
  collar: string;
  teat: string;
  tick: string;
  /** What is in it, by kind, and the line its surface draws. */
  milk: Readonly<Record<BottleMilk, string>>;
  surface: Readonly<Record<BottleMilk, string>>;
  /** The light down the glass; null where nothing may be lit (the amber Night). */
  shine: string | null;
}

/**
 * The owner's butter gold — the bottle's own disc on their color reference, the same hex in light
 * and in dark by their sheet — for the collar, and paler for the teat.
 */
const BUTTER = moduleDiscSwatch.feed;
/**
 * Formula: an ivory a shade warmer and deeper than breast milk's `milkSoft`, so the two read as two
 * milks side by side. The one milk that is not a palette role, because the palette has none for it.
 */
const FORMULA = '#F1E0C0';
const WHITE = '#FFFFFF';

/** The milk, the same whatever the theme around it (see the header). */
const MILK: Readonly<Record<BottleMilk, string>> = {
  breast: themes.light.milkSoft,
  formula: FORMULA,
  water: themes.light.cyanSoft,
};

const light = themes.light;
const dark = themes.dark;
const amber = themes.night;

export const BOTTLE_PICTURE_LIGHT: BottlePicture = {
  ground: light.feedSoft,
  word: light.text,
  quiet: light.text2,
  ghost: light.text3,
  glass: light.surfaceSolid,
  outline: light.feed,
  collar: BUTTER,
  teat: composite(light.surfaceSolid, BUTTER, 0.45),
  tick: light.feed,
  milk: MILK,
  // on a white glass the pale milk has no edge of its own, so its surface is a line: the milk's
  // own amber over milk, the feed ink over formula, the water module's blue over water
  surface: { breast: light.milk, formula: light.feed, water: light.cyan },
  shine: withAlpha(WHITE, 0.7),
};

/**
 * The dark glass is the pill with a little of the theme's text in it — a tinted clear thing on a
 * dark counter — and against it the pale milk IS the edge, so the line at its surface is the
 * pill's own dark, drawn as a meniscus.
 */
const DARK_GLASS = composite(dark.feedSoft, dark.text, 0.12);

export const BOTTLE_PICTURE_DARK: BottlePicture = {
  ground: dark.feedSoft,
  word: dark.text,
  quiet: dark.text2,
  ghost: dark.text3,
  glass: DARK_GLASS,
  outline: dark.feed,
  collar: BUTTER,
  teat: composite(DARK_GLASS, BUTTER, 0.45),
  tick: dark.feed,
  milk: MILK,
  surface: { breast: dark.feedSoft, formula: dark.feedSoft, water: dark.cyanSoft },
  shine: withAlpha(WHITE, 0.5),
};

/**
 * The amber theme's bottle, from the night palette's roles only: the feed module's night tint for
 * the pill, its night ink for the bottle, the dimmest text ink for the milk — one milk, whatever
 * is in the bottle — and the pill's own dark for its surface. No highlight: nothing is lit.
 */
export const BOTTLE_PICTURE_NIGHT: BottlePicture = {
  ground: amber.feedSoft,
  word: amber.text,
  quiet: amber.text2,
  ghost: amber.text3,
  glass: amber.surface3,
  outline: amber.feed,
  collar: amber.feed,
  teat: amber.surface3,
  tick: amber.feed,
  milk: { breast: amber.text3, formula: amber.text3, water: amber.text3 },
  surface: { breast: amber.feedSoft, formula: amber.feedSoft, water: amber.feedSoft },
  shine: null,
};

export const BOTTLE_PICTURE: Readonly<Record<ThemeName, BottlePicture>> = {
  light: BOTTLE_PICTURE_LIGHT,
  dark: BOTTLE_PICTURE_DARK,
  night: BOTTLE_PICTURE_NIGHT,
};

/** The bottle's colors for the theme being painted. */
export const bottlePictureFor = (theme: ThemeName): BottlePicture => BOTTLE_PICTURE[theme];
