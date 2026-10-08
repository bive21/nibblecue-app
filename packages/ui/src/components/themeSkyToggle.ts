/**
 * The theme toggle as numbers: its size at every width the Appearance sheet can give it, where
 * the chosen word and the other stops' glyphs sit, how a tap turns into a move, and what every
 * layer of the picture looks like at each point of the values that animate it (the owner,
 * 2026-09-25: *"Make 3 a 3 way toggle: left day, middle night, right dark. So from currently what
 * we have we just need to fit the text on it, and add one more option to the right which is for
 * dark"*). Pure TypeScript, so all of it is tested in node — this package's tests cannot render
 * React Native — and `ThemeSkyToggle.tsx` only hands these numbers to views and to
 * `Animated.Value#interpolate`.
 *
 * It is setup's day/night switch (`dayNightSwitch.ts`) grown by one stop and a word, and it
 * borrows that switch's drawings — the cloud, the sparkle, the craters, the sun's highlight — and
 * its curve, so the two controls are one picture language.
 *
 * THREE VALUES, NOT ONE, and the reason is a jump from one end to the other. Setup's switch
 * drives every layer from one value, which is right for two stops. Here the knob has to roll
 * THROUGH the middle on a Light → Dark jump, but the picture must not pass through the middle's:
 * a parent going from day to dark would see the amber Night sky flash up half way across and be
 * told, for a moment, that they had picked something they had not. So the knob has its own value
 * (`pos`, in stops) and the pictures have theirs (`night` and `dark`, a layer each), and they move
 * together without the pictures ever being a function of where the knob is.
 *
 * AND THE SAME TOGGLE WITH TWO OF ITS STOPS (the owner, 2026-09-26: *"in theme selection if
 * automatic night mode is on, the dim to should be a toggle like previously but only bettwen dark
 * or night"*). Every number below takes the stops a toggle OFFERS — all three, or `DIM_STOPS` —
 * and the three-stop answers are exactly the ones this file gave before it did.
 */
import type { ThemeName } from '../theme/theme';
import { type as typeScale } from '../theme/theme';
import {
  DAY_NIGHT_EASE,
  DAY_NIGHT_MS,
  type CloudBox,
  type Frame,
  type Star,
} from './dayNightSwitch';

/* ----------------------------------------------------------------------------- the stops */

/** Left to right: day, the amber night, dark. The order IS the owner's ("left day, middle night, right dark"). */
export const SKY_STOPS = ['light', 'night', 'dark'] as const satisfies readonly ThemeName[];
export type SkyStop = (typeof SKY_STOPS)[number];

/**
 * THE AUTOMATIC WINDOW'S TWO LOOKS, as "Dim to" offers them (the owner, 2026-09-26: *"the dim to
 * should be a toggle like previously but only bettwen dark or night"*): the Theme toggle's own two
 * right-hand stops, in its order — Night, then Dark — so each picture sits where it sits in the
 * toggle above it on the same sheet, its word on the same side of its knob, and the one control is
 * learned once.
 */
export const DIM_STOPS = ['night', 'dark'] as const satisfies readonly SkyStop[];

/**
 * The stops a toggle offers, left to right: two or three of `SKY_STOPS`, in its order, each once.
 * Anything else — a stop twice, the order turned round, one stop — is not a toggle, and gets all
 * three, the Theme toggle every test proves.
 */
export function skyStops(stops?: readonly SkyStop[]): readonly SkyStop[] {
  if (stops === undefined) return SKY_STOPS;
  const places = stops.map(s => SKY_STOPS.indexOf(s));
  const ordered = places.every((p, i) => p >= 0 && (i === 0 || p > (places[i - 1] ?? -1)));
  return stops.length >= 2 && ordered ? stops : SKY_STOPS;
}

/**
 * A stop's place along the track — 0, 1 or 2 on the Theme toggle, 0 or 1 on "Dim to" — and the
 * knob's value is in these units. A stop the toggle does not offer is never asked for (nothing
 * draws it and nothing can tap it); it is answered as the first place, so no arithmetic sees −1.
 */
export const stopIndex = (stop: SkyStop, stops: readonly SkyStop[] = SKY_STOPS): number =>
  Math.max(0, stops.indexOf(stop));

/* ---------------------------------------------------------------------------- the size */

