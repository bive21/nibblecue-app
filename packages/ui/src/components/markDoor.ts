/**
 * THE HEART'S HIDDEN DOOR (the owner, 2026-09-26: "i want night light to be a hidden feature
 * (instead of adding another module), like tap our logo 3 times, to enter night light").
 *
 * Three taps on the mark in the top bar, each within `MARK_DOOR_IDLE_MS` of the last, open what
 * the app hands the bar — the Night light. The count is the About credits' own (`countTap`), with
 * a shorter door: three taps is a deliberate gesture a thumb makes in a second, and the mark is
 * not a control anyone taps for anything else, so a brush or two of it opens nothing, and a pause
 * longer than the idle window starts the count again.
 *
 * NOTHING IS FELT OR SHOWN BEFORE IT OPENS. The credits tick from their fourth tap because seven
 * is long enough to wonder; three is not, and a door the parent was told about should simply open.
 * The Night light's own fade is the arrival.
 *
 * THE TARGET IS THE MARK AND A FEW POINTS ROUND IT, never the bar: the mark's slot spans the bar
 * and lets every touch through except on the mark itself (`box-none`), and the slop that brings a
 * 28–30 pt mark up to a 44 pt target stays clear of the child chip, which the bar's layout keeps a
 * gap and more away (`markDoorClearsChip`, tested at every width a phone gives).
 */
import { countTap, type TapResult, type TapRun } from './starfield';
import { chipRightEdge, markLeft, markSize } from './topBarLayout';

export const MARK_DOOR_TAPS = 3;
/** A pause longer than this between two taps starts the count again. */
export const MARK_DOOR_IDLE_MS = 700;
/** The smallest target a touch control may have (docs/DESIGN_SYSTEM.md, CLAUDE.md §6). */
const MIN_TARGET = 44;

/** One tap on the mark at `now`. */
export const countMarkTap = (run: TapRun | null, now: number): TapResult =>
  countTap(run, now, MARK_DOOR_TAPS, MARK_DOOR_IDLE_MS);

export interface MarkHitSlop {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/**
 * How far past its edges a touch still lands on the mark: enough to make it a 44 pt target, and
 * LOPSIDED WHERE IT HAS TO BE. At 380 pt the chip's cap steps up from 126 to 150 and its widest
 * edge comes within 7 pt of the mark, so the slop toward it is cut to what is free (a point short
 * of the chip) and the difference is added on the right, where the bar is empty to the sync chip.
 * Above and below, the bar is 52 tall, so the full half is always there.
 */
export function markHitSlop(width: number): MarkHitSlop {
  const size = markSize(width);
  const half = Math.max(0, Math.ceil((MIN_TARGET - size) / 2));
  const free = Math.floor(markLeft(width) - chipRightEdge(width) - 1);
  const left = Math.max(0, Math.min(half, free));
  return { top: half, bottom: half, left, right: Math.max(half, MIN_TARGET - size - left) };
}

/** True when the mark's target, slop and all, stays right of the child chip at its widest. */
export const markDoorClearsChip = (width: number): boolean =>
  chipRightEdge(width) < markLeft(width) - markHitSlop(width).left;
