/**
 * THE DIAPER TOGGLE'S PICTURE — its colors, per theme (`DiaperToggle`; the owner, 2026-09-26, of the
 * diaper sheet's "What was in it": *"we can do something on diaper category too (wet, dirt, both,
 * and dry)"*). In `theme/` beside the bottle's and the bath's, for their reason: a picture's colors
 * are measured values, and a component may not write one (eslint).
 *
 * THE PILL AND ITS WORDS FOLLOW THE THEME, as the bottle's and the bath's do: the ground is the
 * diaper module's own soft tint (`diaperSoft`), the words are the theme's `text` and `text2`, the
 * ghosts at the empty stops its `text3`.
 *
 * THE DIAPER IS THE OWNER'S, THE SAME IN LIGHT AND IN DARK, the way the milk is milk whatever the
 * room is painted: its colors are sampled from the owner's illustrated diaper
 * (`icons/illustrated/diaper.png`, the picture the diaper module wears on Today) — the cream body,
 * the one dark outline the whole illustrated set shares, the sky-blue tabs and cuffs. Where the
 * illustration has a heart, the knob has the stripe a real diaper carries down its front: the
 * illustration's own gold while it is dry, and the water module's blue (`cyan`) once it is wet —
 * the one part of the picture that says something, so the wet stripe is measured against the body.
 * On the dark theme the cream is its own edge, and the outline is only the toy's seam.
 *
 * WHAT MOVES OVER THE GROUND FOLLOWS THE THEME: the droplets are the theme's water blue, the whiff
 * lines its quiet `text3`, the sparkle a gold that clears the ground.
 *
 * WHAT IS MEASURED (`diaper.test.ts`): the words clear 4.5:1 on the ground; the ghost, the whiffs,
 * the droplets and the sparkle clear 3:1 on it; the diaper has a 3:1 edge on it — its body or its
 * outline — and the wet stripe clears 3:1 on the body, so "wet" is there at rest.
 *
 * NIGHT (the amber theme): the night palette's roles and nothing else, and nothing lit — the body is
 * the palette's `surface3` inside the diaper module's night ink, the stripe is dim while dry and the
 * palette's `text3` once wet, and there is no sparkle at all. It is also where nothing moves
 * (`pictureStill`), so the droplets and the wisp are never drawn there; their colors are the
 * palette's own anyway.
 *
 * THERE IS NO STOOL IN THIS PICTURE, AND NO COLOR THAT MEANS ANYTHING ABOUT A BABY: the stripe is
 * the diaper's, the whiffs are a cartoon's, and nothing here is a status color (CLAUDE.md §2 rule 3).
 */
import { composite } from './contrast';
import { moduleDiscSwatch, themes, type ThemeName } from './theme';

export interface DiaperPicture {
  /** The pill. */
  ground: string;
  /** The chosen stop's word, and the others': text, 4.5:1 on the pill. */
  word: string;
  quiet: string;
  /** The outline diapers at the stops the knob is not at: a mark, 3:1 on the pill. */
  ghost: string;
  /** The diaper: its body, its outline, its tabs and cuffs. */
  body: string;
  line: string;
  tab: string;
  /** The wetness stripe down its front: dry, and wet. */
  dry: string;
  wet: string;
  /** The droplets that fall into it, the whiff lines over it, and the sparkle over it. */
  drop: string;
  whiff: string;
  /** Null where nothing may be lit (the amber Night). */
  sparkle: string | null;
}

/** The owner's illustrated diaper, sampled: its cream, its outline and its sky-blue tabs. */
const CREAM = '#FCF5EA';
const OUTLINE = '#034E74';
const SKY = '#73CEF2';
/** The illustration's own gold, for the stripe while it is dry. */
const GOLD = '#FDB72B';

const light = themes.light;
const dark = themes.dark;
const amber = themes.night;

/** The diaper itself, the same in light and in dark (see the header). */
const DIAPER = {
  body: CREAM,
  line: OUTLINE,
  tab: SKY,
  dry: GOLD,
  // the water module's blue, deep enough to read on the cream in either theme
  wet: light.cyan,
} as const;

export const DIAPER_PICTURE_LIGHT: DiaperPicture = {
  ground: light.diaperSoft,
  word: light.text,
  quiet: light.text2,
  ghost: light.text3,
  ...DIAPER,
  drop: light.cyan,
  whiff: light.text3,
  // the feed module's gold: the illustration's is too pale to be seen on the pale ground
  sparkle: light.feed,
};

export const DIAPER_PICTURE_DARK: DiaperPicture = {
  ground: dark.diaperSoft,
  word: dark.text,
  quiet: dark.text2,
  ghost: dark.text3,
  ...DIAPER,
  drop: dark.cyan,
  whiff: dark.text3,
  sparkle: moduleDiscSwatch.feed,
};

/**
 * The amber theme's diaper, from the night palette's roles only: its `surface3` for the body, the
 * diaper module's night ink round it and, blended into it, for the tabs; the stripe `text3` once
 * wet and half of that while dry. Nothing is lit: no sparkle.
 */
export const DIAPER_PICTURE_NIGHT: DiaperPicture = {
  ground: amber.diaperSoft,
  word: amber.text,
  quiet: amber.text2,
  ghost: amber.text3,
  body: amber.surface3,
  line: amber.diaper,
  tab: composite(amber.surface3, amber.diaper, 0.45),
  dry: composite(amber.surface3, amber.text3, 0.45),
  wet: amber.text3,
  drop: amber.text3,
  whiff: amber.text3,
  sparkle: null,
};

export const DIAPER_PICTURE: Readonly<Record<ThemeName, DiaperPicture>> = {
  light: DIAPER_PICTURE_LIGHT,
  dark: DIAPER_PICTURE_DARK,
  night: DIAPER_PICTURE_NIGHT,
};

/** The diaper's colors for the theme being painted. */
export const diaperPictureFor = (theme: ThemeName): DiaperPicture => DIAPER_PICTURE[theme];
