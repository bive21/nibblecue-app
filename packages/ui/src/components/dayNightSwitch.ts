/**
 * The day/night switch as numbers: its size, the curve it moves on, and what every layer of the
 * picture looks like at each point of the one animated value (docs/SETUP.md §2, "How often?";
 * the owner, 2026-09-25). Pure TypeScript, so all of it is tested in node — this package's tests
 * cannot render React Native — and `DayNightSwitch.tsx` only hands these frames to
 * `Animated.Value#interpolate`.
 *
 * ONE VALUE DRIVES EVERYTHING. `progress` is 0 by day and 1 by night; every layer is a
 * piecewise-linear function of it, written below as `Frame`s in the exact shape `interpolate`
 * takes. That is what makes the switch reversible mid-flight for free — a tap while it is still
 * rolling just sends the same value back the way it came — and what lets a test ask "what does
 * the picture look like at 0, at 1, and on the way" without a device.
 */

/**
 * The pill. The knob sits `inset` inside every edge, so it is `height - 2 × inset` across, and the
 * `rim` — the theme's hairline round the pill — is drawn inside that inset, never under the knob.
 */
export const DAY_NIGHT_SIZE = { width: 64, height: 34, inset: 3, rim: 1 } as const;

/** One flip, day to night or back. Long enough to be seen, short enough not to be waited for. */
export const DAY_NIGHT_MS = 560;

/**
 * The curve, as `Easing.bezier`'s four control points: a slow start, then a small overshoot that
 * settles back. `Animated.timing` applies it to the distance still to go, so the knob rolls a hair
 * PAST its rest at whichever end it is heading for and comes back — the same in both directions,
 * with no second curve for the way home. About 4.5% past: a point and a half of knob and a few
 * degrees of moon settling upright, which `dayNightSwitch.test.ts` measures against the room
 * between the knob and the rim — the knob may never touch it.
 */
export const DAY_NIGHT_EASE = [0.5, 0, 0.25, 1.3] as const;

export interface DayNightGeometry {
  width: number;
  height: number;
  inset: number;
  /** The hairline round the pill, inside the inset. */
  rim: number;
  /** The knob's diameter. */
  knob: number;
  /** How far the knob's left edge moves, day to night. */
  travel: number;
  /**
   * How far the knob turns crossing the track, in degrees: the angle a wheel of the knob's size
   * turns over `travel` without slipping, so it ROLLS rather than skating with a spin painted on.
   */
  roll: number;
  /** The two rings of light round the knob, inner and outer diameter. */
  halo: readonly [number, number];
}

export function dayNightGeometry(size: typeof DAY_NIGHT_SIZE = DAY_NIGHT_SIZE): DayNightGeometry {
  const knob = size.height - 2 * size.inset;
  const travel = size.width - knob - 2 * size.inset;
  return {
    width: size.width,
    height: size.height,
    inset: size.inset,
    rim: size.rim,
    knob,
    travel,
    roll: ((travel / (knob / 2)) * 180) / Math.PI,
    halo: [knob + 12, knob + 24],
  };
}

/** The value the switch comes to rest at: night is on. */
export const progressFor = (checked: boolean): 0 | 1 => (checked ? 1 : 0);

/**
 * What a change of `checked` does. Under reduce motion nothing is animated: the value is set to
 * where it ends and the picture simply IS day or night (docs/DESIGN_SYSTEM.md §7 — "disables
 * transforms and transitions but never hides content"). The end state is the same either way.
 */
export function dayNightMove(
  checked: boolean,
  reduceMotion: boolean,
): { to: 0 | 1; animate: boolean; duration: number } {
  return {
    to: progressFor(checked),
    animate: !reduceMotion,
    duration: reduceMotion ? 0 : DAY_NIGHT_MS,
  };
}

/** One layer's keyframes, in the shape `interpolate` takes. */
export interface Frame {
  readonly inputRange: readonly number[];
  readonly outputRange: readonly number[];
  /**
   * `clamp` everywhere except where the curve's overshoot is MEANT to show — the knob's travel and
   * its turn. An opacity that followed the overshoot would try to go past fully on.
   */
  readonly extrapolate: 'clamp' | 'extend';
}

const frame = (
  inputRange: readonly number[],
  outputRange: readonly number[],
  extrapolate: Frame['extrapolate'] = 'clamp',
): Frame => ({ inputRange, outputRange, extrapolate });

/**
 * A star: its CENTER in the track's own coordinates, its size, and the point in the flip where it
 * starts to appear. They sit on the left of the pill, where the knob is not at night, and come on
 * one after another as the moon arrives.
 */
export interface Star {
  x: number;
  y: number;
  size: number;
  kind: 'dot' | 'sparkle';
  at: number;
}

export const STARS: readonly Star[] = [
  { x: 10, y: 10, size: 6, kind: 'sparkle', at: 0.45 },
  { x: 19, y: 6, size: 2, kind: 'dot', at: 0.52 },
  { x: 24, y: 17, size: 4, kind: 'sparkle', at: 0.58 },
  { x: 7, y: 23, size: 2, kind: 'dot', at: 0.65 },
  { x: 16, y: 26, size: 5, kind: 'sparkle', at: 0.72 },
];

