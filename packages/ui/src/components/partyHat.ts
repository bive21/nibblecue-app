/**
 * THE MONTH-DAY PARTY HAT, as numbers (the owner, 2026-09-26, approving the delight list —
 * "agreed", "lets try … apply it, and if i dont like it then i will let you know"). On the day a
 * baby turns a whole number of months (`monthDayOn`, packages/core), the baby's own avatar in the
 * top bar wears a small party hat, tilted, which pops on once the first time Today shows that day
 * and then sits still all day. Pure TypeScript, so every point of the drawing, every frame of the
 * pop and every word the chip says about it is tested in node — this package's tests cannot
 * render React Native — and `PartyHat.tsx` only hands these numbers to an SVG and one
 * `Animated.Value`.
 *
 * THE HAT IS WORN, NOT BALANCED. It is a cone standing on the head's rim along the head's own
 * radius at its tilt, its base sunk a little inside the circle, so whatever the head is — the brand
 * gradient with the initial, or the baby's own picture — the hat reads as on it. It is drawn in
 * proportion to the head (`HAT`), so the one 31 pt avatar and the 21 and 18 pt discs of "Both"
 * each wear a hat of their own size, and every one keeps clear of the initial on its face.
 *
 * WHERE IT MAY REACH: up into the chip's own padding and the bar's space above the chip, never
 * past it into the phone's status bar; right no further than the gap before the chip's words; and,
 * on Both, never over another baby's disc or another baby's hat (`partyHat.test.ts` measures each).
 *
 * ONE KEYLINE ROUND ALL OF IT, in the chip's own solid surface (`theme/partyHat.ts`): the same
 * device the pair's rings use to part two circles of one gradient. The hat's colors are the
 * household's accent, and so is the gradient under it; the keyline is what keeps a teal hat on a
 * teal head a hat.
 *
 * THE POP: 0 to 1 on one value, on the native driver — the hat grows from nothing out of the
 * middle of its base past full size and settles back (`HAT_POP_FRAMES`), a beat after Today
 * appears (`HAT_POP.delayMs`) so the pop is not spent on the frames the page is still arriving in.
 * WHEN NOTHING MOVES — reduce motion, or the amber Night (`motionStill`) — the hat is simply there.
 * What decides whether a hat pops at all is the app's (`apps/mobile/src/celebrations/monthHat.ts`):
 * once, on Today, the first time Today shows that day; everywhere else it arrives still.
 */
import type { Frame } from './dayNightSwitch';

/* ------------------------------------------------------------------------------ the drawing */

export interface HatPoint {
  x: number;
  y: number;
}

/** The head a hat is worn on: its center and radius, in the coordinates the hat is drawn in. */
export interface HatHead {
  cx: number;
  cy: number;
  r: number;
}

/**
 * THE HAT'S PROPORTIONS, as fractions of the head's diameter. On the chip's 31 pt avatar that is a
 * cone about 10 pt tall on a 10 pt base, its middle sunk 2.8 pt inside the rim, with a 2.2 pt
 * pom-pom: a hat, not a crown, and short enough to stay inside the bar (`partyHat.test.ts`).
 */
export const HAT = {
  /** Base to tip. */
  height: 0.32,
  /** Across the base. */
  base: 0.32,
  /** How far the middle of the base sits inside the head's rim, so the hat is worn. */
  seat: 0.09,
  /** The pom-pom's radius, and how far past the tip its center sits (in its own radii). */
  pom: 0.07,
  pomLift: 0.3,
  /** The keyline round the whole hat, clamped so a small hat is not all outline. */
  halo: 0.04,
  haloMin: 0.9,
  haloMax: 1.25,
  /** Two bands across the cone, as fractions of its height from the base. */
  stripes: [
    [0.22, 0.36],
    [0.52, 0.66],
  ],
} as const;

/**
 * HOW EACH HAT LEANS, in degrees clockwise from upright. The one avatar's leans right, jauntily,
 * away from the chip's rounded end; on Both each baby's hat leans away from the others, into room
 * the pair leaves free — the back disc's to the left, the front disc's to the right, and of three
 * the top one nearly upright and the two below out to either side.
 */
export const HAT_TILT = {
  one: 20,
  two: [-16, 22],
  three: [10, -48, 48],
} as const;

/** The tilt for disc `index` of `count` heads (one is the chip's own avatar). */
export function hatTilt(count: number, index: number): number {
  if (count <= 1) return HAT_TILT.one;
  const set: readonly number[] = count === 2 ? HAT_TILT.two : HAT_TILT.three;
  return set[index] ?? HAT_TILT.one;
}

