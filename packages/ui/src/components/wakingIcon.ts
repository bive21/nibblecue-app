/**
 * MODULE ICONS THAT WAKE UP, as numbers (the owner, 2026-09-25, of the "that's cool" list, idea 7:
 * *"might not necessarily be useful, but it's cool … Let's try doing everything. I will then
 * review"*). When a module is switched ON in setup's "What you track" or in More → What you track,
 * its icon does one small move of its own, once: the bottle tilts as if pouring, the sleeping moon
 * sways like a mobile, the diaper hops, the pump pulses, the bath tips up on one foot like a
 * splash, the medicine gets a little shake, growth stretches up, the solids spoon lifts,
 * breastfeeding gives a gentle nod, tummy time rolls over. Pure TypeScript, so every pose of every
 * move is tested in node; `WakingIcon.tsx` only hands these frames to `interpolate`.
 *
 * WHAT MOVES IS THE ICON'S BOX, NEVER THE DRAWING. Eleven of the thirteen module icons are the
 * owner's illustrated print set — finished PNGs (`icons/illustrated.ts`), which cannot be taken
 * apart into a lid and a spoon — and the other two (the stash's box, the vaccines' shield) are
 * glyphs. So every move is a transform of the view the icon sits in: translate, rotate and scale,
 * about a pivot chosen for the object (a bottle tips about its base, a mobile swings from above
 * its top, a tub lifts off one foot). Transforms only, so each one runs on the native driver.
 *
 * THE RULES EVERY MOVE KEEPS, each held by `wakingIcon.test.ts`:
 *
 *   - ONCE, AND ONLY ON THE WAY ON (`wakes`). Not on mount — setup opens with every switch on, and
 *     a screen of thirteen icons all waking at once is noise, not delight — and not on the way off,
 *     because switching a module off is not a thing to celebrate. Only a switch turning on while
 *     its row is on the screen.
 *   - SHORT: no move is longer than 600 ms, so it is over before the next tap.
 *   - IT STARTS AND ENDS AT REST, the icon exactly where it was, so a move cut off by a second tap
 *     or by reduce motion is set straight back to rest and nothing is ever left tilted.
 *   - IT STAYS IN ITS CHIP. The row draws the icon at 16 in a 32 pt chip that clips (`Row.tsx`),
 *     so every corner of the icon stays inside it at every frame of every move.
 *   - REDUCE MOTION AND THE AMBER NIGHT THEME play nothing: the icon simply is on
 *     (docs/DESIGN_SYSTEM.md §7; night keeps a dark room still).
 *
 * NOTHING HERE IS ABOUT THE BABY. The move answers a parent's tap on a settings switch; it is not
 * tied to anything the household has logged, so it is never praise (CLAUDE.md §2 rules 3 and 6).
 */
import type { ModuleId } from '@nibblecue/core';
import type { Frame } from './dayNightSwitch';
import { keyFrame, keyValue, type Key } from './keyframes';

/** Where a module row draws its icon: a 16 pt glyph in the middle of a 32 pt chip (`Row.tsx`). */
export const ROW_ICON = { chip: 32, glyph: 16 } as const;

/** The moves there are. Each is named for what the object does, not for the module. */
export type WakeMove =
  | 'pour'
  | 'nod'
  | 'pulse'
  | 'hop'
  | 'sway'
  | 'lift'
  | 'shake'
  | 'stretch'
  | 'rise'
  | 'roll'
  | 'splash'
  | 'stamp'
  | 'gulp'
  | 'jot';

export interface WakeMoveDef {
  /** How long it takes, in ms. */
  ms: number;
  /**
   * The point it turns and grows about, from the icon's center, in icons: `{ x: 0, y: 0.5 }` is
   * the middle of its bottom edge, where a thing standing on the ground turns.
   */
  pivot: { x: number; y: number };
  /** Sideways and up-and-down, in icons (0.25 is a quarter of the icon's size). Up is negative. */
  tx?: readonly Key[];
  ty?: readonly Key[];
  /** Turning, in degrees; positive is clockwise. */
  rotate?: readonly Key[];
  /** Width and height, as a multiple of the icon's own. */
  sx?: readonly Key[];
  sy?: readonly Key[];
}

