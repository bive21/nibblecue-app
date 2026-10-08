/**
 * A DELETED ROW CRUMPLES INTO A PAPER BALL, AND UNDO UNCRUMPLES IT, as numbers (the owner,
 * 2026-09-26, "agreed", of the second delight animation). Pure TypeScript, so every claim here is
 * tested in node — this package's tests cannot render React Native — and `CrumpleRow.tsx` only hands
 * these numbers to three `Animated.Value`s and two small SVGs.
 *
 * THREE VALUES, THREE TRACKS:
 *
 *   - `c`, the CRUMPLE, 0 (the row) → 1 (a ball). The row's content is squeezed toward its own
 *     middle — scaleX and scaleY toward a 24 pt ball, with a turn and a skew that wobble as the
 *     paper gives — and fades, with a few crease lines drawn over it that come and go; the ball
 *     fades in over the last of it, shrinking from twice its size as the paper packs down.
 *   - `d`, the DROP, 0 (in place) → 1 (gone): the ball falls a little, rolls to the right — turning
 *     exactly as far as a 24 pt ball rolling that distance turns — and fades out.
 *   - `e`, the ROOM, 1 (the row's own height) → 0: the rows below slide up to close the gap. A height
 *     is layout, so this one rides the JavaScript driver, as `RollDown`'s does; `c` and `d` are
 *     transforms and opacities, on the native driver.
 *
 * ONE AFTER ANOTHER, OVERLAPPING A LITTLE (`planCrumple`): the crumple in 260 ms, the drop leaving as
 * the ball lands (200 ms), and the gap closing as the ball fades (240 ms) — 640 ms in all. The row is
 * clipped to its room the whole time, so a ball still falling when the room closes over it is cut by
 * the floor rather than drawn over the next row.
 *
 * UNDO REVERSES IT (`planUncrumple`): the room opens (240 ms), the ball is back in its place, and it
 * unfolds into the row in 300 ms, starting once there is room to see it. A delete undone before the
 * crumple has finished turns round from wherever it is, and a move with less of the way to go takes
 * less time — the rule every other move in this package keeps.
 *
 * NOTHING HERE TOUCHES THE DATA. The delete is written before the first frame and the Undo is the
 * toast's, honored by the data layer or not at all: a row uncrumples only once its entry is back in
 * the list the screen read (the app's `crumples.ts` decides the phases).
 *
 * WHEN NOTHING MOVES — reduce motion, or the amber Night (`motionStill`) — none of this plays: the
 * row simply goes, and simply comes back.
 */
import type { Palette } from '../theme/theme';
import type { Frame } from './dayNightSwitch';
import { easeAt } from './themeSkyToggle';

/* ------------------------------------------------------------------------------- the clock */

/** The ball's size, in points. */
export const CRUMPLE_BALL = 24;
/** The row to a ball. */
export const CRUMPLE_MS = 260;
/** The ball falls, rolls and fades. */
export const CRUMPLE_DROP_MS = 200;
/** How long before the ball has formed it starts to fall: it leaves as it lands. */
export const CRUMPLE_DROP_LEAD = 20;
/** The gap closes, the rows below sliding up. */
export const CRUMPLE_CLOSE_MS = 240;
/** How long before the ball has gone the gap starts to close: its last faint moment is clipped. */
export const CRUMPLE_CLOSE_LEAD = 40;
/** Undo: the room opens again. */
export const CRUMPLE_OPEN_MS = 240;
/** Undo: the ball unfolds into the row. */
export const UNCRUMPLE_MS = 300;
/** Undo: how long the ball sits in the opening room before it unfolds, so it is seen as a ball. */
export const UNCRUMPLE_WAIT = 80;
/**
 * A delete made from a sheet over the list — the entry editor's Delete — crumples once the sheet is
 * leaving, this long after, so the sheet is most of the way down when the paper starts to give.
 */
export const CRUMPLE_AFTER_SHEET_MS = 120;

/** An ease, as `Easing.bezier`'s four control points. */
export type CrumpleEase = readonly [number, number, number, number];

/** The squeeze: firm at first, slowing as the paper packs into a ball. */
export const CRUMPLE_EASE: CrumpleEase = [0.3, 0.6, 0.35, 1];
/** The unfolding: the ball lingers, opens, and settles into the row. */
export const UNCRUMPLE_EASE: CrumpleEase = [0.4, 0, 0.2, 1];
/** The drop's clock runs straight: its frames carry the fall's own acceleration. */
export const CRUMPLE_DROP_EASE: CrumpleEase = [0, 0, 1, 1];
/** §7's sheet curve, for the room: a quick start and a long, soft landing. */
export const CRUMPLE_ROOM_EASE: CrumpleEase = [0.22, 0.8, 0.28, 1];

