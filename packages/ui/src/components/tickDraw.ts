/**
 * THE TICK THAT DRAWS ITSELF, AND THE SPARKLE ROUND THE ONE THAT FINISHES A LIST, as numbers (the
 * owner, 2026-09-25, of the "that's cool" list: *"might not necessarily be useful, but it's cool …
 * Let's try doing everything. I will then review"*). Pure TypeScript, so every claim here is tested
 * in node — this package's tests cannot render React Native — and `TickMark.tsx` only hands these
 * numbers to one SVG path and to `Animated.Value#interpolate`, the way `ThemeSkyToggle.tsx` hands
 * `themeSkyToggle.ts`'s.
 *
 * THE MARK IS THE GLYPH IT REPLACES. `TICK_POINTS` are `paths.ts`'s own `check`, point for point,
 * at that glyph's stroke, so a row that drew `<Icon name="check">` draws the same tick — only now
 * the pen is seen moving. `tickDraw.test.ts` holds the two together: an edit to the glyph that
 * forgot this file fails there, rather than on a phone where the tick changes shape as it lands.
 *
 * THE DRAW is one dash the length of the path sliding along it (`tickDash`). At the start the whole
 * path sits inside the gap between two dashes, round caps and all; at the end it is one dash from
 * end to end — a pen stroke with a round nib at its head, running from the short stroke's start,
 * through the corner, to the long stroke's tip. It is the one value in the lists' motion that
 * cannot ride the native driver: a dash offset is a prop of the SVG path, not a style, and the
 * native driver animates styles only. So it is kept to one path and 220 ms.
 *
 * THE SPARKLE is eight short rays round the circle, each drawn OUT from just past the ring and then
 * drawn IN toward its own tip — its inner end chases its outer one — so a ray never touches the
 * circle and never reaches past `rayReach(ring)`, which is the room both checklist rows have round
 * their tick (the tests measure it against the rows' own paddings). Opacity and transforms only, on
 * the native driver.
 *
 * NOTHING HERE IS ABOUT THE BABY. The sparkle marks a LIST finished — the last chore ticked, the
 * last thing in the basket — never a number in the log (the batch's rule: no praise tied to the
 * baby's numbers).
 */
import type { ThemeName } from '../theme/theme';
import type { Frame } from './dayNightSwitch';

/* ------------------------------------------------------------------------ when nothing moves */

/**
 * WHEN NOTHING MOVES: the parent asked the phone for less motion, or the app is in the amber night
 * theme — the one a parent reads at 3 a.m. in a dark room, where nothing moves or glows
 * (docs/DESIGN_SYSTEM.md §7; the batch's rule, 2026-09-25). Either way the END STATE is drawn at
 * once: a ticked tick is a whole tick, never hidden and never half drawn, and nothing plays.
 */
export const motionStill = (reduceMotion: boolean, theme: ThemeName): boolean =>
  reduceMotion || theme === 'night';

/* ------------------------------------------------------------------------------- the mark */

/** The glyph's grid: `paths.ts` draws every icon in a 24 box. */
export const TICK_GRID = 24;
/** `check`'s own stroke on that grid, so the drawn tick weighs what the static one did. */
export const TICK_STROKE = 2;
/**
 * `check` — 'm5 12.8 4.6 4.6L19 7' — as the three points the pen passes: the short stroke's start,
 * the corner, the long stroke's tip. In the order it is drawn, because the order IS the draw.
 */
export const TICK_POINTS = [
  [5, 12.8],
  [9.6, 17.4],
  [19, 7],
] as const satisfies readonly (readonly [number, number])[];

type Points = readonly (readonly [number, number])[];

