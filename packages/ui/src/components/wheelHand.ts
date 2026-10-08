/**
 * THE DAY WHEEL'S CLOCK HAND, as numbers (the owner, 2026-09-26, of the delight list: *"lets try
 * doing number 5-14, apply it, and if i dont like it then i will let you know"*). Pure TypeScript,
 * so every claim here is a node test — this package's tests cannot render React Native — and
 * `WheelHand.tsx` only hands these numbers to one SVG and to `Animated.Value#interpolate`.
 *
 * WHAT IT IS. On TODAY's live wheel (Schedule → Manage, the ring folded under the day card), a slim
 * hand runs out from under the hub to the ring, with a small dot where it meets it: the minute the
 * parent is reading the ring in. When the ring first appears the hand sweeps round clockwise from
 * the wake mark to now — the day so far, in one gesture — and then stays put, stepping to each new
 * minute without moving (a minute is a quarter of a degree on a twenty-four-hour ring; animating
 * that would be a tremor, not a clock).
 *
 * WHERE NOW IS, IS WHERE A STOP WOULD BE. The bearing comes from `@nibblecue/core`'s own
 * `wheelDegrees`, over the same window and the same day arc every house on the ring was placed
 * with (`nowBearing`), so a stop planned for 2:30 PM and the hand at 2:30 PM point the same way.
 * Nothing here decides anything about the day: the hand is a clock, not a verdict on what is
 * behind it or ahead of it (CLAUDE.md §2).
 *
 * IT NEVER COVERS A WORD. `ScheduleWheel` draws it straight after the ring's own track — under the
 * houses, the sun and the moon, every caption and the hub — so the most it can do is pass behind a
 * caption, and the captions were placed clear of the hub in the first place (`placeCaptions`).
 * Thin (2 pt), in the theme's accent at a reduced share, measured at 3:1 against everything it can
 * land on in every theme and scheme (`wheelHand.test.ts`).
 *
 * ONLY ON TODAY. The prop that asks for it defaults to off, so the setup preview ("What your day
 * looks like") and any other day's ring draw no hand at all.
 */
import { wheelDegrees, type WheelLayout } from '@nibblecue/core';
import { themes, type Palette, type ThemeName } from '../theme/theme';

/** The hand's drawing: its stroke, the dot at its tip, and how much of the accent it wears. */
export const WHEEL_HAND = {
  /** The line's weight, in points. */
  stroke: 2,
  /** The dot at the tip: its radius, so it reads on the ring's 3 pt track and its 12 pt night band. */
  tip: 3.5,
  /**
   * THE ACCENT AT 85%. Quieter than the houses it runs under, so the stops stay the thing the ring
   * is about — and no quieter: the dot lands on the ring's hairline track, and there the default
   * teal in light is 2.94:1 at 80% and 3.16:1 at 85%, the least share that holds the 3:1 a mark
   * needs on the card, the track and the night band in all eighteen themes and schemes
   * (`wheelHand.test.ts` walks them).
   */
  alpha: 0.85,
} as const;

/**
 * THE SWEEP: from the wake mark to now, clockwise, on an ease-out — fast off the mark and settling
 * onto the minute. Longer the further it goes, and never past 900 ms (the brief's ceiling): a hand
 * a few degrees past wake does not need most of a second to get there.
 */
export const HAND_SWEEP = {
  minMs: 320,
  maxMs: 900,
  /** `Easing.bezier`'s four points: the ease-out every glide in this package uses (easeOutCubic). */
  ease: [0.33, 1, 0.68, 1] as const,
} as const;

/** Where a wall-clock minute sits on this ring: the same arithmetic that placed every stop. */
export function nowBearing(
  layout: Pick<WheelLayout, 'window' | 'dayArcDeg'>,
  minutes: number,
): number {
  return wheelDegrees(minutes, layout.window, layout.dayArcDeg);
}

/** How far clockwise from one bearing to another, 0 ≤ d < 360. */
export const clockwiseDeg = (from: number, to: number): number => (((to - from) % 360) + 360) % 360;

export interface HandSweep {
  /** The bearing the hand sets off from: the wake mark. */
  from: number;
  /**
   * The bearing it lands on, UNWRAPPED — `from` plus the clockwise distance, so it may pass 360.
   * An animated value interpolated straight to a wrapped bearing would take the short way round,
   * which at five in the morning is backwards.
   */
  to: number;
  durationMs: number;
}

/**
 * The entrance. ALWAYS CLOCKWISE FROM THE WAKE MARK, whatever the hour: at 2 p.m. that is the
 * morning and the early afternoon; at 5 a.m. it is the whole of yesterday's waking day and the
 * night after it, because that is what has passed since the household last woke.
 */
export function handSweep(wakeDeg: number, nowDeg: number): HandSweep {
  const d = clockwiseDeg(wakeDeg, nowDeg);
  const durationMs = Math.round(
    HAND_SWEEP.minMs + (HAND_SWEEP.maxMs - HAND_SWEEP.minMs) * (d / 360),
  );
  return { from: wakeDeg, to: wakeDeg + d, durationMs };
}

/**
 * THE HAND'S TWO ENDS, as radii from the wheel's center: from the hub's edge — the hub is drawn
 * over it, so any ink inside that edge would be ink nobody sees — out to the ring itself, where
 * the dot sits on the track at the minute it is.
 */
export function handReach(ringR: number, hubR: number): { inner: number; outer: number } {
  return { inner: Math.max(0, Math.min(hubR, ringR)), outer: ringR };
}

/**
 * THE HAND'S INK: the theme's accent — and in the amber Night the night palette's own amber, not
 * the scheme's accent the resolved night palette carries for its buttons (`resolvePalette`). A
 * teal line on the 3 a.m. screen would be the one blue thing on it (theme.ts, usage rule 7).
 */
export function handInk(palette: Pick<Palette, 'accent'>, theme: ThemeName): string {
  return theme === 'night' ? themes.night.accent : palette.accent;
}
