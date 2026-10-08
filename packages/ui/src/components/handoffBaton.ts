/**
 * The handoff baton as numbers (the owner, 2026-09-25, of the "that's cool" list — *"might not
 * necessarily be useful, but it's cool … Let's try doing everything. I will then review"*; idea
 * #12). "Who's on" gives one person the baby's reminders until a time (apps/mobile/src/duty); when
 * someone takes over, a small baton passes in an arc from the previous person's disc to the new
 * person's — once — and then stays with them, still. Pure TypeScript, so every frame is tested in
 * node — this package's tests cannot render React Native — and `HandoffBaton.tsx` only hands these
 * numbers to views and to `Animated.Value#interpolate`, as `DayNightSwitch.tsx` does with its own.
 *
 * THE BATON IS THE CARD'S OWN GLYPH. The Who's-on row already led with a moon (a night) or a bell
 * (a stretch of the day) in a 36 square; that glyph is what is being handed over — the reminders —
 * so it becomes a badge on the shoulder of whoever holds it, drawn over their initials disc, and it
 * is the thing that flies. At rest the square shows who is on and what they hold; the words beside
 * it still say it all, so the picture is decoration to a screen reader.
 *
 * THE WHOLE PASS HAPPENS IN THAT SQUARE, and it has to: the row is the glyph, the words and a
 * button, and nothing else may move when a shift changes hands. So the two discs step down into a
 * pair that fits it — the giver slides left into the card's own padding, the taker comes in on the
 * right, short of the words — the baton is thrown between their shoulders, and the taker grows back
 * into the square with it. Every layer stays inside the room the card gives it at every frame,
 * which `handoffBaton.test.ts` walks: the card's padding on the left and above (Today's is 11), the
 * gap before the words on the right (8), each less two points of air.
 *
 * ONE VALUE, `p`, from 0 (the giver holds it, exactly the picture that was on the card) to 1 (the
 * taker holds it, exactly the picture that stays), driven at a constant rate: the easing is IN the
 * frames, sampled from the curves below, because the pass is five beats of one second and no single
 * curve over the whole of it is right for any of them.
 *
 *   0.00–0.22  make room: the giver steps left and down to a pair's size; the taker slides in
 *   0.24–0.60  the throw: steady across, up and over on a parabola, one full turn, upright on landing
 *   0.60       it lands: the success haptic (the component's timer), a squash, the taker's catch
 *   0.62–0.82  the giver fades out, drifting on the way it went
 *   0.70–1.00  the taker grows back into the square, the baton riding its shoulder to rest
 *
 * Under REDUCE MOTION, and in the amber NIGHT theme, nothing moves: `p` is 1 from the first frame
 * and the square simply IS the new holder with the baton (docs/DESIGN_SYSTEM.md §7; docs/MOBILE.md
 * §5 — at 3 a.m. nothing moves that is not information).
 */
import type { Frame } from './dayNightSwitch';
import { easeAt } from './themeSkyToggle';

/* ---------------------------------------------------------------------------- the size */

/** The stage: the card glyph's own square (WhoIsOnCard.tsx `Glyph`), so the row keeps its layout. */
export const BATON_SLOT = 36;
/** A person's disc: `Avatar` at 31, the size a Row draws a person at. */
export const BATON_DISC = 31;
/** The baton: an 18 badge — a 14 disc in a 2 ring of the card's own surface — and its 10 glyph. */
export const BATON_BADGE = 18;
export const BATON_RING = 2;
export const BATON_ICON = 10;

/**
 * The room round the square that a layer may use, in points: the card's padding on the left and
 * above and below (Today's is `space.lg`, 11; the Reminders card's is larger), the gap before the
 * words on the right (`space.md`, 8), each less two points of air, so no layer ever touches the
 * card's edge or the first letter of the words.
 */
export const BATON_ROOM = { left: 9, top: 9, right: 6, bottom: 9 } as const;

export interface BatonPoint {
  x: number;
  y: number;
}

export interface BatonGeometry {
  slot: number;
  disc: number;
  badge: number;
  ring: number;
  icon: number;
  /** The picture at rest: the holder's disc filling the square, the baton on its lower right. */
  rest: { disc: BatonPoint; badge: BatonPoint };
  /** The pair the pass happens in: both discs at `scale`, side by side and just touching. */
  pair: { scale: number; giver: BatonPoint; taker: BatonPoint };
  /** The throw: the baton at `scale`, from the giver's shoulder to the taker's, `height` high. */
  throw: { scale: number; height: number; from: BatonPoint; to: BatonPoint };
}

/** The pair's size: 21 points of disc, which puts the two side by side inside the room. */
const PAIR_SCALE = 0.68;
/** The baton in flight: small enough to clear the giver's initial from the shoulder it sits on. */
const THROW_SCALE = 0.72;
/**
 * How far the arc rises above the two shoulders: OVER the taker's head, not across its face — at
 * 16 the baton crossed the initial it was being thrown to — and down onto the far shoulder. 20 is
 * as high as the room above allows with the baton's own size (`BATON_ROOM.top`).
 */
