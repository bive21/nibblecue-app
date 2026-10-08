/**
 * THE SCHEDULE'S DAY, MOVING, as numbers (the owner, 2026-09-26: *"try everything, if i dont like
 * it, i will ask you to remove"*). Pure TypeScript, so every claim here is a node test — this
 * package's tests cannot render React Native — and `NowLine.tsx` and `SoonDot.tsx` only hand these
 * numbers to `Animated.Value#interpolate`, on the native driver.
 *
 *   THE NOW LINE. A thin line in the accent across today's card, with a small dot at its start, at
 *     the place in the list where now is: under the last slot behind the clock, over the next one.
 *     When the page comes into view it glides down to that place from the top of the card — the day
 *     so far, in one gesture, as the wheel's hand sweeps round from the wake mark — and then stays,
 *     gliding on past a row when the clock does. It is the wheel's own "now": one ink for both
 *     (`handInk`), so a parent who has met one has met the other.
 *   THE SOON DOT. The next slot, once it is fifteen minutes off or less, has a small dot in the
 *     row's gutter that breathes — swelling a little, a soft ring of its own ink opening round it
 *     and gathering back — until the slot is done, skipped or its time comes. Never in the amber
 *     Night: that screen is read at 3 a.m. in a dark room, where nothing glows.
 *   A SLOT TURNING DONE. Its chip settles into its new state as the check in it draws itself (the
 *     checklists' own `TickMark`), and the due wash under the row fades away.
 *
 * NOTHING HERE IS ABOUT THE BABY. The line is a clock and the dot says "this one is close"; neither
 * is a verdict on anything behind or ahead of now (CLAUDE.md §2), and nothing is drawn by color
 * alone — the slot's own caption says "In 12 min" and its chip says "Done".
 *
 * WHEN NOTHING MOVES (`motionStill`: reduce motion, or the amber Night) the line is simply at now,
 * a soon dot is simply a dot (and none at all in Night), and a slot is simply done.
 */
import type { Palette, ThemeName } from '../theme/theme';
import type { Frame } from './dayNightSwitch';
import { keyValue, type Key } from './keyframes';
import { loopFrame } from './timerMotion';
import { handInk, HAND_SWEEP } from './wheelHand';

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const finite = (v: number): number => (Number.isFinite(v) ? v : 0);

/* ------------------------------------------------------------------------------ the line */

/** The line's drawing. */
export const NOW_LINE = {
  /** Its weight, in points: thin, and quieter than the rows' own words. */
  stroke: 1.5,
  /** The dot at its start, in the rows' gutter: its diameter. */
  dot: 7,
  /**
   * THE LINE AT 85% OF THE INK, the wheel's hand's own share (`WHEEL_HAND.alpha`) — quiet beside
   * the slots it runs between, and no quieter than 3:1 on every ground it crosses (the card, a due
   * row's wash, a folded group's paper) in every theme, scheme and skin (`scheduleMotion.test.ts`).
   * The dot is the ink at full.
   */
  alpha: 0.85,
} as const;

/**
 * THE GLIDE, when the page comes into view: from the top of the card down to now, on the ease-out
 * every glide in this package uses — quick off the top and settling on its place. Longer the
 * further it goes, never past 700 ms; it sets off a beat after the page, so the rows are there to
 * be passed.
 */
export const NOW_GLIDE = {
  minMs: 300,
  maxMs: 700,
  /** Each point of the way adds this much, up to the ceiling. */
  msPerPt: 1,
  delayMs: 120,
  ease: HAND_SWEEP.ease,
} as const;

/** How long the glide down to a place `distance` points below the top takes. */
export function nowGlideMs(distance: number): number {
  const d = Math.max(0, finite(distance));
  return Math.round(
    clamp(NOW_GLIDE.minMs + d * NOW_GLIDE.msPerPt, NOW_GLIDE.minMs, NOW_GLIDE.maxMs),
  );
}

/**
 * THE STEP, when the clock passes a slot and now is one row further down: a short glide, even in
 * and out, as a thing that was waiting moves on. A change that is only the page's layout — a fold
 * opened above, a row grown — is not a step: the line is simply where the rows now put it.
 */