/** The same turning points on both axes: a move that grows, rather than stretches. */
const both = (keys: readonly Key[]): Pick<WakeMoveDef, 'sx' | 'sy'> => ({ sx: keys, sy: keys });

/**
 * THE MOVES, as turning points (`keyframes.ts` says why that and not straight lines). Written for
 * what each object is: every one begins and ends at rest, and every number in it is the furthest
 * that part of the move goes.
 */
export const WAKE_MOVES: Readonly<Record<WakeMove, WakeMoveDef>> = {
  /** A bottle tipped about its base to pour, held a moment, and set back upright with a rock. */
  pour: {
    ms: 600,
    pivot: { x: 0, y: 0.45 },
    rotate: [
      [0, 0],
      [0.3, 30],
      [0.56, 26],
      [0.8, -6],
      [0.92, 2],
      [1, 0],
    ],
  },
  /** One gentle nod: forward and a little down, back past upright, and still. */
  nod: {
    ms: 520,
    pivot: { x: 0, y: 0.5 },
    rotate: [
      [0, 0],
      [0.32, 10],
      [0.58, -3],
      [0.8, 2],
      [1, 0],
    ],
    ty: [
      [0, 0],
      [0.32, 0.07],
      [0.58, -0.02],
      [1, 0],
    ],
  },
  /** Two beats, the second softer: a pump's rhythm. */
  pulse: {
    ms: 560,
    pivot: { x: 0, y: 0 },
    ...both([
      [0, 1],
      [0.16, 1.15],
      [0.34, 0.95],
      [0.54, 1.11],
      [0.76, 0.98],
      [1, 1],
    ]),
  },
  /** Crouch, jump, land squashed, stand: squash and stretch about its feet. */
  hop: {
    ms: 560,
    pivot: { x: 0, y: 0.5 },
    ty: [
      [0, 0],
      [0.14, 0],
      [0.44, -0.32],
      [0.68, 0],
      [0.82, -0.04],
      [1, 0],
    ],
    sx: [
      [0, 1],
      [0.14, 1.1],
      [0.3, 0.95],
      [0.44, 0.99],
      [0.68, 1.1],
      [0.84, 0.98],
      [1, 1],
    ],
    sy: [
      [0, 1],
      [0.14, 0.86],
      [0.3, 1.08],
      [0.44, 1.02],
      [0.68, 0.86],
      [0.84, 1.04],
      [1, 1],
    ],
  },
  /** A mobile's moon: it hangs from a point above its top and swings, each swing smaller. */
  sway: {
    ms: 600,
    pivot: { x: 0, y: -0.8 },
    rotate: [
      [0, 0],
      [0.2, -12],
      [0.46, 9],
      [0.7, -5],
      [0.88, 2],
      [1, 0],
    ],
  },
  /** A spoon lifted toward a mouth: up and tipped back, down, and still. */
  lift: {
    ms: 540,
    pivot: { x: 0, y: 0.5 },
    ty: [
      [0, 0],
      [0.38, -0.28],
      [0.66, 0.03],
      [0.84, -0.02],
      [1, 0],
    ],
    rotate: [
      [0, 0],
      [0.38, -12],
      [0.66, 3],
      [1, 0],
    ],
  },
  /** A bottle of medicine shaken before it is given: quick, side to side, dying away. */
  shake: {
    ms: 480,
    pivot: { x: 0, y: 0 },
    rotate: [
      [0, 0],
      [0.1, -10],
      [0.24, 10],
      [0.38, -8],
      [0.52, 6],
      [0.66, -3.5],
      [0.8, 1.5],
      [1, 0],
    ],
    tx: [
      [0, 0],
      [0.1, -0.05],
      [0.24, 0.05],
      [0.38, -0.04],
      [0.52, 0.03],
      [0.66, -0.015],
      [1, 0],
    ],
  },
  /** Growing: taller and narrower from its feet up, a little squat on the way back, and still. */
  stretch: {
    ms: 560,
    pivot: { x: 0, y: 0.5 },
    sx: [
      [0, 1],
      [0.36, 0.92],
      [0.58, 1.06],
      [0.78, 0.98],
      [1, 1],
    ],
    sy: [
      [0, 1],
      [0.36, 1.24],
      [0.58, 0.92],
      [0.78, 1.05],
      [1, 1],
    ],
  },
  /** A reading climbing: lifted and drawn up a little, and settled. Softer than a hop. */
  rise: {
    ms: 520,
    pivot: { x: 0, y: 0.5 },
    ty: [
      [0, 0],
      [0.36, -0.2],
      [0.62, 0.03],
      [0.82, -0.015],
      [1, 0],
    ],
    sy: [
      [0, 1],
      [0.36, 1.1],
      [0.62, 0.96],
      [0.82, 1.02],
      [1, 1],
    ],
  },
  /**
   * A roll onto its back and over: a lean the other way first, one whole turn, and a hair past.
   * It ends at 360°, which is where it began — the test holds every move's end to a whole turn.
   */
  roll: {
    ms: 600,
    pivot: { x: 0, y: 0 },
    rotate: [
      [0, 0],
      [0.16, -16],
      [0.76, 360],
      [0.88, 366],
      [1, 360],
    ],
    ty: [
      [0, 0],
      [0.46, -0.12],
      [0.76, 0],
      [1, 0],
    ],
  },
  /** A tub tipped up on its left foot as the water splashes, and rocking back down. */
  splash: {
    ms: 560,
    pivot: { x: -0.45, y: 0.5 },
    rotate: [
      [0, 0],
      [0.24, -14],
      [0.48, 4],
      [0.68, -4],
      [0.86, 1.5],
      [1, 0],
    ],
    ty: [
      [0, 0],
      [0.24, -0.04],
      [0.48, 0],
      [1, 0],
    ],
  },
  /** Raised, pressed down like a stamp on a record card, and settled. */
  stamp: {
    ms: 520,
    pivot: { x: 0, y: 0.5 },
    ...both([
      [0, 1],
      [0.3, 1.14],
      [0.5, 0.9],
      [0.7, 1.04],
      [1, 1],
    ]),
    ty: [
      [0, 0],
      [0.3, -0.12],
      [0.5, 0],
      [1, 0],
    ],
  },
  /**
   * A page leaning in to be written on (the Health note, 2026-10-08): tipped a little about its
   * bottom right corner toward the pen, a short stroke sideways, and settled flat. Small on purpose:
   * the note is the quietest thing a parent logs.
   */
  jot: {
    ms: 520,
    pivot: { x: 0.45, y: 0.5 },
    rotate: [
      [0, 0],
      [0.3, -8],
      [0.55, 3],
      [0.78, -1.5],
      [1, 0],
    ],
    tx: [
      [0, 0],
      [0.3, -0.04],
      [0.55, 0.02],
      [1, 0],
    ],
  },
  /** A box taking something in: a squat, standing tall, settled. */
  gulp: {
    ms: 520,
    pivot: { x: 0, y: 0.5 },
    sx: [
      [0, 1],
      [0.24, 1.1],
      [0.5, 0.94],
      [0.72, 1.03],
      [1, 1],
    ],
    sy: [
      [0, 1],
      [0.24, 0.88],
      [0.5, 1.1],
      [0.72, 0.98],
      [1, 1],
    ],
  },
};

