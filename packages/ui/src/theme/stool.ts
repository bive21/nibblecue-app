/**
 * THE DIAPER SHEET'S COLOR DOTS — the small filled dot before each color chip's word (the owner,
 * 2026-09-26: *"Optional: (yellow color icon) yellow, (green color icon) green, etc."*). In `theme/`
 * because a picture's colors are measured values and a component may not write one (eslint).
 *
 * THEY ARE THE COLORS THE PARENT SAW, NOTHING MORE. Each is a plain, recognizable swatch of its
 * name — the yellow, the green, the brown, the black and the red a parent is choosing between — so
 * the dot says at a glance which chip is which, and the WORD beside it always says it too (Chip
 * draws the label whatever the icon; nothing is conveyed by color alone). No dot is a status color,
 * none is brighter or bigger than another, and none carries a mark, a ring of warning or a word:
 * red is red and black is black, as Yellow is yellow (CLAUDE.md §2 rules 1 and 3). The test holds
 * that the red here is not the palette's `crit`, and that nothing distinguishes one dot but its
 * fill.
 *
 * THE SAME FILL IN LIGHT AND IN DARK, the way the milk is the milk whatever the room is painted —
 * with a thin RING so every dot is seen on the chip it sits on: the dot's own color deepened on a
 * light chip, where a yellow would otherwise melt into white, and lifted on a dark one, where a
 * black would melt into the dark. A ring in the dot's own hue reads as the bead's rim, not as a
 * gray outline laid over it. Measured (`stool.test.ts`): every dot has a 3:1 edge — its fill or its
 * ring — against every ground a resting chip is painted on, in every theme, scheme and design.
 *
 * NIGHT (the amber theme) draws them DIMMED: each fill half way into the night chip's own dark, so
 * a dot is never brighter than the words beside it, with a ring of the palette's own `text3`. No
 * fill there carries more blue than red (theme.ts usage rule 7) — none of these five ever did.
 */
import { composite } from './contrast';
import { themes, type ThemeName } from './theme';

/** The chips' colors, in the sheet's order: the words `diaper_details.color` holds, lower-cased. */
export const STOOL_COLORS = ['yellow', 'green', 'brown', 'black', 'red'] as const;
export type StoolColor = (typeof STOOL_COLORS)[number];

/** A dot: its fill, and the thin ring round it. */
export interface StoolDot {
  fill: string;
  ring: string;
}

/** The five colors, as a parent would name them. */
const FILL: Readonly<Record<StoolColor, string>> = {
  yellow: '#E8B62A',
  green: '#6E9E3A',
  brown: '#8B5B31',
  black: '#2A2522',
  red: '#C4403A',
};

/**
 * How far the ring is taken from the dot's own color: towards black on a light chip, towards white
 * on a dark one. Enough that the yellow's ring clears 3:1 on white and the black's on the darkest
 * dark chip, and no further — a ring is the dot's rim, not a second color.
 */
const RING_MIX = { light: 0.42, dark: 0.45 } as const;
/** How much of the day's fill the amber Night keeps, over its own chip. */
export const NIGHT_DOT = 0.5;

const BLACK = '#000000';
const WHITE = '#FFFFFF';

const dots = (ring: (fill: string) => string): Readonly<Record<StoolColor, StoolDot>> => ({
  yellow: { fill: FILL.yellow, ring: ring(FILL.yellow) },
  green: { fill: FILL.green, ring: ring(FILL.green) },
  brown: { fill: FILL.brown, ring: ring(FILL.brown) },
  black: { fill: FILL.black, ring: ring(FILL.black) },
  red: { fill: FILL.red, ring: ring(FILL.red) },
});

export const STOOL_DOTS_LIGHT = dots(c => composite(c, BLACK, RING_MIX.light));
export const STOOL_DOTS_DARK = dots(c => composite(c, WHITE, RING_MIX.dark));

const amber = themes.night;
const dim = (c: string): string => composite(amber.surfaceSolid, c, NIGHT_DOT);
export const STOOL_DOTS_NIGHT: Readonly<Record<StoolColor, StoolDot>> = {
  yellow: { fill: dim(FILL.yellow), ring: amber.text3 },
  green: { fill: dim(FILL.green), ring: amber.text3 },
  brown: { fill: dim(FILL.brown), ring: amber.text3 },
  black: { fill: dim(FILL.black), ring: amber.text3 },
  red: { fill: dim(FILL.red), ring: amber.text3 },
};

export const STOOL_DOTS: Readonly<Record<ThemeName, Readonly<Record<StoolColor, StoolDot>>>> = {
  light: STOOL_DOTS_LIGHT,
  dark: STOOL_DOTS_DARK,
  night: STOOL_DOTS_NIGHT,
};

/** The dots for the theme being painted. */
export const stoolDotsFor = (theme: ThemeName): Readonly<Record<StoolColor, StoolDot>> =>
  STOOL_DOTS[theme];

/** Which of the five a chip's word is — `'Yellow'` is `'yellow'` — or null for any other word. */
export const stoolColorOf = (word: string): StoolColor | null => {
  const key = word.trim().toLowerCase();
  return (STOOL_COLORS as readonly string[]).includes(key) ? (key as StoolColor) : null;
};
