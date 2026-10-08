/**
 * THE CAPSULE'S WORDS, MEASURED — never an ellipsis, never a word broken in half (the owner,
 * 2026-09-26: *"check the text warp in capsule mode, it still shows "....." on my display"*).
 *
 * A capsule is a wide pill two to a row, its icon at the left and two lines beside it: the module's
 * NAME, and the LINE under it (`37m · 4 oz`) with the day's count. Every one of those used to be
 * able to come out wrong on a phone:
 *
 *   - the name had no measure at all. It grew with the phone's text size, uncapped, in a column
 *     92 pt wide on a 360 dp phone, and "Temperature" is 5.95 em in the face it is drawn in: at
 *     1.2× text it no longer fits one line, and a word longer than its line is broken where it runs
 *     out — "Temperatur / e";
 *   - the line was held to one line (`numberOfLines={1}`) and trusted to a character budget, so
 *     any line the budget did not foresee — a caregiver's own rule name in wide capitals, a first
 *     frame laid out before the tile had measured itself, a face that had not loaded — was drawn
 *     as "…";
 *   - and the count's chip sat in the top corner OVER the name's line, so a long name ran under it:
 *     "Breastfe[3×]" at 1.3× text on a 360 dp phone.
 *
 * WHAT A CAPSULE DOES NOW. The name is measured before it is drawn: it takes the phone's text size
 * (to the chrome cap, 1.6, as a path tile's title does), and where a word would not fit the column
 * at that size the name is drawn SMALLER — never below `CAPSULE_LABEL.floor`, what the phone's own
 * smallest text setting draws it at — on at most two lines, broken only between words
 * (`capsuleLabelFit`). The widths are the face's own, read out of the Hanken Grotesk Bold TTF the
 * app ships (`UI_BOLD_EM`; the app's test reads the TTF again and holds this table to it). The
 * count leaves the corner for the end of the second row, beside the line when both fit and on a row
 * of its own when they do not (`capsuleSecondRow`), so nothing is ever drawn over a word. And no
 * text in a capsule is held to a number of lines any more: a line the budget got wrong WRAPS, and
 * cannot be cut. `quickCapsule.test.ts` walks every phone from 320 to 430 pt at every text size.
 */
import { space, type as typeScale } from '../theme/theme';
import { ADVANCE, lineBudget, TILE_TRACKING, type TileFace } from './quickScale';

/** The disc a capsule's icon sits in, at its left; the glyph in it is 24. */
export const QUICK_HOLDER_CAPSULE = 36;
/** The gutter each three-row tile keeps for itself, the grid's own padding (`QuickRow`). */
export const QUICK_GRID_PAD = 4;

/**
 * HANKEN GROTESK BOLD, CHARACTER BY CHARACTER, in em: the advance widths out of the TTF the app
 * bundles (`@expo-google-fonts/hanken-grotesk/700Bold`, 1000 units to the em), without kerning —
 * so a word measured here is a hair WIDER than the face sets it, the safe side for a fit. The name
 * is drawn in the UI face at the bold weight, which is this face or the regular one made bold by
 * the platform; either is no wider than this. A character not in the table is charged
 * `UI_BOLD_FALLBACK_EM`, the widest glyph the face has (W), so an unforeseen name can only be
 * measured too wide.
 */
export const UI_BOLD_EM: Readonly<Record<string, number>> = {
  a: 0.546,
  b: 0.574,
  c: 0.522,
  d: 0.574,
  e: 0.541,
  f: 0.348,
  g: 0.522,
  h: 0.564,
  i: 0.245,
  j: 0.245,
  k: 0.56,
  l: 0.278,
  m: 0.843,
  n: 0.564,
  o: 0.572,
  p: 0.574,
  q: 0.574,
  r: 0.426,
  s: 0.472,
  t: 0.367,
  u: 0.564,
  v: 0.535,
  w: 0.755,
  x: 0.542,
  y: 0.535,
  z: 0.471,
  A: 0.674,
  B: 0.611,
  C: 0.709,
  D: 0.674,
  E: 0.578,
  F: 0.558,
  G: 0.735,
  H: 0.693,
  I: 0.263,
  J: 0.556,
  K: 0.663,
  L: 0.504,
  M: 0.856,
  N: 0.689,
  O: 0.747,
  P: 0.562,
  Q: 0.785,
  R: 0.612,
  S: 0.575,
  T: 0.584,
  U: 0.657,
  V: 0.672,
  W: 0.979,
  X: 0.67,
  Y: 0.625,
  Z: 0.605,
  ' ': 0.26,
  '-': 0.327,
  "'": 0.193,
  '’': 0.27,
  '.': 0.24,
  '&': 0.7,
};
export const UI_BOLD_FALLBACK_EM = 0.979;