/* ------------------------------------------------------------------------------- the poses */

/** Where the three values stand. */
export interface CrumplePose {
  /** The crumple: 0 the row, 1 a ball. */
  c: number;
  /** The drop: 0 the ball in place, 1 fallen, rolled and gone. */
  d: number;
  /** The room: 1 the row's own height, 0 none. */
  e: number;
}

/** A row at rest. */
export const CRUMPLE_REST: CrumplePose = { c: 0, d: 0, e: 1 };
/** A row crumpled and gone, its gap closed. */
export const CRUMPLE_GONE: CrumplePose = { c: 1, d: 1, e: 0 };
/** Where an undone delete starts once it has gone: the ball in its place, the room shut. */
export const CRUMPLE_BALL_POSE: CrumplePose = { c: 1, d: 0, e: 0 };

/** One value's move: where from, where to, when it starts and how long it takes, on which curve. */
export interface CrumpleTrack {
  from: number;
  to: number;
  delay: number;
  duration: number;
  ease: CrumpleEase;
}

export interface CrumplePlan {
  c: CrumpleTrack;
  d: CrumpleTrack;
  e: CrumpleTrack;
}

const clamp01 = (x: number): number => (Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0);
const ms = (x: number): number => Math.max(0, Math.round(x));

/**
 * THE CRUMPLE, from wherever the row is — at rest, or part of the way back from an Undo — to gone.
 * Each track is shortened by the part of its way already done, and starts where the one before it
 * would have handed over; `after` holds the whole of it back (a sheet still leaving).
 */
export function planCrumple(from: CrumplePose, after = 0): CrumplePlan {
  const start = ms(after);
  const c0 = clamp01(from.c);
  const d0 = clamp01(from.d);
  const e0 = clamp01(from.e);
  const cDur = ms(CRUMPLE_MS * (1 - c0));
  const cEnd = start + cDur;
  const dDelay = cDur > 0 ? Math.max(start, cEnd - CRUMPLE_DROP_LEAD) : start;
  const dDur = ms(CRUMPLE_DROP_MS * (1 - d0));
  const dEnd = dDelay + dDur;
  const eDelay = dDur > 0 ? Math.max(start, dEnd - CRUMPLE_CLOSE_LEAD) : Math.max(start, dEnd);
  return {
    c: { from: c0, to: 1, delay: start, duration: cDur, ease: CRUMPLE_EASE },
    d: { from: d0, to: 1, delay: dDelay, duration: dDur, ease: CRUMPLE_DROP_EASE },
    e: {
      from: e0,
      to: 0,
      delay: eDelay,
      duration: ms(CRUMPLE_CLOSE_MS * e0),
      ease: CRUMPLE_ROOM_EASE,
    },
  };
}

/**
 * THE UNCRUMPLE, from wherever the row is — gone (`CRUMPLE_BALL_POSE`: an Undo after the crumple
 * finished), or part of the way through a crumple — back to rest. The room opens and a fallen ball
 * rolls back at once; the unfolding waits for the room, but never longer than the room takes to open.
 */
export function planUncrumple(from: CrumplePose): CrumplePlan {
  const c0 = clamp01(from.c);
  const d0 = clamp01(from.d);
  const e0 = clamp01(from.e);
  const eDur = ms(CRUMPLE_OPEN_MS * (1 - e0));
  return {
    c: {
      from: c0,
      to: 0,
      delay: Math.min(UNCRUMPLE_WAIT, eDur),
      duration: ms(UNCRUMPLE_MS * c0),
      ease: UNCRUMPLE_EASE,
    },
    d: { from: d0, to: 0, delay: 0, duration: ms(CRUMPLE_DROP_MS * d0), ease: CRUMPLE_DROP_EASE },
    e: { from: e0, to: 1, delay: 0, duration: eDur, ease: CRUMPLE_ROOM_EASE },
  };
}

/** How long a whole plan takes, to its last track's end. */
export const crumplePlanMs = (p: CrumplePlan): number =>
  Math.max(...[p.c, p.d, p.e].map(t => t.delay + t.duration));

