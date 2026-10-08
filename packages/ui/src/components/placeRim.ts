/**
 * A STORAGE PLACE'S PICTURE AT THE RIM OF A SURFACE, as numbers (the owner, 2026-09-26: *"why do
 * you only have the new background image in milk stash only for frozen, this is a fun one, and it
 * should be on every category"*). Frost came first (`frostRim.ts`); these are its siblings, one
 * per place, each drawn exactly where frost is — in the host's padding, beside its words and never
 * under them:
 *
 *   - ROOM, a counter: a warm GLOW at the edge like a little sunbeam, two shafts of light slanting
 *     in from it and a couple of motes in them;
 *   - FRIDGE: DEW — a faint cool mist at the edge and beads of condensation, one of which runs a
 *     little way down when it arrives and stays where it stopped, its wet track behind it;
 *   - FREEZER: the frost; DEEP_FREEZER: the frost, heavier — a third fern a side, a bluer rim;
 *   - THAWED: MELTWATER — what a frost leaves when it thaws: its drops resting at the foot of the
 *     runs they made, the wet lines behind them, a bead or two, and a faint wet sheen.
 *
 * Pure TypeScript, so every piece of every picture, every frame of every motion and every decision
 * about which one plays is a node test (`placeRim.test.ts`); `PlaceRim.tsx` only hands these
 * numbers to views and to `Animated.Value#interpolate`. The design system knows nothing about milk:
 * this is "the rim of a surface, dressed as a place", and the caller says which place.
 *
 * THE SHAPE EVERY PICTURE SHARES, from frost: two STRIPS, one down each side of the host, exactly as
 * wide as its side padding and as tall as its content (the top and bottom padding are kept clear).
 * In each, a broad WASH — frost's glaze, the fridge's mist, the counter's glow, meltwater's sheen —
 * thickest on the edge and gone at the strip's inner edge and at its two ends, and the picture's
 * own small pieces near the edge. `placeRim.test.ts` walks every strip a host can give and holds
 * every piece inside its strip, apart from the others, and clear of the roundest card corner any
 * skin draws. A card whose words fill its left and leave its right empty wears its picture down the
 * RIGHT only, in a strip as wide as that emptiness allows (`rimZone`).
 *
 * WHEN THEY MOVE — and the rule the owner's brief for the stash turns on — ONLY ON A CHANGE THE
 * CALLER SAW: a picture that first appears is drawn at rest, so a list of a hundred rows opens
 * still. A change is handed down as a cue, from one place to another (`PlaceRimCue`), and plays
 * ONE motion (`rimPlan`): frost keeps its own arrival (the creep) and its own departure (the melt, or
 * the THAW when what comes next is meltwater, whose drops stay); every other picture has one short
 * ARRIVAL, at most 600 ms, and then sits still; a picture that is not frost leaves by fading while
 * the sheet that caused the change slides away. Nothing loops. Reduce motion and the amber Night
 * theme draw the end of any change, set directly (`frostCalm`).
 */
import type { PlaceKind } from '../theme/placeTones';
import type { Frame } from './dayNightSwitch';
import {
  DEEP_FROST,
  DROP_MAX_STRETCH,
  DROP_SAG,
  EASE,
  FALL,
  FORM,
  FROST_HOLD_MS,
  FROST_MIN_RIM,
  FROST_MIN_STRIP,
  FROST_MS,
  FROST_RECIPE,
  FROST_SIDES,
  THAW_TRAIL,
  clearBand,
  cornerShift,
  curve,
  frameOf,
  frostDrops,
  frostFrames,
  frostGeometry,
  type Box,
  type Drop,
  type DropFrames,
  type FrostCorners,
  type FrostGeometry,
  type FrostInset,
  type FrostMotion,
  type FrostSide,
  type MotionFrames,
  type PieceFrames,
  type Point,
} from './frostRim';

/* ----------------------------------------------------------------------------- the words */

/** Every picture there is, as the storage place it is drawn for. */
export const PLACE_RIM_LOOKS: readonly PlaceKind[] = [
  'ROOM',
  'FRIDGE',
  'FREEZER',
  'DEEP_FREEZER',
  'THAWED',
];

