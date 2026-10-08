/**
 * THE LOADER AS NUMBERS: the mark travelling a small ∞, non-stop, for as long as something is
 * waited for (the owner, 2026-09-26: *"are we going to have a page where it's loading? ive not
 * enconuntered one yet, but if there is, our loading icon shuold be our logo spinning non stop in
 * an infinity shape."*). Pure TypeScript, so every claim here is tested in node — this package's
 * tests cannot render React Native — and `LogoLoader.tsx` only hands these numbers to one image,
 * one SVG path and `Animated.Value#interpolate`, the way `PaperPlane.tsx` hands `paperPlane.ts`'s.
 *
 * WHERE IT IS DRAWN is two places, because the app is local-first and almost nothing waits
 * (docs/BRANDING.md §2, "Waiting"): the first moment after opening the app, while the session is
 * read off the phone, and a button waiting on the server — signing in, sending a reset link,
 * joining a household. Never on Today and never in the logging loop: a save there is written on
 * the phone and does not wait for anything.
 *
 * THE CURVE is Bernoulli's lemniscate, the ∞ a mathematician draws:
 *
 *     x = a·cos t / (1 + sin²t)        y = a·sin t·cos t / (1 + sin²t)
 *
 * `reach` (a) from its center to either far end, and 0.71·a tall. It crosses itself once, at its
 * center, at right angles — which is what makes it read as ∞ rather than as two circles touching.
 *
 * IT DIVES THROUGH THE MIDDLE AND CLIMBS AT THE ENDS. From the crossing the mark runs down and to
 * the right, along under the right-hand loop, UP its far end, back over the top and down through
 * the crossing to the left, and round the left-hand loop the same way — a swing's path rather than
 * a racetrack's. The lean below depends on that direction (see `leanFor`), so it is fixed here, by
 * the sign of `y` in `lemniscatePoint`, rather than left to whichever way the formula happens to go.
 *
 * EVEN SPEED. Taken at even steps of t, the curve is run about 1.4 times as fast at its far ends as
 * through its middle (its speed is a / √(1 + sin²t)): the mark would dawdle through the crossing
 * and whip round the ends, which reads as a thing being flung rather than travelling. So the
 * keyframes are taken at even steps of DISTANCE along the curve — the arc length, integrated from
 * that speed and inverted — and one linear clock over them is one steady pace all the way round.
 * 64 of them: the chord between two is a twelfth of `reach`, and the furthest it strays from the
 * true curve, where the ends turn tightest, is under a tenth of a point at the large size.
 *
 * THE MARK STAYS UPRIGHT, NEARLY. It leans into its heading by a fraction of the way its path has
 * turned — right while it heads right, left while it heads left, standing straight where the path
 * climbs the far ends — and never more than `LOADER_LEAN_MAX` either way. The whole mark turning
 * with the path would put the parent-and-baby heart on its side twice a second and upside down at
 * the top of every loop; a mark that never turned at all would slide round the ∞ like a sticker.
 *
 * NOTHING HERE IS ABOUT THE BABY, OR ABOUT HOW LONG THE WAIT WILL BE. It is not a progress bar: it
 * says "working" and nothing else, and it stops the moment the thing waited for arrives.
 */
import { withAlpha } from '../theme/contrast';
import type { Palette, ThemeName } from '../theme/theme';
import type { Frame } from './dayNightSwitch';
import { motionStill } from './tickDraw';

/* ------------------------------------------------------------------------------- the sizes */

export type LoaderVariant = 'small' | 'large';

export interface LoaderSize {
  /** The mark's square box. The image is drawn `contain` inside it, as the top bar's mark is. */
  readonly mark: number;
  /** Bernoulli's `a`: from the ∞'s center to either far end. */
  readonly reach: number;
  /**
   * The loader's own box, the ∞'s center at its middle. Big enough that the mark's box, turned by
   * its lean, stays inside at every point of the loop — `logoLoader.test.ts` walks every keyframe
   * and the points between them — and no more than a point bigger than that on any side.
   */
  readonly box: { readonly width: number; readonly height: number };
  /** The ∞ drawn behind the mark: a hairline at the small size, a little more at the large. */
  readonly stroke: number;
}

/**
 * SMALL, FOR A BUTTON: the mark at 14 — about the height of the words it stands in for, so a
 * button that is waiting looks the size it did a moment before — on an ∞ 36 wide. 52 × 30 with the
 * lean, so a 44 pt button keeps 7 pt clear above and below it, and even the 34 pt short pill holds
 * it. Each loop of the ∞ is wider than the mark: any narrower and the mark covers its own track,
 * and the shape it is tracing is lost.
 *
 * LARGE, FOR THE BOOT WAIT: the mark at 40 on an ∞ 128 wide, in a box 170 × 94. The splash before
 * it draws the mark at 160; this is not the splash again, it is the phone saying it is still busy,
 * so it is the size of something to glance at, not something to read.
 *
 * Both boxes are EVEN, so the ∞'s center and the mark's resting box fall on whole points and the
 * mark at rest is drawn on the pixel grid rather than smeared across it.
 */
