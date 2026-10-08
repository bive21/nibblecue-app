/**
 * A MEAL'S LITTLE WINDOW, as numbers: the sky each row of the solids rhythm wears at its start, with
 * the sun standing at the height of that row's time of day (the owner, 2026-09-28: *"make it
 * interesting too, not just boring table"*). Pure TypeScript, so every claim is tested in node —
 * this package's tests cannot render React Native — and `MealWindow.tsx` only hands these numbers
 * to views and to `Animated.Value#interpolate`, the way `MealSkyToggle.tsx` hands
 * `mealSkyToggle.ts`'s.
 *
 * THE SOLIDS SHEET'S SKIES, SMALL. Each meal wears its own scene from `theme/mealSky.ts` — a dawn
 * for breakfast, noon for lunch, the afternoon for a snack, a dusk for dinner — with the same
 * pale-gold sun, the same far hill and the same ground, in a window the size of a row's icon. In
 * the amber Night every window is the night palette's one warm sky, as the sheet's is.
 *
 * THE SUN'S HEIGHT IS THE ROW'S TIME IN THE HOUSEHOLD'S OWN DAY. It rises at their wake time on the
 * left, is highest half way to their bed time, and sets on the right at bed time: a breakfast just
 * after waking stands low, a lunch near the middle of the day stands high. A time outside the day
 * sits on the horizon at the nearer end, half behind the land, never lower: a row that is ON always
 * shows its sun. Only a row that is OFF sets it wholly behind the hill, and dims its window.
 *
 * THREE MOVES, transforms and opacity only, all on the native driver:
 *
 *   glide  a time changed: the sun travels along its arc to the new height, round the curve
 *          rather than in a line, in 320 to 640 ms by how far it goes, with the sky toggle's small
 *          settle at the end;
 *   sink   a meal switched off: the sun drops behind the hill and the window dims toward the table
 *          under it, 360 ms; switched back on, it rises again the same way;
 *   pop    a snack added: its row grows out of itself from 86% to a hair past full, settling, and
 *          fades in, 360 ms. Its room is there from the first frame: nothing round it is animated.
 *
 * WHEN NOTHING MOVES — reduce motion, Calm motion (which reaches the design system as reduce motion)
 * and the amber Night (`motionStill`) — every value is set where its move would end, and nothing is
 * ever hidden: the sun is at its height, an off window is dimmed, an added row is simply there.
 *
 * NO WORD IS WRITTEN ON THE SKY. The meal's name is the row's own text, beside the window on the
 * table's ground, so the one contrast the picture has to carry is its sun against its sky, which
 * `mealWindow.test.ts` measures at every stop of every scene (WCAG 1.4.11, 3:1). The window is
 * decoration: the switch says whether a meal is on, and the time button says when.
 */
import { hm, type DayWindow } from '@nibblecue/core';
import type { ThemeName } from '../theme/theme';
import type { Frame } from './dayNightSwitch';
import { motionStill } from './tickDraw';

/* ---------------------------------------------------------------------------- the size */

/**
 * THE WINDOW: square, the size of a row's icon, 40 pt — the row it starts is 56 pt tall with its
 * 44 pt controls, and the window beside them should read as a picture, not as a fourth control.
 *
 *   `horizon`  where the sky meets the land, 12 pt of ground under it
 *   `apex`     the sun's center at the top of its day
 *   `sun`      the sun's radius
 *   `side`     how far in from each side the sun's arc meets the horizon, as a fraction of the size
 *   `veil`     how far an off meal's window dims toward the table under it
 */
export const MEAL_WINDOW = {
  size: 40,
  horizon: 28,
  apex: 9,
  sun: 5,
  side: 0.175,
  rim: 1,
  veil: 0.55,
} as const;

/** The far hill on the land, as fractions of the size and a rise above the horizon. */
export const MEAL_WINDOW_HILL = { from: 0.34, to: 1.02, rise: 4 } as const;

/**
 * DUSK'S TWO STARS, for dinner's window only and never in the amber Night: small dots in the upper
 * left, the part of a dusk furthest from where the sun sets. Still, not twinkling: at 40 pt a star
 * that moved would be the only thing on the screen moving.
 */
export const MEAL_WINDOW_STARS: readonly { x: number; y: number; r: number }[] = [
  { x: 7, y: 7, r: 0.9 },
  { x: 14, y: 4.5, r: 0.7 },
];