/**
 * The picture for a caller's kind: one of the five, or null — a place of a kind this build does
 * not know draws nothing, as it draws a neutral dot rather than a hue it has no claim to
 * (`placeTone`).
 */
export function placeRimLook(kind: string | null | undefined): PlaceKind | null {
  return PLACE_RIM_LOOKS.find(look => look === kind) ?? null;
}

/** The two pictures that are frost, and so keep frost's own motions. */
export type FrostLook = 'FREEZER' | 'DEEP_FREEZER';
export const isFrostLook = (look: PlaceKind | null): look is FrostLook =>
  look === 'FREEZER' || look === 'DEEP_FREEZER';

/** Down both sides of the host (a row), or down its right side only (a card empty on its right). */
export type RimSides = 'both' | 'right';
export const sidesOf = (sides: RimSides): readonly FrostSide[] =>
  sides === 'right' ? ['right'] : FROST_SIDES;

/* --------------------------------------------------------------------------- the corners */

/** The radius each corner of the host is clipped to; 0 where it is not a card's corner. */
export interface RimClip {
  topLeft: number;
  topRight: number;
  bottomLeft: number;
  bottomRight: number;
}

/**
 * THE CLIP A HOST'S CORNERS ASK FOR (`FrostCorners` says why only a card's own corners are ever
 * rounded). A picture down the right only is drawn from the right edge, so only the right-hand
 * corners are the card's: its strip's left edge is somewhere in the middle of the card, and
 * rounding it would take a bite out of the wash where no corner is.
 */
export function rimClip(
  corners: FrostCorners | null | undefined,
  sides: RimSides = 'both',
): RimClip | null {
  if (corners == null || (!corners.top && !corners.bottom) || corners.radius <= 0) return null;
  const top = corners.top ? corners.radius : 0;
  const bottom = corners.bottom ? corners.radius : 0;
  const left = sides === 'both';
  return {
    topLeft: left ? top : 0,
    topRight: top,
    bottomLeft: left ? bottom : 0,
    bottomRight: bottom,
  };
}

/* ------------------------------------------------------------------------------ the zone */

/**
 * A CARD'S EMPTY RIGHT SIDE, as a strip for its picture (the owner, 2026-09-26, of the stash's
 * storage windows: *"only on right side, since its mostly empty on the right"*). The caller
 * measures two things on the device — the card's width, and the right-hand edge of its words — and
 * the strip is what is left of the card past the words, less a clear `gap`, up to `max`:
 *
 *   - NEVER UNDER A WORD, by construction and not by an estimate of how wide a word is: the strip
 *     starts at or past the words' measured edge, whatever the phone's text size did to them;
 *   - NEVER LESS THAN THE CARD'S OWN PADDING, which no word is ever laid out in — so a card whose
 *     words run to its edge (a long label, the largest text) still wears its picture there, in the
 *     margin, exactly as a row wears frost in its;
 *   - NEVER MORE THAN `max`, because a picture a third of a card wide is a banner, not a rim.
 *
 * Null until both are measured: a picture that guessed first and moved after would be a flash.
 */
export const RIM_ZONE = { max: 36, gap: 6 } as const;

export function rimZone(m: {
  /** The card's width, border included (its own `onLayout`). */
  width: number;
  /** The right-hand edge of its words, measured from the card's left edge, border included. */
  words: number;
  /** The card's border width, which the picture is drawn inside. */
  border: number;
  /** The card's side padding: always free of words. */
  pad: number;
}): number | null {
  if (!(m.width > 0) || !(m.words > 0)) return null;
  // what is past the words, inside the border: the picture is drawn in the padding box
  const room = m.width - m.border - m.words;
  if (room <= 0) return null;
  return Math.min(room, Math.max(m.pad, Math.min(RIM_ZONE.max, room - RIM_ZONE.gap)));
}

/* ---------------------------------------------------------------------------- the pieces */

/** A strip: its top in the host, its height, and its width. Frost's own shape. */
export type Strip = FrostGeometry['strip'];

