/**
 * THE PLAN LISTS AS A GRID, MEASURED — the numbers behind `PlanLists` (the owner, 2026-09-27:
 * *"the plan where it lists the plus and free are looking very crowded with text, how else would
 * we do it to make it cleaner?"*). Pure TypeScript, so the layout is held in node against the
 * face the app ships (`planGridFit.test.ts`); the component only hands these numbers to views.
 *
 * AN ITEM is a glyph and the feature's `short` name beside it, in `bodySm`. TWO ACROSS while every
 * name sets on two lines at most in half the card at the reader's text size, ONE ACROSS when one
 * would not — `lastgrid`'s rule from docs/MOBILE.md §9 (collapse the columns, never cut the
 * words). The name is body text and follows the phone's text size, with one limit
 * (`planGridScaleCap`): it grows no further than the size at which every name still sets on two
 * lines ACROSS THE WHOLE CARD. From a 360 pt phone up that is past the largest size a phone
 * offers, so nothing is held back; on the 320 pt one it is 3.12×, where "Supplies and shopping"
 * would otherwise go to three lines and "Community" would be broken in half at iOS's largest,
 * 3.57×. A word is never broken and no text is cut, at any width and any size: that is the
 * promise the numbers keep. Measured (2026-09-27): two across at 1× on every phone, one across
 * from 1.34× on the 320 pt phone and from 1.81× on a 390; at 1× on a 390 every name is one line.
 */
import { space, type as typeScale } from '@nibblecue/ui/theme';

export const PLAN_GRID = {
  /** The star or the check, bare: the card is its ground. Row's glyph size, without Row's chip. */
  glyph: 16,
  /** Between the glyph and the name. */
  glyphGap: space.sm,
  /** Between the two columns. */
  columnGap: space.lg,
  /** Between two rows, and under the card's title. */
  rowGap: space.md,
  /** The name: `bodySm`, 13 on 19, in the text ink. */
  size: typeScale.bodySm.fontSize,
  lineHeight: typeScale.bodySm.lineHeight,
  /** Lines a name may take. */
  lines: 2,
  /**
   * THE LARGEST TEXT A PHONE ASKS FOR: React Native's own multiplier for iOS's largest
   * accessibility size, AX5 (`RCTAccessibilityManager.mm`; Android stops at 2). Only a bound for
   * the cap below — past it there is no size left to allow.
   */
  largest: 3.571,
} as const;

/**
 * HANKEN GROTESK REGULAR, CHARACTER BY CHARACTER, in em: the advance widths out of the TTF the app
 * bundles (`@expo-google-fonts/hanken-grotesk/400Regular`, 1000 units to the em), rounded up and
 * without kerning — so a name measured here is a hair WIDER than the face sets it, the safe side
 * for a fit. `planGridFit.test.ts` reads the TTF again and holds this table to it. A character
 * not in the table is charged `UI_REGULAR_FALLBACK_EM`, the widest glyph here (W), so a name
 * nobody measured can only be measured too wide.
 */
export const UI_REGULAR_EM: Readonly<Record<string, number>> = {
  a: 0.54,
  b: 0.587,
  c: 0.518,
  d: 0.587,
  e: 0.54,
  f: 0.335,
  g: 0.514,
  h: 0.547,
  i: 0.226,
  j: 0.226,
  k: 0.532,
  l: 0.265,
  m: 0.828,
  n: 0.547,
  o: 0.577,
  p: 0.587,
  q: 0.587,
  r: 0.407,
  s: 0.47,
  t: 0.346,
  u: 0.547,
  v: 0.521,
  w: 0.748,
  x: 0.52,
  y: 0.521,
  z: 0.472,
  A: 0.637,
  B: 0.601,
  C: 0.704,
  D: 0.682,
  E: 0.585,
  F: 0.565,
  G: 0.731,
  H: 0.678,
  I: 0.246,
  J: 0.552,
  K: 0.634,
  L: 0.495,
  M: 0.839,
  N: 0.676,
  O: 0.748,
  P: 0.554,
  Q: 0.774,
  R: 0.598,
  S: 0.564,
  T: 0.587,
  U: 0.656,
  V: 0.656,
  W: 0.957,
  X: 0.641,
  Y: 0.602,
  Z: 0.582,
  ' ': 0.26,
  ',': 0.24,
  '-': 0.327,
  "'": 0.174,
  '’': 0.263,
  '.': 0.24,
  '&': 0.686,
  '·': 0.334,
};
export const UI_REGULAR_FALLBACK_EM = 0.957;