/**
 * The pill. 44 tall because the pill IS the target — each third of it is one stop's tap zone —
 * and 44 is the floor for a target (CLAUDE.md §6). The knob sits `inset` inside every edge, as
 * setup's does, and the `rim` is the theme's hairline drawn inside that inset.
 *
 * ITS WIDTH IS THE ROOM IT IS GIVEN, up to `maxWidth`. The Appearance sheet gives it its body —
 * the window less `space.xxl` either side: 324 pt on a 360 dp Android phone, 339 on a 375 pt
 * iPhone, 360 on a 396 pt window. Past 360 it stops growing: a sky a tablet-width long is a
 * banner, not a switch, and the words already have all the room they want there. `minWidth` is
 * not a clamp; it is the narrowest width the placement is PROVEN at — 272, a 308 pt window, with
 * room below the narrow phones of today — and `themeSkyToggle.test.ts` walks every half point
 * from it to `maxWidth`.
 */
/**
 * HOW FAR THE KNOB TURNS BETWEEN TWO STOPS, in degrees: half a turn, so Light to Dark is ONE turn
 * (the owner, 2026-09-26, "yes do this", of the knob that spun about 2.6 times going from Light to
 * Dark). It was the angle a wheel of the knob's size turns rolling that far without slipping —
 * setup's rule — which over this longer track is two and a half turns and reads as a spin, not a
 * roll. Half a turn a stop still reads as rolling, and every face still arrives upright at its own
 * stop, because each face's turn is measured from there (`themeSkyFrames`' `turn`).
 */
export const ROLL_PER_STRIDE = 180;

export const THEME_SKY_SIZE = {
  height: 44,
  inset: 3,
  rim: 1,
  minWidth: 272,
  maxWidth: 360,
} as const;

/**
 * THE GLYPH AN UNCHOSEN STOP SHOWS: a sun, a crescent or a moon in a box this size — 18, up from 14
 * (the owner, 2026-09-26: *"the moon icons (for night and dark) need tto be highlighted more, in
 * case if user wont understand how to change it"*). At 14, drawn a little dim so the chosen word
 * led, the two stops a parent could go to read as a texture on the sky rather than as places to
 * tap: nothing said "this is a control" but the knob, and the knob is the one place a parent is
 * already at. So each glyph is a third bigger, brighter (`sky.ts`), and sits on a HALO of its own —
 * `MARKER_HALO` across, a soft disc of its ink edged by a fine ring of it — the shape of a button
 * without being one's weight: the knob is 38 and opaque, the chosen word is the whole ink, and the
 * halo is neither.
 */
export const MARKER = 18;
/** The crescent inside that box: a point in from each side, so it weighs what the full moon does. */
export const MARKER_CRESCENT = 16;
/** The lock a locked stop's glyph carries beside it, and the room between the two. */
export const MARKER_LOCK = 12;
export const MARKER_LOCK_GAP = 2;
/**
 * The halo behind an unchosen stop's glyph: a disc this wide, round the 18 pt glyph with 4 pt to
 * spare — or, with a lock beside the glyph, a capsule this TALL round both, the glyph and its lock
 * one thing to tap. 26 is the widest that leaves every word its 1.3× room on the narrowest sheet
 * (at 28 the Theme toggle's "Light" beside a locked Night would have 1.29×; `themeSkyToggle.test.ts`
 * walks every width). Its ring is `MARKER_RING` wide, drawn inside it.
 */
export const MARKER_HALO = 26;
export const MARKER_RING = 1;
/** The glyph's inset inside its halo, all round: the halo is the glyph with this much air. */
export const MARKER_PAD = (MARKER_HALO - MARKER) / 2;
/** How wide a stop's marker is — its halo, which holds the lock too when the stop is sold. */
export const markerWidth = (locked: boolean): number =>
  locked ? MARKER_HALO + MARKER_LOCK_GAP + MARKER_LOCK : MARKER_HALO;
/**
 * The clear room kept between the word and anything else on the track — the knob, a glyph —
 * `space.md`, the gap the design system puts between a label and the thing beside it.
 */
export const WORD_GAP = 8;

/**
 * THE WORD'S SIZE AND HOW FAR IT MAY GROW. `bodyStrong`, the design system's bold 15, read from the
 * type scale so a change there reaches the arithmetic too.
 *
 * `advance` is how wide a character is allowed to be, as a fraction of the size: a BOUND, not an
 * average. The widths of the three words in the face the app ships, read out of its TTF
 * (Hanken Grotesk Bold, 1000 units to the em): "Light" 2.202 em, "Night" 2.387, "Dark" 2.206 —
 * 0.44 to 0.55 em a character, the capital doing most of the work in a short word. The system's
 * bold face, which draws the word for the moment before the app's fonts are in, sets "Night"
 * near 2.5 em. 0.6 covers all of them with room, and `adjustsFontSizeToFit` stays on the Text as
 * the last resort for a word this bound does not cover.
 *
 * `floor` and `ceiling` bound the font scale the word follows. It grows with the phone's text
 * size as far as its room allows (`wordScaleCap`), never past the chrome cap every other capped
 * role stops at (1.6, `CHROME_FONT_CAP` in Text.tsx; docs/MOBILE.md §9), and the placement test
 * holds that the room is never less than 1.3 at any width the sheet can have. `shrink` is how
 * far `adjustsFontSizeToFit` may take a word the bound did not cover: smaller, whole, on one
 * line, rather than cut off with an ellipsis.
 */
