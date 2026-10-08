/**
 * A DAILY GOAL REACHED, as numbers (the owner, 2026-09-26: *"possible tummy time animation idea:
 * when goal is achieved, make it more celebratory"*). `GoalBar` draws a goal's progress line with a
 * small mark on its end once the day has reached the goal, and — when the app says the moment is
 * now — plays the moment once. Pure TypeScript, tested in node like `cartBadge.ts`; `GoalBar.tsx`
 * only hands these numbers to `interpolate`.
 *
 * THE MOMENT, in ms on one clock (`GOAL_BURST_MS` in all):
 *     0–360   the bar FILLS the rest of the way, from where the day stood before it crossed;
 *   300–640   the GOAL MARK on the bar's end pops: 0 → 1.35 → 0.9 → 1;
 *   380–1040  five small sparkles burst out of it, up and away from the bar, and fade;
 *   520–820   the words under the bar, where a caller gives them, rise into place.
 * Then everything is at rest: a full bar, the mark, and the words. That end state is ALL there is
 * under reduce motion and in the amber Night — no fill, no pop, nothing thrown, no glow.
 *
 * WHAT IT SAYS, AND DOES NOT. The mark is a check in a disc of the bar's own color: the fact that
 * the household's own number was reached, beside the words that already say the minutes. No
 * trophy, no star rating, no exclamation — nothing that grades a baby or a parent (CLAUDE.md §2
 * rules 3 and 6). No haptic here either: the save that crossed the goal was already felt once, in
 * the write funnel, and a timer crossing it was nobody's tap.
 */
import type { Frame } from './dayNightSwitch';
import { keyFrame, keysWithin, type Key } from './keyframes';

/** The whole moment. */
export const GOAL_BURST_MS = 1100;

/** When each part runs, as fractions of the moment's clock. */
export const GOAL_BURST = {
  fill: [0, 360],
  mark: [300, 640],
  sparks: [380, 1040],
  words: [520, 820],
} as const satisfies Record<string, readonly [number, number]>;

/** The mark on the bar's end: a disc this wide, centred on the bar's end, the check inside it. */
export const GOAL_MARK = 14;
export const GOAL_MARK_CHECK = 9;

/** The mark's pop, over its own window: from nothing, past full, a little back, settled. */
export const GOAL_MARK_KEYS: readonly Key[] = [
  [0, 0],
  [0.45, 1.35],
  [0.75, 0.9],
  [1, 1],
];

/** One sparkle: where it flies to from the mark's middle, how big, and how late it leaves. */
export interface GoalSpark {
  dx: number;
  dy: number;
  size: number;
  /** A share of the sparks' window it waits before it leaves. */
  lag: number;
}

/**
 * FIVE, UP AND AWAY FROM THE BAR. The mark sits at the bar's right end, so they fan up and to the
 * left — over the card's own words for half a second, never out past its right edge or down into
 * whatever is under the bar. Fixed places, so the moment is the same every time and a test can hold
 * every one inside `GOAL_SPARK_REACH`.
 */
export const GOAL_SPARKS: readonly GoalSpark[] = [
  { dx: -22, dy: -6, size: 7, lag: 0 },
  { dx: -15, dy: -16, size: 9, lag: 0.08 },
  { dx: -4, dy: -21, size: 7, lag: 0.04 },
  { dx: 3, dy: -13, size: 6, lag: 0.12 },
  { dx: -26, dy: -12, size: 5, lag: 0.16 },
];

/** The furthest any sparkle's middle travels from the mark's middle, in points. */
export const GOAL_SPARK_REACH = 30;

/** A share `u` of a window, placed on the moment's own clock (0–1). */
const inWindow = (w: readonly [number, number], keys: readonly Key[]): Key[] =>
  keysWithin(keys, w[0] / GOAL_BURST_MS, w[1] / GOAL_BURST_MS);

export interface GoalBurstFrames {
  /** The fill's width as a share of the track: from where the day stood to all of it. */
  fill: Frame;
  mark: Frame;
  sparks: { x: Frame; y: Frame; scale: Frame; opacity: Frame }[];
  words: { opacity: Frame; y: Frame };
}

/** Every frame of the moment, the fill starting at `from` (the bar's share before the crossing). */
export function goalBurstFrames(from: number): GoalBurstFrames {
  const start = Math.min(1, Math.max(0, Number.isFinite(from) ? from : 0));
  const [s0, s1] = GOAL_BURST.sparks;
  return {
    fill: keyFrame(
      inWindow(GOAL_BURST.fill, [
        [0, start],
        [1, 1],
      ]),
    ),
    mark: keyFrame(inWindow(GOAL_BURST.mark, GOAL_MARK_KEYS)),
    sparks: GOAL_SPARKS.map(s => {
      const w: readonly [number, number] = [s0 + s.lag * (s1 - s0), s1];
      return {
        x: keyFrame(
          inWindow(w, [
            [0, 0],
            [0.7, s.dx],
          ]),
        ),
        y: keyFrame(
          inWindow(w, [
            [0, 0],
            [0.7, s.dy],
          ]),
        ),
        scale: keyFrame(
          inWindow(w, [
            [0, 0.2],
            [0.3, 1],
            [1, 0.5],
          ]),
        ),
        opacity: keyFrame(
          inWindow(w, [
            [0, 0],
            [0.12, 1],
            [0.6, 1],
            [1, 0],
          ]),
        ),
      };
    }),
    words: {
      opacity: keyFrame(
        inWindow(GOAL_BURST.words, [
          [0, 0],
          [1, 1],
        ]),
      ),
      y: keyFrame(
        inWindow(GOAL_BURST.words, [
          [0, 4],
          [1, 0],
        ]),
      ),
    },
  };
}