/** How wide `text` is at `size` points in the regular UI face. */
export type NameWidth = (text: string, size: number) => number;
export const nameWidth: NameWidth = (text, size) =>
  Array.from(text).reduce((em, c) => em + (UI_REGULAR_EM[c] ?? UI_REGULAR_FALLBACK_EM), 0) * size;

/**
 * The grid's width before it has measured itself, from the window alone: the page's gutter
 * either side (`space.xxl`, the Screen's and the sheet's alike), and the card's padding
 * (`space.xl`) and hairline either side.
 */
export const planGridGuess = (windowWidth: number): number =>
  Math.max(0, windowWidth - 2 * space.xxl - 2 * space.xl - 2);

/** The room a name has in a grid `gridWidth` wide at `columns` across: its cell, less the glyph. */
export function planGridRoom(gridWidth: number, columns: 1 | 2): number {
  const cell = columns === 2 ? (gridWidth - PLAN_GRID.columnGap) / 2 : gridWidth;
  return Math.max(0, cell - PLAN_GRID.glyph - PLAN_GRID.glyphGap);
}

const wordsOf = (name: string): string[] => name.trim().split(/\s+/).filter(Boolean);

/**
 * How many lines `name` takes in `room` at `size`, its words set greedily and broken only between
 * them, as the platforms set them — or `Infinity` when one word alone is wider than the room,
 * which is a word broken in half.
 */
export function planGridLines(
  name: string,
  room: number,
  size: number,
  width: NameWidth = nameWidth,
): number {
  const gap = width(' ', size);
  let lines = 0;
  let used = 0;
  for (const word of wordsOf(name)) {
    const w = width(word, size);
    if (w > room + 1e-9) return Infinity;
    if (lines === 0 || used + gap + w > room + 1e-9) {
      lines += 1;
      used = w;
    } else used += gap + w;
  }
  return Math.max(1, lines);
}

/**
 * The largest text scale at which `name` sets on two lines at most in `room`, no word broken: the
 * best of its one-line setting and every place it could break between two lines. (Greedy setting
 * needs two lines or fewer exactly when some break fits both halves, so this is the scale at
 * which `planGridLines` turns three.)
 */
export function nameScaleLimit(name: string, room: number, width: NameWidth = nameWidth): number {
  const words = wordsOf(name);
  const at1 = (ws: string[]) => width(ws.join(' '), PLAN_GRID.size);
  let best = room / Math.max(1e-9, at1(words));
  for (let i = 1; i < words.length; i += 1) {
    const widest = Math.max(at1(words.slice(0, i)), at1(words.slice(i)));
    best = Math.max(best, room / Math.max(1e-9, widest));
  }
  return best;
}

/**
 * HOW FAR THE NAMES MAY GROW WITH THE PHONE'S TEXT SIZE: the largest scale at which every name
 * still sets on two lines across the whole card, never reported below 1 or above `largest`. The
 * Text is handed this as its `maxFontSizeMultiplier`, so a name follows the phone's setting as
 * far as one column has room for it and stops there, whole.
 */
export function planGridScaleCap(
  gridWidth: number,
  names: readonly string[],
  width: NameWidth = nameWidth,
): number {
  const room = planGridRoom(gridWidth, 1);
  const cap = Math.min(PLAN_GRID.largest, ...names.map(n => nameScaleLimit(n, room, width)));
  return Math.max(1, cap);
}

/**
 * TWO ACROSS WHILE EVERY NAME SETS ON TWO LINES IN HALF THE CARD, ONE OTHERWISE, at `scale` — the
 * size the names are drawn at, the phone's own already held to `planGridScaleCap`.
 */
export function planGridColumns(
  gridWidth: number,
  scale: number,
  names: readonly string[],
  width: NameWidth = nameWidth,
): 1 | 2 {
  const s = Number.isFinite(scale) && scale > 0 ? scale : 1;
  const room = planGridRoom(gridWidth, 2);
  return names.every(n => nameScaleLimit(n, room, width) >= s - 1e-9) ? 2 : 1;
}

/**
 * The items in rows of `columns`, in reading order — along the row, then down — so the order a
 * screen reader walks is the order the eye does and the matrix's.
 */
export function planGridRows<T>(items: readonly T[], columns: 1 | 2): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += columns) rows.push(items.slice(i, i + columns));
  return rows;
}