export const WORD_TYPE = {
  size: typeScale.bodyStrong.fontSize,
  advance: 0.6,
  floor: 1.3,
  ceiling: 1.6,
  shrink: 0.75,
} as const;

/** A stretch of the track, in the pill's own coordinates. */
export interface Span {
  left: number;
  right: number;
}

export const spanWidth = (s: Span): number => Math.max(0, s.right - s.left);

export interface ThemeSkyGeometry {
  /** The stops it offers, left to right (`skyStops`): every other record is read for these only. */
  stops: readonly SkyStop[];
  width: number;
  height: number;
  inset: number;
  rim: number;
  /** The knob's diameter. */
  knob: number;
  /** How far the knob moves between two neighboring stops. */
  stride: number;
  /** The knob's left edge at rest, at each stop. */
  rest: Record<SkyStop, number>;
  /** The knob's center at rest, at each stop — where that stop's glyph is drawn when it is not chosen. */
  center: Record<SkyStop, number>;
  /**
   * How far the knob turns crossing one stride, in degrees: HALF A TURN, so it turns once going
   * from one end to the other (`ROLL_PER_STRIDE`).
   */
  roll: number;
  /** The two rings of light round the knob, inner and outer diameter. */
  halo: readonly [number, number];
  /** How wide each stop's marker is — its halo, holding its lock too when the stop is sold. */
  marker: Record<SkyStop, number>;
  /**
   * Where each stop's marker starts: centered on the stop, and kept inside the pill's inset where
   * a wide one (a locked stop at an end, on "Dim to") would reach past it.
   */
  markerLeft: Record<SkyStop, number>;
  /** Where each stop's word may sit when it is the chosen one. */
  word: Record<SkyStop, Span>;
  /** The free stretch of the day picture that holds its clouds, and of the dark one its stars. */
  scenery: { light: Span; dark: Span };
  cloud: CloudBox;
  wisp: CloudBox;
  stars: readonly Star[];
  /** Each stop's tap zone: a third of the pill, or half of it on a two-stop toggle. */
  zone: number;
}

/**
 * The cloud and the wisp, setup's two, a third larger for a pill a third taller, as a PAIR: the
 * wisp sits above and to the right of the cloud, as it does on setup's switch, and the pair is
 * centered in the day picture's free stretch. They drift right as the day is covered, the wisp
 * further and sooner, so they part — by less than setup's, because here the next thing to the
 * right is a glyph and not the end of the pill.
 */
const CLOUD_SIZE = { width: 28, height: 14, y: 21, drift: 8, alpha: 1 } as const;
const WISP_SIZE = { dx: 20, width: 17, height: 8.5, y: 9, drift: 11, alpha: 0.7 } as const;

/**
 * The stars, as places in the dark picture's free stretch — the fraction of the way across it,
 * and a height in the pill — so they spread over whatever width the sheet gives. Setup's shapes
 * and sizes, a third larger, and one more, because the stretch is longer.
 */
const STAR_FIELD: readonly (Omit<Star, 'x'> & { across: number })[] = [
  { across: 0.06, y: 12, size: 7.5, kind: 'sparkle', at: 0.45 },
  { across: 0.24, y: 30, size: 2.5, kind: 'dot', at: 0.5 },
  { across: 0.4, y: 16, size: 5, kind: 'sparkle', at: 0.56 },
  { across: 0.57, y: 33, size: 2.5, kind: 'dot', at: 0.62 },
  { across: 0.73, y: 10, size: 3, kind: 'dot', at: 0.67 },
  { across: 0.92, y: 26, size: 6.5, kind: 'sparkle', at: 0.72 },
];