/** A wash: an ellipse centered on the edge at the strip's middle, gone at its reach. */
export interface Wash {
  rx: number;
  ry: number;
  cy: number;
}

/** A bead of water (or a mote of light): its center, strip coordinates, its radius, and when it
 *  appears, in ms into its picture's arrival. */
export interface Bead {
  side: FrostSide;
  cx: number;
  cy: number;
  r: number;
  at: number;
}

/** The fridge's one bead that runs: down its center line from `y0` to `y1`, where it stays. */
export interface Runner {
  side: FrostSide;
  cx: number;
  y0: number;
  y1: number;
  r: number;
}

/**
 * A shaft of the counter's light: a thin wedge from its ROOT on the edge to its TIP further in and
 * lower down, fading along its length. Drawn in its own box for the arrival, which grows it from
 * its root, and in strip coordinates for the still picture.
 */
export interface Ray {
  side: FrostSide;
  root: Point;
  tip: Point;
  box: Box;
  d: string;
  dStrip: string;
  /** Where it grows from, inside its box. */
  origin: Point;
  at: number;
}

/** What every picture has: its strips (the sides it is drawn down, and their shape) and its wash. */
interface RimBase {
  sides: readonly FrostSide[];
  strip: Strip;
  wash: Wash;
}

export type RimGeometry = RimBase &
  (
    | { look: FrostLook; frost: FrostGeometry }
    | { look: 'FRIDGE'; beads: readonly Bead[]; runner: Runner | null }
    | { look: 'ROOM'; rays: readonly Ray[]; motes: readonly Bead[] }
    | { look: 'THAWED'; drops: readonly Drop[]; beads: readonly Bead[] }
  );

/** How close to its strip's edges a bead's rim may come. */
const BEAD_EDGE = 0.4;

/** A bead, as fractions of its strip: `u` in from the edge, `v` down; its radius; when it appears. */
interface BeadPlan {
  u: number;
  v: number;
  r: number;
  at: number;
}

/**
 * THE FRIDGE'S DEW: beads of every size scattered near the edge, a different scatter each side —
 * condensation is not a pattern — and one on the right that RUNS: it appears, hangs, and slides a
 * little way down, leaving the wet track a real bead leaves. Placed as fractions of the strip, so a
 * wider strip (a card's empty right side) spreads them further in.
 */
const DEW_BEADS: Readonly<Record<FrostSide, readonly BeadPlan[]>> = {
  left: [
    { u: 0.26, v: 0.2, r: 1.45, at: 40 },
    { u: 0.62, v: 0.36, r: 1, at: 150 },
    { u: 0.3, v: 0.6, r: 1.85, at: 95 },
    { u: 0.64, v: 0.84, r: 1.15, at: 205 },
  ],
  right: [
    { u: 0.24, v: 0.16, r: 1.2, at: 70 },
    { u: 0.64, v: 0.44, r: 1.55, at: 125 },
    { u: 0.3, v: 0.86, r: 1.3, at: 180 },
  ],
};
const DEW_RUNNER = { side: 'right', u: 0.3, from: 0.3, to: 0.66, r: 1.7 } as const;
/** How far the running bead stretches at most, and how far it sags before it lets go. */
export const RUNNER_STRETCH = 1.25;
export const RUNNER_SAG = 0.6;

/**
 * THE COUNTER'S LIGHT: two shafts a side, slanting in and down from the edge as light through a
 * window does, the upper one longer; and two motes floating in them.
 */
