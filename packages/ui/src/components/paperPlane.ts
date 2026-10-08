/**
 * THE PAPER PLANE the shopping list's Share folds and throws, as numbers (the owner, 2026-09-25, of
 * the "that's cool" list: *"Let's try doing everything. I will then review"*; and 2026-09-26: *"the
 * share button animation looks very minimal, like its not showing anything. make it look more better
 * and feel better"*). Pure TypeScript, tested in node like `tickDraw.ts`; `PaperPlane.tsx` only hands
 * these numbers to a few SVG drawings and to `Animated.Value#interpolate`.
 *
 * WHY THE FIRST ONE READ AS NOTHING, measured rather than guessed:
 *   - it was SMALLER THAN THE GLYPH it came out of: a 22 pt box whose sheet was 13 pt across, laid
 *     over the button's 18 pt icon, so the paper never showed outside the button;
 *   - it folded UNDER THE THUMB, on the glyph the finger had just lifted off;
 *   - it was OVER in 620 ms and flew 90 pt;
 *   - it flew INTO A WALL: the button is the page's first row, 29 pt under the top of the scroller,
 *     and the plane climbed 60 pt from there inside the ScrollView, which clips — it was cut off at
 *     the top bar's edge a third of the way up;
 *   - and the platform's sheet was asked for at 180 ms, while the paper was still folding, so its
 *     dim and its rise took the eye before there was a plane to look at.
 *
 * WHAT IT DOES NOW, in ms from the tap (`PLANE_MS` in all). It is drawn in the page's overlay, over
 * everything on the page and clipped only where the page is (`PaperPlane.tsx`):
 *     0– 70  a sheet of paper in the accent comes out of the Share glyph and slides left into the
 *            gap between the title and the button, growing past full size and settling — clear of
 *            the thumb, 39 × 30 pt;
 *    70–140  its two front corners fold in to the crease, one after the other, each lifting toward
 *            the eye and coming down on the sheet with the paper's back, a tone away, showing: the
 *            nose of a dart. The first corner lands at 120 — felt as a TAP;
 *   145–205  it folds in half along the crease, edge on, and the plane opens out of the same line:
 *            the wing in the accent, the fold a tone away, 42 pt nose to tail;
 *   205–250  it is drawn back, nose up and squashed a little, and at 250 THROWN — felt as a SUCCESS;
 *   250–700  it noses over into a dive across the page, pulls up through one loop in the upper middle
 *            of the page and climbs away to the left, banking into every turn, off the left edge of
 *            the phone, shrinking and fading as it goes; a short dotted trail marks where it has just
 *            been and fades behind it.
 *   At 700   it has gone, and the share sheet is asked for.
 *
 * THE SHARE SHEET WAITS FOR THE PLANE (the owner, 2026-09-26, on an Android phone: *"share
 * animation (plane did not complete) before the pop up show up. can we wait until animation
 * complete, then pop up show up? … when we close the share log it's just gone"*). It used to be asked
 * for at 480 ms, a fixed time into a 900 ms flight. Android's sheet is another activity: the app
 * paused under it with the plane frozen over "the" of "2 of 6 in the basket", and on the way back
 * its time had run out, so it was simply gone. Now the caller asks for the sheet when the flight
 * ENDS — `PaperPlane`'s `onLanded`, fired once the plane is off the page, or at once when there is
 * no plane to fly — with `SHARE_SAFETY_MS` from the tap as the latest it ever waits, so a lost end
 * can never keep a list from being sent.
 *
 * AND SO IT IS SHORT: 700 ms from the tap, down from 900, because a parent is waiting for the sheet
 * through all of it. Every moment of the fold is kept and a little quicker (each corner 50 ms, the
 * throw at 250), and the same path is flown in 450 ms instead of 610 — thrown harder, the same shape.
 * The tap is still answered at once: the paper comes out of the button on the next frame. Under
 * reduce motion and in the amber Night theme nothing moves (`motionStill`): no plane, and the sheet
 * opens on the tap, as it always did.
 *
 * EVERY TURN IS ONE AXIS PER VIEW. The corners fold about their diagonals, which takes a turn about a
 * tilted line; that is built from three views — a flat turn, a `rotateY`, the flat turn back — and
 * never as one transform list, because Android's view has no single property for a tilted 3-D turn
 * and decomposes a combined one into angles it applies in its own order. Every `rotateX`/`rotateY`
 * here also stays inside ±90°, where that decomposition is unambiguous: a fold that passes edge on is
 * two drawings, the one before and its mirror after, swapped at the moment neither shows. Opacity and
 * transforms only, all of it on the native driver.
 */