export function themeSkyGeometry(
  width: number,
  locked: Readonly<Partial<Record<SkyStop, boolean>>> = {},
  stops: readonly SkyStop[] = SKY_STOPS,
): ThemeSkyGeometry {
  const offered = skyStops(stops);
  const n = offered.length;
  const { height, inset, rim, maxWidth } = THEME_SKY_SIZE;
  // never narrower than a 44 pt zone a stop, whatever a caller measures on its first frame
  const w = Math.min(Math.max(width, n * height), maxWidth);
  const knob = height - 2 * inset;
  const stride = (w - 2 * inset - knob) / (n - 1);
  const place = (s: SkyStop) => stopIndex(s, offered);
  const rest = {
    light: inset + place('light') * stride,
    night: inset + place('night') * stride,
    dark: inset + place('dark') * stride,
  };
  const center = {
    light: rest.light + knob / 2,
    night: rest.night + knob / 2,
    dark: rest.dark + knob / 2,
  };
  const markerOf = (s: SkyStop): number => markerWidth(!!locked[s]);
  const marker = { light: markerOf('light'), night: markerOf('night'), dark: markerOf('dark') };
  // centered on its stop, and never past the inset: a locked stop at an END is 40 wide round a
  // center 22 from the edge, so on "Dim to" its halo would touch the rim without the clamp
  const leftOf = (s: SkyStop) =>
    Math.min(Math.max(center[s] - marker[s] / 2, inset), w - inset - marker[s]);
  const markerLeft = { light: leftOf('light'), night: leftOf('night'), dark: leftOf('dark') };
  // a marker's near edge, either side of it, with the word's clear room
  const before = (s: SkyStop) => markerLeft[s] - WORD_GAP;
  const after = (s: SkyStop) => markerLeft[s] + marker[s] + WORD_GAP;
  const none: Span = { left: 0, right: 0 };
  let word: Record<SkyStop, Span>;
  let scenery: { light: Span; dark: Span };
  if (n === 3) {
    word = {
      // right of the sun, up to the middle's glyph
      light: { left: rest.light + knob + WORD_GAP, right: before('night') },
      // right of the middle knob, up to the dark glyph
      night: { left: rest.night + knob + WORD_GAP, right: before('dark') },
      // left of the moon, back to the middle's glyph
      dark: { left: after('night'), right: rest.dark - WORD_GAP },
    };
    // each picture's other half: the day's clouds between the middle and the moon's glyph, the
    // dark's stars between the sun's glyph and the middle — never under the word
    scenery = {
      light: { left: after('night'), right: before('dark') },
      dark: { left: after('light'), right: before('night') },
    };
  } else {
    /*
      TWO STOPS: each word keeps the side of its knob it has on the three-stop toggle (the first
      stop's to the right of its knob, the last's to the left) and the ROOM it has there — the
      Theme toggle's span for that word at this same width — so its fit is the one the Theme
      toggle's words are proved to, and it stays beside its knob rather than floating in the
      middle of a sky twice as long. What is left between the word and the other stop's marker is
      the picture's own: the dark's stars, the day's clouds; Night draws nothing there.
    */
    const three = themeSkyGeometry(w, locked, SKY_STOPS);
    const [first = 'night', last = 'dark'] = offered;
    const firstWord: Span = {
      left: rest[first] + knob + WORD_GAP,
      right: Math.min(before(last), rest[first] + knob + WORD_GAP + spanWidth(three.word[first])),
    };
    const lastWord: Span = {
      left: Math.max(after(first), rest[last] - WORD_GAP - spanWidth(three.word[last])),
      right: rest[last] - WORD_GAP,
    };
    word = { light: none, night: none, dark: none, [first]: firstWord, [last]: lastWord };
    const free: Record<SkyStop, Span> = {
      light: none,
      night: none,
      dark: none,
      [first]: { left: firstWord.right + WORD_GAP, right: before(last) },
      [last]: { left: after(first), right: lastWord.left - WORD_GAP },
    };
    scenery = { light: free.light, dark: free.dark };
  }
  const pair = WISP_SIZE.dx + WISP_SIZE.width;
  const cloudLeft = scenery.light.left + (spanWidth(scenery.light) - pair) / 2;
  const cloud: CloudBox = {
    x: cloudLeft,
    y: CLOUD_SIZE.y,
    width: CLOUD_SIZE.width,
    height: CLOUD_SIZE.height,
    drift: CLOUD_SIZE.drift,
    alpha: CLOUD_SIZE.alpha,
  };
  const wisp: CloudBox = {
    x: cloudLeft + WISP_SIZE.dx,
    y: WISP_SIZE.y,
    width: WISP_SIZE.width,
    height: WISP_SIZE.height,
    drift: WISP_SIZE.drift,
    alpha: WISP_SIZE.alpha,
  };
  const field = scenery.dark;
  const stars = STAR_FIELD.map(({ across, ...s }) => ({
    ...s,
    // the fraction of the stretch that is left once the star's own size is kept inside it
    x: field.left + s.size / 2 + across * Math.max(0, spanWidth(field) - s.size),
  }));
  return {
    stops: offered,
    width: w,
    height,
    inset,
    rim,
    knob,
    stride,
    rest,
    center,
    roll: ROLL_PER_STRIDE,
    halo: [knob + 12, knob + 24],
    marker,
    markerLeft,
    word,
    scenery,
    cloud,
    wisp,
    stars,
    zone: w / n,
  };
}