interface RayPlan {
  /** Where its root sits, down the strip; how far in it reaches, as a share of the strip's width. */
  v: number;
  reach: number;
  /** Degrees below level, going inward. */
  angle: number;
  /** Its width at the root and at the tip. */
  w0: number;
  w1: number;
  at: number;
}
const GLOW_RAYS: Readonly<Record<FrostSide, readonly RayPlan[]>> = {
  left: [
    { v: 0.22, reach: 0.88, angle: 30, w0: 1.3, w1: 3.2, at: 120 },
    { v: 0.5, reach: 0.7, angle: 36, w0: 1, w1: 2.5, at: 200 },
  ],
  right: [
    { v: 0.24, reach: 0.84, angle: 28, w0: 1.2, w1: 3, at: 150 },
    { v: 0.54, reach: 0.66, angle: 34, w0: 1, w1: 2.4, at: 230 },
  ],
};
/** A shaft's root sits this far in from the edge, clear of a card's rounded corner. */
const RAY_ROOT = 1.2;
const GLOW_MOTES: Readonly<Record<FrostSide, readonly BeadPlan[]>> = {
  left: [
    { u: 0.52, v: 0.36, r: 0.75, at: 360 },
    { u: 0.36, v: 0.74, r: 0.6, at: 420 },
  ],
  right: [
    { u: 0.46, v: 0.38, r: 0.7, at: 390 },
    { u: 0.6, v: 0.76, r: 0.6, at: 450 },
  ],
};

/**
 * MELTWATER'S BEADS: one a side that did not run, tucked between the edge and the drops' lines —
 * placed from the edge in points, not as a share of the strip, because the drops they keep clear
 * of are placed that way (`frostDrops`).
 */
const MELT_BEADS: Readonly<Record<FrostSide, readonly BeadPlan[]>> = {
  left: [{ u: 2.8, v: 0.5, r: 1.2, at: 260 }],
  right: [{ u: 2.6, v: 0.34, r: 1.3, at: 320 }],
};

const clamp = (x: number, lo: number, hi: number): number => Math.min(Math.max(x, lo), hi);
const stripX = (side: FrostSide, width: number, u: number): number =>
  side === 'left' ? u : width - u;
/** A number, short: paths are strings, and six decimals of a point is noise (`frostRim.ts`'s `f`). */
const f = (n: number): number => Math.round(n * 1000) / 1000;

/**
 * A bead placed in its strip, whole inside it and clear of the card's corners (`clearBand`), or
 * left out where there is no such room; `fraction` says whether `u` is a share or points.
 */
function placeBead(
  side: FrostSide,
  strip: Strip,
  corners: FrostCorners | null,
  p: BeadPlan,
  fraction: boolean,
): Bead[] {
  const w = strip.width;
  const S = strip.height;
  const u = clamp(fraction ? p.u * w : p.u, p.r + BEAD_EDGE, w - p.r - BEAD_EDGE);
  const band = clearBand(strip, corners, u, p.r);
  const lo = Math.max(p.r + BEAD_EDGE, band.lo);
  const hi = Math.min(S - p.r - BEAD_EDGE, band.hi);
  if (lo > hi) return [];
  return [{ side, cx: stripX(side, w, u), cy: clamp(p.v * S, lo, hi), r: p.r, at: p.at }];
}