/**
 * EVERY MODULE'S MOVE — a `Record` over every id the type carries, so a module added to the
 * registry without a move is a type error before it is a test failure.
 *
 * The retired ids (`RETIRED_MODULES` in core: water, hydration, self-care, milestones, notes) are
 * never offered by a picker, but the type still carries them for the household's history, so
 * they borrow a move from the thing their icon draws rather than having one of their own.
 */
export const MODULE_WAKE: Readonly<Record<ModuleId, WakeMove>> = {
  bottle: 'pour',
  breastfeed: 'nod',
  pump: 'pulse',
  diaper: 'hop',
  sleep: 'sway',
  solids: 'lift',
  med: 'shake',
  growth: 'stretch',
  temp: 'rise',
  tummy: 'roll',
  bath: 'splash',
  vaccine: 'stamp',
  stash: 'gulp',
  wellbeing: 'jot',
  // retired: a cup, a heart, a star, a page
  water: 'pour',
  hydration: 'pour',
  selfcare: 'pulse',
  milestone: 'stamp',
  note: 'nod',
};

/**
 * WHETHER A CHANGE WAKES THE ICON: off to on, and nothing else. `was` is what the icon last saw —
 * on its first render that is the value it opens with, so a screen that opens with modules on
 * wakes nothing. Under reduce motion or in the amber night theme (`still`) nothing plays at all.
 */
