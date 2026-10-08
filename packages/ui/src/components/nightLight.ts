/**
 * The night light as numbers: how bright it may be, how a drag sets it, what a lift of the finger
 * meant, and where the glow and its one line of words sit (the owner, 2026-09-25, of the "that's
 * cool" list). Pure TypeScript, tested in node; `NightLight.tsx` hands a finger's travel to these
 * and draws what they return.
 *
 * ONE SURFACE, THREE GESTURES, AND THE ONE THAT HAD TO BE TOLD APART. The whole screen is the
 * control: a slow drag up brightens the light and a slow drag down dims it; a tap closes it; and
 * a SWIPE down closes it too. A swipe and a slow drag down start the same way, so it is the lift
 * that decides (`releaseOf`): quick and long enough downward, it was a swipe, and the light closes
 * at the level it was opened at — the finger's dimming on the way was not a request to dim it for
 * next time. Anything else that moved was an adjustment, and is kept. A tap is a lift that barely
 * moved and did not linger, so resting a thumb on the glass in the dark does not close the light.
 */
import { space } from '../theme/theme';

/** The level: 0 is the dimmest ember, 1 the brightest the colors allow (`theme/nightLight.ts`). */
export const NIGHT_LIGHT_LEVEL = { min: 0, max: 1, start: 0.4, step: 0.1 } as const;

/** Any number to a level the light can be; a nonsense one to where a new light starts. */
export function clampLevel(level: number): number {
  if (!Number.isFinite(level)) return NIGHT_LIGHT_LEVEL.start;
  return Math.min(NIGHT_LIGHT_LEVEL.max, Math.max(NIGHT_LIGHT_LEVEL.min, level));
}

/** The level in whole percent, for the accessibility value and nothing else. */
export const levelPercent = (level: number): number => Math.round(clampLevel(level) * 100);

/**
 * How far a finger travels, as a share of the screen's height, to run the light from dimmest to
 * brightest. Most of a screen but not all of it: a thumb can sweep the whole range from wherever
 * it lands without reaching an edge.
 */
export const DRAG_SPAN = 0.6;

/** The level after a finger has moved `dy` points (down is positive) from where it was `from`. */
export function levelAfterDrag(from: number, dy: number, height: number): number {
  if (!(height > 0)) return clampLevel(from);
  return clampLevel(clampLevel(from) - dy / (height * DRAG_SPAN));
}

/** One step of the accessibility action: a tenth, landing on the tenths. */
export function stepLevel(level: number, direction: 1 | -1): number {
  const tenths = Math.round(clampLevel(level) / NIGHT_LIGHT_LEVEL.step);
  return clampLevel((tenths + direction) * NIGHT_LIGHT_LEVEL.step);
}

/**
 * Whether a move has just ARRIVED at an end — the moment the drag's travel stops doing anything,
 * which is what the one haptic tick marks. Not while it stays there: a finger pressed on past the
 * top is not a second arrival.
 */
export function endReached(previous: number, next: number): 'min' | 'max' | null {
  if (next <= NIGHT_LIGHT_LEVEL.min && previous > NIGHT_LIGHT_LEVEL.min) return 'min';
  if (next >= NIGHT_LIGHT_LEVEL.max && previous < NIGHT_LIGHT_LEVEL.max) return 'max';
  return null;
}

/** A lift that moved less than this in either direction, and not for long, was a tap. */
export const TAP_SLOP = 10;
export const TAP_MS = 350;
/** A lift this far down, this fast, and mostly downward, was a swipe to close. */
export const CLOSE_SWIPE = { distance: 64, velocity: 0.9 } as const;

export type NightLightRelease = 'tap' | 'close' | 'adjust';

/**
 * What a lift of the finger meant. `dx`/`dy` are the whole gesture's travel in points, `vy` its
 * speed at the lift in points per millisecond (React Native's `gestureState`), `ms` how long the
 * finger was down.
 */
export function releaseOf(g: {
  dx: number;
  dy: number;
  vy: number;
  ms: number;
}): NightLightRelease {
  if (Math.abs(g.dx) < TAP_SLOP && Math.abs(g.dy) < TAP_SLOP && g.ms < TAP_MS) return 'tap';
  if (
    g.dy >= CLOSE_SWIPE.distance &&
    g.vy >= CLOSE_SWIPE.velocity &&
    Math.abs(g.dy) > 2 * Math.abs(g.dx)
  )
    return 'close';
  return 'adjust';
}

/**
 * WHERE THE LIGHT SITS: a little above the middle, where a phone propped against something
 * throws it furthest, and never so large that it reaches the line of words at the foot — the
 * hint is measured on the bare ground (`theme/nightLight.test.ts`) and this is what keeps it
 * there, at every size of screen and at the phone's largest text.
 */
export const GLOW_CENTER = 0.42;
/** The bright glow's reach, as a share of the narrower side, when the screen has room for it. */
export const GLOW_REACH = 0.62;
/** The ember's reach, as a share of the bright glow's. */
export const EMBER_REACH = 0.7;
/**
 * The room the hint takes at the foot: two lines of `bodySm` at the chrome cap (19 × 1.6 each),
 * rounded up. `NightLight.tsx` holds the hint to two lines and that cap.
 */
export const HINT_BAND = 64;

/** Where the gradient's stops fall, from the heart (0) to where it meets the ground (1). */
export const GLOW_STOPS: readonly { offset: number; at: 'core' | 'halo'; opacity: number }[] = [
  { offset: 0, at: 'core', opacity: 1 },
  { offset: 0.35, at: 'halo', opacity: 0.9 },
  { offset: 0.7, at: 'halo', opacity: 0.35 },
  { offset: 1, at: 'halo', opacity: 0 },
];

export interface NightLightGeometry {
  width: number;
  height: number;
  cx: number;
  cy: number;
  /** The golden glow's radius, and the ember's. */
  brightR: number;
  dimR: number;
  /** The top of the hint's band: nothing of the glow reaches below it. */
  hintTop: number;
  /** The hint's distance from the bottom of the screen. */
  hintBottom: number;
}

export function nightLightGeometry(
  width: number,
  height: number,
  bottomInset: number,
): NightLightGeometry {
  const w = Math.max(0, width);
  const h = Math.max(0, height);
  const hintBottom = Math.max(0, bottomInset) + space.xxl;
  const hintTop = h - hintBottom - HINT_BAND;
  const cx = w / 2;
  const cy = h * GLOW_CENTER;
  const brightR = Math.max(0, Math.min(GLOW_REACH * Math.min(w, h), hintTop - cy - space.xxl));
  return { width: w, height: h, cx, cy, brightR, dimR: brightR * EMBER_REACH, hintTop, hintBottom };
}