function placeRay(side: FrostSide, strip: Strip, corners: FrostCorners | null, p: RayPlan): Ray[] {
  const w = strip.width;
  const S = strip.height;
  const a = (p.angle * Math.PI) / 180;
  // the unit vector along the shaft (inward and down) and the one across it, in (u, v)
  const along = { u: Math.cos(a), v: Math.sin(a) };
  const across = { u: -Math.sin(a), v: Math.cos(a) };
  /** The shaft rooted `v0` down the strip, `length` long: its root, its tip and its four corners. */
  const shaft = (v0: number, length: number) => {
    const root = { u: RAY_ROOT, v: v0 };
    const tip = { u: RAY_ROOT + along.u * length, v: v0 + along.v * length };
    return {
      root,
      tip,
      quad: [
        { u: root.u + (across.u * p.w0) / 2, v: root.v + (across.v * p.w0) / 2 },
        { u: tip.u + (across.u * p.w1) / 2, v: tip.v + (across.v * p.w1) / 2 },
        { u: tip.u - (across.u * p.w1) / 2, v: tip.v - (across.v * p.w1) / 2 },
        { u: root.u - (across.u * p.w0) / 2, v: root.v - (across.v * p.w0) / 2 },
      ],
    };
  };
  type Shaft = ReturnType<typeof shaft>;
  const span = (s: Shaft) => {
    const vs = s.quad.map(q => q.v);
    return { high: Math.min(...vs), low: Math.max(...vs) };
  };
  // a strip too short for the whole shaft shortens it, a fifth at a time, until it fits
  let length = Math.max(0, p.reach * w - RAY_ROOT);
  let shape = shaft(p.v * S, length);
  for (let i = 0; i < 12; i += 1) {
    const { high, low } = span(shape);
    if (low - high <= S) break;
    length *= 0.8;
    shape = shaft(p.v * S, length);
  }
  // and a shaft whose foot would run past the strip's end is lifted inside it rather than cut
  const { high, low } = span(shape);
  const lift = low > S ? S - low : high < 0 ? -high : 0;
  if (lift !== 0) shape = shaft(p.v * S + lift, length);
  // one at a card's rounded corner moves clear of it; one that cannot, whole, is left out
  const inStrip = (s: Shaft) => s.quad.map(q => ({ x: stripX(side, w, q.u), y: q.v }));
  const clear = cornerShift(inStrip(shape), side, strip, corners, 0);
  if (clear === null) return [];
  if (clear !== 0) {
    shape = shaft(shape.root.v + clear, length);
    const moved = span(shape);
    if (moved.high < -1e-9 || moved.low > S + 1e-9) return [];
    if (cornerShift(inStrip(shape), side, strip, corners, 0) !== 0) return [];
  }
  const pts = inStrip(shape);
  const xs = pts.map(q => q.x);
  const ys = pts.map(q => q.y);
  const box: Box = {
    left: Math.min(...xs),
    top: Math.min(...ys),
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
  };
  const path = (dx: number, dy: number) =>
    `M${pts.map(q => `${f(q.x - dx)} ${f(q.y - dy)}`).join('L')}Z`;
  const root = { x: stripX(side, w, shape.root.u), y: shape.root.v };
  const tip = { x: stripX(side, w, shape.tip.u), y: shape.tip.v };
  return [
    {
      side,
      root,
      tip,
      box,
      d: path(box.left, box.top),
      dStrip: path(0, 0),
      origin: { x: root.x - box.left, y: root.y - box.top },
      at: p.at,
    },
  ];
}

/**
 * EVERY PIECE OF A PICTURE for a host of `height`, inside its padding `inset`, down `sides`, and
 * clear of the card `corners` it is clipped to (`clearBand`). A strip too small for a piece to sit
 * in whole gets the wash alone, which scales to anything — the rule frost has always kept.
 */
export function rimGeometry(
  look: PlaceKind,
  height: number,
  inset: FrostInset,
  sides: RimSides = 'both',
  corners: FrostCorners | null = null,
): RimGeometry {
  const drawn = sidesOf(sides);
  if (look === 'FREEZER' || look === 'DEEP_FREEZER') {
    const frost = frostGeometry(height, inset, {
      recipe: look === 'DEEP_FREEZER' ? DEEP_FROST : FROST_RECIPE,
      sides: drawn,
      corners,
    });
    return { look, sides: drawn, strip: frost.strip, wash: frost.glaze, frost };
  }
  const width = Math.max(0, inset.x);
  const top = Math.max(0, inset.y);
  const S = Math.max(0, height - 2 * top);
  const strip: Strip = { top, height: S, width };
  const wash: Wash = { rx: width, ry: S / 2, cy: S / 2 };
  const room = S >= FROST_MIN_STRIP && width >= FROST_MIN_RIM;
  const each = <T>(plan: Readonly<Record<FrostSide, readonly T[]>>) =>
    room ? drawn.flatMap(side => plan[side].map(p => ({ side, p }))) : [];

  if (look === 'FRIDGE') {
    const beads = each(DEW_BEADS).flatMap(({ side, p }) =>
      placeBead(side, strip, corners, p, true),
    );
    return { look, sides: drawn, strip, wash, beads, runner: room ? placeRunner() : null };
  }
  if (look === 'ROOM') {
    const rays = each(GLOW_RAYS).flatMap(({ side, p }) => placeRay(side, strip, corners, p));
    const motes = each(GLOW_MOTES).flatMap(({ side, p }) =>
      placeBead(side, strip, corners, p, true),
    );
    return { look, sides: drawn, strip, wash, rays, motes };
  }
  // THAWED: the frost's own drops, where its thaw leaves them, and a bead a side
  const drops = frostDrops(strip, drawn, corners);
  const beads = each(MELT_BEADS).flatMap(({ side, p }) =>
    placeBead(side, strip, corners, p, false),
  );
  return { look, sides: drawn, strip, wash, drops, beads };

  /** The fridge's running bead: whole inside the strip, and clear of its corners, at both ends. */
  function placeRunner(): Runner | null {
    if (!drawn.includes(DEW_RUNNER.side)) return null;
    const r = DEW_RUNNER.r;
    const u = clamp(DEW_RUNNER.u * width, r + BEAD_EDGE, width - r - BEAD_EDGE);
    // how far it reaches above and below its center, stretched as far as it goes
    const reach = r * RUNNER_STRETCH;
    const band = clearBand(strip, corners, u, r);
    const margin = reach + RUNNER_SAG + BEAD_EDGE;
    const y0 = clamp(DEW_RUNNER.from * S, Math.max(margin, band.lo + reach), S / 2);
    const y1 = Math.max(Math.min(DEW_RUNNER.to * S, S - margin, band.hi - reach), y0 + 1);
    if (y0 - reach < band.lo - 1e-9 || y1 + reach > band.hi + 1e-9) return null;
    return { side: DEW_RUNNER.side, cx: stripX(DEW_RUNNER.side, width, u), y0, y1, r };
  }
}

