/**
 * THE BATH TOGGLE AS NUMBERS (the owner, 2026-09-25, idea 6 of the "that's cool" list: the bath
 * sheet's "Hair — Washed / Not washed" as a little bath where "yes" sends a few BUBBLES up). The
 * shared track is `pictureToggle.ts`; this is the scene drawn in it. Pure TypeScript, tested in
 * node (`bathToggle.test.ts`); `BathToggle.tsx` only hands these numbers to views.
 *
 * WHAT THE PICTURE SAYS. The pill is a bath seen from the side: a band of water along its foot and
 * a rubber duck floating on it for the knob. The duck rests at the chosen answer's end. On the
 * BUBBLES stop ("Washed") a little foam sits on the water round it; on the other ("Not washed")
 * the water is still and there is nothing on it. A change of answer floats the duck across,
 * rocking and bobbing, with a ripple either side of it; arriving at the bubbles stop, the foam
 * puffs up round it and a few bubbles rise ONCE — out of the foam, wobbling, growing a little — and
 * leave through the top of the pill. Then nothing moves. Leaving it, the foam pops and the water
 * goes still. It is a picture of the answer the parent gave: nothing in it is tied to a number,
 * and it congratulates nobody (CLAUDE.md §2 rules 3 and 6).
 *
 * TWO VALUES OF ITS OWN, beside the track's `pos` and `sway`. `suds` is how much foam is up (0
 * none, 1 all of it): it runs with the move, so the foam puffs as the duck arrives and pops as it
 * leaves. `rise` carries the bubbles that leave (0 before they start, 1 once every one of them is
 * out of the pill): it runs ONCE, only when the answer changes TO the bubbles stop, and at rest —
 * the first frame included — it sits at 1, where every rising bubble is already gone. So "Washed"
 * at rest is foam on the water and nothing rising, and a sheet that opens on "Washed" blows no
 * bubbles: only a change to it does.
 */
import type { Frame } from './dayNightSwitch';
import {
  pictureFrame,
  swayEven,
  swayFrame,
  type PictureStop,
  type PictureToggleGeometry,
} from './pictureToggle';

/* ---------------------------------------------------------------------------- the size */

/** The duck's slot: the duck from its tail to its beak, and a ripple's width either side. */
export const BATH_SLOT = 36;

/**
 * The water along the pill's foot: `depth` of it under the surface, and the surface line. The
 * words are written above it, in the room the water leaves (`bathScene`).
 */
export const WATER = { depth: 17, line: 1.2 } as const;

export interface BathScene {
  /** The water's surface, in the pill's coordinates. */
  surface: number;
  /** Where the words are written: the room above the water, from the pill's top. */
  words: { top: number; height: number };
  /** The surface in the knob's own box — where the duck floats. */
  waterline: number;
}

export function bathScene(g: PictureToggleGeometry): BathScene {
  const surface = g.height - WATER.depth;
  return { surface, words: { top: 0, height: surface }, waterline: surface - g.inset };
}

/**
 * THE DUCK, facing right, in the knob's box (`BATH_SLOT` × 48, y down), floating with its
 * waterline at `waterline` (35 in the box, the pill's surface): a body with a raised tail, a round
 * head, a beak, an eye and a wing. The body goes a few points under the surface, where the water
 * drawn over it (`lip`) makes it float rather than sit on a line.
 */
export const DUCK = {
  body:
    'M5 26.2C6.4 24.6 8.4 25 10.2 26.4C12.6 24.9 17.4 24.6 21.4 25.8C26.4 26.4 30.4 29.2 30.4 32.8' +
    'C30.4 36.6 26.2 38.6 18.4 38.6C11.4 38.6 6.4 37 5.8 32.6C5.5 30.4 4.7 28 5 26.2Z',
  head: { cx: 24.2, cy: 20.2, r: 6.2 },
  beak: 'M29.6 19.6C32 19 34.2 19.5 34.8 20.6C34.2 21.9 31.8 22.6 29.4 22Z',
  eye: { cx: 25.9, cy: 18.8, r: 1.05 },
  wing: 'M11.2 30.2C13.4 28.2 18.2 28 20.8 30C18.8 32.6 13.8 32.9 11.2 30.2Z',
  /** The light on the head (not in the amber Night). */
  shine: { cx: 22.4, cy: 17.6, r: 1.3 },
  /** The outline's width, round the body, the head and the beak. */
  stroke: 1.1,
  /** Its extent in the box, for the placement test: tail to beak, crown to keel. */
  bounds: { left: 4.7, right: 34.8, top: 14, bottom: 38.6 },
  /** Where it rocks about: the middle of its waterline. */
  pivot: { x: 18, y: 35 },
} as const;