/** Where one track stands `elapsed` ms into its plan — an estimate from the clock and the curve. */
export function crumpleTrackAt(t: CrumpleTrack, elapsed: number): number {
  if (t.duration <= 0) return elapsed >= t.delay ? t.to : t.from;
  const x = (elapsed - t.delay) / t.duration;
  return t.from + (t.to - t.from) * easeAt(t.ease, x);
}

/**
 * WHERE A ROW IS, `elapsed` ms into a plan — how a change of mind mid-move knows how far it has to
 * go back. The drivers have the truth; a new move on the native driver sets off from the value the
 * view actually holds, so this only decides how long the way back takes.
 */
export function crumplePoseAt(p: CrumplePlan, elapsed: number): CrumplePose {
  return {
    c: crumpleTrackAt(p.c, elapsed),
    d: crumpleTrackAt(p.d, elapsed),
    e: crumpleTrackAt(p.e, elapsed),
  };
}

/* ------------------------------------------------------------------------------ the frames */

const frame = (inputRange: readonly number[], outputRange: readonly number[]): Frame => ({
  inputRange,
  outputRange,
  extrapolate: 'clamp',
});

/**
 * How far the ball falls, in points: a little. From the middle of the shortest row there is (44 pt,
 * the target floor) a 24 pt ball has 10 pt under it, so it lands on the row's floor and never
 * through it.
 */
export const CRUMPLE_DROP_FALL = 10;
/** How far it rolls to the right, in points. */
export const CRUMPLE_DROP_ROLL = 20;
/** The turn a 24 pt ball makes rolling `CRUMPLE_DROP_ROLL` without slipping: distance over radius. */
export const CRUMPLE_DROP_TURN = Math.round(
  ((CRUMPLE_DROP_ROLL / (CRUMPLE_BALL / 2)) * 180) / Math.PI,
);

/** The smallest a row is squeezed to on either axis: never exactly zero. */
const SQUEEZE_MIN = 0.02;

export interface CrumpleFrames {
  /** Of `c`: the row's content, squeezed toward its middle, and fading. */
  content: { scaleX: Frame; scaleY: Frame; rotate: Frame; skewX: Frame; opacity: Frame };
  /** Of `c`: the crease lines over the content (they share its squeeze). */
  creases: { opacity: Frame };
  /** Of `c`: the ball forming over the last of the squeeze. */
  ball: { opacity: Frame; scale: Frame; rotate: Frame };
  /** Of `d`: the ball's fall, roll and fade. */
  drop: { x: Frame; y: Frame; rotate: Frame; opacity: Frame };
  /** Of `e`: the room the row takes in the list. */
  height: Frame;
}

/**
 * The frames for a row `width` × `height` points. The squeeze ends at the ball's size on both axes,
 * so the row's last visible outline is the ball's; everything else is a proportion of the way.
 */
export function crumpleFrames(width: number, height: number): CrumpleFrames {
  const w = Number.isFinite(width) ? Math.max(0, width) : 0;
  const h = Number.isFinite(height) ? Math.max(0, height) : 0;
  const toBall = (side: number): number =>
    side <= 0 ? 1 : Math.min(1, Math.max(SQUEEZE_MIN, CRUMPLE_BALL / side));
  const sx = toBall(w);
  const sy = toBall(h);
  const k = [0, 0.3, 0.65, 1];
  return {
    content: {
      // the ends in first, then the whole sheet packed down to the ball
      scaleX: frame(k, [1, 0.8, 0.38, sx]),
      scaleY: frame(k, [1, 0.72, 0.6, sy]),
      // a wobble as the paper gives: one way, then the other, ending turned a little
      rotate: frame(k, [0, -2.5, 4, 10]),
      skewX: frame(k, [0, 7, -5, 0]),
      opacity: frame(k, [1, 0.85, 0.3, 0]),
    },
    creases: { opacity: frame([0, 0.2, 0.7, 1], [0, 1, 0.8, 0]) },
    // from 60% of the squeeze, as the words go: the two cross under 30% each, never both strong
    ball: {
      opacity: frame([0, 0.6, 0.85, 1], [0, 0, 1, 1]),
      scale: frame([0, 0.6, 1], [1.9, 1.9, 1]),
      rotate: frame([0, 0.6, 1], [-50, -50, 0]),
    },
    drop: {
      x: frame([0, 1], [0, CRUMPLE_DROP_ROLL]),
      // falling: slow off the mark, faster as it goes
      y: frame(
        [0, 0.3, 0.6, 1],
        [0, CRUMPLE_DROP_FALL * 0.12, CRUMPLE_DROP_FALL * 0.45, CRUMPLE_DROP_FALL],
      ),
      rotate: frame([0, 1], [0, CRUMPLE_DROP_TURN]),
      opacity: frame([0, 0.35, 1], [1, 1, 0]),
    },
    height: frame([0, 1], [0, h]),
  };
}