export const LOADER_SIZE = {
  small: { mark: 14, reach: 18, box: { width: 52, height: 30 }, stroke: 1.25 },
  large: { mark: 40, reach: 64, box: { width: 170, height: 94 }, stroke: 2 },
} as const satisfies Record<LoaderVariant, LoaderSize>;

/* ------------------------------------------------------------------------------ the timing */

/**
 * One ∞, end to end: about the tour's breath (1.8 s, `docs/TOUR.md`), so the two things in the app
 * that repeat on their own keep one tempo. Quick enough to read as busy, slow enough that the mark
 * can be seen for what it is on the way round.
 */
export const LOADER_LOOP_MS = 1800;

/** How many even steps of distance the loop is cut into (see "EVEN SPEED" above). */
export const LOADER_FRAMES = 64;

/**
 * THE LEAN: a share of how far the heading has turned from straight up — which is the heading at
 * both far ends — and never past the clamp. At the crossing the heading is 135° from straight up,
 * so the share alone would lean the mark 19°; the clamp holds it at 16 there, a little plateau
 * through the middle where the mark is going fastest across the eye.
 */
export const LOADER_LEAN_SHARE = 0.14;
export const LOADER_LEAN_MAX = 16;

/**
 * WHEN NOTHING MAY MOVE, THE MARK BREATHES: full to `LOADER_BREATH_FLOOR` over `LOADER_BREATH_MS`
 * and back over the same — one breath every 2.4 s, slower than the ∞, because a thing told to keep
 * still should also be calm. It starts from the faint end, so a loader that appears still arrives
 * by breathing in rather than by popping up at full strength.
 */
export const LOADER_BREATH_MS = 1200;
export const LOADER_BREATH_FLOOR = 0.35;

/**
 * THE BOOT WAIT'S PATIENCE: how long opening the app may take before the loader is shown at all,
 * and how long it then takes to fade in. A loader that appears for a tenth of a second is a flicker,
 * and a flicker on every launch reads as something going wrong; a quick launch never shows one.
 * 400 ms is past a fast launch and well short of the second at which a parent starts to wonder. A
 * button does not wait like this: it answers the tap at once, as it always has.
 */
export const LOADER_DELAY_MS = 400;
export const LOADER_FADE_MS = 240;

/** What a screen reader calls the loader, unless the caller names it. Never the product's name. */
export const LOADER_LABEL = 'Loading';

/* ------------------------------------------------------------------------------- the curve */

type Point = readonly [number, number];

/**
 * The lemniscate at `t`, in screen coordinates (y down). `t` runs from −π/2 — the crossing, heading
 * down and to the right — round the right loop and back through the crossing at π/2, heading down
 * and to the left, then round the left loop to 3π/2. The minus on `y` is the direction: without it
 * the mark would climb through the middle and dive at the ends.
 */
export function lemniscatePoint(reach: number, t: number): Point {
  const s = Math.sin(t);
  const d = 1 + s * s;
  return [(reach * Math.cos(t)) / d, (-reach * s * Math.cos(t)) / d];
}

/**
 * Which way the mark is heading at `t`, in degrees clockwise from pointing right (screen
 * coordinates, as `rotate` counts them). From the derivatives, which simplify to
 * dx/dt = −a·s·(3 − s²) / (1 + s²)² and dy/dt = −a·(1 − 3s²) / (1 + s²)², s = sin t; the common
 * positive factor does not change the direction, so it is left out.
 */
export function lemniscateHeading(t: number): number {
  const s = Math.sin(t);
  return (Math.atan2(-(1 - 3 * s * s), -s * (3 - s * s)) * 180) / Math.PI;
}

/** How fast the curve is run at `t` per unit of t: a / √(1 + sin²t) — √2 times faster at the ends. */
export const lemniscateSpeed = (reach: number, t: number): number =>
  reach / Math.sqrt(1 + Math.sin(t) ** 2);

/** The whole ∞'s length, about 5.244 × `reach` (twice the lemniscate constant). */
export function lemniscateLength(reach: number): number {
  return arcTable(reach).total;
}

/** The start of the loop: the crossing, heading down and to the right. */
const T0 = -Math.PI / 2;
/** Steps in the arc-length table: fine enough that inverting it is exact to well under a hair. */
const ARC_STEPS = 4096;

