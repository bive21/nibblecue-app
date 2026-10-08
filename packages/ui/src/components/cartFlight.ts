/**
 * THE CART THE SUPPLIES PAGE THROWS INTO, as numbers (the owner, 2026-09-26: *"add animation in
 * shopping list to make it more fun"*, and of this one: *"Shopping: adding from Supplies flies the
 * item into the list, and the cart bounces."*). Pure TypeScript, tested in node like `paperPlane.ts`;
 * `CartFlight.tsx`, `CartBounce.tsx` and `CountRoll.tsx` only hand these numbers to `interpolate`.
 *
 * WHAT A + ON A SUPPLIES ROW DOES NOW, in ms from the tap (`CART_LAND_MS` in all):
 *     0– 90  a chip — the item's own category square, ringed in its category's ink — pops out of
 *            the + it was tapped on, from 40% of its size to a hair past full and back;
 *    90–420  it is tossed in an arc to the cart at the top of the page: up out of the row, over,
 *            and down into the basket from above, tipping a little on the way and shrinking to 42%;
 *            it fades into the cart over the last 50 ms.
 *   At 420   it lands: felt as a TAP, the cart bounces — 1 → 1.18 → 0.95 → 1.03 → 1, with a small
 *            wobble, 340 ms — and the count beside it rolls to the new number (260 ms).
 *
 * WHERE IT LANDS IS THE PAGE'S OWN CART. Supplies is a page pushed over the tabs, so the shopping
 * tab is not on the screen; the way to the list from there is the "3 on the shopping list" row at
 * the top of the page, whose cart square is the target. A parent adding things far down a long
 * catalog has scrolled that row away: the chip then flies up and out through the top of the page,
 * toward it (`cartRoute`, `lands: false`), and the count is already right when they scroll back.
 *
 * THE LANDING IS THE CALLER'S CLOCK, NOT THE DRAWING'S. The haptic, the bounce and the count all
 * happen `CART_LAND_MS` after the tap whether or not a chip could be drawn (`cartLanding`); a chip
 * that is measured a frame or two after the tap joins the flight where the clock says it should be
 * rather than landing late.
 *
 * UNDER REDUCE MOTION AND IN THE AMBER NIGHT nothing flies, bounces or rolls (`motionStill`): the
 * tap is felt on the tap and the count is simply the new number. The + turning into "On list" says
 * the rest, as it always did.
 */
import type { HapticKind } from '../feedback/haptics';
import type { ThemeName } from '../theme/theme';
import type { Frame } from './dayNightSwitch';
import { motionStill } from './tickDraw';

/* ------------------------------------------------------------------------------ the chip */

/**
 * The chip's box, in points: the catalog's small category square (32) and a ring round it. Big
 * enough to be recognized as the thing that was tapped; small beside the row it leaves.
 */
export const CART_CHIP = 36;

/** How big the chip is as it comes out of the +, at the top of its pop, at full size, and landing. */
export const CHIP_SCALE = { out: 0.4, peak: 1.1, full: 1, landed: 0.42 } as const;

/** How far the chip tips over on its way, at the middle of the flight, in degrees: it rights itself as it lands. */
export const CHIP_TILT = -16;

/* ------------------------------------------------------------------------------- the clock */

/** Out of the +. */
export const CART_EMERGE_MS = 90;
/** The top of the pop out of the +: past full size, then settling to it. */
export const CART_POP_PEAK_MS = 60;
/** In the cart: felt, bounced and counted. The whole throw is under half a second. */
export const CART_LAND_MS = 420;
/** It fades into the cart over the last of the flight. */
export const CART_FADE_MS = 50;
/** The flight is sampled every 10 ms: finer than a frame. */
export const CART_STEP_MS = 10;

/* ------------------------------------------------------------------------------ the route */

export interface Pt {
  readonly x: number;
  readonly y: number;
}

/** The flight layer's own box, in points: the page's scroller, which clips it. */
export interface CartRoom {
  readonly width: number;
  readonly height: number;
}

