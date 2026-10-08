/**
 * THE HEART ON A PULL, as numbers (the owner, 2026-09-26, approving the delight list: "agreed" …
 * "lets try … apply it, and if i dont like it then i will let you know"). When a parent pulls Today
 * down to sync, the mark in the top bar stretches with the pull — taller, and a little narrower, as
 * the finger draws the page further — and when the finger lets go it springs back on its own: with
 * a little bounce if the pull started a sync, and simply home if it fell short. Pure TypeScript, so
 * the curve, both springs and every rule about when anything moves are tested in node, and
 * `useMarkPull.ts` only hands them to three `Animated.Value`s on the native driver.
 *
 * THE PULL IS THE PAGE'S OWN OFFSET, read on the native side (`Animated.event`), so the heart moves
 * on the same frame as the page under the finger: past the top of the page the offset goes below
 * zero, and the stretch is a function of how far (`MARK_PULL_FRAME`). It FOLLOWS ONLY WHILE A FINGER
 * IS ON THE PAGE — a fling that bounces off the top is not a pull, and on iOS a page that is syncing
 * sits pulled down by the height of its spinner, which must not hold the heart stretched.
 *
 * ON LETTING GO the heart leaves the page and rides a spring of its own from exactly the stretch it
 * had (`markRelease`): `bounce` — a little past its shape and back, twice at most — when a sync
 * started during the pull; `settle`, home without passing it, when it did not. ANDROID'S refresh
 * layout keeps the page still and draws its own spinner, and says nothing of the pull until it lets
 * go, so there the heart has no stretch to follow: a sync starting with no finger on the page gives
 * it the bounce from rest instead (`markKick`), and the platform's spinner does the rest.
 *
 * WHEN NOTHING MOVES — reduce motion, and the amber Night (`motionStill`) — the heart is simply the
 * heart: no stretch, no bounce, and the page's own pull-to-refresh works exactly as it does anywhere.
 *
 * Anchored at its TOP: the heart hangs from the top of its place in the bar and grows down toward
 * the page, which is the way the page is being pulled. At full stretch it is 7.5 points taller than
 * its 30 and still inside the bar (`markPull.test.ts`).
 */
import type { Frame } from './dayNightSwitch';
import { sampleFrame } from './keyframes';

export const MARK_PULL = {
  /** How far past the top of the page, in points, the heart reaches its full stretch. */
  full: 80,
  /** How much taller it is at full stretch: a quarter. */
  stretch: 0.25,
  /** How much narrower for each part taller: at full stretch, a tenth — a squash, never a pinch. */
  squash: 0.4,
  /** How finely the curve is sampled between rest and full stretch. */
  steps: 16,
} as const;

/**
 * THE STRETCH FOR A PULL, `scaleY − 1`, as `interpolate` takes it: the page's offset from
 * `-full` (pulled all the way) to 0 (at rest), eased out like a rubber band — quick to start, slower
 * as it nears its limit, and held there however much further the page goes. Clamped: a page that is
 * not pulled at all (scrolled down, offset above zero) leaves the heart alone.
 */
export const MARK_PULL_FRAME: Frame = (() => {
  const { full, stretch, steps } = MARK_PULL;
  const inputRange: number[] = [];
  const outputRange: number[] = [];
  for (let i: number = steps; i >= 0; i -= 1) {
    const d = i / steps;
    // rest is 0 exactly, not the −0 a product with −full makes of it
    inputRange.push(i === 0 ? 0 : -full * d);
    outputRange.push(stretch * (1 - (1 - d) ** 2));
  }
  return { inputRange, outputRange, extrapolate: 'clamp' };
})();

/** The stretch at a page offset — what the native side draws there, read here in JavaScript. */
export const markPullStretch = (offsetY: number): number => sampleFrame(MARK_PULL_FRAME, offsetY);

/** The heart's two scales for a stretch: taller by it, narrower by `squash` of it. */
export const markScales = (stretch: number): { x: number; y: number } => ({
  x: 1 - MARK_PULL.squash * stretch,
  y: 1 + stretch,
});

/* ------------------------------------------------------------------------------ the springs */

export interface MarkSpring {
  stiffness: number;
  damping: number;
  mass: number;
}

/**
 * THE TWO SPRINGS HOME, as React Native's `Animated.spring` takes them.
 *
 *   bounce   after a pull that started a sync: a damping ratio of 0.42, so the heart overshoots its
 *            shape once by about a quarter of the stretch it was let go from — a squash, a little
 *            wider and shorter — rises a hair past it again, and rests inside 0.6 s;
 *   settle   after a pull that fell short: critically damped, so it goes home and stops there.
 */
export const MARK_SPRINGS: Readonly<Record<'bounce' | 'settle', MarkSpring>> = {
  bounce: { stiffness: 260, damping: 13.5, mass: 1 },
  settle: { stiffness: 300, damping: 2 * Math.sqrt(300), mass: 1 },
};

/**
 * THE KICK a sync gives a heart that was not being pulled (Android, below): an upward velocity, in
 * stretch per second, that lifts it to about 0.14 taller at the top of its bounce — a little over
 * half a full pull — and lets the bounce spring bring it home.
 */
export const MARK_KICK_VELOCITY = 3.8;

/** One run of the heart's spring: from where, how fast, on which spring. Always home to rest (0). */
export interface MarkRun {
  from: number;
  velocity: number;
  spring: MarkSpring;
}

/**
 * THE FINGER LETS GO at page offset `offsetY`: the heart leaves the page from exactly the stretch it
 * had there, bouncing if a sync started during the pull and settling if not. Nothing moves when the
 * heart was not stretched at all and nothing started — a drag that never reached the top.
 */
export function markRelease(offsetY: number, synced: boolean): MarkRun | null {
  const from = markPullStretch(offsetY);
  // a sync with nothing to let go of (a pull the page never showed) still gets its bounce
  if (synced) return from > 0 ? { from, velocity: 0, spring: MARK_SPRINGS.bounce } : markKick();
  return from > 0 ? { from, velocity: 0, spring: MARK_SPRINGS.settle } : null;
}

/** A SYNC STARTED WITH NO FINGER ON THE PAGE (Android's refresh layout): the bounce, from rest. */
export function markKick(): MarkRun {
  return { from: 0, velocity: MARK_KICK_VELOCITY, spring: MARK_SPRINGS.bounce };
}

/**
 * WHAT A SYNC STARTING DOES TO THE HEART. On a page that goes past its own top as it is pulled
 * (iOS), a sync starts while the finger is still pulling, and the heart WAITS for the finger: the
 * letting go is the bounce (`markRelease`). Anywhere else — no finger on the page, or a page that
 * never moved because the platform's refresh layout held it (Android) — it is KICKED now.
 */
export const markOnSync = (dragging: boolean, pageOverscrolls: boolean): 'wait' | 'kick' =>
  dragging && pageOverscrolls ? 'wait' : 'kick';
