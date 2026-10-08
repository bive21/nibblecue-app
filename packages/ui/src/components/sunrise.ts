/**
 * THE SUN COMES UP OVER THE WELCOME — as numbers (the owner, 2026-09-26: *"Think about on boarding
 * process too … other than shaking modules in feeding and milk"*, and on the delights already in
 * the app: they make it "look more fun"). Setup ends on a page that says welcome and whose one
 * button reads "Open my day"; over its heading a small sun rises from behind a horizon line and its
 * rays open out, once. It is drawn after the app's own sun glyph (`paths.ts`'s `sun`: a ring and
 * eight rays), larger, so the welcome speaks the picture language of the sky on Today's top bar, the
 * Theme switch and the meal sky the parent is about to meet. Pure TypeScript, tested in node
 * (`sunrise.test.ts`); `Sunrise.tsx` only hands these numbers to views.
 *
 * CALM, AND ONCE: the horizon draws out from its middle, the sun rises behind it and settles, the
 * rays open one after another round the sun from the top — about nine tenths of a second, on the
 * page's first frame only, never again. No confetti: the first-run tour ends on the product's one
 * confetti a minute later (`tour/Confetti.tsx` says why there is only one), and a second burst a
 * minute earlier would spend it.
 *
 * THE END STATE IS A PICTURE ON ITS OWN: under reduce motion and in the amber Night the risen sun
 * is simply there, rays and all, in the night's own ink — nothing moves and nothing is lit.
 *
 * ONE INK, `accent2` — the eyebrow glyph's ink, which is what the sun stands in for (`StepHeader`'s
 * `art`) and is measured at 3:1 as a graphic on every ground the welcome can be drawn on
 * (`sunrise.test.ts`).
 */
import type { Frame } from './dayNightSwitch';
import { keyFrame, keysWithin, type Key } from './keyframes';

/** The picture's box, in points. */
export const SUNRISE_BOX = { width: 72, height: 46 } as const;

/** The horizon: a line `thick` points thick, centered `y` points down, `inset` in from each side. */
export const HORIZON = { y: 42, inset: 4, thick: 2 } as const;

/**
 * The sun at rest: a ring `r` points round, stroked `stroke` thick, its center at (`cx`, `cy`) —
 * drawn after the glyph (`paths.ts`'s `sun`, a ring with eight rays standing clear of it), with
 * the rays a little closer in so the whole sun fits over the horizon in a picture this short.
 */
export const SUN = { cx: 36, cy: 21, r: 9, stroke: 2.2 } as const;

/** The rays: eight, like the glyph's, each from `from` to `from + length` out from the center. */
export const RAY = { from: 13, length: 4.5, thick: 2.2 } as const;

/** Where each ray points, in degrees clockwise from pointing right: from the top, clockwise. */
export const RAY_ANGLES = [-90, -45, 0, 45, 90, 135, 180, 225] as const;

/** How far below its rest the sun starts: far enough that the whole ring is under the horizon. */
export const RISE_FROM = 32;

/**
 * The timings, in ms from the first frame. The rays open clockwise FROM THE TOP, so the ones that
 * point up open while the sun is finishing its rise and the ones that point down only once it is
 * up — a downward ray opened on a sun still low would be cut off by the horizon (`sunrise.test.ts`
 * walks every ray's tip through its whole opening).
 */
export const SUNRISE_TIMING = {
  /** The horizon draws out from its middle. */
  horizonMs: 240,
  /** The sun starts up as the horizon is half drawn, and rises for this long. */
  riseAt: 120,
  riseMs: 560,
  /** The first ray opens as the sun is nearly up; each next one a beat later, clockwise. */
  raysAt: 600,
  rayStagger: 26,
  rayMs: 200,
} as const;

/** The whole sunrise, in ms: the last ray open. */
export const SUNRISE_MS =
  SUNRISE_TIMING.raysAt +
  (RAY_ANGLES.length - 1) * SUNRISE_TIMING.rayStagger +
  SUNRISE_TIMING.rayMs;

/** The top of the horizon line: nothing of the sky is drawn below it. */
export const SKY_FLOOR = HORIZON.y - HORIZON.thick / 2;

export interface SunriseFrames {
  /** The horizon's width, as a scale about its middle. */
  horizon: Frame;
  /** The sun's drop below its rest, in points (0 is risen). */
  rise: Frame;
  /** Each ray, in `RAY_ANGLES` order: its center's distance from the sun's, its length's scale, its strength. */
  rays: readonly { angle: number; x: Frame; scale: Frame; opacity: Frame }[];
}

/** The smallest a ray is scaled to: never exactly zero, which some platforms treat as singular. */
const LEAST = 0.01;

/**
 * Every frame over ONE clock, 0 → 1 across `SUNRISE_MS`: each part in its own window of it, eased
 * turning point to turning point (`keyframes.ts`). A ray opens from its inner end: its center
 * moves out by half of what it gains, so the end nearest the sun stays where it starts.
 */
export function sunriseFrames(): SunriseFrames {
  const T = SUNRISE_MS;
  const win = (keys: readonly Key[], at: number, ms: number) =>
    keyFrame(keysWithin(keys, at / T, (at + ms) / T), 'clamp', 160);
  const s = SUNRISE_TIMING;
  return {
    horizon: win(
      [
        [0, LEAST],
        [1, 1],
      ],
      0,
      s.horizonMs,
    ),
    rise: win(
      [
        [0, RISE_FROM],
        [1, 0],
      ],
      s.riseAt,
      s.riseMs,
    ),
    rays: RAY_ANGLES.map((angle, i) => {
      const at = s.raysAt + i * s.rayStagger;
      return {
        angle,
        x: win(
          [
            [0, RAY.from + (RAY.length * LEAST) / 2],
            [1, RAY.from + RAY.length / 2],
          ],
          at,
          s.rayMs,
        ),
        scale: win(
          [
            [0, LEAST],
            [1, 1],
          ],
          at,
          s.rayMs,
        ),
        opacity: win(
          [
            [0, 0],
            [0.4, 1],
          ],
          at,
          s.rayMs,
        ),
      };
    }),
  };
}
