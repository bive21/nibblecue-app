/**
 * WHAT A CONTROL ASKS NEXT, ROLLED DOWN OUT FROM UNDER IT, as numbers (the owner, 2026-09-26, of
 * the bottle sheet's leftover: *"instead of instantly summon, it rolls down from the button aboe
 * ive (some left) and asks how remaining milk"*). Pure TypeScript, so every claim here is tested in
 * node — this package's tests cannot render React Native — and `RollDown.tsx` only hands these
 * numbers to two `Animated.Value`s.
 *
 * ONE FRACTION, `p`: 0 tucked away, 1 rolled down. Three things are read from it:
 *
 *   - THE CLIP'S HEIGHT, p × the content's own height. It is the room the row takes in the column,
 *     so everything under it moves down with it, frame by frame — nothing on the sheet jumps;
 *   - THE SLIDE: the content's bottom edge rides the clip's bottom edge, so the row comes out from
 *     under the control above it, bottom first, the way a blind unrolls — never uncovered in place;
 *   - THE FADE: in over the first `ROLL_FADE` of the way, so what is still tucked under the control
 *     is never drawn at full strength against it.
 *
 * TWO VALUES, TWO DRIVERS. A height is layout, and the native driver animates only styles that do
 * not lay anything out, so the clip's height runs on the JavaScript driver. The slide and the fade
 * are a transform and an opacity and run on the native driver, on their own value, so the part of
 * the move the eye follows stays smooth when the JavaScript thread is busy. Both are started
 * together on the same clock and curve. If the layout lags a frame behind, the content is a frame
 * further along than its clip, and the clip hides the difference.
 *
 * THE CONTENT IS MEASURED, NOT GUESSED: laid out once inside a clip of no height, which is
 * invisible and moves nothing, and its own height (a transform never changes it) is what the roll
 * runs to. At rest open, the clip lets go of the height and the content lays itself out, so a line
 * that comes or goes inside it later (the "took" line, a twin's row) is simply there.
 *
 * WHEN NOTHING MOVES (`motionStill`): under reduce motion, and in the amber Night, the content is
 * simply there or not — no clip, no slide, no fade (docs/DESIGN_SYSTEM.md §7).
 */
import type { Frame } from './dayNightSwitch';
import { easeAt } from './themeSkyToggle';

/* ------------------------------------------------------------------------------ the phases */

/**
 * Where a roll stands. `opening` and `closing` are moves in flight; `open` and `closed` are rest.
 * The content exists in every phase but `closed`: a roll-up keeps drawing it until it is gone.
 */
export type RollPhase = 'closed' | 'opening' | 'open' | 'closing';

/**
 * THE PHASE AFTER THE CALLER'S ANSWER (`open`) OR THE MOTION RULE (`still`) CHANGES. A change of
 * answer mid-move turns the roll round from where it is; when nothing may move, the roll is at its
 * end state at once, even over a move in flight.
 */
export function rollPhase(phase: RollPhase, open: boolean, still: boolean): RollPhase {
  if (still) return open ? 'open' : 'closed';
  if (open) return phase === 'open' ? 'open' : 'opening';
  return phase === 'closed' ? 'closed' : 'closing';
}

/** Where a move comes to rest when it finishes. */
export function rollSettled(phase: RollPhase): RollPhase {
  if (phase === 'opening') return 'open';
  if (phase === 'closing') return 'closed';
  return phase;
}

/** Whether the content is drawn at all. Rolled up, it is not in the tree — out of reach and focus. */
export const rollDrawn = (phase: RollPhase): boolean => phase !== 'closed';

/** Whether the clip is sized by the move (and clips), rather than by the content at rest. */
export const rollClipped = (phase: RollPhase): boolean =>
  phase === 'opening' || phase === 'closing';

/**
 * Whether the content is on its way out: still drawn, but no longer offered to a finger or a
 * screen reader. A row that is rolling DOWN is offered at once — it is what the parent just asked
 * for.
 */