/* ---------------------------------------------------------------------------- the clock */

/**
 * THE BEAT BEFORE ANYTHING MOVES: frost's own (`FROST_HOLD_MS`), for frost's reason — a change is
 * made in a bottom sheet, and the sheet slides away over it. A picture that is leaving FADES in this
 * beat, under the sheet, so the one arriving has the rim to itself.
 */
export const RIM_HOLD_MS = FROST_HOLD_MS;
/** An arrival that is not frost's: one short flourish, then still. Never past 600 ms. */
export const RIM_ARRIVE_MS = 560;
/**
 * When a MELTING frost hands the rim to the picture that comes next: the moment its glaze has gone
 * (`frostFrames`' melt), while its last droplets are still running, as water would.
 */
export const RIM_HANDOFF_MS = 1260;

/**
 * WHAT ONE CHANGE PLAYS, from one picture to another — every layer of it on ONE clock of `total`
 * ms, so a picture that mounts part way through joins it by setting the clock:
 *
 *   - `fade`: the picture that is leaving, when it is not frost, fading in the opening beat;
 *   - `frost`: frost's own motion — its creep when frost arrives, its melt when it leaves for
 *     anything but meltwater, its THAW (the drops stay) when it leaves for meltwater;
 *   - `arrive`: the new picture's flourish, from `at` ms — after the beat, or at the hand-off when a
 *     frost is melting away before it. `runs` is false for meltwater after a thaw: its drops are
 *     the thaw's, already running.
 *
 * Null when there is nothing to play: no change; or frost to frost, which is set directly — a bag
 * moved between two freezers keeps its frost and only its weight changes.
 */
export interface RimPlan {
  total: number;
  fade: PlaceKind | null;
  frost: { look: FrostLook; motion: FrostMotion } | null;
  arrive: { look: Exclude<PlaceKind, FrostLook>; at: number; runs: boolean } | null;
}

export function rimPlan(from: PlaceKind | null, to: PlaceKind | null): RimPlan | null {
  if (to === null || from === to) return null;
  if (isFrostLook(from) && isFrostLook(to)) return null;
  if (isFrostLook(to))
    return {
      total: FROST_MS.creep,
      fade: from,
      frost: { look: to, motion: 'creep' },
      arrive: null,
    };
  if (isFrostLook(from)) {
    const thaw = to === 'THAWED';
    return {
      total: FROST_MS[thaw ? 'thaw' : 'melt'],
      fade: null,
      frost: { look: from, motion: thaw ? 'thaw' : 'melt' },
      arrive: { look: to, at: RIM_HANDOFF_MS, runs: !thaw },
    };
  }
  return {
    total: RIM_HOLD_MS + RIM_ARRIVE_MS,
    fade: from,
    frost: null,
    arrive: { look: to, at: RIM_HOLD_MS, runs: true },
  };
}