/** The points as a path, absolute and in drawing order: `M5 12.8L9.6 17.4L19 7`. */
export function tickPath(points: Points = TICK_POINTS): string {
  return points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x} ${y}`).join('');
}

/** How far the pen travels, on the grid: the two strokes end to end. */
export function tickLength(points: Points = TICK_POINTS): number {
  let length = 0;
  let prev: readonly [number, number] | null = null;
  for (const p of points) {
    if (prev !== null) length += Math.hypot(p[0] - prev[0], p[1] - prev[1]);
    prev = p;
  }
  return length;
}

/**
 * The dash that draws the tick, on the grid.
 *
 * `dasharray` is one dash the length of the path and a gap longer than the path by both caps and
 * a little slack, so the NEXT dash never reaches the path's far end, and `from` puts the path's
 * start a cap's width into that gap. At `from` nothing of the path is on a dash — not a stroke,
 * not a round cap's dot at either end — and at `to` the path is wholly on the first dash.
 * Between the two the visible stroke is `[0, length - offset)`: it grows from the start, the way
 * a pen draws.
 */
export interface TickDash {
  dasharray: readonly [number, number];
  /** The offset before the draw: nothing shows. */
  from: number;
  /** The offset after it: the whole tick shows. */
  to: 0;
}

/** Past the caps, so no renderer's rounding can leave a dot of the next dash at the tip. */
const DASH_SLACK = 0.5;

export function tickDash(length: number = tickLength(), stroke: number = TICK_STROKE): TickDash {
  const cap = stroke / 2;
  return { dasharray: [length, length + 2 * cap + DASH_SLACK], from: length + cap, to: 0 };
}

/* ------------------------------------------------------------------------------- the draw */

/** The stroke, start to end: long enough to be seen as a pen, short enough to be over at once. */
export const TICK_DRAW_MS = 220;

/**
 * THE STROKE RUN BACK, for a caller that asks for it (`TickMark`'s `undraw`; the shopping list,
 * 2026-09-26: *"un-ticking reverses it"*): the pen lifts off from the tip back to the start,
 * quicker than it drew — taking a tick off is the smaller act.
 */
export const TICK_UNDRAW_MS = 140;

/**
 * A pen's curve, as `Easing.bezier`'s four control points: it settles on the paper, runs through
 * the corner and slows as it lands on the tip. No overshoot — a dash offset past its end would
 * draw the next dash's first dot past the tip.
 */
export const TICK_EASE = [0.4, 0, 0.2, 1] as const;

const frame = (
  inputRange: readonly number[],
  outputRange: readonly number[],
  extrapolate: Frame['extrapolate'] = 'clamp',
): Frame => ({ inputRange, outputRange, extrapolate });

/** Of the draw value, 0 → 1: the dash offset, `from` → 0. Clamped, so nothing draws past the tip. */
export function tickFrames(dash: TickDash = tickDash()): { offset: Frame } {
  return { offset: frame([0, 1], [dash.from, dash.to]) };
}

/* ---------------------------------------------------------------------------- the sparkle */

/**
 * When the rays start, counted from the start of the draw: the pen is into its long stroke, so
 * the burst reads as the tick LANDING rather than as something happening beside it.
 */
export const BURST_DELAY_MS = 140;
/** The rays' whole life, out and in again — under half a second, as the batch asked. */
export const BURST_MS = 360;

/** One ray: its direction (degrees clockwise from pointing right), its length, and its life. */
export interface Ray {
  angle: number;
  length: number;
  /** Where it starts, is fully out, and is gone, as fractions of the burst. */
  life: readonly [number, number, number];
}

/** The room between the circle's edge and a ray's inner end. */
export const RAY_GAP = 3;
/** How thick a ray is: a short, round-ended stroke, the pen's own weight at a row's size. */
export const RAY_THICK = 2;
/** The smallest a ray is scaled to: never exactly zero, which some platforms treat as singular. */
export const RAY_MIN_SCALE = 0.01;

/**
 * EIGHT RAYS, long on the four points of the compass and short between them, the short ones a
 * beat behind — the shape a hand draws round a thing to say it shone. Few enough to stay a
 * sparkle, not a sun.
 */
export const RAYS: readonly Ray[] = Array.from({ length: 8 }, (_, i) =>
  i % 2 === 0
    ? { angle: -90 + i * 45, length: 4, life: [0, 0.42, 1] as const }
    : { angle: -90 + i * 45, length: 2.5, life: [0.1, 0.48, 0.92] as const },
);

/** The farthest a ray gets from the tick's center: its outer end, fully drawn out. */
export const rayReach = (ring: number): number =>
  ring + RAY_GAP + Math.max(...RAYS.map(r => r.length));

export interface RayFrames {
  /** The ray these frames draw. */
  ray: Ray;
  /** Of the burst value: the ray's CENTER, from the tick's center along its angle. */
  x: Frame;
  /** Of the burst value: its length, as a scale of `length`. */
  scale: Frame;
  opacity: Frame;
}

/**
 * Each ray's frames round a circle of radius `ring`, over the burst value 0 → 1.
 *
 * OUT, THEN IN, ANCHORED AT EACH END IN TURN. From its start to fully out the ray's inner end stays
 * at `ring + RAY_GAP` while it grows, so its center moves out by half of what it gains; from fully
 * out to gone its OUTER end stays put while it shrinks toward it. Both halves are linear in the
 * burst value, so they are exact as `interpolate` keyframes — no ray ever reaches back over the
 * circle, and none past `rayReach`. The centers at either end allow for `RAY_MIN_SCALE`, so the
 * anchored end does not creep by the hair of length a ray keeps at its smallest.
 */
export function burstFrames(ring: number): RayFrames[] {
  const r0 = ring + RAY_GAP;
  return RAYS.map(ray => {
    const {
      length,
      life: [a, m, e],
    } = ray;
    const least = (length * RAY_MIN_SCALE) / 2;
    return {
      ray,
      x: frame([a, m, e], [r0 + least, r0 + length / 2, r0 + length - least]),
      scale: frame([a, m, e], [RAY_MIN_SCALE, 1, RAY_MIN_SCALE]),
      opacity: frame([a, a + 0.06, e - 0.06, e], [0, 1, 1, 0]),
    };
  });
}

/* ------------------------------------------------------------------------------ the dots */

/**
 * THE EVERYDAY SPARKLE (the shopping list, 2026-09-26: *"a tiny burst of 4–6 dots in the category
 * color"*): every tick on the shopping list that does NOT finish it throws five small dots out of
 * the circle in the ink of the thing ticked — the diapers' brown, the wipes' blue — which go a few
 * points and are gone. The tick that finishes the list keeps its rays instead (`RAYS`); the two
 * are never drawn together. Opacity and transforms only, on the native driver, like the rays.
 */
export interface Dot {
  /** Its direction, degrees clockwise from pointing right. */
  angle: number;
  /** Its diameter, in points. */
  size: number;
}

/** Five, a fifth of a turn apart and none straight up, alternating big and small. */
export const DOTS: readonly Dot[] = Array.from({ length: 5 }, (_, i) => ({
  angle: -54 + i * 72,
  size: i % 2 === 0 ? 3.2 : 2.4,
}));
/** Between the circle's edge and a dot's inner edge as it starts. */
export const DOT_GAP = 1;
/**
 * How far a dot travels out, in points: a tiny burst — no further out than the rays reach, which
 * is the room both rows were measured for (`rayReach`).
 */
export const DOT_TRAVEL = 3.8;
/** The smallest a dot shrinks to as it goes. */
export const DOT_END_SCALE = 0.35;
/** When the dots start, counted from the start of the draw: as the pen turns the corner. */
export const DOTS_DELAY_MS = 110;
/** And their whole life: out and gone. */
export const DOTS_MS = 300;

/**
 * The farthest any part of a dot gets from the tick's center. Its outer edge is its center plus
 * half its size, and both are straight lines between the frames' keys — so the farthest is at one
 * of those keys, and this reads every one of them rather than assuming it is the last.
 */
export function dotReach(ring: number): number {
  let most = 0;
  for (const f of dotFrames(ring))
    f.x.inputRange.forEach((p, i) => {
      const scale = 1 + (DOT_END_SCALE - 1) * p;
      most = Math.max(most, (f.x.outputRange[i] ?? 0) + (f.dot.size * scale) / 2);
    });
  return most;
}

export interface DotFrames {
  dot: Dot;
  /** Of the dots' value: the dot's CENTER, from the tick's center along its angle. */
  x: Frame;
  scale: Frame;
  opacity: Frame;
}

/** Each dot's frames round a circle of radius `ring`, over the dots' value 0 → 1. */
export function dotFrames(ring: number): DotFrames[] {
  return DOTS.map(dot => {
    const start = ring + DOT_GAP + dot.size / 2;
    // out quickly and slowing, as a thing thrown out does
    const steps = [0, 0.25, 0.5, 0.75, 1];
    return {
      dot,
      x: frame(
        steps,
        steps.map(u => start + DOT_TRAVEL * (1 - (1 - u) ** 2)),
      ),
      scale: frame([0, 1], [1, DOT_END_SCALE]),
      opacity: frame([0, 0.08, 0.6, 1], [0, 1, 1, 0]),
    };
  });
}
