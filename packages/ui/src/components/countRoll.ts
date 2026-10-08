/**
 * A TILE'S COUNT ROLLS WHEN IT RISES, as numbers (the owner, 2026-09-26, "agreed", of the second
 * half of the saved → tick idea: when Today's `3×` goes up because of a new entry, the digits roll
 * like an odometer from the old number to the new one and the tile gives a tiny pulse). Pure
 * TypeScript, so every claim here is tested in node — this package's tests cannot render React
 * Native — and `RollingCount.tsx` only hands these numbers to two `Animated.Value`s.
 *
 * THE ODOMETER. The count is split into columns, right-aligned, and ONLY A COLUMN THAT CHANGES
 * MOVES: its old digit slides up out of a clip one line tall while the new one comes up into it
 * from below (`countColumns`), in `COUNT_ROLL_MS`. 3 → 4 turns one wheel; 9 → 10 turns the units
 * wheel from 9 to 0 and brings a 1 up into a tens column that was blank. The `×` never moves. A
 * count that jumps by two (both twins logged at once) turns straight to its new digit — an
 * odometer's wheels do not stop at every number on the way.
 *
 * WHEN IT ROLLS, AND WHEN IT NEVER DOES (`countStep`). Only a RISE rolls, and only a rise of the
 * same count: `scope` names what the number is a count OF — the baby, the day, the rows it was read
 * from — and a change of scope is never a roll, whatever the number does. So the count simply
 * CHANGES on the first render (there is no "before"), on a child switch, on a day change and when a
 * load lands; it rolls for a new entry, whether it was logged on this phone or pulled from the other
 * parent's (a real new entry either way). A fall — an Undo, a delete — is never played: a number
 * going backwards is a correction, not an event.
 *
 * HELD WHILE A SHEET COVERS THE TILE. A save lands while its sheet is still up, and a roll played
 * under the sheet is a roll nobody sees. So the caller says `hold` while something covers the tile,
 * a rise waits — the chip keeps showing the old number — and it rolls once the cover lifts, a beat
 * after (`COUNT_AFTER_SHEET_MS`) so the sheet is out of the way and the scrim has faded.
 *
 * THE PULSE is the tile's own scale, 1 → 1.04 → 1 over `COUNT_PULSE_MS`, riding a half sine so it
 * swells and settles rather than ticking at a corner. Both run on the native driver.
 *
 * WHEN NOTHING MOVES — reduce motion, or the amber Night (`motionStill`) — the count simply changes
 * and the tile does not pulse: no clip, no slide, nothing held.
 */
import type { Frame } from './dayNightSwitch';

/** One wheel's turn: the old digit up and out, the new one up and in. */
export const COUNT_ROLL_MS = 260;
/** §7's sheet curve: the wheel turns quickly and lands softly, never past its digit. */
export const COUNT_ROLL_EASE = [0.22, 0.8, 0.28, 1] as const;
/** The tile's swell and settle. */
export const COUNT_PULSE_MS = 280;
/** How far the tile swells at the top of the pulse. */
export const COUNT_PULSE_PEAK = 1.04;
/**
 * A rise that waited for a sheet rolls this long after the sheet starts to leave: the sheet's own
 * slide is 220 ms on an ease-out, so by now it is most of the way down and the scrim (180 ms) is
 * nearly gone.
 */
export const COUNT_AFTER_SHEET_MS = 120;
/** The count chip's own line height (QuickAction's `chipText`), before the reader's type scale. */
export const COUNT_CHIP_LINE = 14;
/** What follows the number on a tile: `3×`. */
export const COUNT_MARK = '×';

/** The clip each wheel turns in, at the reader's (capped) type scale. */
export const countLine = (fontScale: number): number =>
  COUNT_CHIP_LINE * (Number.isFinite(fontScale) && fontScale > 0 ? fontScale : 1);

/* ------------------------------------------------------------------------------- the wheels */

/** One column of the odometer: the digit it showed and the digit it shows. `''` is no digit. */
export interface CountColumn {
  from: string;
  to: string;
}

/** A tile draws no chip at 0, so a count of 0 has no digits to roll away. */
const digitsOf = (n: number): string => (Number.isFinite(n) && n > 0 ? String(Math.floor(n)) : '');

/**
 * THE COLUMNS, most significant first and aligned on the right, the way the number is read: 9 → 10
 * is `[{'' → '1'}, {'9' → '0'}]`.
 */
export function countColumns(from: number, to: number): CountColumn[] {
  const a = digitsOf(from);
  const b = digitsOf(to);
  const width = Math.max(a.length, b.length);
  const pa = a.padStart(width, ' ');
  const pb = b.padStart(width, ' ');
  return Array.from({ length: width }, (_, i) => ({
    from: (pa[i] ?? ' ').trim(),
    to: (pb[i] ?? ' ').trim(),
  }));
}