/* ----------------------------------------------------------------------------- the drawings */

/** The crease lines' weight over the row, in points. */
export const CRUMPLE_CREASE_STROKE = 1.25;
/** The ball's edge and its creases, on its 24 pt box. */
export const CRUMPLE_BALL_EDGE = 1.5;
export const CRUMPLE_BALL_CREASE = 1.1;

type Point = readonly [number, number];
const round = (v: number): number => Math.round(v * 100) / 100;
const path = (points: readonly Point[], close = false): string =>
  points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${round(x)} ${round(y)}`).join('') +
  (close ? 'Z' : '');

/**
 * THE CREASES OVER THE ROW: four folds across it and one along it, as the row's own fractions, so a
 * short row and a tall one crease alike. Deterministic — a row crumples the same way every time.
 */
export const CRUMPLE_CREASE_PLAN: readonly (readonly Point[])[] = [
  [
    [0.18, 0],
    [0.24, 0.45],
    [0.16, 1],
  ],
  [
    [0.42, 0],
    [0.36, 0.55],
    [0.45, 1],
  ],
  [
    [0.63, 0],
    [0.7, 0.4],
    [0.6, 1],
  ],
  [
    [0.84, 0],
    [0.8, 0.6],
    [0.88, 1],
  ],
  [
    [0, 0.55],
    [0.3, 0.4],
    [0.62, 0.62],
    [1, 0.45],
  ],
];

/** The creases for a row `width` × `height` points, as SVG paths in its own box. */
export function crumpleCreases(width: number, height: number): string[] {
  const w = Math.max(0, width);
  const h = Math.max(0, height);
  return CRUMPLE_CREASE_PLAN.map(line => path(line.map(([x, y]) => [x * w, y * h] as const)));
}

/**
 * THE BALL, on a 24 pt box: an outline with eleven corners — round enough to read as a ball, uneven
 * enough to read as paper — and four creases inside it. Every point sits at least the edge's
 * half-stroke inside the box, so nothing is clipped at its edge.
 */
export const CRUMPLE_BALL_POINTS: readonly Point[] = [
  [12, 1.5],
  [17.5, 3.2],
  [21.8, 7.5],
  [22.5, 13],
  [20.5, 18.8],
  [15.5, 22.3],
  [9.2, 22.2],
  [3.8, 18.6],
  [1.6, 12.4],
  [3.4, 6.3],
  [7.6, 2.6],
];
export const CRUMPLE_BALL_OUTLINE = path(CRUMPLE_BALL_POINTS, true);
export const CRUMPLE_BALL_CREASE_LINES: readonly (readonly Point[])[] = [
  [
    [7, 7],
    [11, 10.5],
    [9.5, 15],
  ],
  [
    [14, 5.5],
    [13, 10],
    [17.5, 13],
  ],
  [
    [11, 10.5],
    [13, 10],
  ],
  [
    [9.5, 15],
    [15, 17.5],
  ],
];
export const CRUMPLE_BALL_CREASES = CRUMPLE_BALL_CREASE_LINES.map(line => path(line)).join('');

/* --------------------------------------------------------------------------------- the inks */

export interface CrumpleInks {
  /** The ball's paper: a card's own solid surface — white by day, the theme's own after dark. */
  paper: string;
  /** The ball's edge, which is what separates it from the page. */
  edge: string;
  /** The creases, over the row's page and over the ball's paper. */
  crease: string;
}

/**
 * THE PALETTE'S OWN ROLES, AND NO COLOR OF ITS OWN. The paper is `surfaceSolid` — a card's solid
 * surface, which is what a sheet of paper is in this app — and the edge and the creases are `text2`,
 * the secondary ink the contrast gate
 * already holds at 4.5:1 on every ground a page can be; `crumple.test.ts` measures the marks again
 * as graphics (3:1) on the page, the pattern and the ball's own paper, in every scheme and theme.
 */
export const crumpleInks = (p: Palette): CrumpleInks => ({
  paper: p.surfaceSolid,
  edge: p.text2,
  crease: p.text2,
});