/** A ripple either side of the duck at its waterline, seen only while it moves. */
export const RIPPLES = ['M0.8 35.6Q3.3 33.9 5.8 35.6', 'M30.2 35.6Q32.7 33.9 35.2 35.6'] as const;

/** The duck at the stop it is not at: in outline, smaller, floating at the same waterline. */
export const DUCK_GHOST_SCALE = 0.72;

/**
 * A BUBBLE, placed from the bubbles stop's slot: `dx` across from the slot's middle (mirrored at
 * the right-hand end, so the pattern always leans the same way against the pill's end) and `dy`
 * up from the water's surface.
 */
export interface Bubble {
  dx: number;
  dy: number;
  r: number;
}

/**
 * THE FOAM, at rest round the duck on the bubbles stop: four bubbles on the water, two behind it
 * and two before it. `at` is where in a move to the stop each one puffs up (`suds`, 0 to 1), one
 * after another as the duck comes in; leaving, the same frames run backwards and they pop, the
 * last one up the first one gone.
 */
export const FOAM: readonly (Bubble & { at: number })[] = [
  { dx: -14.2, dy: -1.6, r: 2.8, at: 0.4 },
  { dx: -10.4, dy: -4.4, r: 2.2, at: 0.48 },
  { dx: 11, dy: -2.2, r: 3.1, at: 0.56 },
  { dx: 15, dy: -0.6, r: 2.1, at: 0.64 },
];

/**
 * THE BUBBLES THAT RISE, once, from the foam: where each sets off (`dx`, and a point above the
 * surface), its size, and when in the rise it goes (`at`, for `span` of it) — staggered, so they
 * leave one after another rather than as a sheet. Each wobbles `wobble` either side on the way.
 */
export const RISERS: readonly {
  dx: number;
  r: number;
  at: number;
  span: number;
  wobble: number;
}[] = [
  { dx: -10, r: 2.3, at: 0, span: 0.5, wobble: 1.6 },
  { dx: 14.5, r: 1.7, at: 0.13, span: 0.46, wobble: 1.2 },
  { dx: -4.5, r: 2.7, at: 0.27, span: 0.54, wobble: 1.8 },
  { dx: 9, r: 1.5, at: 0.42, span: 0.5, wobble: 1.2 },
];
/** How far above the surface a rising bubble sets off: out of the top of the foam. */
export const RISE_FROM = 3;

/**
 * The ghost's foam: three small bubbles over the ghost duck at the bubbles stop, in outline, so the
 * empty end of the pill says "bubbles" before the duck is there.
 */
export const GHOST_BUBBLES: readonly Bubble[] = [
  { dx: -8, dy: -14, r: 2.2 },
  { dx: -2.5, dy: -19.5, r: 1.6 },
  { dx: -7, dy: -25, r: 1.2 },
];

/** Where a bubble is, in the pill: from the bubbles stop's slot and the water's surface. */
export function bubbleAt(
  g: PictureToggleGeometry,
  scene: BathScene,
  stop: PictureStop,
  b: Bubble,
): { x: number; y: number; r: number } {
  const side = stop === 0 ? 1 : -1;
  return { x: g.center[stop] + side * b.dx, y: scene.surface + b.dy, r: b.r };
}

/* --------------------------------------------------------------------------- the rise */

/** The bubbles' one rise, start to last one out: long enough to watch, and then it is over. */
export const RISE_MS = 1400;
/**
 * When the rise starts, as a share of the move that brings the duck in: most of the way, once the
 * foam is up, so the bubbles come out of the foam rather than out of empty water.
 */
export const RISE_DELAY = 0.7;