/* --------------------------------------------------------------------------- the word */

/** How wide `label` may be at `scale` × the word's size: characters × the bound (`WORD_TYPE`). */
export const wordWidth = (label: string, scale = 1): number =>
  [...label].length * WORD_TYPE.advance * WORD_TYPE.size * scale;

/**
 * How far the words may grow with the phone's text size and still fit: the largest scale at
 * which every stop's word fits its own span, capped at the chrome cap and never reported below 1
 * (a word that does not fit even at 1 is `adjustsFontSizeToFit`'s to shrink, not this rule's).
 * The Text is handed this as its `maxFontSizeMultiplier`, so the word follows the phone's setting
 * as far as the pill has room and stops there, whole, rather than truncating or clipping.
 */
export function wordScaleCap(
  g: ThemeSkyGeometry,
  labels: Readonly<Partial<Record<SkyStop, string>>>,
): number {
  // the stops it offers only: a word for a stop it does not draw needs no room
  const room = g.stops.map(s => spanWidth(g.word[s]) / Math.max(1, wordWidth(labels[s] ?? '')));
  return Math.min(WORD_TYPE.ceiling, Math.max(1, Math.min(...room)));
}

/* ------------------------------------------------------------------------ the crescent */

/**
 * A crescent in a `size` square: the disc of the square with a second disc, up and to the right
 * of it, taken out — the orientation of the app's own moon glyph (paths.ts), so the crescent the
 * toggle draws is the one a parent already reads as night. The path goes the long way round the
 * outer circle from one horn to the other and comes back along the inner one.
 *
 * `cut` is the second disc's radius and `offset` how far its center sits from the first's, both
 * as fractions of the outer radius. The defaults leave the lit limb about two fifths of the disc
 * across at its thickest (1 + 0.62 − 0.84 = 0.78 of a radius): plainly a crescent at the knob's
 * size, still a shape at a glyph's.
 */
export function crescentPath(size: number, cut = 0.84, offset = 0.62): string {
  const r = size / 2;
  const rc = cut * r;
  const d = offset * r;
  const u = Math.SQRT1_2;
  // along the line between the centers, how far from the outer one the chord between the horns is
  const x = (d * d + r * r - rc * rc) / (2 * d);
  const h = Math.sqrt(Math.max(0, r * r - x * x));
  const f = (n: number) => Number(n.toFixed(3));
  // the horns: the chord's two ends, lower right first (the direction to the cut is up-right)
  const p1 = [r + u * (x + h), r + u * (h - x)] as const;
  const p2 = [r + u * (x - h), r - u * (x + h)] as const;
  return (
    `M${f(p1[0])} ${f(p1[1])}` +
    `A${f(r)} ${f(r)} 0 1 1 ${f(p2[0])} ${f(p2[1])}` +
    `A${f(rc)} ${f(rc)} 0 0 0 ${f(p1[0])} ${f(p1[1])}Z`
  );
}

/**
 * The sun glyph's rays, as `[x1, y1, x2, y2]` in a `MARKER` box: eight, from just outside the
 * disc. A sun has rays and a moon has none — the difference between the two glyphs is their
 * SHAPE, so a parent who cannot tell the colors apart can still tell them apart. The 14 pt glyph's
 * own drawing, scaled to 18 (2026-09-26): rays from 6.0 to 8.1 round a 3.7 disc, a 1.6 line.
 */
export const SUN_RAYS: readonly (readonly [number, number, number, number])[] = Array.from(
  { length: 8 },
  (_, i) => {
    const a = (i * Math.PI) / 4;
    const [c, s] = [Math.cos(a), Math.sin(a)];
    const f = (n: number) => Number(n.toFixed(3));
    const mid = MARKER / 2;
    return [f(mid + 6 * c), f(mid + 6 * s), f(mid + 8.1 * c), f(mid + 8.1 * s)] as const;
  },
);
/** How heavy a ray is drawn, round-capped: the cap reaches half of it past the ray's end. */
export const SUN_RAY_STROKE = 1.6;
/** The sun glyph's disc, the full moon glyph's disc and its two craters, in a `MARKER` box. */
export const SUN_GLYPH_R = 3.7;
export const MOON_GLYPH_R = 6.9;
export const MOON_GLYPH_CRATERS = [
  { cx: 11.2, cy: 7.1, r: 1.9 },
  { cx: 6.9, cy: 11.3, r: 1.4 },
] as const;