const THROW_HEIGHT = 20;

/**
 * Where a baton rides on a disc drawn at `scale` round `center`: the badge's place at rest, moved
 * in with the disc — so it sits on the same shoulder whatever size the disc is drawn at.
 */
export function shoulderOf(center: BatonPoint, scale: number): BatonPoint {
  const rest = batonRest();
  return {
    x: center.x + (rest.badge.x - rest.disc.x) * scale,
    y: center.y + (rest.badge.y - rest.disc.y) * scale,
  };
}

function batonRest(): { disc: BatonPoint; badge: BatonPoint } {
  const r = BATON_DISC / 2;
  // the badge's center is in from the square's corner by its own radius: it touches the square's
  // right and bottom edges and overlaps the disc's lower right, the way a status badge does
  const b = BATON_SLOT - BATON_BADGE / 2;
  return { disc: { x: r, y: r }, badge: { x: b, y: b } };
}

export function batonGeometry(): BatonGeometry {
  const rest = batonRest();
  // the pair's two centers: 19 apart, so two 21 discs just overlap and neither initial is covered;
  // a half point up from the rest disc's center, so the pair sits in the middle of the square
  const giver = { x: 4.5, y: 15 };
  const taker = { x: 23.5, y: 15 };
  return {
    slot: BATON_SLOT,
    disc: BATON_DISC,
    badge: BATON_BADGE,
    ring: BATON_RING,
    icon: BATON_ICON,
    rest,
    pair: { scale: PAIR_SCALE, giver, taker },
    throw: {
      scale: THROW_SCALE,
      height: THROW_HEIGHT,
      from: shoulderOf(giver, PAIR_SCALE),
      to: shoulderOf(taker, PAIR_SCALE),
    },
  };
}

/* --------------------------------------------------------------------------- the move */

/** The whole pass. Long enough to be followed once, short enough not to be waited for. */
export const BATON_MS = 1000;

/** The beats, as fractions of the pass (the header has them in words). */
export const BATON_BEATS = {
  room: [0, 0.22],
  enter: [0.04, 0.22],
  throw: [0.24, 0.6],
  land: 0.6,
  catch: [0.6, 0.68],
  squash: [0.6, 0.66],
  gone: [0.62, 0.82],
  settle: [0.7, 1],
} as const;

/** When the baton lands, in milliseconds after the pass starts: the success haptic's moment. */
export const BATON_LAND_MS = BATON_BEATS.land * BATON_MS;

/**
 * A move across the square: `DayNightSwitch`'s slow start without its overshoot, the curve the
 * theme toggle lands on at either end (`SKY_EASE.land`). A disc that overshot here would cross
 * into the words.
 */
export const BATON_EASE = [0.5, 0, 0.25, 1] as const;

/**
 * What the square does. It passes the baton only when there is a pass to show and something may
 * move; otherwise it starts, and stays, at the end. `still` is reduce motion or amber night.
 */
export function batonPlan(pass: boolean, still: boolean): { animate: boolean; start: 0 | 1 } {
  const animate = pass && !still;
  return { animate, start: animate ? 0 : 1 };
}

/* ------------------------------------------------------------------------- the frames */

type Key = readonly [at: number, value: number];

/** How finely an eased stretch is cut into straight pieces: eight is smooth at a phone's 60 Hz. */
const PIECES = 8;
/** And the throw's arc: sixteen, one piece every 22 ms of a 360 ms flight. */
const ARC_PIECES = 16;

/** A stretch from (`t0`, `v0`) to (`t1`, `v1`) along the move curve, as straight pieces. */
function along(t0: number, t1: number, v0: number, v1: number): Key[] {
  return Array.from({ length: PIECES + 1 }, (_, i) => {
    const u = i / PIECES;
    // the last key exactly at `t1`, not a rounding away from it, so the next stretch can follow
    return [i === PIECES ? t1 : t0 + (t1 - t0) * u, v0 + (v1 - v0) * easeAt(BATON_EASE, u)];
  });
}

const at = (t: number, v: number): Key[] => [[t, v]];

/**
 * The keys, in time order, as the frame `interpolate` takes: a held value between two stretches is
 * the straight line between two equal keys, so a hold needs no key of its own. The same instant
 * twice is one key if it says the same thing; anything else is a mistake in the timeline, and
 * throws rather than drawing a jump.
 */
function track(...parts: readonly Key[][]): Frame {
  const inputRange: number[] = [];
  const outputRange: number[] = [];
  for (const [x, y] of parts.flat()) {
    const last = inputRange[inputRange.length - 1];
    if (last !== undefined && x <= last) {
      if (x === last && outputRange[outputRange.length - 1] === y) continue;
      throw new Error(`baton frames out of order at ${x}`);
    }
    inputRange.push(x);
    outputRange.push(y);
  }
  return { inputRange, outputRange, extrapolate: 'clamp' };
}