export const rollHidden = (phase: RollPhase): boolean => phase === 'closing';

/* ------------------------------------------------------------------------------- the move */

/** The two ends of `p`. */
export type RollEnd = 0 | 1;

/**
 * How long a whole roll takes: down in 280 ms, up in 250. Longer than a sheet's 220 ms (§7),
 * because the row travels its own height AND the sheet under it moves with it, and a move that
 * pushes the rest of the page is read as a slower one; the way back up is the quicker of the two,
 * as an exit is. A roll that starts part of the way is shorter (`rollMs`).
 */
export const ROLL_DOWN_MS = 280;
export const ROLL_UP_MS = 250;

/**
 * The sheet's own curve (§7, `motion.sheet` in design-tokens.json): a quick start and a long, soft
 * landing, with no overshoot — a clip taller than its content would show a gap, and a slide past
 * its end would lift the row off the line it stops on.
 */
export const ROLL_EASE = [0.22, 0.8, 0.28, 1] as const;

/** How far into the move the content is fully drawn. */
export const ROLL_FADE = 0.6;

/**
 * How long a roll over `distance` of the way takes: the whole time for the whole way, a little
 * over a third of it for a sliver (the picture toggles' rule, `pictureMoveMs`), nothing for none.
 */
export function rollMs(distance: number, to: RollEnd): number {
  const d = Math.min(Math.max(distance, 0), 1);
  if (d <= 1e-6) return 0;
  return Math.round((to === 1 ? ROLL_DOWN_MS : ROLL_UP_MS) * (0.35 + 0.65 * d));
}

/** A move in flight: where it set off from, where to, when, and for how long. */
export interface RollMotion {
  from: number;
  to: RollEnd;
  startedAt: number;
  duration: number;
}

/** How far down the roll is, `now` — an estimate from the clock and the curve; the drivers have the truth. */
export function rollAt(m: RollMotion, now: number): number {
  const x = m.duration <= 0 ? 1 : (now - m.startedAt) / m.duration;
  return m.from + (m.to - m.from) * easeAt(ROLL_EASE, x);
}

export interface RollPlan {
  /** Where the roll is as this move begins. */
  from: number;
  to: RollEnd;
  duration: number;
}

/**
 * WHAT A CHANGE OF ANSWER DOES: from rest, the roll sets off from its end; mid-move, it turns round
 * from where it is, and a move that has less of the way to go takes less time — so a parent who
 * taps Some left and then Finished it at once sees the row go back the way it came, never jump.
 */
export function planRoll(
  motion: RollMotion | null,
  at: RollEnd,
  to: RollEnd,
  now: number,
): RollPlan {
  const moving = motion !== null && now < motion.startedAt + motion.duration;
  const from = moving ? rollAt(motion, now) : at;
  return { from, to, duration: rollMs(Math.abs(to - from), to) };
}

/* ------------------------------------------------------------------------------ the frames */

const frame = (inputRange: readonly number[], outputRange: readonly number[]): Frame => ({
  inputRange,
  outputRange,
  extrapolate: 'clamp',
});

export interface RollFrames {
  /** Of `p`: the clip's height — the room the row takes, so what is under it moves with it. */
  height: Frame;
  /** Of `p`: the content's slide. Its bottom edge is the clip's bottom edge all the way. */
  slide: Frame;
  /** Of `p`: the content's opacity, full from `ROLL_FADE` on. */
  opacity: Frame;
}

/** The frames for content `height` points tall (a height not yet measured is none). */
export function rollFrames(height: number): RollFrames {
  const h = Number.isFinite(height) ? Math.max(0, height) : 0;
  return {
    height: frame([0, 1], [0, h]),
    slide: frame([0, 1], [-h, 0]),
    opacity: frame([0, ROLL_FADE, 1], [0, 1, 1]),
  };
}