/* --------------------------------------------------------------------------- the move */

/** One stop's move: setup's flip. A jump across both is a little longer, never double. */
export const THEME_SKY_MS = DAY_NIGHT_MS;

/**
 * THE TWO CURVES, one family. `settle` is setup's own — a slow start and a small overshoot that
 * comes back — and it is the curve for arriving at the MIDDLE, where there is room past the rest
 * for the knob to carry into and come back from. `land` is the same curve with the overshoot
 * taken out (its last control point at 1, not 1.3), for arriving at either END: the stride here
 * is five times setup's, so setup's 4.5% overshoot would be seven points and the rim is three
 * away. A ball rolling into the end of its track stops there; it does not go through the wall.
 */
export const SKY_EASE = {
  settle: DAY_NIGHT_EASE,
  land: [0.5, 0, 0.25, 1],
} as const satisfies Record<string, readonly [number, number, number, number]>;
export type SkyEase = keyof typeof SKY_EASE;

/** How long a move of `distance` stops takes: 560 ms for one, 728 for two, a little less for less. */
export const moveMs = (distance: number): number =>
  Math.round(THEME_SKY_MS * (0.7 + 0.3 * Math.min(Math.max(distance, 0), 2)));

/** A cubic Bézier easing at time `x` in [0, 1] — `Easing.bezier`'s own arithmetic, for the planner. */
export function easeAt(
  [x1, y1, x2, y2]: readonly [number, number, number, number],
  x: number,
): number {
  // exactly where it starts and where it ends, not a halving's hair away from either
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const t = x;
  const bez = (s: number, a: number, b: number) =>
    3 * (1 - s) ** 2 * s * a + 3 * (1 - s) * s * s * b + s ** 3;
  // x(s) is increasing on [0, 1] for control points inside it, so halving finds s for t
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 40; i += 1) {
    const mid = (lo + hi) / 2;
    if (bez(mid, x1, x2) < t) lo = mid;
    else hi = mid;
  }
  return bez((lo + hi) / 2, y1, y2);
}

/** A move in flight: where the knob set off from, where to, when, and on which curve. */
export interface SkyMotion {
  from: number;
  to: SkyStop;
  startedAt: number;
  duration: number;
  ease: SkyEase;
}

/** Where the knob is, in stops, `now` — the planner's estimate; the native driver has the truth. */
export function knobAt(m: SkyMotion, now: number, stops: readonly SkyStop[] = SKY_STOPS): number {
  const x = m.duration <= 0 ? 1 : (now - m.startedAt) / m.duration;
  return m.from + (stopIndex(m.to, stops) - m.from) * easeAt(SKY_EASE[m.ease], x);
}

/**
 * WHAT A TAP DOES TO THE THREE VALUES. The layers are stacked day, dark, night, bottom to top
 * (`skyWeights`), and the day is always fully drawn — so the pill is never see-through, whatever
 * the other two are doing:
 *
 *   to Light   night → 0, dark → 0
 *   to Dark    night → 0, dark → 1
 *   to Night   night → 1, and dark is HELD where it is — Night arrives over whatever is showing
 *
 * So Light ↔ Dark never touches the Night layer: it is 0 at the start, 0 at the end and 0 at
 * every frame between, and the amber picture cannot flash up on the way across. Every move from
 * rest is exactly two pictures cross-fading, the old one out and the new one in.
 *
 * THE ONE SNAP, and why it is invisible. Leaving Night, the Dark layer under it may be 0 or 1
 * depending on where the parent came from. While Night rests fully drawn it hides everything
 * under it, so Dark is SET to where the move is going before anything animates — then Night
 * fades off it, and Night → Light shows no dark on the way, nor Night → Dark any day.
 *
 * A TAP MID-ROLL re-targets: every value animates on from wherever it is, so the picture blends
 * from the mix on screen to the new stop without a jump, and the knob turns round where it is.
 * The snap is only ever taken from rest, when it cannot be seen. The knob's own position mid-roll
 * is not known to JavaScript on the native driver, so `knobAt` estimates it from the clock and
 * the curve — only to size the move's duration, never to place anything.
 *
 * Under REDUCE MOTION nothing animates: the three values are set to where the move ends
 * (docs/DESIGN_SYSTEM.md §7), and the picture simply IS the new stop.
 *
 * ON "DIM TO" (`DIM_STOPS`, Night and Dark) the same rules hold, and the day is never shown: a move
 * to Dark sets the Dark layer, a move to Night holds it, and the one snap — leaving a Night at rest
 * — sets it to 1 under the Night before it fades. Both stops are ENDS there, so both land.
 */