/**
 * THE THROW: steady across and up and down on a parabola, as a thrown thing goes — so time is
 * spent evenly along x, and the height is 4h·u(1−u), the whole of `height` half way over.
 */
function arc(
  t0: number,
  t1: number,
  from: BatonPoint,
  to: BatonPoint,
  height: number,
): { x: Key[]; y: Key[] } {
  const x: Key[] = [];
  const y: Key[] = [];
  for (let i = 0; i <= ARC_PIECES; i += 1) {
    const u = i / ARC_PIECES;
    const t = i === ARC_PIECES ? t1 : t0 + (t1 - t0) * u;
    x.push([t, from.x + (to.x - from.x) * u]);
    y.push([t, from.y + (to.y - from.y) * u - 4 * height * u * (1 - u)]);
  }
  return { x, y };
}

export interface BatonLayerFrames {
  opacity: Frame;
  /** Offsets from where the layer rests, in points. */
  x: Frame;
  y: Frame;
  scale: Frame;
}

export interface BatonFrames {
  /** The disc that held the baton: whole at 0, gone by `gone`'s end. */
  giver: BatonLayerFrames;
  /** The disc that holds it now: in by `enter`'s end, at rest at 1. */
  taker: BatonLayerFrames;
  /** The baton: from the giver's shoulder to the taker's, turning once on the way, in degrees. */
  baton: Omit<BatonLayerFrames, 'opacity'> & { rotate: Frame };
}

export function batonFrames(g: BatonGeometry): BatonFrames {
  const B = BATON_BEATS;
  const s = g.pair.scale;
  const f = g.throw.scale;
  // each layer is placed at its REST and moved by offsets from there
  const giver = { x: g.pair.giver.x - g.rest.disc.x, y: g.pair.giver.y - g.rest.disc.y };
  const taker = { x: g.pair.taker.x - g.rest.disc.x, y: g.pair.taker.y - g.rest.disc.y };
  const from = { x: g.throw.from.x - g.rest.badge.x, y: g.throw.from.y - g.rest.badge.y };
  const to = { x: g.throw.to.x - g.rest.badge.x, y: g.throw.to.y - g.rest.badge.y };
  const flight = arc(B.throw[0], B.throw[1], from, to, g.throw.height);
  /** How far the taker comes in from, and how small it starts. */
  const ENTER = { dx: 6, scale: 0.6 };
  /** The giver on its way out: on along the way it stepped, smaller. */
  const LEAVE = { dx: -3, scale: 0.52 };
  /** The catch: the taker swells a tenth as the baton lands, and the baton squashes. */
  const CATCH = 1.1;
  const SQUASH = 0.85;
  const mid = (a: readonly [number, number]) => (a[0] + a[1]) / 2;
  return {
    giver: {
      opacity: track(at(B.gone[0], 1), at(B.gone[1], 0)),
      x: track(
        along(B.room[0], B.room[1], 0, giver.x),
        along(B.gone[0], B.gone[1], giver.x, giver.x + LEAVE.dx),
      ),
      y: track(along(B.room[0], B.room[1], 0, giver.y)),
      scale: track(along(B.room[0], B.room[1], 1, s), along(B.gone[0], B.gone[1], s, LEAVE.scale)),
    },
    taker: {
      opacity: track(at(B.enter[0], 0), at(B.enter[1] - 0.02, 1)),
      x: track(
        along(B.enter[0], B.enter[1], taker.x + ENTER.dx, taker.x),
        along(B.settle[0], B.settle[1], taker.x, 0),
      ),
      y: track(at(B.enter[0], taker.y), along(B.settle[0], B.settle[1], taker.y, 0)),
      scale: track(
        along(B.enter[0], B.enter[1], ENTER.scale, s),
        at(B.catch[0], s),
        at(mid(B.catch), s * CATCH),
        at(B.catch[1], s),
        along(B.settle[0], B.settle[1], s, 1),
      ),
    },
    baton: {
      x: track(
        along(B.room[0], B.room[1], 0, from.x),
        flight.x,
        along(B.settle[0], B.settle[1], to.x, 0),
      ),
      y: track(
        along(B.room[0], B.room[1], 0, from.y),
        flight.y,
        along(B.settle[0], B.settle[1], to.y, 0),
      ),
      // one whole turn in the air, so it lands the right way up — a thrown baton turns
      rotate: track(at(B.throw[0], 0), at(B.throw[1], 360)),
      scale: track(
        along(B.room[0], B.room[1], 1, f),
        at(B.squash[0], f),
        at(mid(B.squash), f * SQUASH),
        at(B.squash[1], f),
        along(B.settle[0], B.settle[1], f, 1),
      ),
    },
  };
}