export const NOW_STEP = { ms: 360, ease: [0.45, 0, 0.55, 1] as const } as const;

/**
 * Where the line's middle is drawn for a place `y` in a list `height` tall: at the place, but never
 * so near an edge that half the dot is cut off by the card's corner. A list shorter than the dot
 * draws it in the middle.
 */
export function nowLineY(y: number, height: number): number {
  const h = Math.max(0, finite(height));
  const r = NOW_LINE.dot / 2;
  if (h <= NOW_LINE.dot) return h / 2;
  return clamp(finite(y), r, h - r);
}

/**
 * THE LINE'S INK: the wheel's hand's (`handInk`) — the theme's accent, and in the amber Night the
 * night palette's own amber rather than the scheme's accent. One "now" in the app, drawn one way.
 */
export function nowInk(palette: Pick<Palette, 'accent'>, theme: ThemeName): string {
  return handInk(palette, theme);
}

/* --------------------------------------------------------------------------- the soon dot */

/** How soon a slot has to be for its dot: the next one, a quarter of an hour off or less. */
export const SOON_MS = 15 * 60_000;

/** The soon dot's drawing and its breath. */
export const SOON_DOT = {
  /** The dot's diameter, in the row's 14 pt gutter. */
  size: 6,
  /** One breath, in and out: slow enough to be calm, the tour mark's 2 s and a little more. */
  cycleMs: 2400,
  /** The dot at the full of the breath: a swell, not a jump. */
  corePeak: 1.2,
  /** The ring round it at its widest, as a scale of the dot: still inside the gutter. */
  haloPeak: 2.2,
  /** And its ink at its widest: a glow, not a second dot. */
  haloAlpha: 0.3,
} as const;

// the full of the breath is its middle; a half cosine each way (`keyframes.ts`), as breathing is
const CORE: readonly Key[] = [
  [0, 1],
  [0.5, SOON_DOT.corePeak],
  [1, 1],
];
const HALO: readonly Key[] = [
  [0, 1],
  [0.5, SOON_DOT.haloPeak],
  [1, 1],
];
const HALO_INK: readonly Key[] = [
  [0, 0],
  [0.5, SOON_DOT.haloAlpha],
  [1, 0],
];

export interface SoonBreath {
  /** The dot's scale, about its middle. Its ink never dims: the dot is at full at every frame. */
  core: Frame;
  /** The ring's scale, about the same middle. */
  halo: Frame;
  /** The ring's opacity: nothing at the empty of the breath, `haloAlpha` at its full. */
  haloOpacity: Frame;
}

/** One breath, over the loop's clock 0 → 1 — which begins and ends at rest, so it loops seamlessly. */
export function soonBreath(): SoonBreath {
  return {
    core: loopFrame(t => keyValue(CORE, t), [0.5]),
    halo: loopFrame(t => keyValue(HALO, t), [0.5]),
    haloOpacity: loopFrame(t => keyValue(HALO_INK, t), [0.5]),
  };
}

/** The dot is never drawn in the amber Night — and in light and dark under reduce motion, it is still. */
export const soonDotShown = (theme: ThemeName): boolean => theme !== 'night';

/* ---------------------------------------------------------------------- a slot turning done */

/**
 * A SLOT TURNING DONE while the page is watched: the chip settles into its new state as the check
 * in it draws itself (220 ms, `TICK_DRAW_MS`), and the due wash under the row fades away. A slot
 * that was done before the page looked is simply done — only a change the row sees is played.
 */
export const SLOT_DONE = {
  /** The chip, from a little small and faint to itself. */
  chipMs: 220,
  chipFromScale: 0.92,
  chipFromOpacity: 0.4,
  /** The wash under a due row, fading as it stops being due. */
  washMs: 280,
} as const;

/** The chip's settle, over its value 0 → 1. */
export function chipSettleFrames(): { scale: Frame; opacity: Frame } {
  return {
    scale: {
      inputRange: [0, 1],
      outputRange: [SLOT_DONE.chipFromScale, 1],
      extrapolate: 'clamp',
    },
    opacity: {
      inputRange: [0, 1],
      outputRange: [SLOT_DONE.chipFromOpacity, 1],
      extrapolate: 'clamp',
    },
  };
}