export interface SkyPlan {
  animate: boolean;
  /** The knob's position as the move begins, in stops — the next re-target's starting point. */
  from: number;
  /** Where the knob goes, in stops: 0, 1 or 2 on the Theme toggle, 0 or 1 on "Dim to". */
  pos: number;
  /** Set before anything moves: the Dark layer under a Night at rest, which hides it entirely. */
  snapDark?: 0 | 1;
  night: 0 | 1;
  /** Where the Dark layer goes; absent, it is held where it is. */
  dark?: 0 | 1;
  duration: number;
  ease: SkyEase;
}

export function planSkyMove(
  motion: SkyMotion | null,
  at: SkyStop,
  to: SkyStop,
  now: number,
  reduceMotion: boolean,
  stops: readonly SkyStop[] = SKY_STOPS,
): SkyPlan {
  const offered = skyStops(stops);
  const moving = motion !== null && now < motion.startedAt + motion.duration;
  const from = moving ? knobAt(motion, now, offered) : stopIndex(at, offered);
  const pos = stopIndex(to, offered);
  // a stop between two others has room past it to settle into; an end has the rim
  const middle = pos > 0 && pos < offered.length - 1;
  const night = to === 'night' ? 1 : 0;
  const dark = to === 'night' ? {} : { dark: to === 'dark' ? (1 as const) : (0 as const) };
  // from REST on Night only: then Night hides the Dark layer completely, and nothing else does
  const snap =
    !moving && at === 'night' && to !== 'night'
      ? { snapDark: to === 'dark' ? (1 as const) : (0 as const) }
      : {};
  if (reduceMotion)
    return { animate: false, from: pos, pos, night, ...dark, ...snap, duration: 0, ease: 'land' };
  return {
    animate: true,
    from,
    pos,
    night,
    ...dark,
    ...snap,
    duration: moveMs(Math.abs(pos - from)),
    ease: middle ? 'settle' : 'land',
  };
}

/**
 * How much of each picture reaches the screen, for the Night and Dark layers' opacities: day at
 * the bottom and always whole, dark over it, night on top. The component stacks its layers in
 * exactly this order, and the test holds it to that.
 */
export function skyWeights(night: number, dark: number): Record<SkyStop, number> {
  return { light: (1 - night) * (1 - dark), dark: (1 - night) * dark, night };
}

/* ----------------------------------------------------------------- which set is drawn */

/**
 * WHICH SET TO KEEP DRAWING WHILE A MOVE RUNS, as the theme the pictures are drawn for. Tapping
 * Night repaints the whole app amber in the same frame the knob starts to roll, and the toggle
 * would follow it into the amber set at once — the cobalt day it is rolling away from turning
 * brown before the roll has begun, the jump `sky.ts` exists to prevent. So a move to Night that
 * starts from the plain set (`shown` is light or dark, which draw the same pictures) KEEPS that
 * set until the knob arrives; the component lets go when the move finishes. Arriving is when the
 * change is free: Night's picture is the same object in both sets and, at rest, hides the other
 * two.
 *
 * Every other move follows the painted theme at once. Leaving Night for Light or Dark, the app
 * repaints while the toggle still rests on Night, which hides every picture that changes; and a
 * move that repaints nothing has nothing to hold. Returns the theme to keep drawing for, or null.
 */
export function skyHold(
  shown: ThemeName,
  to: SkyStop,
  painted: ThemeName,
  reduceMotion: boolean,
): ThemeName | null {
  return !reduceMotion && to === 'night' && shown !== 'night' && painted === 'night' ? shown : null;
}

/* ------------------------------------------------------------------------- the frames */

const frame = (
  inputRange: readonly number[],
  outputRange: readonly number[],
  extrapolate: Frame['extrapolate'] = 'clamp',
): Frame => ({ inputRange, outputRange, extrapolate });

/** How long a star takes to come on, dip once and settle: setup's twinkle. */
const TWINKLE = [0, 0.12, 0.2, 0.26] as const;

