/**
 * A MOVE WRITTEN AS ITS TURNING POINTS, and sampled into the shape `Animated.Value#interpolate`
 * takes (the owner, 2026-09-25, of the "that's cool" list: *"might not necessarily be useful, but
 * it's cool … Let's try doing everything"*). The bell switch's ring and the module icons' wake-up
 * moves are both written this way (`bellSwitch.ts`, `wakingIcon.ts`). Pure TypeScript, so every
 * pose of every move is a number a node test can read.
 *
 * WHY TURNING POINTS AND A HALF COSINE, and not keyframes joined by straight lines. `interpolate`
 * is linear between the points it is given, and a swing drawn from four straight segments moves at
 * one speed and then turns round in a single frame — which reads as a machine, not as a bell or a
 * bottle. A pendulum is slowest at the ends of its swing and fastest through the middle, and half
 * a cosine between two extremes is exactly that shape. So a move is written as the points where it
 * TURNS (the tilt at its fullest, the top of a hop, the far end of a sway), each segment between
 * two of them is eased in and out, and the result is sampled finely enough — every turning point
 * exactly, and a point every 1/40 of the move between — that the straight lines `interpolate`
 * draws between the samples are shorter than a frame is long.
 *
 * AND THE EXTREMES ARE THE ONES WRITTEN DOWN. A half cosine never passes the two values it joins,
 * so the furthest a move reaches is a number in its own table — which is what lets a test hold
 * every move inside the chip it is drawn in without sampling for the worst frame.
 */
import type { Frame } from './dayNightSwitch';

/** A turning point: when, as a fraction of the move (0–1), and the value there. */
export type Key = readonly [at: number, value: number];

/** How finely a move is sampled between its turning points: 1/40 of it, 15 ms of a 600 ms move. */
export const KEY_STEPS = 40;

/** The eased share of the way from one turning point to the next, at `u` in [0, 1]. */
const halfCosine = (u: number): number => (1 - Math.cos(Math.PI * u)) / 2;

/**
 * The value at `t`: the first point's value before it, the last one's after it, and a half
 * cosine between each pair. The points must be in order of time.
 */
export function keyValue(keys: readonly Key[], t: number): number {
  const first = keys[0];
  const last = keys[keys.length - 1];
  if (first === undefined || last === undefined) return 0;
  if (t <= first[0]) return first[1];
  if (t >= last[0]) return last[1];
  for (let i = 1; i < keys.length; i += 1) {
    const b = keys[i];
    const a = keys[i - 1];
    if (a === undefined || b === undefined || t > b[0]) continue;
    const span = b[0] - a[0];
    return span <= 0 ? b[1] : a[1] + (b[1] - a[1]) * halfCosine((t - a[0]) / span);
  }
  return last[1];
}

/**
 * `Animated.Value#interpolate` for one number: piecewise-linear between the frame's points, and
 * clamped or extended past its ends. The planner's copy of what the native driver draws, so a test
 * — or `bellSwitch.ts`, asking what its picture looks like mid-move — reads the SAME frames the
 * component hands over, rather than the curves they were sampled from.
 */
export function sampleFrame(fr: Frame, x: number): number {
  const xs = fr.inputRange;
  const ys = fr.outputRange;
  const last = xs.length - 1;
  const seg = (i: number): number => {
    const [x0, x1, y0, y1] = [xs[i] ?? 0, xs[i + 1] ?? 1, ys[i] ?? 0, ys[i + 1] ?? 0];
    return x1 === x0 ? y1 : y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
  };
  if (x <= (xs[0] ?? 0)) return fr.extrapolate === 'clamp' ? (ys[0] ?? 0) : seg(0);
  if (x >= (xs[last] ?? 1)) return fr.extrapolate === 'clamp' ? (ys[last] ?? 0) : seg(last - 1);
  let i = 0;
  while ((xs[i + 1] ?? 1) < x) i += 1;
  return seg(i);
}

/**
 * A MOVE PLACED INSIDE A LONGER CLOCK: its turning points, written over 0 → 1 of its own time,
 * moved into `[from, to]` of a clock that also drives other moves (setup's wheel pops each house
 * in its own window of one clock, 2026-09-26). The values are untouched; only the times move.
 */
export function keysWithin(keys: readonly Key[], from: number, to: number): Key[] {
  return keys.map(([at, value]) => [from + at * (to - from), value]);
}

/**
 * The move as a `Frame`: every turning point exactly, and a sample every `1 / steps` between the
 * first and the last. Clamped by default — at rest before it starts and after it ends — which is
 * what every move here wants: nothing is meant to carry past its own last point.
 */
export function keyFrame(
  keys: readonly Key[],
  extrapolate: Frame['extrapolate'] = 'clamp',
  steps: number = KEY_STEPS,
): Frame {
  const first = keys[0]?.[0] ?? 0;
  const last = keys[keys.length - 1]?.[0] ?? 1;
  const times = new Set<number>(keys.map(k => k[0]));
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    if (t > first && t < last) times.add(t);
  }
  const inputRange = [...times].sort((a, b) => a - b);
  // two points closer than a microsecond of a move are one point to `interpolate`, which wants
  // its input strictly increasing
  const strict = inputRange.filter((t, i) => i === 0 || t - (inputRange[i - 1] ?? -1) > 1e-6);
  // a single turning point is a value held still, and `interpolate` needs two ends to draw between
  const input = strict.length < 2 ? [0, 1] : strict;
  return {
    inputRange: input,
    outputRange: input.map(t => keyValue(keys, t)),
    extrapolate,
  };
}