/**
 * A THROW, in the layer's points, y running down: across at an even pace, and up and down as a
 * thing thrown goes — `y(t) = from.y + b·t + a·t²`, `t` the share of the flight. `a` is the pull
 * that brings it down again: 0 for a straight line.
 */
export interface CartRoute {
  readonly from: Pt;
  readonly to: Pt;
  readonly a: number;
  readonly b: number;
  /**
   * Whether the chip lands in a cart that is on the page. False when the cart has been scrolled
   * off it: the route then ends just past the page's edge, straight toward it, and the chip leaves.
   */
  readonly lands: boolean;
}

/**
 * HOW FAR ABOVE THE CART THE THROW PEAKS — above the higher of its two ends, so the chip goes up
 * and over and DROPS into the basket: a share of the distance, never less than a toss and never
 * more than a lob.
 */
export const LOB = { share: 0.1, min: 28, max: 64 } as const;
/** At the top of its throw the chip keeps this far inside the page's top edge. */
export const ARC_CLEAR = 4;

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** Where the throw is at `t`, the share of the flight: 0 at the +, 1 in the cart. */
export function routeAt(r: CartRoute, t: number): Pt {
  return {
    x: r.from.x + (r.to.x - r.from.x) * t,
    y: r.from.y + r.b * t + r.a * t * t,
  };
}

/** The highest the throw goes — its least y — and when. */
export function routeTop(r: CartRoute): { y: number; t: number } {
  // a pull of nothing is a straight line, whose highest point is one of its ends
  const t = r.a > 0 ? clamp(-r.b / (2 * r.a), 0, 1) : r.b < 0 ? 1 : 0;
  return { y: routeAt(r, t).y, t };
}

/**
 * THE THROW FROM THE + TO THE CART. Across at an even pace, and up under its own speed until it
 * peaks `LOB` above the cart, then down into it — so the last of the flight is a drop into the
 * basket, from above and a little to the side, the way a thing tossed into one arrives.
 *
 * THE PEAK SETS THE THROW. A parabola through both ends with its top at a given height is one of
 * two; this is the one whose top comes BETWEEN them (`a ≥ 0`, peaking at `t` in 0–1), found in
 * closed form. It stays on the page: a peak that would be above the layer's top edge (a cart
 * close under it) comes down to `ARC_CLEAR` inside the edge, and to the higher end itself when
 * even that is too high — then the throw arrives level, with no drop.
 *
 * A CART OFF THE PAGE is not landed on: the route ends half a chip past the edge the cart is
 * beyond, at the cart's own x (kept on the page), in a straight line — the chip flies out toward
 * the list the parent scrolled away from.
 */
export function cartRoute(from: Pt, to: Pt, room: CartRoom): CartRoute {
  const half = CART_CHIP / 2;
  const onPage = to.y >= 0 && to.y <= room.height;
  if (!onPage) {
    const end: Pt = {
      x: clamp(to.x, half, Math.max(half, room.width - half)),
      y: to.y < 0 ? -half : room.height + half,
    };
    return { from, to: end, a: 0, b: end.y - from.y, lands: false };
  }
  const higher = Math.min(from.y, to.y);
  const dist = Math.hypot(to.x - from.x, to.y - from.y);
  const wanted = higher - clamp(dist * LOB.share, LOB.min, LOB.max);
  const peak = Math.max(wanted, Math.min(ARC_CLEAR + half, higher));
  // (q − a)² = 4·a·p, with p how far the start is below the peak and q the climb to the end
  const p = from.y - peak;
  const q = to.y - from.y;
  const a = q + 2 * p + 2 * Math.sqrt(Math.max(0, p * (p + q)));
  return { from, to, a, b: q - a, lands: true };
}

/* ------------------------------------------------------------------------------ the frames */

export interface CartFlightFrames {
  /** The chip's center, in the layer's points. */
  x: Frame;
  y: Frame;
  scale: Frame;
  opacity: Frame;
  /** Degrees of `rotate`. */
  turn: Frame;
}