/**
 * A change for a picture to show, handed down by whoever saw it happen (the stash screen): from
 * which picture (null for a host that has just arrived) to which. Its `startAt` is when it began to
 * be SHOWN, not when the data changed: a change that lands while the screen is not in front waits,
 * with `startAt` null, and starts when it is.
 */
export interface PlaceRimCue {
  from: PlaceKind | null;
  to: PlaceKind | null;
  startAt: number | null;
}

/** What a picture draws now: a look at rest, or a change from a point in it (0–1). */
export type PlaceRimShow =
  | { kind: 'still'; look: PlaceKind | null }
  | { kind: 'play'; from: PlaceKind | null; to: PlaceKind; at: number };

/**
 * WHAT TO DRAW, from the look the host has now, the cue it was handed, the clock, and whether the
 * picture may move at all:
 *
 *   - no cue, or CALM (reduce motion, or Night): the look it has, still. A change under reduce
 *     motion is simply the new look, set directly — never a frame of the way there;
 *   - a cue that does not lead to the look it has now (it was moved again), or one with nothing to
 *     play: the look it has;
 *   - a cue still WAITING for the screen to be in front: the look it is leaving, still, so the
 *     first frame the parent sees is where the change starts rather than where it ends;
 *   - a cue under way: that change, from as far as it has got — so a second picture of the same
 *     thing joins the first rather than starting over;
 *   - a cue whose change is over: the look it has, still. A picture that first appears after the
 *     change is drawn as it is, never as a transition.
 */
export function placeRimShow(
  look: PlaceKind | null,
  cue: PlaceRimCue | null | undefined,
  now: number,
  calm: boolean,
): PlaceRimShow {
  if (cue == null || calm || cue.to !== look) return { kind: 'still', look };
  const plan = rimPlan(cue.from, look);
  if (plan === null || look === null) return { kind: 'still', look };
  if (cue.startAt === null) return { kind: 'still', look: cue.from };
  const at = (now - cue.startAt) / plan.total;
  if (at >= 1) return { kind: 'still', look };
  return { kind: 'play', from: cue.from, to: look, at: Math.max(0, at) };
}

/* ---------------------------------------------------------------------------- the frames */

/** A bead popping in: it swells a little past its size and settles. */
function pop(total: number, t: number): PieceFrames {
  return {
    opacity: frameOf(total, curve(t, t + 60, 0, 1)),
    scale: frameOf(
      total,
      curve(t, t + 100, 0.3, 1.15, FORM),
      curve(t + 100, t + 170, 1.15, 1, EASE),
    ),
  };
}

/** A wash arriving: it fades in and spreads from the edge, `reach` ms to its full width. */
function washIn(total: number, t: number, fade: number, reach: number, from: number): PieceFrames {
  return {
    opacity: frameOf(total, curve(t, t + fade, 0, 1)),
    scale: frameOf(total, curve(t, t + reach, from, 1, FORM)),
  };
}

/**
 * A DROP THAT RUNS AND STAYS, from `t`: it forms, hangs and sags, lets go and falls faster as it
 * goes, stretching, and settles round at the foot of its run with its wet line behind it — frost's
 * droplet, told in a third of the time (`frostFrames`), because this is a flourish and not a melt.
 * The same shape carries the fridge's running bead.
 */
function runStays(
  total: number,
  t: number,
  run: number,
  sag: number,
  stretch: number,
  trailRest: number,
): DropFrames {
  return {
    opacity: frameOf(total, curve(t, t + 50, 0, 1)),
    scale: frameOf(total, curve(t, t + 50, 0.4, 1)),
    y: frameOf(total, curve(t + 50, t + 100, 0, sag), curve(t + 100, t + 340, sag, run, FALL)),
    stretch: frameOf(total, [
      [t + 50, t + 100, t + 270, t + 340, t + 380],
      [1, 1.08, stretch, 1.1, 1],
    ]),
    trail: frameOf(total, curve(t + 100, t + 340, Math.min(1, sag / run), 1, FALL)),
    trailOpacity: frameOf(total, [
      [t + 100, t + 140, t + 340, t + 390],
      [0, 0.9, 0.8, trailRest],
    ]),
  };
}