/** How long a star takes to come on, dip once and settle: its twinkle. */
const TWINKLE = [0, 0.12, 0.2, 0.26] as const;

/** A cloud's box in the track's coordinates: on the right, where the knob is not by day. */
export interface CloudBox {
  x: number;
  y: number;
  width: number;
  height: number;
  /** How far it drifts to the right as night comes, which takes it out past the pill's end. */
  drift: number;
  /** Its resting opacity by day. */
  alpha: number;
}

export const CLOUD: CloudBox = { x: 34, y: 16, width: 22, height: 11, drift: 26, alpha: 1 };
/** A smaller, fainter cloud higher up. It leaves faster than the big one, so the two part. */
export const WISP: CloudBox = { x: 44, y: 6, width: 13, height: 6.5, drift: 34, alpha: 0.7 };

/**
 * A cloud's outline in a 24 × 12 box: a flat base with rounded ends and three bumps, drawn as one
 * shape of one fill so it fades as one thing rather than as overlapping discs.
 */
export const CLOUD_VIEWBOX = '0 0 24 12';
export const CLOUD_BASE = { x: 3, y: 6, width: 18, height: 6, r: 3 } as const;
export const CLOUD_BUMPS = [
  { cx: 7.5, cy: 7, r: 4 },
  { cx: 12.5, cy: 5, r: 5 },
  { cx: 17.5, cy: 7.5, r: 3.8 },
] as const;

/** A four-point sparkle in a 10 × 10 box. */
export const SPARKLE_PATH =
  'M5 0C5.5 3.5 6.5 4.5 10 5C6.5 5.5 5.5 6.5 5 10C4.5 6.5 3.5 5.5 0 5C3.5 4.5 4.5 3.5 5 0Z';

/**
 * The moon's craters as fractions of the knob, so they scale with it: one large high on the
 * right, one below it on the left, one small at the foot. Drawn upright at the moon's rest angle.
 */
export const CRATERS = [
  { cx: 0.64, cy: 0.34, r: 0.12 },
  { cx: 0.34, cy: 0.6, r: 0.095 },
  { cx: 0.66, cy: 0.72, r: 0.065 },
] as const;

/** Where the sun's highlight sits, as a fraction of the knob: up and to the left, like a lamp. */
export const SUN_HIGHLIGHT = { cx: 0.38, cy: 0.34, r: 0.72 } as const;

export interface DayNightFrames {
  knobX: Frame;
  /** The knob stretches a little across its travel and is round again at either end. */
  knobStretch: Frame;
  sunOpacity: Frame;
  /** In degrees. */
  sunTurn: Frame;
  moonOpacity: Frame;
  /** In degrees: it turns INTO place, arriving upright. */
  moonTurn: Frame;
  haloOpacity: Frame;
  haloScale: Frame;
  nightSky: Frame;
  cloudX: Frame;
  cloudOpacity: Frame;
  wispX: Frame;
  wispOpacity: Frame;
  /** The whole field of stars slides in from the left as the knob rolls away to the right. */
  starsX: Frame;
  stars: readonly { opacity: Frame; scale: Frame }[];
}

export function dayNightFrames(g: DayNightGeometry = dayNightGeometry()): DayNightFrames {
  return {
    knobX: frame([0, 1], [0, g.travel], 'extend'),
    knobStretch: frame([0, 0.5, 1], [1, 1.1, 1]),
    // the faces cross over the middle of the roll: the sun is gone before the moon is whole, so
    // the knob is never two pictures at full strength at once
    sunOpacity: frame([0.3, 0.6], [1, 0]),
    sunTurn: frame([0, 1], [0, g.roll], 'extend'),
    moonOpacity: frame([0.4, 0.7], [0, 1]),
    moonTurn: frame([0, 1], [-g.roll, 0], 'extend'),
    // the light round the knob draws in as it rolls and blooms again, fainter round the moon
    haloOpacity: frame([0, 0.5, 1], [1, 0.3, 0.6]),
    haloScale: frame([0, 0.5, 1], [1, 0.72, 1]),
    nightSky: frame([0.15, 0.85], [0, 1]),
    cloudX: frame([0, 0.6], [0, CLOUD.drift]),
    cloudOpacity: frame([0, 0.45], [CLOUD.alpha, 0]),
    wispX: frame([0, 0.5], [0, WISP.drift]),
    wispOpacity: frame([0, 0.35], [WISP.alpha, 0]),
    starsX: frame([0.3, 1], [-6, 0]),
    stars: STARS.map(s => ({
      // on, a dip, and on again: one twinkle as it arrives, then still
      opacity: frame(
        TWINKLE.map(d => s.at + d),
        [0, 1, 0.35, 1],
      ),
      scale: frame(
        TWINKLE.map(d => s.at + d),
        [0.3, 1.25, 0.8, 1],
      ),
    })),
  };
}