const frame = (keys: readonly (readonly [number, number])[], span: number): Frame => ({
  inputRange: keys.map(([ms]) => ms / span),
  outputRange: keys.map(([, v]) => v),
  extrapolate: 'clamp',
});

/** Every sample time of the throw, both ends included. */
const throwTimes = (): number[] => {
  const times: number[] = [];
  for (let ms = 0; ms < CART_LAND_MS; ms += CART_STEP_MS) times.push(ms);
  times.push(CART_LAND_MS);
  return times;
};

/**
 * How far through the throw the chip is at `ms`, 0 → 1: nowhere until it is out of the +, then at
 * an even pace — the parabola does the rest, fast off the hand, slowing over the top and quickening
 * into the cart, as a thing thrown does.
 */
export function tossAt(ms: number): number {
  return clamp((ms - CART_EMERGE_MS) / (CART_LAND_MS - CART_EMERGE_MS), 0, 1);
}

/** How big the chip is at `ms`: out of the + small, past full and back, then shrinking into the cart. */
export function chipScaleAt(ms: number): number {
  if (ms <= CART_POP_PEAK_MS) {
    const u = clamp(ms / CART_POP_PEAK_MS, 0, 1);
    return CHIP_SCALE.out + (CHIP_SCALE.peak - CHIP_SCALE.out) * (1 - (1 - u) * (1 - u));
  }
  if (ms <= CART_EMERGE_MS) {
    const u = (ms - CART_POP_PEAK_MS) / (CART_EMERGE_MS - CART_POP_PEAK_MS);
    return CHIP_SCALE.peak + (CHIP_SCALE.full - CHIP_SCALE.peak) * u;
  }
  const u = clamp((ms - CART_EMERGE_MS) / (CART_LAND_MS - CART_EMERGE_MS), 0, 1);
  return CHIP_SCALE.full + (CHIP_SCALE.landed - CHIP_SCALE.full) * u ** 1.5;
}

/** Over the value 0 → 1, which is 0 → `CART_LAND_MS` from the tap. */
export function cartFlightFrames(r: CartRoute): CartFlightFrames {
  const times = throwTimes();
  const at = times.map(ms => ({ ms, p: routeAt(r, tossAt(ms)) }));
  return {
    x: frame(
      at.map(s => [s.ms, s.p.x] as const),
      CART_LAND_MS,
    ),
    y: frame(
      at.map(s => [s.ms, s.p.y] as const),
      CART_LAND_MS,
    ),
    scale: frame(
      times.map(ms => [ms, chipScaleAt(ms)] as const),
      CART_LAND_MS,
    ),
    opacity: frame(
      [
        [0, 0],
        [16, 1],
        [CART_LAND_MS - CART_FADE_MS, 1],
        [CART_LAND_MS, 0],
      ],
      CART_LAND_MS,
    ),
    turn: frame(
      times.map(ms => {
        const u = clamp((ms - CART_EMERGE_MS) / (CART_LAND_MS - CART_EMERGE_MS), 0, 1);
        return [ms, CHIP_TILT * Math.sin(Math.PI * u)] as const;
      }),
      CART_LAND_MS,
    ),
  };
}

/* ----------------------------------------------------------------------------- the landing */

export interface CartFeel {
  /** In ms from the tap. */
  at: number;
  kind: HapticKind;
}

export interface CartLanding {
  /** Whether a chip is thrown at all. */
  fly: boolean;
  /** When it lands, from the tap: the cart bounces and the count rolls then. */
  landAt: number;
  /** What the add is felt as, and when: one tap, on the landing. */
  felt: readonly CartFeel[];
}

/**
 * WHAT A + DOES BESIDES THE WRITE. With a chip: it is thrown on the tap, and the landing is felt
 * as a `tap` — one per add, at the moment the thing is in the cart. Under reduce motion and in the
 * amber Night (`motionStill`): nothing is thrown and the tap is felt on the tap — the haptic is not
 * motion, so it stays.
 */