interface ArcTable {
  /** t at each step, and the distance run from T0 to it. */
  readonly t: readonly number[];
  readonly s: readonly number[];
  readonly total: number;
}

/** The distance run from the start to each of `ARC_STEPS` even steps of t: the trapezoid rule on the speed. */
function arcTable(reach: number): ArcTable {
  const dt = (2 * Math.PI) / ARC_STEPS;
  const t: number[] = [T0];
  const s: number[] = [0];
  for (let i = 1; i <= ARC_STEPS; i++) {
    const t1 = T0 + i * dt;
    const run = ((lemniscateSpeed(reach, t1 - dt) + lemniscateSpeed(reach, t1)) / 2) * dt;
    t.push(t1);
    s.push((s[i - 1] ?? 0) + run);
  }
  return { t, s, total: s[ARC_STEPS] ?? 0 };
}

/** The t at which `distance` has been run: the table searched and read between its two steps. */
function tAtDistance(table: ArcTable, distance: number): number {
  let lo = 0;
  let hi = ARC_STEPS;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if ((table.s[mid] ?? 0) <= distance) lo = mid;
    else hi = mid;
  }
  const [s0, s1] = [table.s[lo] ?? 0, table.s[hi] ?? 0];
  const [t0, t1] = [table.t[lo] ?? 0, table.t[hi] ?? 0];
  return s1 === s0 ? t0 : t0 + ((distance - s0) / (s1 - s0)) * (t1 - t0);
}

/**
 * THE LEAN FOR A HEADING, `heading` UNWRAPPED — counted on round the loop without jumping back by
 * 360°, which is what makes it a turn rather than a direction: the right loop turns the heading
 * from 45° (down-right) through −90° (up, at the far end) to −225° (down-left), and the left loop
 * turns it all the way back. Measured from −90°, straight up, the turn is a share of the way
 * INTO the heading: counted from straight down instead, the same share would lean the mark back
 * from where it is going, which is why the direction of travel is fixed above.
 */
export function leanFor(heading: number): number {
  const lean = LOADER_LEAN_SHARE * (heading + 90);
  return Math.max(-LOADER_LEAN_MAX, Math.min(LOADER_LEAN_MAX, lean));
}

/** One stop on the loop: where the mark's center is, from the ∞'s center, and how it leans. */
export interface LoaderStop {
  readonly x: number;
  readonly y: number;
  /** Degrees, clockwise positive, as `rotate` takes them. */
  readonly lean: number;
}

/** A thousandth of a point is well past anything a screen can draw; `+ 0` turns −0 into 0. */
const tidy = (v: number): number => Math.round(v * 1000) / 1000 + 0;

/**
 * `count` even steps of distance round the loop, from the crossing back to it: `count + 1` stops,
 * the last the first again, so a clock that jumps from 1 back to 0 lands where it already is.
 */
export function loaderStops(reach: number, count: number = LOADER_FRAMES): readonly LoaderStop[] {
  const table = arcTable(reach);
  const stops: LoaderStop[] = [];
  let unwrapped = lemniscateHeading(T0);
  for (let i = 0; i <= count; i++) {
    const t = tAtDistance(table, (table.total * i) / count);
    const [x, y] = lemniscatePoint(reach, t);
    let heading = lemniscateHeading(t);
    // the turn since the last stop is the short way round: a step is never near half a turn
    while (heading - unwrapped > 180) heading -= 360;
    while (heading - unwrapped < -180) heading += 360;
    unwrapped = heading;
    stops.push(Object.freeze({ x: tidy(x), y: tidy(y), lean: tidy(leanFor(heading)) }));
  }
  return Object.freeze(stops);
}

/* ------------------------------------------------------------------------------ the frames */

const frame = (
  inputRange: readonly number[],
  outputRange: readonly number[],
  extrapolate: Frame['extrapolate'] = 'clamp',
): Frame => Object.freeze({ inputRange, outputRange, extrapolate });

/** The journey, over one clock 0 → 1: where the mark is from the box's middle, and its lean in degrees. */
export interface LoaderFrames {
  readonly x: Frame;
  readonly y: Frame;
  readonly lean: Frame;
}

function buildFrames(size: LoaderSize): LoaderFrames {
  const stops = loaderStops(size.reach);
  const input = Object.freeze(stops.map((_, i) => i / LOADER_FRAMES));
  return Object.freeze({
    x: frame(input, Object.freeze(stops.map(p => p.x))),
    y: frame(input, Object.freeze(stops.map(p => p.y))),
    lean: frame(input, Object.freeze(stops.map(p => p.lean))),
  });
}

/**
 * COMPUTED ONCE, WHEN THE MODULE LOADS, AND FROZEN: every loader of a size shares these arrays, so
 * a caller that edited one would bend the ∞ for every loader on the screen. `LogoLoader.tsx`
 * copies them into the fresh arrays `interpolate` takes.
 */