/** How wide `text` is at `size` points in the bold UI face. */
export const uiBoldWidth = (text: string, size: number): number =>
  Array.from(text).reduce((em, c) => em + (UI_BOLD_EM[c] ?? UI_BOLD_FALLBACK_EM), 0) * size;

/**
 * THE NAME'S TYPE. `bodySm`'s size and line, the size a capsule has always drawn its name at; the
 * chrome cap on how far it follows the phone's text size (`CHROME_FONT_CAP` in Text.tsx, which this
 * file cannot import — it is React Native; a capsule's name is chrome in a box of a fixed width,
 * as a path tile's title is); the `floor` it is never made smaller than — 11, what the phone's own
 * smallest text setting (0.85) draws it at, so shrinking never takes a name below a size a parent
 * could have chosen; and two lines at most.
 */
export const CAPSULE_LABEL = {
  size: typeScale.bodySm.fontSize,
  lineHeight: typeScale.bodySm.lineHeight,
  cap: 1.6,
  floor: 11,
  lines: 2,
} as const;

/**
 * What a capsule spends on its own edges before a word: the hairline pair (2, and 4 for an alert's
 * heavier edge — an allowance that costs a fraction of a character, never an ellipsis), its left
 * gutter `space.sm`, its right one `space.xl`, the icon holder and the gap after it `space.md`.
 */
export const capsuleChrome = (alerting = false): number =>
  (alerting ? 4 : 2) + space.sm + space.xl + QUICK_HOLDER_CAPSULE + space.md;

/** The words' column in a capsule `tileWidth` wide. */
export const capsuleTextWidth = (tileWidth: number, alerting = false): number =>
  Math.max(0, tileWidth - capsuleChrome(alerting));

/**
 * A capsule's width on Today, from the window alone — for the first frame, before the tile has
 * measured itself: the screen's gutters (`space.xxl` each side), the grid's negative margin and
 * each cell's padding (`QuickRow`), two to a row. 158 on a 360 dp phone, 138 on the 320 pt one.
 */
export const capsuleTileWidth = (windowWidth: number): number =>
  Math.max(0, (windowWidth - 2 * space.xxl + 2 * QUICK_GRID_PAD) / 2 - 2 * QUICK_GRID_PAD);

/**
 * How many lines `label` takes in `room` at `size`, its words set greedily and broken only between
 * them — or `Infinity` when one word alone is wider than the room, which is a word broken in half.
 */
export function capsuleLines(label: string, room: number, size: number): number {
  const words = label.trim().split(/\s+/).filter(Boolean);
  const gap = uiBoldWidth(' ', size);
  let lines = 0;
  let used = 0;
  for (const word of words) {
    const w = uiBoldWidth(word, size);
    if (w > room + 1e-9) return Infinity;
    if (lines === 0 || used + gap + w > room + 1e-9) {
      lines += 1;
      used = w;
    } else used += gap + w;
  }
  return Math.max(1, lines);
}

export interface CapsuleLabelFit {
  /** The size to draw the name at, with the phone's text size already in it: the Text scales no further. */
  size: number;
  lineHeight: number;
  /** The lines it takes at that size: one or two. */
  lines: number;
  /**
   * Whether it fits whole at `size`. False only for a word no size down to the floor can hold — a
   * name nobody has written yet — which is drawn at the floor and wraps rather than being cut.
   */
  fits: boolean;
}

/**
 * THE NAME'S SIZE IN A CAPSULE: the phone's own text size (to the cap), or the largest size under
 * it at which every word fits the column and the name takes two lines at most — never below the
 * floor. A name that fits is never touched; one that does not is made smaller, not cut.
 */