/** When each of meltwater's drops starts to run in its arrival, in plan order. */
const MELT_RUN_AT = [30, 100, 170] as const;
/** When the fridge's running bead appears. */
const RUNNER_AT = 170;

export type ArriveFrames =
  | { look: 'FRIDGE'; wash: PieceFrames; beads: readonly PieceFrames[]; runner: DropFrames | null }
  | { look: 'ROOM'; wash: PieceFrames; rays: readonly PieceFrames[]; motes: readonly Frame[] }
  | {
      look: 'THAWED';
      wash: PieceFrames;
      drops: readonly DropFrames[];
      beads: readonly PieceFrames[];
    };

/** A picture's arrival, from `at` ms on a clock of `total` ms. */
export function arriveFrames(
  g: Exclude<RimGeometry, { look: FrostLook }>,
  at: number,
  total: number,
  runs: boolean,
): ArriveFrames {
  switch (g.look) {
    case 'FRIDGE':
      return {
        look: 'FRIDGE',
        wash: washIn(total, at, 300, 380, 0.3),
        beads: g.beads.map(b => pop(total, at + b.at)),
        runner:
          g.runner === null
            ? null
            : runStays(
                total,
                at + RUNNER_AT,
                g.runner.y1 - g.runner.y0,
                RUNNER_SAG,
                RUNNER_STRETCH,
                1,
              ),
      };
    case 'ROOM':
      return {
        look: 'ROOM',
        wash: washIn(total, at, 320, 440, 0.25),
        rays: g.rays.map(r => ({
          opacity: frameOf(total, curve(at + r.at, at + r.at + 220, 0, 1)),
          scale: frameOf(total, curve(at + r.at, at + r.at + 260, 0.5, 1, FORM)),
        })),
        motes: g.motes.map(m => frameOf(total, curve(at + m.at, at + m.at + 100, 0, 1))),
      };
    case 'THAWED':
      return {
        look: 'THAWED',
        wash: washIn(total, at, 300, 380, 0.3),
        drops: runs
          ? g.drops.map((d, i) =>
              runStays(
                total,
                at + (MELT_RUN_AT[Math.min(i, MELT_RUN_AT.length - 1)] ?? 0),
                d.y1 - d.y0,
                DROP_SAG,
                DROP_MAX_STRETCH,
                THAW_TRAIL,
              ),
            )
          : [],
        beads: g.beads.map(b => pop(total, at + b.at)),
      };
  }
}

/** Every frame of one change, on its one clock. */
export interface RimMotion {
  plan: RimPlan;
  /** The leaving picture's opacity, when it fades. */
  fade: Frame | null;
  /** Frost's own motion, over the frost that arrives or leaves. */
  frost: { look: FrostLook; g: FrostGeometry; motion: FrostMotion; frames: MotionFrames } | null;
  arrive: ArriveFrames | null;
}

/**
 * THE FRAMES OF A CHANGE from the geometry of the two pictures in it. Frost's frames are fractions
 * of its own motion, and a plan with frost in it lasts exactly that long (`rimPlan`), so they are
 * used as they are; every other layer is written on the plan's clock.
 */
export function rimMotion(plan: RimPlan, gFrom: RimGeometry | null, gTo: RimGeometry): RimMotion {
  const fade = plan.fade === null ? null : frameOf(plan.total, curve(0, RIM_HOLD_MS, 1, 0));
  let frost: RimMotion['frost'] = null;
  if (plan.frost !== null) {
    const g = plan.frost.motion === 'creep' ? gTo : gFrom;
    if (g !== null && 'frost' in g)
      frost = {
        look: plan.frost.look,
        g: g.frost,
        motion: plan.frost.motion,
        frames: frostFrames(g.frost)[plan.frost.motion],
      };
  }
  const arrive =
    plan.arrive === null || 'frost' in gTo
      ? null
      : arriveFrames(gTo, plan.arrive.at, plan.total, plan.arrive.runs);
  return { plan, fade, frost, arrive };
}
