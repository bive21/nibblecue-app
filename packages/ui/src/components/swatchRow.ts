/**
 * THE COLOR ROW AS NUMBERS (the owner, 2026-09-25, of the Appearance sheet: *"color is taking too
 * much space, make it fit into a 1 row 4/5 options, remove the description text below the color
 * name"*). Pure, so the one decision this row makes — all six on the page, or a sideways row that
 * shows part of the next — is tested in node at every width and text size the sheet can have,
 * and `Swatch.tsx` and the sheet only hand these numbers to views.
 *
 * The row used to be a grid of three across and two down, each swatch with its name and a line
 * describing the palette under it: about 190 pt of a sheet whose pinned preview already takes the
 * top third. The describing line went (the swatch IS the description), and the six went into one
 * row of disc-and-name cells about 62 pt tall.
 *
 * ONE ROW WHEN EACH CELL CAN HAVE ITS ROOM. A cell is a swatch's whole tap target and the room its
 * name is written in, so it needs two things: the 44 pt a target is never below (CLAUDE.md §6), and
 * the longest name at the phone's current text size with clear air either side of it. When six
 * such cells fit the sheet's body, the six share it equally and nothing scrolls — which is every
 * phone from a 360 dp Android up at the default text size, and most of them at 1.3×.
 *
 * OTHERWISE IT SCROLLS SIDEWAYS, SHOWING FOUR AND A HALF. A row that fits five and clips the sixth
 * at its edge reads as a row of five; a cell cut exactly in half at the sheet's edge reads as "there
 * is more this way", which is the whole job of a scroller nobody is told about. So the cells are
 * sized to leave a half cell showing — four and a half at every width and text size the tests walk,
 * and fewer (three and a half, two and a half) only when the phone's text is so large that four
 * cells no longer fit, never an integer. The scroller runs out to the sheet's right edge (`bleed`,
 * the sheet's own gutter), so the half cell is cut by the edge of the sheet and not in mid-air.
 */
import { hit, space, type as typeScale } from '../theme/theme';

/**
 * THE NAME UNDER A SWATCH, as the arithmetic sees it. `size` is the `meta` role the name is set in,
 * read from the type scale so a change there reaches this too.
 *
 * `advance` is how wide a character is allowed to be, as a fraction of the size — a BOUND, not an
 * average, the same one the theme toggle's words are held to (`WORD_TYPE`). The six names in the
 * face the app ships, read out of its TTF (Hanken Grotesk Regular, 1000 units to the em): Ocean
 * 2.893 em, Lilac 2.044, Rose 2.185, Sunny 2.726 (NibbleCue's Leaf, in its place, 1.91), Reef 2.013, Slate 2.255 — at most 0.579 em a
 * character, Ocean's capital O doing the work. The system faces that draw the name for the moment
 * before the app's own are in set Ocean near 2.85 em. 0.6 covers every one of them.
 *
 * THE BOUND CHOSE A NAME ONCE (2026-09-27). The warm scheme that replaced Clay was to be Mango, and
 * Mango measures 3.017 em — 0.603 a character, past the bound — so it is Sunny (2.726). A scheme
 * name is five letters at most and inside the bound, or the row stops fitting on a 360 dp phone.
 *
 * `gap` is the least clear room between two neighbors' names — `space.sm`, so "Ocean" and "Lilac"
 * never read as one word — and it is also what a lone name keeps from its cell's edges.
 */
export const SWATCH_NAME = {
  size: typeScale.meta.fontSize,
  advance: 0.6,
  gap: space.sm,
} as const;

/** How many cells a scrolling row shows at rest: four, and half of the next. */
export const SWATCH_PEEK = 4.5;

/** How wide `name` may be at `fontScale` × the name's size: characters × the bound. */
export const swatchNameWidth = (name: string, fontScale: number): number =>
  [...name].length * SWATCH_NAME.advance * SWATCH_NAME.size * fontScale;

/** The narrowest a cell may be for `names` at `fontScale`: a target, and the longest name with air. */
export const swatchMinCell = (names: readonly string[], fontScale: number): number =>
  Math.max(hit.min, ...names.map(n => swatchNameWidth(n, fontScale) + SWATCH_NAME.gap));

export interface SwatchRowLayout {
  /** False: every swatch in one row across the body. True: a sideways scroller. */
  scroll: boolean;
  /** Each swatch's cell — its whole tap target and the room its name has. */
  cell: number;
  /**
   * How many cells are in view at rest: `names.length` when the row fits, otherwise a whole number
   * and a half, counted from the body's left edge to the end of the bleed.
   */
  visible: number;
}

export interface SwatchRowInput {
  /** The sheet's body: the room the row has before it scrolls. */
  width: number;
  /** How far a scrolling row may run past the body's right edge (the sheet's own gutter). */
  bleed: number;
  /** Every swatch's name, in order. */
  names: readonly string[];
  /** The text size the names are drawn at — the phone's, capped as their role caps it. */
  fontScale: number;
}

export function swatchRowLayout({
  width,
  bleed,
  names,
  fontScale,
}: SwatchRowInput): SwatchRowLayout {
  const count = Math.max(1, names.length);
  const min = swatchMinCell(names, fontScale);
  if (count * min <= width) return { scroll: false, cell: width / count, visible: count };
  // the viewport a scrolling row is seen through, and the most whole cells that leave a half beside
  // them in it — capped at the four the owner asked to see, and never fewer than one
  const view = width + Math.max(0, bleed);
  const whole = Math.max(1, Math.min(Math.floor(SWATCH_PEEK), Math.floor(view / min - 0.5)));
  const cell = view / (whole + 0.5);
  return { scroll: true, cell, visible: whole + 0.5 };
}