export function capsuleLabelFit(label: string, room: number, fontScale: number): CapsuleLabelFit {
  const scale =
    Number.isFinite(fontScale) && fontScale > 0 ? Math.min(fontScale, CAPSULE_LABEL.cap) : 1;
  const nominal = CAPSULE_LABEL.size * scale;
  const ratio = CAPSULE_LABEL.lineHeight / CAPSULE_LABEL.size;
  const at = (size: number, fits: boolean): CapsuleLabelFit => {
    const lines = capsuleLines(label, room, size);
    return {
      size,
      lineHeight: size * ratio,
      lines: Number.isFinite(lines) ? lines : CAPSULE_LABEL.lines,
      fits,
    };
  };
  const fitsAt = (size: number) => capsuleLines(label, room, size) <= CAPSULE_LABEL.lines;
  // a column not measured yet has nothing to fit against: the phone's size, as the first frame
  if (!(room > 0) || fitsAt(nominal)) return at(nominal, true);
  // never below the floor — nor above the phone's own size, where that is smaller still
  const floor = Math.min(CAPSULE_LABEL.floor, nominal);
  if (!fitsAt(floor)) return at(floor, false);
  // smaller words never take more lines, so the largest size that fits is found by halving
  let lo = floor;
  let hi = nominal;
  for (let i = 0; i < 24; i += 1) {
    const mid = (lo + hi) / 2;
    if (fitsAt(mid)) lo = mid;
    else hi = mid;
  }
  return at(Math.floor(lo * 100) / 100, true);
}

/* ------------------------------------------------------------------ the second row */

/**
 * THE COUNT'S CHIP, AS WIDE AS IT IS DRAWN (QuickAction's `chip`, `chipText`): a hairline and 5 pt
 * either side of its digits and its ×, set in the mono face at 11.5 — 0.6 em a character — and
 * growing with the phone's text to the chrome cap, as the `meta` role it is drawn in does.
 */
export const COUNT_CHIP = { size: 11.5, pad: 5, border: 1, advance: ADVANCE.mono } as const;

export const countChipWidth = (count: number, fontScale: number): number => {
  const chars = String(Math.max(0, Math.floor(count))).length + 1;
  const scale =
    Number.isFinite(fontScale) && fontScale > 0 ? Math.min(fontScale, CAPSULE_LABEL.cap) : 1;
  return (
    2 * (COUNT_CHIP.border + COUNT_CHIP.pad) + chars * COUNT_CHIP.advance * COUNT_CHIP.size * scale
  );
};

/** The air between the line and the chip beside it. */
export const CAPSULE_CHIP_GAP = space.sm;

/**
 * THE LINE AND THE COUNT, ON THE CAPSULE'S SECOND ROW. The chip goes BESIDE the line when the line,
 * built to the room the chip leaves, still says at least as much as its shortest form: then the
 * pair is one row and the capsule is no taller. Otherwise the line takes the whole column and the
 * chip wraps to a row of its own under it — a capsule a row taller, never a word under a chip.
 *
 * `face` is the line's own (`mono` for the time since and what it was, `ui` for an alert's words)
 * and `lineOf` builds it to a budget of characters (`tileLine`, `tileAlert`), shortening it rung by
 * rung and returning its shortest form when even that is over — which is how "does not fit beside"
 * is recognized.
 *
 * AND A LINE THAT CANNOT BE SHORTENED INTO ITS ROW IS DRAWN SMALLER, not cut (`size`). "Running" is
 * one word the ladder cannot touch, and at 1.5× text on the 320 pt phone it is 73.5 pt of mono in a
 * 72 pt column — which, held to one line, is "Runni…". The size is the meta role's at the phone's
 * text size, or the largest under it at which the line fits its room; the Text is handed it with
 * the phone's scaling turned off, as the name is.
 */
export interface CapsuleSecondRow {
  line: string;
  chipBeside: boolean;
  /** The line's size, the phone's text size already in it. */
  size: number;
}

export function capsuleSecondRow(
  textWidth: number,
  chipWidth: number,
  face: TileFace,
  metaSize: number,
  lineOf: (budget: number) => string,
): CapsuleSecondRow {
  const tracking = face === 'mono' ? TILE_TRACKING : 0;
  const budgetOf = (width: number) => lineBudget(width, metaSize, face, tracking);
  // how large the line may be drawn and still fit `room`: n characters of (advance + tracking)
  const sized = (line: string, chipBeside: boolean, room: number): CapsuleSecondRow => {
    const n = Array.from(line).length;
    const fits = n === 0 ? metaSize : (room / n - tracking) / ADVANCE[face];
    return { line, chipBeside, size: Math.max(0, Math.min(metaSize, fits)) };
  };
  const whole = () => sized(lineOf(budgetOf(textWidth)), false, textWidth);
  if (!(chipWidth > 0)) return whole();
  const room = textWidth - chipWidth - CAPSULE_CHIP_GAP;
  const budget = room > 0 ? budgetOf(room) : 0;
  const shared = budget > 0 ? lineOf(budget) : '';
  return budget > 0 && Array.from(shared).length <= budget ? sized(shared, true, room) : whole();
}