import type { HapticKind } from '../feedback/haptics';
import type { ThemeName } from '../theme/theme';
import type { Frame } from './dayNightSwitch';
import { motionStill } from './tickDraw';

/* ------------------------------------------------------------------------------ the drawings */

/**
 * The plane's box, in points. Both drawings fill most of it: the sheet is 39 × 30 and the plane 42
 * nose to tail — about the Share button's height, so it is seen from arm's length.
 */
export const PLANE_BOX = 52;
/** Both drawings are on the icon set's 24 grid (`paths.ts`). */
export const PLANE_GRID = 24;
/** One grid unit, in points. */
export const PLANE_UNIT = PLANE_BOX / PLANE_GRID;
/** THE CREASE: the box's own horizontal center line. The fold in half and the plane opening both turn about it. */
export const CREASE_Y = PLANE_GRID / 2;

type Point = readonly [number, number];
const poly = (points: readonly Point[]): string =>
  `${points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x} ${y}`).join('')}Z`;

/**
 * THE SHEET: letter-shaped, its long side along the crease — the length a dart is folded along —
 * with its front (the left end, where the nose will be) facing the way it is about to fly.
 */
export const SHEET = { left: 3, top: 5, right: 21, bottom: 19 } as const;
/** A front corner folds in to the crease: its two short sides are half the sheet's height. */
export const CORNER = (SHEET.bottom - SHEET.top) / 2;

/** `p` mirrored across the line through `a` and `b`: where a folded corner lies. */
export function mirrorAcross(p: Point, a: Point, b: Point): Point {
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
  const k = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy);
  const foot: Point = [a[0] + k * dx, a[1] + k * dy];
  return [2 * foot[0] - p[0], 2 * foot[1] - p[1]];
}

export interface PlaneCorner {
  name: 'top' | 'bottom';
  /** The square the corner folds in, on the grid. Its diagonal is the fold line. */
  square: { x: number; y: number; size: number };
  /** The fold line, from end to end. */
  line: readonly [Point, Point];
  /**
   * The fold line's tilt off the vertical, in degrees clockwise (`rotate`'s own sense): 45 is `/`,
   * −45 is `\`. The corner's view is turned by it, its `rotateY` is then about the fold line, and its
   * drawing is turned back by it (the header says why that is three views and not one list).
   */
  tilt: 45 | -45;
  /** The corner as it lies before the fold. */
  flat: readonly Point[];
  /** And after it: its mirror across the fold line, lying on the sheet. */
  folded: readonly Point[];
  /** When it starts to fold, in ms from the tap. */
  at: number;
}

/** To a thousandth of a grid unit: a mirrored point is exact, less the float's last digit. */
const tidy = ([x, y]: Point): Point => [Math.round(x * 1000) / 1000, Math.round(y * 1000) / 1000];

const cornerOf = (name: PlaneCorner['name'], at: number): PlaneCorner => {
  const y = name === 'top' ? SHEET.top : CREASE_Y;
  const nose: Point = [SHEET.left, CREASE_Y];
  // the sheet's own corner, the one that folds in
  const tip: Point = [SHEET.left, name === 'top' ? SHEET.top : SHEET.bottom];
  // where the fold line meets the sheet's long edge
  const edge: Point = [SHEET.left + CORNER, tip[1]];
  const line: readonly [Point, Point] = name === 'top' ? [edge, nose] : [nose, edge];
  const flat: readonly Point[] = name === 'top' ? [tip, edge, nose] : [nose, tip, edge];
  return {
    name,
    square: { x: SHEET.left, y, size: CORNER },
    line,
    tilt: name === 'top' ? 45 : -45,
    flat,
    folded: flat.map(p => tidy(mirrorAcross(p, line[0], line[1]))),
    at,
  };
};

/** The corner's own path, and the box its drawing is cut from — the corner's square on the grid. */
export const cornerPath = (points: readonly Point[]): string => poly(points);
export const cornerViewBox = (c: PlaneCorner): string =>
  `${c.square.x} ${c.square.y} ${c.square.size} ${c.square.size}`;

/**
 * THE SHEET WITHOUT ITS CORNERS: what stays flat while the corners fold in. The corners are drawn
 * over it in their own views, so when one lifts, the paper it was is lifting — nothing is left
 * behind where it lay.
 */
export const SHEET_BODY = poly([
  [SHEET.left, CREASE_Y],
  [SHEET.left + CORNER, SHEET.top],
  [SHEET.right, SHEET.top],
  [SHEET.right, SHEET.bottom],
  [SHEET.left + CORNER, SHEET.bottom],
]);
/** The crease, end to end: pressed into the paper before it is folded along. */
export const SHEET_CREASE_PATH = `M${SHEET.left} ${CREASE_Y}L${SHEET.right} ${CREASE_Y}`;

/**
 * THE PLANE, pointing left — where it is about to go — as two faces that meet along the crease: the
 * WING above it, the big flat face, in the accent; and the FOLD under it, a tone away, which is what
 * makes it folded paper rather than a flat arrow. Its crease, nose to notch, lies on the sheet's, so
 * the fold between the two drawings has one axis.
 */
export const PLANE_NOSE = [2.5, CREASE_Y] as const;
export const PLANE_WING_TIP = [22, 4] as const;
export const PLANE_NOTCH = [18.5, CREASE_Y] as const;
export const PLANE_TAIL = [21.5, 20.5] as const;
export const PLANE_WING = poly([PLANE_NOSE, PLANE_WING_TIP, PLANE_NOTCH]);
export const PLANE_FOLD = poly([PLANE_NOSE, PLANE_NOTCH, PLANE_TAIL]);
/** Which way the drawings point, in degrees clockwise from pointing right: left. */
export const DRAWN_HEADING = 180;

/** The camera for a corner's turn: close, so a 15 pt corner visibly lifts toward the eye. */
export const CORNER_PERSPECTIVE = 80;
/** The camera for the fold in half and the plane opening, over the whole box. */
export const PLANE_PERSPECTIVE = 180;

/* ------------------------------------------------------------------------------- the timeline */

/**
 * The whole of it, from the tap to the plane gone — and so how long the share sheet waits. 700 at
 * most: a parent is waiting on it (the header says what was taken out of the 900 it was).
 */
export const PLANE_MS = 700;
/** The sheet is out of the glyph, in the clear and full size. */
export const SHEET_OUT_MS = 70;
/** One corner's fold: up to edge on, then down onto the sheet. */
export const CORNER_MS = 50;
/** The corners fold one after the other, so each is seen: the top one first. */
export const CORNER_AT = { top: SHEET_OUT_MS, bottom: SHEET_OUT_MS + 20 } as const;
export const PLANE_CORNERS: Readonly<Record<PlaneCorner['name'], PlaneCorner>> = {
  top: cornerOf('top', CORNER_AT.top),
  bottom: cornerOf('bottom', CORNER_AT.bottom),
};
/** The first corner lands: the first crease, and what the fold is felt as. */
export const PLANE_CREASE_MS = CORNER_AT.top + CORNER_MS;
/** The sheet starts to fold in half. */
export const HALVE_MS = 145;
/** Edge on: the sheet gives way to the plane, on the same line, where neither covers anything. */
export const PLANE_FOLDED_MS = 175;
/** The plane is open. The fold, from the tap to here, is a fifth of a second. */
export const PLANE_OPEN_MS = 205;
/** Drawn back, and thrown: 130 ms after the crease, so the two are felt as two. */
export const PLANE_LAUNCH_MS = 250;
/**
 * THE LATEST THE SHARE SHEET WAITS, from the tap. It is asked for when the flight ends
 * (`PaperPlane`'s `onLanded`) — this is only for an end that is never heard, so a list is always
 * sent. Past `PLANE_MS` by the time a plane can take to leave: the tap's re-render, the two
 * measurements on the throw and the start of the run, on a busy phone — any sooner and a plane
 * that set off late would be cut short again, the very thing this waits to avoid.
 */
export const SHARE_SAFETY_MS = PLANE_MS + 300;
/** From here to the end it fades, climbing away off the page. */
export const PLANE_FADE_MS = 610;
/** From here it recedes, as a thing flying away from the eye does. */
export const PLANE_RECEDE_MS = 530;

/* ---------------------------------------------------------------------------- the flight path */

/**
 * Where the sheet folds, from the glyph's center, in points: left of the button — the gap between
 * the title and it — and level with it. The button's left edge is 23 pt left of its glyph (`Button`
 * `sm`: 14 of padding, half an 18 glyph), so the sheet, 39 wide, stands 16 pt clear of it, and the
 * plane, drawn back toward it before the throw, still 8.
 */
export const FOLD_SPOT = { x: -60, y: 2 } as const;
/** How far it is drawn back before the throw: away from where it is about to go, and a little up. */
export const WIND_BACK = { x: 6, y: -2 } as const;
/** Where the throw starts: the fold spot, drawn back. */
export const WIND_SPOT = { x: FOLD_SPOT.x + WIND_BACK.x, y: FOLD_SPOT.y + WIND_BACK.y } as const;
/**
 * The heading it is thrown on, degrees clockwise from pointing right — `rotate`'s own sense, on a
 * screen whose y runs down: left, with the nose ten degrees up.
 */
export const LAUNCH_HEADING = 190;

/** One leg of the flight: `length` points of path, turning `turn` degrees at an even rate (+ is clockwise). */
export interface PlaneLeg {
  name: 'nose over' | 'dive' | 'loop' | 'climb' | 'away';
  length: number;
  turn: number;
}

/** The loop's radius: 72 pt across, near twice the plane's length, so it reads as a loop and not a spin. */
export const LOOP_RADIUS = 36;

/**
 * THE FLIGHT, from the throw: it noses over into a dive down and across the page, pulls up and levels
 * out at the loop's foot, goes once round the loop — up, over on its back, down — and climbs away to
 * the left, off the edge. It is laid out for the shopping list's first row, where the Share button
 * is: the dive is what takes the loop down far enough to stay on the page above it.
 */
export const PLANE_LEGS: readonly PlaneLeg[] = [
  { name: 'nose over', length: 56, turn: -80 },
  { name: 'dive', length: 96, turn: 70 },
  { name: 'loop', length: 2 * Math.PI * LOOP_RADIUS, turn: 360 },
  { name: 'climb', length: 40, turn: 20 },
  { name: 'away', length: 200, turn: 0 },
];
export const PLANE_PATH_LENGTH = PLANE_LEGS.reduce((n, l) => n + l.length, 0);

const rad = (deg: number): number => (deg * Math.PI) / 180;

export interface PathPoint {
  /** From the glyph's center, in points; y runs down. */
  x: number;
  y: number;
  /** Degrees clockwise from pointing right, unwrapped: the loop takes it past 360. */
  heading: number;
}

/** Where the plane is `s` points along its path, and which way it points. Each leg is an arc, so this is exact. */
export function planePoint(s: number): PathPoint {
  let x: number = WIND_SPOT.x;
  let y: number = WIND_SPOT.y;
  let heading = LAUNCH_HEADING;
  let left = Math.min(Math.max(s, 0), PLANE_PATH_LENGTH);
  for (const leg of PLANE_LEGS) {
    if (left <= 0) break;
    const d = Math.min(left, leg.length);
    const turn = (leg.turn * d) / leg.length;
    const [h0, h1] = [rad(heading), rad(heading + turn)];
    if (leg.turn === 0) {
      x += d * Math.cos(h0);
      y += d * Math.sin(h0);
    } else {
      // an arc of radius r: heading and position both follow from how far round it has gone
      const r = leg.length / rad(leg.turn);
      x += r * (Math.sin(h1) - Math.sin(h0));
      y -= r * (Math.cos(h1) - Math.cos(h0));
    }
    heading += turn;
    left -= d;
  }
  return { x, y, heading };
}

/**
 * HOW FAST, AS IT GOES: relative speeds at moments of the flight (ms from the tap), joined by
 * straight lines — thrown hard, slowest over the top of the loop, fastest as it leaves. Scaled so the
 * flight covers the whole path by `PLANE_MS`: about 1.7 pt a millisecond off the hand, 1.1 over the
 * top (it was 1.2 and 0.8 over 610 ms; the moments are where they were, as parts of the flight).
 */
export const FLIGHT_SPEED: readonly (readonly [number, number])[] = [
  [PLANE_LAUNCH_MS, 1.25],
  [346, 1],
  [442, 0.8],
  [530, 0.95],
  [PLANE_MS, 1.25],
];

function rawDistance(ms: number): number {
  let covered = 0;
  for (let i = 1; i < FLIGHT_SPEED.length; i += 1) {
    const [t0, v0] = FLIGHT_SPEED[i - 1] ?? [0, 0];
    const [t1, v1] = FLIGHT_SPEED[i] ?? [0, 0];
    if (ms <= t0) break;
    const u = Math.min(ms, t1) - t0;
    covered += (u * (2 * v0 + ((v1 - v0) * u) / (t1 - t0))) / 2;
  }
  return covered;
}
const PACE = PLANE_PATH_LENGTH / rawDistance(PLANE_MS);

/** How far along its path the plane is, `ms` after the tap: nothing before the throw, all of it at the end. */
export const distanceAt = (ms: number): number => PACE * rawDistance(ms);

/** When the plane is `s` points along its path, in ms from the tap. */
export function timeAt(s: number): number {
  if (s <= 0) return PLANE_LAUNCH_MS;
  if (s >= PLANE_PATH_LENGTH) return PLANE_MS;
  let [lo, hi] = [PLANE_LAUNCH_MS, PLANE_MS];
  for (let i = 0; i < 40; i += 1) {
    const mid = (lo + hi) / 2;
    if (distanceAt(mid) < s) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * THE BANK: a plane seen from above leans into a turn, and its wing is foreshortened across the way
 * it flies — `scaleY` of the drawing, whose crease runs along its own x. Deepest in the tightest turn,
 * level on a straight; read over a short stretch of path either side, so it rolls into a turn and
 * out of it rather than snapping, and passes through level where one turn hands over to the other.
 */
export const PLANE_BANK = 0.26;
const BANK_REACH = 12;
const STEEPEST = Math.max(...PLANE_LEGS.map(l => Math.abs(l.turn / l.length)));

export function bankAt(s: number): number {
  const lo = Math.max(0, s - BANK_REACH);
  const hi = Math.min(PLANE_PATH_LENGTH, s + BANK_REACH);
  if (hi <= lo) return 1;
  const rate = Math.abs(planePoint(hi).heading - planePoint(lo).heading) / (hi - lo);
  return 1 - PLANE_BANK * Math.min(1, rate / STEEPEST);
}

/* ------------------------------------------------------------------------------- the launch */

export interface PlaneFeel {
  /** In ms from the tap. */
  at: number;
  kind: HapticKind;
}

export interface PlaneLaunch {
  /**
   * Whether a plane is drawn at all. With one, the share sheet waits for its flight to end
   * (`PaperPlane`'s `onLanded`); with none, it is asked for on the tap.
   */
  fly: boolean;
  /**
   * The latest the share sheet is asked for, in ms from the tap, if the flight's end is never
   * heard (`SHARE_SAFETY_MS`); 0 with no plane — at once.
   */
  shareBy: number;
  /** What the tap is felt as, and when. */
  felt: readonly PlaneFeel[];
}

/**
 * WHAT A TAP ON SHARE DOES BESIDES SHARING. With a plane: the crease is felt as a tap, the throw as a
 * success, and the sheet waits for the plane to be gone — at the flight's end, or `SHARE_SAFETY_MS`
 * after the tap if that end is lost. Under reduce motion and in the amber Night theme
 * (`motionStill`): no plane, nothing waits, and the send is felt as a success on the tap — the haptic
 * is not motion, so it stays.
 */
export function planeLaunch(reduceMotion: boolean, theme: ThemeName): PlaneLaunch {
  return motionStill(reduceMotion, theme)
    ? { fly: false, shareBy: 0, felt: [{ at: 0, kind: 'success' }] }
    : {
        fly: true,
        shareBy: SHARE_SAFETY_MS,
        felt: [
          { at: PLANE_CREASE_MS, kind: 'tap' },
          { at: PLANE_LAUNCH_MS, kind: 'success' },
        ],
      };
}

/**
 * Where the plane comes from, in the button's own coordinates: the center of its leading glyph,
 * which a compact button draws `pad` in from its left edge, `glyph` across, centered in a row
 * `height` tall.
 */
export function planeOrigin(pad: number, glyph: number, height: number): { x: number; y: number } {
  return { x: pad + glyph / 2, y: height / 2 };
}

/* ------------------------------------------------------------------------------- the frames */

const frame = (
  keys: readonly (readonly [number, number])[],
  extrapolate: Frame['extrapolate'] = 'clamp',
): Frame => ({
  inputRange: keys.map(([ms]) => ms / PLANE_MS),
  outputRange: keys.map(([, v]) => v),
  extrapolate,
});

/** A hair of time: two keys this close are one moment, kept apart so the input stays increasing. */
const SWAP_MS = 0.5;
/** An instant change at `ms`: `from` before it, `to` after. */
const swap = (ms: number, from: number, to: number): Frame =>
  frame([
    [ms, from],
    [ms + SWAP_MS, to],
  ]);
/** A turn from `from` to `to` over `ms0`–`ms1`, speeding up (`in`) or settling (`out`), in four steps. */
const eased = (ms0: number, ms1: number, from: number, to: number, ease: 'in' | 'out'): Frame =>
  frame(
    [0, 0.25, 0.5, 0.75, 1].map(u => {
      const e = ease === 'in' ? u * u : 1 - (1 - u) * (1 - u);
      return [ms0 + u * (ms1 - ms0), from + e * (to - from)] as const;
    }),
  );

/** The flight is sampled every 10 ms: finer than a frame, so the path between samples is a straight line nobody sees. */
export const FLIGHT_STEP_MS = 10;
const flightTimes = (from: number): number[] => {
  const times: number[] = [];
  for (let ms = from; ms <= PLANE_MS; ms += FLIGHT_STEP_MS) times.push(ms);
  return times;
};

/** The sheet comes out of the glyph on a little arc, this high over the straight line. */
const RISE_ARC = 8;
/** How it turns as it comes out, settling level with its nose a touch down. */
const RISE_TURN = -24;
const FOLD_TURN = -4;

export interface CornerFrames {
  /** The corner as it was, lifting from flat to edge on: degrees of `rotateY` about its fold line. */
  lift: Frame;
  /** Its mirror, coming down from edge on onto the sheet. */
  land: Frame;
  liftOpacity: Frame;
  landOpacity: Frame;
}

export interface PaperPlaneFrames {
  /** The plane's box, from the glyph's center, in points. */
  x: Frame;
  y: Frame;
  /** Degrees of `rotate`: the drawings point left, so this is the heading less 180. */
  turn: Frame;
  /** Uniform: out of the glyph small, past full size and back, and receding at the end. */
  scale: Frame;
  /** Along the drawing's crease: squashed as it is drawn back, stretched as it is thrown. */
  scaleX: Frame;
  /** Across it: the squash's other half, and then the bank. */
  scaleY: Frame;
  opacity: Frame;
  /** The sheet, body and corners: its fold in half about the crease (`rotateX`), and when it gives way. */
  sheetHalve: Frame;
  sheetOpacity: Frame;
  corners: Record<PlaneCorner['name'], CornerFrames>;
  /** The plane opening about the same crease (`rotateX`), and when it takes the sheet's place. */
  planeOpen: Frame;
  planeOpacity: Frame;
}

export function paperPlaneFrames(): PaperPlaneFrames {
  const rise = [0, 0.25, 0.5, 0.75, 1].map(u => ({ ms: u * SHEET_OUT_MS, u, e: 1 - (1 - u) ** 2 }));
  const wind = [0, 0.5, 1].map(u => ({
    ms: PLANE_OPEN_MS + u * (PLANE_LAUNCH_MS - PLANE_OPEN_MS),
    u,
  }));
  // the throw's first sample is the wind spot itself, which `wind` already ends on
  const flight = flightTimes(PLANE_LAUNCH_MS + FLIGHT_STEP_MS).map(ms => {
    const s = distanceAt(ms);
    return { ms, s, ...planePoint(s) };
  });
  const corner = (c: PlaneCorner): CornerFrames => {
    const edgeOn = c.at + CORNER_MS / 2;
    return {
      lift: eased(c.at, edgeOn, 0, 90, 'in'),
      land: eased(edgeOn, c.at + CORNER_MS, -90, 0, 'out'),
      liftOpacity: swap(edgeOn, 1, 0),
      landOpacity: swap(edgeOn, 0, 1),
    };
  };
  return {
    x: frame([
      ...rise.map(r => [r.ms, FOLD_SPOT.x * r.e] as const),
      ...wind.map(w => [w.ms, FOLD_SPOT.x + WIND_BACK.x * w.u] as const),
      ...flight.map(f => [f.ms, f.x] as const),
    ]),
    y: frame([
      ...rise.map(r => [r.ms, FOLD_SPOT.y * r.e - RISE_ARC * Math.sin(Math.PI * r.u)] as const),
      ...wind.map(w => [w.ms, FOLD_SPOT.y + WIND_BACK.y * w.u] as const),
      ...flight.map(f => [f.ms, f.y] as const),
    ]),
    turn: frame([
      ...rise.map(r => [r.ms, RISE_TURN + (FOLD_TURN - RISE_TURN) * r.e] as const),
      ...wind.map(
        w => [w.ms, FOLD_TURN + (LAUNCH_HEADING - DRAWN_HEADING - FOLD_TURN) * w.u] as const,
      ),
      ...flight.map(f => [f.ms, f.heading - DRAWN_HEADING] as const),
    ]),
    scale: frame([
      [0, 0.3],
      [55, 1.1],
      [SHEET_OUT_MS, 1],
      [PLANE_RECEDE_MS, 1],
      [PLANE_MS, 0.62],
    ]),
    scaleX: frame([
      [PLANE_OPEN_MS, 1],
      [PLANE_LAUNCH_MS - 5, 0.88],
      [PLANE_LAUNCH_MS + 15, 1.1],
      [PLANE_LAUNCH_MS + 40, 1],
    ]),
    scaleY: frame([
      [PLANE_OPEN_MS, 1],
      [PLANE_LAUNCH_MS - 5, 1.08],
      [PLANE_LAUNCH_MS + 15, 0.94],
      // the bank takes over once the stretch is spent
      ...flight.filter(f => f.ms >= PLANE_LAUNCH_MS + 40).map(f => [f.ms, bankAt(f.s)] as const),
    ]),
    opacity: frame([
      [0, 0],
      [16, 1],
      [PLANE_FADE_MS, 1],
      [PLANE_MS, 0],
    ]),
    sheetHalve: eased(HALVE_MS, PLANE_FOLDED_MS, 0, 90, 'in'),
    sheetOpacity: swap(PLANE_FOLDED_MS, 1, 0),
    corners: { top: corner(PLANE_CORNERS.top), bottom: corner(PLANE_CORNERS.bottom) },
    planeOpen: eased(PLANE_FOLDED_MS, PLANE_OPEN_MS, -90, 0, 'out'),
    planeOpacity: swap(PLANE_FOLDED_MS, 0, 1),
  };
}

/* ------------------------------------------------------------------------------- the trail */

/** The trail: a dot every 18 pt of path, 4 pt across, in the accent. */
export const TRAIL_GAP = 18;
export const TRAIL_DOT = 4;
/**
 * A dot shows once the plane's tail has passed it — never under the plane, never ahead of it: the
 * wing's tip, the drawing's rearmost point, is 21.7 pt behind the box's center, where the path runs.
 */
export const TRAIL_BEHIND = 22;
/** And fades, shrinking, over this: a short trail, a few plane-lengths at most. */
export const TRAIL_LIFE_MS = 100;
const TRAIL_POP_MS = 8;
export const TRAIL_ALPHA = 0.9;
const TRAIL_SHRINK = 0.4;

export interface TrailDot {
  /** How far along the path, and where that is from the glyph's center. */
  s: number;
  x: number;
  y: number;
  /** When it shows, in ms from the tap. */
  shown: number;
  opacity: Frame;
  scale: Frame;
}

/**
 * The dots, from the throw to as far as one can show and fade before the flight ends — so nothing
 * of the trail is left when the plane has gone.
 */
export function planeTrail(): TrailDot[] {
  const dots: TrailDot[] = [];
  for (let s = TRAIL_GAP / 2; s + TRAIL_BEHIND < PLANE_PATH_LENGTH; s += TRAIL_GAP) {
    const shown = timeAt(s + TRAIL_BEHIND);
    if (shown + TRAIL_LIFE_MS > PLANE_MS) break;
    const { x, y } = planePoint(s);
    dots.push({
      s,
      x,
      y,
      shown,
      opacity: frame([
        [shown, 0],
        [shown + TRAIL_POP_MS, TRAIL_ALPHA],
        [shown + TRAIL_LIFE_MS, 0],
      ]),
      scale: frame([
        [shown, 1],
        [shown + TRAIL_LIFE_MS, TRAIL_SHRINK],
      ]),
    });
  }
  return dots;
}