const DAY_MINUTES = 1440;
const wrap = (m: number): number => ((m % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
const f2 = (n: number): number => Number(n.toFixed(2));

/* ------------------------------------------------------------------------- the sun's place */

/**
 * WHERE IN THE HOUSEHOLD'S DAY A CLOCK TIME FALLS: 0 at waking, 1 at bed time, and `up` whether it
 * is inside the day at all. A time outside it is at the nearer end — just before waking is 0, just
 * after bed is 1 — so the sun waits on the horizon rather than vanishing. A day whose wake and bed
 * are one time has no night, and runs midnight to midnight from its wake.
 */
export function dayFraction(minutes: number, day: DayWindow): { u: number; up: boolean } {
  const wake = hm(day.wake);
  const span = wrap(hm(day.bed) - wake) || DAY_MINUTES;
  const into = wrap(Math.round(minutes) - wake);
  if (into <= span) return { u: into / span, up: true };
  const sinceBed = into - span;
  const toWake = DAY_MINUTES - into;
  return { u: sinceBed <= toWake ? 1 : 0, up: false };
}

/** The arc's ends, where the sun rises and sets. */
export const sunRange = (): { x0: number; x1: number } => ({
  x0: MEAL_WINDOW.side * MEAL_WINDOW.size,
  x1: (1 - MEAL_WINDOW.side) * MEAL_WINDOW.size,
});

/** The sun's center at `u` of the day: a sine arch, on the horizon at both ends, highest at 0.5. */
export function sunPoint(u: number): { x: number; y: number } {
  const k = Math.min(Math.max(u, 0), 1);
  const { x0, x1 } = sunRange();
  // exactly on the horizon at either end: sin(π) is a hair above zero in floating point
  const rise = k <= 0 || k >= 1 ? 0 : Math.sin(Math.PI * k);
  return {
    x: x0 + k * (x1 - x0),
    y: MEAL_WINDOW.horizon - (MEAL_WINDOW.horizon - MEAL_WINDOW.apex) * rise,
  };
}

/**
 * HOW FAR AN OFF MEAL'S SUN DROPS: from the top of its day to wholly under the horizon, with a point
 * to spare — one distance for every height, so a sun that was already low is simply out of sight
 * sooner, and the drop is one value the native driver can run.
 */
export const SUN_SINK = MEAL_WINDOW.horizon - MEAL_WINDOW.apex + 2 * MEAL_WINDOW.sun + 2;

/** The far hill as an SVG path: a quadratic whose control point is twice the rise up peaks at it. */
export function hillPath(): string {
  const { size, horizon } = MEAL_WINDOW;
  const { from, to, rise } = MEAL_WINDOW_HILL;
  const a = from * size;
  const b = to * size;
  return `M${f2(a)} ${horizon}Q${f2((a + b) / 2)} ${f2(horizon - 2 * rise)} ${f2(b)} ${horizon}Z`;
}

/** The hill's top at `x`, for the tests: the horizon where there is no hill. */
export function hillTop(x: number): number {
  const { size, horizon } = MEAL_WINDOW;
  const { from, to, rise } = MEAL_WINDOW_HILL;
  const a = from * size;
  const b = to * size;
  if (x <= a || x >= b) return horizon;
  const t = (x - a) / (b - a);
  // the quadratic's height at its own parameter, which runs evenly along x for a centered control
  return horizon - 4 * rise * t * (1 - t);
}

/* ------------------------------------------------------------------------------ the moves */

/** A time changed, the shortest glide and the longest (all the way across the day). */
export const MEAL_WINDOW_GLIDE_MS = { min: 320, max: 640 } as const;
/** A meal switched off or on. */
export const MEAL_WINDOW_SINK_MS = 360;

/** Whether the picture holds still: reduce motion (and with it Calm motion), or the amber Night. */
export const mealWindowStill = (reduceMotion: boolean, theme: ThemeName): boolean =>
  motionStill(reduceMotion, theme);

export interface SunGlide {
  animate: boolean;
  duration: number;
}

/** A time changed from `from` to `to` of the day: how the sun gets there, or that it is simply set. */
export function planSunGlide(from: number, to: number, still: boolean): SunGlide {
  if (still || from === to) return { animate: false, duration: 0 };
  const d = Math.min(Math.abs(to - from), 1);
  const { min, max } = MEAL_WINDOW_GLIDE_MS;
  return { animate: true, duration: Math.round(min + d * (max - min)) };
}

/** A meal switched: where the sink goes (1 is set behind the hill), and whether it moves there. */
export function planSink(on: boolean, still: boolean): { to: 0 | 1; animate: boolean } {
  return { to: on ? 0 : 1, animate: !still };
}

const frame = (
  inputRange: readonly number[],
  outputRange: readonly number[],
  extrapolate: Frame['extrapolate'] = 'clamp',
): Frame => ({ inputRange, outputRange, extrapolate });

/** How finely the arc is sampled for `interpolate`: an hour of a day of 24. */
const SUN_SAMPLES = 24;

export interface MealWindowFrames {
  /** Of the sun's place in the day: its center, sampled along the arc so it glides round it. */
  sunX: Frame;
  sunY: Frame;
  /** Of the sink (0 on, 1 off): how far the sun has dropped, and how far the window has dimmed. */
  sink: Frame;
  veil: Frame;
}

export function mealWindowFrames(): MealWindowFrames {
  const inputs = Array.from({ length: SUN_SAMPLES + 1 }, (_, i) => i / SUN_SAMPLES);
  const points = inputs.map(sunPoint);
  return {
    sunX: frame(
      inputs,
      points.map(p => f2(p.x)),
    ),
    sunY: frame(
      inputs,
      points.map(p => f2(p.y)),
    ),
    sink: frame([0, 1], [0, SUN_SINK]),
    veil: frame([0, 1], [0, MEAL_WINDOW.veil]),
  };
}

/**
 * AN ADDED SNACK'S ROW, POPPING IN: grows from 86% through a hair past full and settles, fading in
 * over its first half, in 360 ms on one value run linearly from 0 to 1 — the curve is in the
 * frames, so the settle needs no spring. At 0 it is small and unseen; at 1 it is exactly itself.
 */
export const MEAL_ROW_POP = {
  ms: 360,
  scale: frame([0, 0.6, 1], [0.86, 1.04, 1]),
  opacity: frame([0, 0.45, 1], [0, 1, 1]),
} as const;