export const wakes = (was: boolean, on: boolean, still: boolean): boolean => !was && on && !still;

/** One pose of a move: where the icon's box is, `t` of the way through it, at `size` points. */
export interface WakePose {
  tx: number;
  ty: number;
  /** Degrees, clockwise. */
  rotate: number;
  sx: number;
  sy: number;
}

const REST: WakePose = { tx: 0, ty: 0, rotate: 0, sx: 1, sy: 1 };
const channel = (keys: readonly Key[] | undefined, rest: number, t: number): number =>
  keys === undefined ? rest : keyValue(keys, t);

export function wakePose(move: WakeMove, t: number, size: number): WakePose {
  const m = WAKE_MOVES[move];
  return {
    tx: channel(m.tx, REST.tx, t) * size,
    ty: channel(m.ty, REST.ty, t) * size,
    rotate: channel(m.rotate, REST.rotate, t),
    sx: channel(m.sx, REST.sx, t),
    sy: channel(m.sy, REST.sy, t),
  };
}

/** A move's frames, for `interpolate` over the one value that runs 0 → 1 while it plays. */
export interface WakeFrames {
  /** Points. */
  tx: Frame;
  ty: Frame;
  /** Degrees. */
  rotate: Frame;
  sx: Frame;
  sy: Frame;
  /** The pivot, in points from the icon's center: a static translate either side of the turn. */
  pivot: { x: number; y: number };
}

const scaled = (keys: readonly Key[], by: number): Key[] => keys.map(([at, v]) => [at, v * by]);

export function wakeFrames(move: WakeMove, size: number): WakeFrames {
  const m = WAKE_MOVES[move];
  const rest = (v: number): readonly Key[] => [[0, v]];
  return {
    tx: keyFrame(scaled(m.tx ?? rest(REST.tx), size)),
    ty: keyFrame(scaled(m.ty ?? rest(REST.ty), size)),
    rotate: keyFrame(m.rotate ?? rest(REST.rotate)),
    sx: keyFrame(m.sx ?? rest(REST.sx)),
    sy: keyFrame(m.sy ?? rest(REST.sy)),
    pivot: { x: m.pivot.x * size, y: m.pivot.y * size },
  };
}

/**
 * Where a point of the icon (from its center, in points) is drawn in `pose` — the transform
 * `WakingIcon` applies, in its order: the pose's translate, then scale and turn about the pivot.
 * React Native applies a transform list the way CSS does, so the pivot is a translate out, the
 * turn and the scale, and the same translate back.
 */
export function posed(
  pose: WakePose,
  pivot: { x: number; y: number },
  point: { x: number; y: number },
): { x: number; y: number } {
  const a = (pose.rotate * Math.PI) / 180;
  const dx = (point.x - pivot.x) * pose.sx;
  const dy = (point.y - pivot.y) * pose.sy;
  return {
    x: pose.tx + pivot.x + dx * Math.cos(a) - dy * Math.sin(a),
    y: pose.ty + pivot.y + dx * Math.sin(a) + dy * Math.cos(a),
  };
}