export function cartLanding(reduceMotion: boolean, theme: ThemeName): CartLanding {
  return motionStill(reduceMotion, theme)
    ? { fly: false, landAt: 0, felt: [{ at: 0, kind: 'tap' }] }
    : { fly: true, landAt: CART_LAND_MS, felt: [{ at: CART_LAND_MS, kind: 'tap' }] };
}

/* ------------------------------------------------------------------------------ the bounce */

/** The cart's bounce as a thing lands in it. */
export const CART_BOUNCE_MS = 340;

/**
 * 1 → 1.18 → 0.95 → 1.03 → 1: up as the thing lands, a small overshoot back through rest, and
 * settled — with a wobble either way as it goes, the way a cart rocks on its wheels.
 */
export const CART_BOUNCE_KEYS: readonly (readonly [number, number, number])[] = [
  // ms, scale, degrees
  [0, 1, 0],
  [90, 1.18, -8],
  [190, 0.95, 5],
  [260, 1.03, -2],
  [CART_BOUNCE_MS, 1, 0],
];

/**
 * Smooth between the keys: each stretch eased in and out (a half cosine), sampled every 10 ms, so
 * the peaks are round rather than the corners of straight lines.
 */
function smoothKeys(keys: readonly (readonly [number, number])[], span: number): Frame {
  const out: [number, number][] = [];
  for (let i = 1; i < keys.length; i += 1) {
    const [t0, v0] = keys[i - 1] ?? [0, 0];
    const [t1, v1] = keys[i] ?? [0, 0];
    for (let ms = t0; ms < t1; ms += CART_STEP_MS) {
      const u = (ms - t0) / (t1 - t0);
      out.push([ms, v0 + (v1 - v0) * (1 - Math.cos(Math.PI * u)) * 0.5]);
    }
  }
  const last = keys[keys.length - 1] ?? [span, 1];
  out.push([last[0], last[1]]);
  return frame(out, span);
}

export function cartBounceFrames(): { scale: Frame; turn: Frame } {
  return {
    scale: smoothKeys(
      CART_BOUNCE_KEYS.map(([ms, s]) => [ms, s] as const),
      CART_BOUNCE_MS,
    ),
    turn: smoothKeys(
      CART_BOUNCE_KEYS.map(([ms, , d]) => [ms, d] as const),
      CART_BOUNCE_MS,
    ),
  };
}

/* -------------------------------------------------------------------------------- the roll */

/** The count beside the cart rolls to its new number. */
export const COUNT_ROLL_MS = 260;
/** How far the words travel as they roll, as a share of a line. */
export const COUNT_ROLL_SHIFT = 0.9;

export interface CountRollFrames {
  /** The words leaving, and the words arriving: their slide (points) and their opacity. */
  outY: Frame;
  outOpacity: Frame;
  inY: Frame;
  inOpacity: Frame;
}

/**
 * THE ROLL, over the value 0 → 1. A number that goes UP rolls up — the old words leave by the top
 * and the new come in from below, like a counter's wheel — and one that goes down rolls down.
 * Both slide on an ease-out (quick, then settling), the old gone by 70% of the way and the new
 * fully drawn from there.
 */
export function countRollFrames(line: number, dir: 1 | -1): CountRollFrames {
  const shift = line * COUNT_ROLL_SHIFT;
  const steps = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1];
  const out = (u: number) => 1 - (1 - u) ** 3;
  return {
    outY: {
      inputRange: steps,
      outputRange: steps.map(u => -dir * shift * out(u)),
      extrapolate: 'clamp',
    },
    outOpacity: { inputRange: [0, 0.7], outputRange: [1, 0], extrapolate: 'clamp' },
    inY: {
      inputRange: steps,
      outputRange: steps.map(u => dir * shift * (1 - out(u))),
      extrapolate: 'clamp',
    },
    inOpacity: { inputRange: [0.15, 0.7], outputRange: [0, 1], extrapolate: 'clamp' },
  };
}
