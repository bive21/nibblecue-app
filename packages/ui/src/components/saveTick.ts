/**
 * THE SAVE THAT TICKS, as numbers (the owner, 2026-09-26, "agreed", of the first of two delight
 * animations: a Save's words give way to a check mark that draws itself inside the button, one
 * soft "done" is felt, and the sheet closes as it always has). Pure TypeScript, so every claim here
 * is tested in node — this package's tests cannot render React Native — and `Button.tsx` only hands
 * these numbers to one `Animated.Value` and to `TickMark`.
 *
 * THE MARK IS THE CHECKLISTS' OWN TICK (`TickMark`, `tickDraw.ts`): the same glyph, the same 220 ms
 * pen running from the short stroke's start through the corner to the tip, drawn in the button's
 * own ink — the ink its words were in, so the mark is measured wherever the words already were.
 * The words step up and fade in `SAVE_WORDS_OUT_MS` as the pen sets off; they stay LAID OUT, unseen,
 * as a waiting button's do, so the button keeps its width and height and nothing around it moves.
 *
 * WHY THE SHEET WAITS FOR IT. A capture sheet closed the instant its save landed, and the sheet
 * leaves on the sheet's own ease-out curve (§7), which has carried the Save button most of the way
 * off the screen within its first sixty milliseconds: a tick drawn DURING that close would be drawn
 * where nobody can see it. So the sheet holds still for `SAVE_TICK_HOLD_MS` once the save has
 * landed — the pen's 220 ms and a beat for it to land — and then closes exactly as it did. The
 * brief's ceiling was 250 ms added to the close; `saveTick.test.ts` holds both ends.
 *
 * NOTHING ABOUT THE WRITE WAITS. The entry is in the local store before the pen moves, the toast
 * has said so (and the screen reader with it), and the one haptic has been felt — all of that
 * happens in the write funnel (`useWriteContext`), which knew nothing of this and still does not.
 *
 * WHEN NOTHING MOVES — reduce motion, or the amber Night (`motionStill`) — the words are gone and
 * the check is whole on the same frame: no lift, no pen. The hold is kept, because it is not
 * motion: it is the moment the check can be seen at all, and without it a still sheet would vanish
 * with the words still on its button.
 */
import type { Frame } from './dayNightSwitch';
import { TICK_DRAW_MS } from './tickDraw';

/**
 * How long a capture sheet waits, once its save has landed, before it closes. The pen's 220 ms and
 * 20 more for the stroke to land on its tip — under the 250 ms the brief allows.
 */
export const SAVE_TICK_HOLD_MS = TICK_DRAW_MS + 20;

/** The most the tick may add to a sheet's close (the brief). */
export const SAVE_TICK_HOLD_MAX_MS = 250;

/**
 * The words leave in this long: all but gone (under 5% of them) by the time the pen turns the
 * corner, so the check is never drawn through a word. 120 left 6% there — `saveTick.test.ts`.
 */
export const SAVE_WORDS_OUT_MS = 100;

/** How far the words rise as they go, in points: a step aside, not a flight. */
export const SAVE_WORDS_LIFT = 6;

/** The words' curve: §7's sheet curve, a quick start and a soft landing. */
export const SAVE_WORDS_EASE = [0.22, 0.8, 0.28, 1] as const;

/**
 * The check's box, as a share of the button's height: 27 pt in the 54 pt sheet Save, 22 in a 44 pt
 * button, 17 in the 34 pt pill. The glyph's stroke scales with its box (the 24-grid's 2 pt), so the
 * check in the sheet's Save is drawn at about 2.3 pt — a hair heavier than the words it replaces.
 */
export const SAVE_TICK_SCALE = 0.5;

export const saveTickSize = (buttonHeight: number): number =>
  Math.round(Math.max(0, buttonHeight) * SAVE_TICK_SCALE);

const frame = (inputRange: readonly number[], outputRange: readonly number[]): Frame => ({
  inputRange,
  outputRange,
  extrapolate: 'clamp',
});

/** Of the words' value, 0 → 1: fully there, then gone and lifted by `SAVE_WORDS_LIFT`. */
export function saveWordsFrames(): { opacity: Frame; lift: Frame } {
  return {
    opacity: frame([0, 1], [1, 0]),
    lift: frame([0, 1], [0, -SAVE_WORDS_LIFT]),
  };
}
