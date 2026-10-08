/**
 * THE STEP TRACK'S HOP, as numbers (the owner, 2026-09-26: *"Think about on boarding process too,
 * surely there are things we can do to make it better with certain animation"*). Pure TypeScript,
 * so every pose is a number a node test reads (`stepHop.test.ts`); `StepTrack.tsx` only hands
 * these frames to `interpolate`.
 *
 * WHAT MOVES IS THE MARKER. The track is five thin bars and one tall one — the step you are on
 * (`STEP_BAR_CURRENT_HEIGHT`). When the step changes, the tall one does not blink from one bar to
 * the next: it HOPS there, a small arc up and over, and lands with a little squash, while the bar
 * it lands on has already filled. Going Back it hops back the same way. The number beside the
 * track rolls like an odometer: the new one comes up from below as the old one leaves upward
 * (going forward), and the other way round going Back.
 *
 * ONE CLOCK, 0 → 1 over `HOP_MS`, and every channel is a frame of it; at rest the clock is 1 and
 * every frame is at rest there — the marker on its own bar, the new number in its place, the old
 * one gone. A hop cut short (a second Continue, reduce motion, the track going away) is set
 * straight back to 1, so nothing is ever left mid-air.
 *
 * TRANSFORMS AND OPACITY ONLY, so the whole hop runs on the native driver — which is what the
 * track's old refusal to animate was about: a WIDTH animation on a flex segment cannot, and would
 * stutter on the very frame the new step's content mounts. Nothing here changes a size.
 *
 * WHEN NOTHING MOVES (`motionStill`): reduce motion, and the amber Night. The marker is simply on
 * its new bar and the number simply changes.
 */
import type { Frame } from './dayNightSwitch';
import { keyFrame, keysWithin, type Key } from './keyframes';

/** Which way the track moved: the marker hops forward, back, or not at all. */
export type TrackStep = 'forward' | 'back' | null;

export interface TrackAt {
  /** 1-based, as `StepTrack` takes it. */
  current: number;
  total: number;
}

/**
 * WHETHER A CHANGE HOPS, and which way. Only a change of step on a track of the same length: a
 * track that gained or lost a bar (setup's brands step appearing or going as the modules change)
 * is a different track, and its marker is simply drawn where it is. Nothing hops the first time a
 * track is drawn (`prev` null), and nothing hops when nothing may move.
 */
export function trackStep(prev: TrackAt | null, next: TrackAt, still: boolean): TrackStep {
  if (prev === null || still || prev.total !== next.total) return null;
  if (next.current > prev.current) return 'forward';
  if (next.current < prev.current) return 'back';
  return null;
}

/** The whole hop: long enough to be seen as a hop, over before the new step has settled. */
export const HOP_MS = 360;
/** How high the marker lifts, in points: less than the page's top padding (`space.md`) above it. */
export const HOP_LIFT = 3;
/** How far it squashes as it lands, as a share of its height, about its own foot. */
export const HOP_SQUASH = 0.72;
/** The number rolls in the first part of the hop, so it is read before the marker lands. */
export const ROLL_END = 0.7;

/**
 * THE ARC, over the clock. The marker is drawn on its NEW bar and starts `offset` points from it
 * (the old bar, to the left going forward), so its travel is `offset → 0` and rest is 0.
 *
 * `x` eases in and out over the whole hop — a half cosine between two turning points is exactly
 * that (`keyframes.ts`). `y` lifts to `HOP_LIFT` at the middle and comes down, so the path is an
 * arc and not a slide. `squash` is its height as it lands: full in the air, pressed to
 * `HOP_SQUASH` just after touching down, and back.
 */
/** Touchdown: the arc is over and the marker is on its bar. The squash starts here and not before. */
export const HOP_LAND = 0.86;
export const HOP_X: readonly Key[] = [
  [0, 1],
  [HOP_LAND, 0],
];
export const HOP_Y: readonly Key[] = [
  [0, 0],
  [HOP_LAND / 2, -1],
  [HOP_LAND, 0],
];
export const HOP_SQUASH_KEYS: readonly Key[] = [
  [0, 1],
  [HOP_LAND, 1],
  [0.93, HOP_SQUASH],
  [1, 1],
];

export interface HopFrames {
  /** Points, from the new bar. */
  x: Frame;
  /** Points; up is negative. */
  y: Frame;
  /** The marker's height as a multiple of its own, about its foot. */
  squash: Frame;
}

const scaledKeys = (keys: readonly Key[], by: number): Key[] => keys.map(([at, v]) => [at, v * by]);

/** The hop from a bar `offset` points away (negative: the old bar is to the left). */
export function hopFrames(offset: number): HopFrames {
  return {
    x: keyFrame(scaledKeys(HOP_X, offset)),
    y: keyFrame(scaledKeys(HOP_Y, HOP_LIFT)),
    squash: keyFrame(HOP_SQUASH_KEYS),
  };
}

/**
 * Where the old bar is, from the new one, on a track whose bars stand `pitch` points apart (a
 * bar's width and the gap after it). Forward from 2 to 3 the old bar is one pitch to the LEFT.
 */
export const hopOffset = (from: number, to: number, pitch: number): number => (from - to) * pitch;

/** A bar's pitch on a row `width` wide holding `total` bars `gap` apart: every bar is `flex: 1`. */
export function barPitch(width: number, total: number, gap: number): number {
  if (total <= 0 || width <= 0) return 0;
  return (width - gap * (total - 1)) / total + gap;
}

export interface RollFrames {
  /** The new number: from `dir × height` below (forward) into place. */
  inY: Frame;
  inOpacity: Frame;
  /** The old number: from its place to `dir × height` above, fading. */
  outY: Frame;
  outOpacity: Frame;
}

/**
 * THE ODOMETER. `dir` is +1 going forward (the new number comes UP from below, as a counter's does)
 * and −1 going back; `height` is the number's own line, measured, so the clip above and below it
 * hides exactly one line. Both halves finish at `ROLL_END` of the hop.
 */
export function rollFrames(dir: 1 | -1, height: number): RollFrames {
  const d = dir * height;
  const w = (keys: readonly Key[]) => keyFrame(keysWithin(keys, 0, ROLL_END));
  return {
    inY: w([
      [0, d],
      [1, 0],
    ]),
    inOpacity: w([
      [0, 0],
      [0.55, 1],
    ]),
    outY: w([
      [0, 0],
      [1, -d],
    ]),
    outOpacity: w([
      [0, 1],
      [0.45, 0],
    ]),
  };
}