export interface ThemeSkyFrames {
  /** Of `pos`: the knob's travel, clamped to the two ends so nothing can carry it into the rim. */
  knobX: Frame;
  /** Of `pos`: a little longer between stops, round at every one. */
  knobStretch: Frame;
  /**
   * Of `pos`, in degrees: each face's turn. One wheel rolls, so every face turns by the same
   * amount, but each is drawn upright at its OWN stop — the sun at the left, the crescent in the
   * middle, the moon at the right — and so each is offset to arrive upright there.
   */
  turn: Record<SkyStop, Frame>;
  /** Of `pos`: the light round the knob — full round the sun, fainter round the moon, none at Night. */
  haloOpacity: Frame;
  haloScale: Frame;
  /** Of the Dark layer's value and the Night layer's: each sky, with its glyphs and its word. */
  darkSky: Frame;
  nightSky: Frame;
  /** Of the same two values: the moon's face and the crescent's, over the sun's. */
  moonFace: Frame;
  crescentFace: Frame;
  /**
   * Of either value: 1 until the face above is whole, then 0, out of sight under it. The sun is
   * multiplied by it for both values and the moon for Night's (`Animated.multiply`), so at rest
   * only the face on show is drawn — three circles of one size stacked would each leave its
   * anti-aliased edge round the next, a gold ring round the moon — while all the way through a
   * move the face below stays whole until the one above it is, and the knob is never see-through.
   */
  covered: Frame;
  /** Of the Night layer's value: the knob's shadow, gone before the amber sky is. */
  shadow: Frame;
  /** Of how much the day is covered (night + dark): the clouds part and go. */
  cloudX: Frame;
  cloudOpacity: Frame;
  wispX: Frame;
  wispOpacity: Frame;
  /** Of the Dark layer's value: the stars slide in and twinkle on, one after another. */
  starsX: Frame;
  stars: readonly { opacity: Frame; scale: Frame }[];
}

/**
 * The light round the knob AT each stop — full round the sun, fainter round the moon, none at
 * Night — and how far it has drawn in there; between two stops it is always 0.3 and 0.72.
 */
const HALO_AT: Readonly<Record<SkyStop, { opacity: number; scale: number }>> = {
  light: { opacity: 1, scale: 1 },
  night: { opacity: 0, scale: 0.72 },
  dark: { opacity: 0.6, scale: 1 },
};
const HALO_BETWEEN = { opacity: 0.3, scale: 0.72 } as const;

export function themeSkyFrames(g: ThemeSkyGeometry): ThemeSkyFrames {
  const R = g.roll;
  const last = g.stops.length - 1;
  // every stop, and the point half way to the next: 0, 0.5, 1 … the last stop
  const points = Array.from({ length: 2 * last + 1 }, (_, i) => i / 2);
  const along = (at: (s: SkyStop) => number, between: number) =>
    points.map(p => (Number.isInteger(p) ? at(g.stops[p] ?? 'light') : between));
  // each face upright at its own stop, turning half a turn a stride either side of it
  const turn = (s: SkyStop) => {
    const i = g.stops.indexOf(s);
    // `0 - …`, not `-…`: a face upright at the first stop turns from 0, never from −0
    return frame([0, last], [0 - i * R, (last - i) * R]);
  };
  return {
    knobX: frame([0, last], [0, last * g.stride]),
    knobStretch: frame(
      points,
      points.map(p => (Number.isInteger(p) ? 1 : 1.08)),
    ),
    turn: { light: turn('light'), night: turn('night'), dark: turn('dark') },
    haloOpacity: frame(
      points,
      along(s => HALO_AT[s].opacity, HALO_BETWEEN.opacity),
    ),
    haloScale: frame(
      points,
      along(s => HALO_AT[s].scale, HALO_BETWEEN.scale),
    ),
    darkSky: frame([0.1, 0.9], [0, 1]),
    nightSky: frame([0.1, 0.9], [0, 1]),
    // the new face turns into place over the middle of the move, as setup's moon does
    moonFace: frame([0.4, 0.7], [0, 1]),
    crescentFace: frame([0.4, 0.7], [0, 1]),
    // from the point the face above is whole (0.7, the end of its fade), a hundredth to go out
    covered: frame([0.7, 0.71], [1, 0]),
    shadow: frame([0, 0.5], [1, 0]),
    cloudX: frame([0, 0.6], [0, g.cloud.drift]),
    cloudOpacity: frame([0, 0.45], [g.cloud.alpha, 0]),
    wispX: frame([0, 0.5], [0, g.wisp.drift]),
    wispOpacity: frame([0, 0.35], [g.wisp.alpha, 0]),
    starsX: frame([0.3, 1], [-6, 0]),
    stars: g.stars.map(s => ({
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