export interface HatBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface HatGeometry {
  /** The cone: base left, tip, base right. */
  cone: readonly [HatPoint, HatPoint, HatPoint];
  /** The bands across it, each four corners in drawing order. */
  stripes: readonly (readonly [HatPoint, HatPoint, HatPoint, HatPoint])[];
  pom: { cx: number; cy: number; r: number };
  /** The keyline's width round the cone and the pom-pom. */
  halo: number;
  /** The middle of the base: what the hat grows out of when it pops. */
  pivot: HatPoint;
  /** Whole points holding all of it, keyline and a half-point of edge included: the hat's view. */
  box: HatBox;
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

export function hatGeometry(head: HatHead, tiltDeg: number): HatGeometry {
  const d = 2 * head.r;
  const turn = (tiltDeg * Math.PI) / 180;
  // `up` runs from the base to the tip; `across` runs along the base, left to right when upright
  const up = { x: Math.sin(turn), y: -Math.cos(turn) };
  const across = { x: Math.cos(turn), y: Math.sin(turn) };
  const height = HAT.height * d;
  const half = (HAT.base * d) / 2;
  const reach = head.r - HAT.seat * d;
  const pivot = { x: head.cx + reach * up.x, y: head.cy + reach * up.y };
  // a point `u` of the way up the cone (0 the base, 1 the tip), `side` of its half-width across
  const at = (u: number, side: number): HatPoint => ({
    x: pivot.x + u * height * up.x + side * half * (1 - u) * across.x,
    y: pivot.y + u * height * up.y + side * half * (1 - u) * across.y,
  });
  const cone = [at(0, -1), at(1, 0), at(0, 1)] as const;
  const stripes = HAT.stripes.map(
    ([u0, u1]) => [at(u0, -1), at(u0, 1), at(u1, 1), at(u1, -1)] as const,
  );
  const pomR = HAT.pom * d;
  const tip = cone[1];
  const pom = {
    cx: tip.x + HAT.pomLift * pomR * up.x,
    cy: tip.y + HAT.pomLift * pomR * up.y,
    r: pomR,
  };
  const halo = clamp(HAT.halo * d, HAT.haloMin, HAT.haloMax);
  const edge = halo + 0.5;
  const xs = [...cone.map(p => p.x), pom.cx - pom.r, pom.cx + pom.r];
  const ys = [...cone.map(p => p.y), pom.cy - pom.r, pom.cy + pom.r];
  const x = Math.floor(Math.min(...xs) - edge);
  const y = Math.floor(Math.min(...ys) - edge);
  const box = {
    x,
    y,
    width: Math.ceil(Math.max(...xs) + edge) - x,
    height: Math.ceil(Math.max(...ys) + edge) - y,
  };
  return { cone, stripes, pom, halo, pivot, box };
}

/** `x,y x,y …` — the shape an SVG `points` attribute takes. */
export const hatPoints = (points: readonly HatPoint[]): string =>
  points.map(p => `${round2(p.x)},${round2(p.y)}`).join(' ');

const round2 = (n: number): number => Math.round(n * 100) / 100;

/* ------------------------------------------------------------------------------- the pop */

/** How a hat arrives: `pop` plays the pop once, as it first appears; `still` is simply there. */
export type HatEntrance = 'pop' | 'still';

/**
 * THE POP: 350 ms on the ease the design system's other pops use (the skin tile's check badge,
 * `skinTile.ts`), the overshoot in the frames rather than in the curve — so the hat is whole within
 * about 40 ms, is at its fullest about a third of the way through, and settles over the rest — and
 * a quarter of a second's beat before it: Today's first frames are the page arriving, and a pop
 * played under them is a pop nobody saw.
 */
export const HAT_POP = {
  ms: 350,
  delayMs: 250,
  ease: [0.25, 0.1, 0.25, 1],
} as const;

const frame = (
  inputRange: readonly number[],
  outputRange: readonly number[],
  extrapolate: Frame['extrapolate'] = 'clamp',
): Frame => ({ inputRange, outputRange, extrapolate });

export interface HatPopFrames {
  /** Of the pop's value: the hat's size, about the middle of its base — nothing, past full, full. */
  scale: Frame;
  /** Of the pop's value: in over the first eighth, so the smallest sizes are never a speck. */
  opacity: Frame;
}

export const HAT_POP_FRAMES: HatPopFrames = {
  scale: frame([0, 0.55, 1], [0, 1.1, 1]),
  opacity: frame([0, 0.12], [0, 1]),
};

/** What a hat does as it first appears: where its value starts, and whether it moves from there. */
export interface HatArrival {
  from: 0 | 1;
  animate: boolean;
  delay: number;
  duration: number;
}

/**
 * DECIDED ONCE, WHEN THE HAT FIRST APPEARS. A hat asked to pop pops — unless nothing may move, in
 * which case it is simply there, whole, like a hat that arrived still. A hat already on the head
 * never pops again, whatever it is asked afterwards: the app turns its `pop` into `still` the
 * moment the pop has been played, and that change must not replay it.
 */
export function hatArrival(entrance: HatEntrance, still: boolean): HatArrival {
  if (still || entrance === 'still') return { from: 1, animate: false, delay: 0, duration: 0 };
  return { from: 0, animate: true, delay: HAT_POP.delayMs, duration: HAT_POP.ms };
}

/* ----------------------------------------------------------------------- what it says */

/**
 * THE CHIP'S ACCESSIBLE NAME, WITH THE MONTH-DAY IN IT. The hat is drawing and is hidden from
 * assistive technology; what it means is said once, in the chip's own name, as a plain fact the app
 * composes (`3 months today`, or on Both `Ada is 3 months today`) — never an exclamation, never
 * praise. When the fact begins with the age the chip already reads ("3 months" and "3 months
 * today"), the age is not read a second time. With no month-day this is the chip's name exactly as
 * it always was.
 */
export function childChipLabel(shown: string, ageLabel: string, monthDay?: string): string {
  const fact = monthDay?.trim() ?? '';
  const age = ageLabel !== '' && fact.startsWith(`${ageLabel} `) ? '' : ageLabel;
  return `${shown}${age ? `, ${age}` : ''}${fact ? `, ${fact}` : ''}. Switch child`;
}