const FRAMES: Readonly<Record<LoaderVariant, LoaderFrames>> = Object.freeze({
  small: buildFrames(LOADER_SIZE.small),
  large: buildFrames(LOADER_SIZE.large),
});

export const loaderFrames = (variant: LoaderVariant): LoaderFrames => FRAMES[variant];

/** The breath, over its own clock: 0 is full strength, 1 the floor (see `LOADER_BREATH_MS`). */
export const LOADER_BREATH: Frame = frame([0, 1], [1, LOADER_BREATH_FLOOR]);

/* ------------------------------------------------------------------------------- the track */

/** The track's points: finer than the keyframes, so its curve is smooth at the large size too. */
const TRACK_POINTS = 128;

/**
 * THE ∞ ITSELF, as an SVG path in the box's own coordinates: drawn faintly behind the mark so the
 * eye has the whole shape while the mark is only ever at one point of it. Decoration — no contrast
 * is claimed for it; the mark alone says "working".
 */
function buildTrack(size: LoaderSize): string {
  const cx = size.box.width / 2;
  const cy = size.box.height / 2;
  const at = (v: number): string => String(Math.round(v * 100) / 100 + 0);
  const stops = loaderStops(size.reach, TRACK_POINTS).slice(0, -1);
  return `${stops.map((p, i) => `${i === 0 ? 'M' : 'L'}${at(cx + p.x)} ${at(cy + p.y)}`).join('')}Z`;
}

const TRACK: Readonly<Record<LoaderVariant, string>> = Object.freeze({
  small: buildTrack(LOADER_SIZE.small),
  large: buildTrack(LOADER_SIZE.large),
});

export const loaderTrack = (variant: LoaderVariant): string => TRACK[variant];

/* -------------------------------------------------------------------- when nothing moves */

/**
 * `travel` round the ∞, or `breathe` at its crossing. The mark does not travel when the parent
 * asked the phone for less motion, or in the amber night — the theme read at 3 a.m. in a dark room,
 * where nothing moves (`motionStill`, the rule every moving picture in this package keeps).
 *
 * WHY IT STILL BREATHES THERE, when the tour's still mark does not (docs/DESIGN_SYSTEM.md §7). A
 * mark at rest can still say "here", which is the tour's whole message; a loader at rest says
 * "stuck", which is the one thing a loader must never say. A slow change of strength moves nothing
 * across the screen, turns nothing and grows nothing — so it keeps the rule reduce motion asks for,
 * and it is the one way left to say "still working".
 */
export type LoaderMotion = 'travel' | 'breathe';

export const loaderMotion = (reduceMotion: boolean, theme: ThemeName): LoaderMotion =>
  motionStill(reduceMotion, theme) ? 'breathe' : 'travel';

/* -------------------------------------------------------------------------------- the inks */

/** How strong the track is in the caller's ink: faint, and never mistaken for the mark. */
export const LOADER_TRACK_ALPHA = 0.3;

export interface LoaderInks {
  /** The one ink the mark is drawn in (`tintColor`), or null for the artwork's own colors. */
  readonly mark: string | null;
  /** The faint ∞ behind it. */
  readonly track: string;
  /** The platform's spinner, drawn instead when the app has installed no mark. */
  readonly spinner: string;
}

/**
 * WHAT THE LOADER IS DRAWN IN.
 *
 *   - A `tint` is the caller's own ink, and it is used for everything: the mark as a one-color
 *     silhouette, the track as that ink at `LOADER_TRACK_ALPHA`. A button hands in its label's ink,
 *     so the heart reads on a filled button exactly as well as the words it stands in for — which
 *     the token gate already holds on every fill — and never brighter than they were.
 *   - With no tint the mark is the owner's artwork, in its own colors, on the theme's `line2` — as
 *     the top bar's mark is (docs/BRANDING.md §4: it carries its own color on every scheme).
 *   - EXCEPT IN THE AMBER NIGHT, which draws the mark as a silhouette in the night's own `text2`:
 *     the artwork's teal and coral would be the brightest thing in a dark room, and night exists to
 *     keep that room dark. `text2` and `line2` are night's own — a scheme never overlays either —
 *     so the loader at night is night-palette colors only, and nothing is lit.
 */
export function loaderInks(
  palette: Pick<Palette, 'text2' | 'line2'>,
  theme: ThemeName,
  tint?: string,
): LoaderInks {
  if (tint !== undefined) {
    return { mark: tint, track: withAlpha(tint, LOADER_TRACK_ALPHA), spinner: tint };
  }
  return {
    mark: theme === 'night' ? palette.text2 : null,
    track: palette.line2,
    spinner: palette.text2,
  };
}