export interface BathPlan {
  animate: boolean;
  /** Where the foam goes: 1 on the bubbles stop, 0 on the other. */
  suds: 0 | 1;
  /** Set the rise back to its start and run it — only on a change TO the bubbles stop. */
  rise: boolean;
  duration: number;
  riseDelay: number;
}

/**
 * WHAT A CHANGE OF ANSWER DOES TO THE BATH. The foam goes with the move — puffing up as the duck
 * arrives at the bubbles stop, popping as it leaves — and the bubbles rise once, and only on the way
 * IN, so a sheet opening on "Washed", or a re-render that changes nothing, blows none. When the
 * picture is still (reduce motion, the amber Night) the foam is simply there or not, and nothing
 * rises: the end state, which is what the parent needs to see.
 */
export function planBath(
  wasBubbles: boolean,
  isBubbles: boolean,
  moveMs: number,
  still: boolean,
): BathPlan {
  const suds = isBubbles ? 1 : 0;
  if (still) return { animate: false, suds, rise: false, duration: 0, riseDelay: 0 };
  return {
    animate: wasBubbles !== isBubbles,
    suds,
    rise: isBubbles && !wasBubbles,
    duration: moveMs,
    riseDelay: Math.round(moveMs * RISE_DELAY),
  };
}

/* ------------------------------------------------------------------------- the frames */

/** How far the duck rocks at the height of a move, in degrees, about its waterline. */
export const DUCK_ROCK = 5;

export interface BathFrames {
  /** Of `suds`: each foam bubble's opacity and scale — up one after another, with a little swell. */
  foam: readonly { opacity: Frame; scale: Frame }[];
  /**
   * Of `rise`: each rising bubble's way up (translateY from where it set off), its wobble
   * (translateX), its opacity and its scale.
   */
  risers: readonly { y: Frame; x: Frame; opacity: Frame; scale: Frame }[];
  /** Of `suds`: the rising bubbles are seen only while the foam is up, so leaving takes them too. */
  gate: Frame;
  /** Of `sway`: the duck's rock, its bob, and its ripples. */
  rock: Frame;
  bob: Frame;
  ripple: Frame;
}

export function bathFrames(scene: BathScene, stop: PictureStop): BathFrames {
  const side = stop === 0 ? 1 : -1;
  const from = scene.surface - RISE_FROM;
  return {
    foam: FOAM.map(b => ({
      opacity: pictureFrame([b.at, b.at + 0.08], [0, 1]),
      scale: pictureFrame([b.at, b.at + 0.16, b.at + 0.26], [0.2, 1.18, 1]),
    })),
    risers: RISERS.map(b => {
      // all the way out: the bubble's lowest point a point above the pill's top edge
      const out = -(from + b.r + 1);
      const end = b.at + b.span;
      return {
        // slow off the foam, quicker as it goes, as a bubble does
        y: pictureFrame([b.at, b.at + b.span / 2, end], [0, out * 0.38, out]),
        x: pictureFrame(
          [b.at, b.at + b.span / 3, b.at + (2 * b.span) / 3, end],
          [0, side * b.wobble, -side * b.wobble, (side * b.wobble) / 2],
        ),
        opacity: pictureFrame([b.at, b.at + 0.05, end - 0.12, end], [0, 1, 1, 0]),
        scale: pictureFrame([b.at, b.at + 0.06, end], [0.4, 1, 1.12]),
      };
    }),
    gate: pictureFrame([0.5, 0.8], [0, 1]),
    rock: swayFrame(DUCK_ROCK),
    // a dip as it is pushed off, riding up, a deeper dip as it stops, and one bob back
    bob: swayEven([0.2, 0.5, 0.8, 0.92], [0.8, -0.5, 1.1, -0.4]),
    ripple: swayEven([0.1, 0.8], [0.85, 0.85]),
  };
}

/** Where a rising bubble sets off, in the pill. */
export function riserFrom(
  g: PictureToggleGeometry,
  scene: BathScene,
  stop: PictureStop,
  i: number,
): { x: number; y: number; r: number } {
  const b = RISERS[i] ?? RISERS[0]!;
  return bubbleAt(g, scene, stop, { dx: b.dx, dy: -RISE_FROM, r: b.r });
}