/** Whether a column turns. A column that shows the same digit before and after stays put. */
export const columnTurns = (c: CountColumn): boolean => c.from !== c.to;

/* ------------------------------------------------------------------------------ the rule */

export interface CountInput {
  /** The count the data says now. */
  value: number;
  /** What the count is a count OF. A change of scope is never a roll (see the header). */
  scope: string;
  /** Something covers the tile: a rise waits until it lifts. */
  hold: boolean;
  /** Reduce motion or the amber Night: the count simply changes. */
  still: boolean;
}

/** A roll to play: from the number shown to the new one, after a delay, numbered so each plays once. */
export interface CountMove {
  from: number;
  to: number;
  delay: number;
  seq: number;
}

export interface CountState {
  scope: string;
  /** What the chip shows at rest — the OLD number while a rise is held, the new one once it rolls. */
  shown: number;
  /** Whether the last input held, so a rise released by the cover lifting knows to wait a beat. */
  hold: boolean;
  /** The roll in flight, or null at rest. */
  move: CountMove | null;
  seq: number;
}

/** The state a tile starts in: whatever it is told first, simply shown. Never a roll. */
export function countStart(input: CountInput): CountState {
  return { scope: input.scope, shown: input.value, hold: input.hold, move: null, seq: 0 };
}

/**
 * THE NEXT STATE, and the same OBJECT when nothing changed — the component calls this as it renders
 * and sets the result only when it differs, so it must settle on the second call.
 */
export function countStep(s: CountState, i: CountInput): CountState {
  if (i.still || i.scope !== s.scope) {
    if (s.scope === i.scope && s.shown === i.value && s.move === null && s.hold === i.hold)
      return s;
    return { scope: i.scope, shown: i.value, hold: i.hold, move: null, seq: s.seq };
  }
  // a fall is a correction, never an event: shown at once, and whatever was rolling stops
  if (i.value < s.shown) return { ...s, shown: i.value, hold: i.hold, move: null };
  if (i.value === s.shown) return s.hold === i.hold ? s : { ...s, hold: i.hold };
  // a rise, with something over the tile: it waits, and the chip keeps the old number
  if (i.hold) return s.hold ? s : { ...s, hold: true };
  const seq = s.seq + 1;
  return {
    scope: s.scope,
    shown: i.value,
    hold: false,
    seq,
    move: { from: s.shown, to: i.value, delay: s.hold ? COUNT_AFTER_SHEET_MS : 0, seq },
  };
}

/** The roll numbered `seq` has finished: the chip is at rest on its new number. */
export function countSettled(s: CountState, seq: number): CountState {
  return s.move !== null && s.move.seq === seq ? { ...s, move: null } : s;
}

/* ------------------------------------------------------------------------------ the frames */

const frame = (inputRange: readonly number[], outputRange: readonly number[]): Frame => ({
  inputRange,
  outputRange,
  extrapolate: 'clamp',
});

/**
 * Of the roll value, 0 → 1: a turning column's two digits, stacked old over new, slide up one line —
 * the old one out of the top of the clip, the new one into it from below.
 */
export function countRollFrames(line: number): { stack: Frame } {
  const l = Number.isFinite(line) ? Math.max(0, line) : 0;
  return { stack: frame([0, 1], [0, -l]) };
}

/**
 * Of the roll value, 0 → 1: the chip's opacity when the day's FIRST entry rolls in. There was no
 * chip at 0, so it arrives the moment its wheel starts to turn — not through a held roll's delay,
 * where it would sit as a bare `×` — and is whole before the digit has come a fiftieth of the way.
 */
export function countAppearFrames(): { opacity: Frame } {
  return { opacity: frame([0, 0.02, 1], [0, 1, 1]) };
}

/** Samples of the pulse's half sine: enough that the swell reads as a curve, not two lines. */
const PULSE_STEPS = 10;

/**
 * Of the pulse value, 0 → 1 (linear in time): the tile's scale, 1 → `COUNT_PULSE_PEAK` at the
 * middle → 1, as a half sine.
 */
export function countPulseFrames(): { scale: Frame } {
  const xs = Array.from({ length: PULSE_STEPS + 1 }, (_, k) => k / PULSE_STEPS);
  // rounded, so the two ends are exactly 1 and not a sine's hair past it
  const at = (x: number): number =>
    Math.round((1 + (COUNT_PULSE_PEAK - 1) * Math.sin(Math.PI * x)) * 1e6) / 1e6;
  return { scale: frame(xs, xs.map(at)) };
}
