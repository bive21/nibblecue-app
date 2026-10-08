/**
 * Frost at the rim of a surface, as numbers: where every piece of it sits for a host of a given
 * height, and what each piece looks like at every point of its three motions — the frost
 * ARRIVING, the frost MELTING away, and the frost THAWING into meltwater that stays (the owner,
 * 2026-09-25, of the "that's cool" list: frozen milk wears frost, *"might not necessarily be
 * useful, but it's cool"*). Pure TypeScript, so all of it is tested in node — this package's tests
 * cannot render React Native — and `PlaceRim.tsx` only hands these numbers to views and to
 * `Animated.Value#interpolate`, the way `ThemeSkyToggle` reads `themeSkyToggle.ts`.
 *
 * FROST IS ONE OF FIVE PICTURES NOW (the owner, 2026-09-26: *"it should be on every category"*).
 * Every storage place wears its own at the rim of its row (`placeRim.ts` has the other three and
 * decides which of them plays when), and frost is two of the five: a freezer's (`FROST_RECIPE`)
 * and a deep freezer's, which is HEAVIER — a third fern each side (`DEEP_FROST`) and a bluer rim
 * (`theme/frost.ts`). A picture can also be drawn down ONE side only (`sides`), for a card whose
 * words fill its left and leave its right empty.
 *
 * WHERE THE FROST IS ALLOWED TO BE, which is the rule everything here serves: in the host's
 * PADDING, beside its words and never under them. A stash row is `space.xl` in from each side
 * and `space.lg` down from its top, and nothing it writes is ever in that margin — so the frost
 * lives in two STRIPS, one down each side, as wide as the side padding and as tall as the content
 * beside it (the top and bottom padding are left clear). `frostRim.test.ts` walks every strip
 * height a row can have and holds every piece inside its strip — and every crystal inside the
 * roundest card corner any skin draws, so a row at a card's corner, clipped to it
 * (`FrostCorners`), never has a crystal cut in half.
 *
 * WHAT IS IN A STRIP, bottom to top:
 *   - the GLAZE, a half-ellipse of rime centered on the edge: thickest there, gone at the strip's
 *     inner edge and at its two ends (`GLAZE_STOPS` in theme/frost.ts is its profile);
 *   - two FERNS, the feathered crystals frost grows on a cold surface: a stem from the edge
 *     inward with four pairs of barbs, shorter toward the tip, each at its own tilt;
 *   - one SPARKLE, setup's four-point star (`SPARKLE_PATH`), so the stash's frost and the sky
 *     toggle's night are one picture language;
 *   - and, only while the frost melts, DROPLETS that run down the strip once.
 *
 * TIME IS LINEAR HERE AND THE EASING IS IN THE FRAMES. Each motion is one value running 0 → 1 at
 * a constant rate, and every eased curve is written into its keyframes (`curve`, sampled from
 * `easeAt`, the planner's own Bézier). That is what lets a picture that mounts part way through
 * a motion — the same bag's row drawn again a moment later, when Use first opens to all of them —
 * JOIN it at the right point instead of starting it again: the value is simply set to how far the
 * motion has got (`placeRimShow`).
 */
import type { Frame } from './dayNightSwitch';
import { easeAt } from './themeSkyToggle';

/* ----------------------------------------------------------------------------- the words */

/**
 * What frost can do: arrive (creeping in from the edges), melt (from the middle out, its water
 * running off and drying), or THAW — melt the same way, but leave its water where it ran to, which
 * is the picture a thawing container rests in (`placeRim.ts`).
 */
export type FrostMotion = 'creep' | 'melt' | 'thaw';

export type FrostSide = 'left' | 'right';
export const FROST_SIDES = ['left', 'right'] as const satisfies readonly FrostSide[];

/** The host's padding: how far in from each side the frost may reach, and the ends it keeps clear. */
export interface FrostInset {
  x: number;
  y: number;
}

/**
 * WHICH ENDS OF THE HOST ARE A CARD'S ROUNDED CORNERS, and how round. A card does not clip what
 * is inside it (`Surface` keeps `overflow: 'visible'` for its shadow), so a row that is the first
 * or the last thing in its card says so, and its picture is clipped to the card's corner there —
 * and only there: a row in the middle of a card has square ends, and clipping them round would
 * take a bite out of its glaze where no corner is. A card of its own (the container sheet's head)
 * rounds both ends. `placeRim.ts`'s `rimClip` turns this into the four radii.
 */
export interface FrostCorners {
  radius: number;
  top: boolean;
  bottom: boolean;
}

export interface Point {
  x: number;
  y: number;
}

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/* ----------------------------------------------------------------------------- the clock */

/**
 * How long each motion takes. The arrival is a second and a half — long enough to watch rime
 * form, short enough that nobody waits for it — and the melt a little longer, because it has
 * droplets to run once the ice has gone. A thaw is a melt whose water stays, so it takes as long.
 */
export const FROST_MS: Readonly<Record<FrostMotion, number>> = {
  creep: 1500,
  melt: 1900,
  thaw: 1900,
};

/**
 * A BEAT BEFORE ANYTHING MOVES. Both motions are set off by something done in a bottom sheet —
 * Save, Move, Mark thawing — and that sheet closes in the same moment the change lands, sliding
 * away over 220 ms (`SHEET_DURATION_MS` in BottomSheet.tsx). A motion that began at once would
 * spend its first fifth under the sheet. So each opens on a still frame that outlasts the slide.
 */
export const FROST_HOLD_MS = 240;

/**
 * Reduce motion, and the amber Night theme, draw every place's picture STILL: the look a motion
 * ends on, set directly, never a frame of the way there (docs/DESIGN_SYSTEM.md §7; Night exists to
 * keep a dark room dark, and nothing on its screen moves or shines).
 */
export const frostCalm = (theme: string, reduceMotion: boolean): boolean =>
  reduceMotion || theme === 'night';

/* ---------------------------------------------------------------------------- the pieces */

/** The smallest strip the crystals are placed for — and proven at. Below it, only the glaze. */
export const FROST_MIN_STRIP = 24;
/** The narrowest side padding the crystals are placed for. */
export const FROST_MIN_RIM = 10;

/** A fern's stroke: a hair under a point, so it reads as a crystal rather than a line. */
export const FERN_STROKE = 0.9;
/**
 * How far in from the edge a fern's root sits: enough that its round cap is not cut by the edge,
 * and clear of the arc of the roundest card corner a row can sit in (the corner test).
 */
const FERN_ROOT = 0.8;
/**
 * The barbs, as fractions of the stem: where each pair leaves it and how long they are, shorter
 * toward the tip, so the fern is a feather and not a comb. Each pair leaves at ±`BARB_ANGLE`
 * degrees from the stem, pointing forward, the way ice grows along its own axis.
 */
const BARBS = [
  { along: 0.3, length: 0.36 },
  { along: 0.5, length: 0.3 },
  { along: 0.68, length: 0.22 },
  { along: 0.84, length: 0.13 },
] as const;
const BARB_ANGLE = 50;
/** One fern: how far down its strip it roots, how long it is, and its tilt (degrees, positive down). */
export interface FernPlan {
  at: number;
  length: number;
  tilt: number;
  /** A middle fern, which a strip too short for three leaves out (`FrostRecipe.middleFrom`). */
  middle?: boolean;
}

/**
 * A FROST'S RECIPE: its ferns, the shortest strip that takes its middle ones, and how far apart
 * its ferns start to grow. The glaze, the glints and the droplets are the same for every frost.
 */
export interface FrostRecipe {
  ferns: Readonly<Record<FrostSide, readonly FernPlan[]>>;
  middleFrom: number;
  /** ms between one fern starting to grow and the next, so the last has grown before a glint. */
  growStep: number;
}

/**
 * A FREEZER'S FROST: two ferns a side, at their own heights, lengths and tilts, so the two sides
 * are not a mirror of one another: frost is not symmetrical, and a picture that is looks stamped.
 * Each pair leans APART — the upper fern up, the lower one down, toward the corners frost gathers
 * in — which is also what leaves the glint its room between them on a short row.
 */
export const FROST_RECIPE: FrostRecipe = {
  ferns: {
    left: [
      { at: 0.27, length: 11, tilt: -16 },
      { at: 0.75, length: 10, tilt: 13 },
    ],
    right: [
      { at: 0.3, length: 10.5, tilt: -10 },
      { at: 0.76, length: 9.5, tilt: 15 },
    ],
  },
  middleFrom: Number.POSITIVE_INFINITY,
  growStep: 100,
};

/**
 * A DEEP FREEZER'S FROST IS HEAVIER (the owner, 2026-09-26): THREE ferns a side — the outer two
 * leaning further apart, into the corners, and a shorter one across the middle — so the rim reads
 * as thicker ice than a freezer's at a glance, before its bluer color is even seen
 * (`theme/frost.ts`). A strip too short to hold three whole and apart (`middleFrom`, proved at
 * every height by `frostRim.test.ts`) keeps the outer two. They start to grow closer together than
 * a freezer's two, so all six have grown before the first glint twinkles, as a freezer's four have.
 */
export const DEEP_FROST: FrostRecipe = {
  ferns: {
    left: [
      { at: 0.17, length: 10.5, tilt: -21 },
      { at: 0.5, length: 8, tilt: 3, middle: true },
      { at: 0.83, length: 10.5, tilt: 19 },
    ],
    right: [
      { at: 0.19, length: 10, tilt: -17 },
      { at: 0.52, length: 7.5, tilt: -3, middle: true },
      { at: 0.85, length: 10, tilt: 21 },
    ],
  },
  middleFrom: 36,
  growStep: 60,
};
/** The ferns are planned for a 14 pt padding (`space.xl`); a narrower one shortens them all. */
const FERN_PLANNED_RIM = 14;

/**
 * A sparkle a side, in the widest gap between two of its ferns and near the edge, where the glaze
 * is thick. Its height is the middle of that gap, not a fraction of the strip, so on no strip can
 * it land on a fern; a strip whose ferns leave it no room simply has no sparkle on that side.
 */
const SPARKLE_PLAN: Readonly<Record<FrostSide, { inset: number; size: number }>> = {
  left: { inset: 4.4, size: 6 },
  right: { inset: 4.6, size: 5.5 },
};
/** The clear room a sparkle keeps from a fern above or below it. */
const SPARKLE_CLEAR = 0.75;
/** The sparkle's own drawing box (`SPARKLE_PATH` is drawn in 10 × 10). */
export const SPARKLE_BOX = 10;

/**
 * A DROPLET: a teardrop, pointed at the top and round at the foot, in a 3.6 × 5.3 box, with a
 * glint low on its left where the light catches it.
 */
export const DROP = { width: 3.6, height: 5.3 } as const;
export const DROP_PATH = 'M1.8 0C2.2 1.3 3.6 2.4 3.6 3.5A1.8 1.8 0 0 1 0 3.5C0 2.4 1.4 1.3 1.8 0Z';
export const DROP_GLINT = { cx: 1.25, cy: 3.55, r: 0.55 } as const;
/** How far a droplet stretches while it runs, at most — it is falling, not sliding. */
export const DROP_MAX_STRETCH = 1.3;
/** How far it sags before it lets go, in points. */
export const DROP_SAG = 1.2;
/**
 * How far in from the ends of its strip a running droplet's CENTER is kept, so it stays whole
 * inside the strip at both ends of its run, sagging and stretched as far as it ever is.
 */
export const DROP_MARGIN = (DROP.height / 2) * DROP_MAX_STRETCH + DROP_SAG + 0.5;
/** The wet line behind it. */
export const TRAIL_WIDTH = 1.1;
/**
 * Three droplets, one after another: two down the left, one down the right. Where each runs
 * (`inset` from its edge), from and to what fraction of the strip, and when it forms, in ms into
 * the melt — after the ferns have gone and while the glaze is going, which is when water would.
 * The two on the left stop at different heights: a thaw leaves its drops where they ran to
 * (`placeRim.ts`), and two drops resting level, side by side, look stamped rather than run.
 */
const DROP_PLAN = [
  { side: 'left', inset: 6.2, from: 0.14, to: 0.9, at: 760 },
  { side: 'right', inset: 6.6, from: 0.1, to: 0.93, at: 880 },
  { side: 'left', inset: 10.2, from: 0.36, to: 0.72, at: 1080 },
] as const satisfies readonly {
  side: FrostSide;
  inset: number;
  from: number;
  to: number;
  at: number;
}[];

export interface Fern {
  side: FrostSide;
  /** In its strip's own coordinates: the root on the edge, and the tip. */
  root: Point;
  tip: Point;
  /** The box it is drawn in (strip coordinates), stroke included, and its path inside that box. */
  box: Box;
  d: string;
  /** The same path in strip coordinates, for the still picture, which draws a strip in one go. */
  dStrip: string;
  /** Its strokes as segments, strip coordinates: the stem, then each barb (the tests measure them). */
  segments: readonly (readonly [Point, Point])[];
  /** Where it grows from, inside its box: its root. */
  origin: Point;
  /** When it grows in, and when it melts, in ms into each motion. */
  growAt: number;
  meltAt: number;
}

export interface Sparkle {
  side: FrostSide;
  /** Its center, strip coordinates, and its size. */
  cx: number;
  cy: number;
  size: number;
  /** When it twinkles on, in ms into the arrival. */
  twinkleAt: number;
}

export interface Drop {
  side: FrostSide;
  /** Its center line, strip coordinates, and where its center runs from and to. */
  x: number;
  y0: number;
  y1: number;
  /** When it forms, in ms into the melt. */
  at: number;
}

export interface FrostGeometry {
  /** One strip a side: its top in the host, its height, and its width (the side padding). */
  strip: { top: number; height: number; width: number };
  /**
   * The glaze: an ellipse centered on the edge at the strip's middle — `rx` the strip's width, so
   * it is gone at the inner edge, and `ry` half its height, so it is gone at both ends.
   */
  glaze: { rx: number; ry: number; cy: number };
  ferns: readonly Fern[];
  sparkles: readonly Sparkle[];
  drops: readonly Drop[];
}

/**
 * A number, short: paths are strings, and six decimals of a point is noise. Rounded by arithmetic
 * rather than through `toFixed`, which formats a string only to parse it again — a hundred frosted
 * rows build their paths once each, and that round trip was most of what building one cost.
 */
const f = (n: number): number => Math.round(n * 1000) / 1000;

/** From "how far in from this side's edge" to the strip's own x. */
const stripX = (side: FrostSide, width: number, u: number): number =>
  side === 'left' ? u : width - u;

/** The glaze's reach at a point of the strip: 0 on the edge at mid-height, 1 on its ellipse. */
export function glazeReach(g: FrostGeometry, side: FrostSide, p: Point): number {
  const u = side === 'left' ? p.x : g.strip.width - p.x;
  const dx = g.glaze.rx > 0 ? u / g.glaze.rx : 1;
  const dy = g.glaze.ry > 0 ? (p.y - g.glaze.cy) / g.glaze.ry : 1;
  return Math.hypot(dx, dy);
}

/** A fern's segments in strip coordinates: the stem, then each barb pair. */
function fernSegments(
  side: FrostSide,
  width: number,
  root: { u: number; v: number },
  length: number,
  tilt: number,
): [Point, Point][] {
  const a = (tilt * Math.PI) / 180;
  const at = (u: number, v: number): Point => ({ x: stripX(side, width, u), y: v });
  const step = (from: { u: number; v: number }, angle: number, dist: number) => ({
    u: from.u + Math.cos(angle) * dist,
    v: from.v + Math.sin(angle) * dist,
  });
  const tip = step(root, a, length);
  const segments: [Point, Point][] = [[at(root.u, root.v), at(tip.u, tip.v)]];
  for (const b of BARBS) {
    const p = step(root, a, b.along * length);
    for (const s of [-1, 1] as const) {
      const q = step(p, a + (s * BARB_ANGLE * Math.PI) / 180, b.length * length);
      segments.push([at(p.u, p.v), at(q.u, q.v)]);
    }
  }
  return segments;
}

/** The box a set of segments fills, with half a stroke round it. */
function boxOf(segments: readonly [Point, Point][], pad: number): Box {
  const xs = segments.flatMap(([p, q]) => [p.x, q.x]);
  const ys = segments.flatMap(([p, q]) => [p.y, q.y]);
  const left = Math.min(...xs) - pad;
  const top = Math.min(...ys) - pad;
  return {
    left,
    top,
    width: Math.max(...xs) + pad - left,
    height: Math.max(...ys) + pad - top,
  };
}

const pathOf = (segments: readonly [Point, Point][], dx: number, dy: number): string =>
  segments.map(([p, q]) => `M${f(p.x - dx)} ${f(p.y - dy)}L${f(q.x - dx)} ${f(q.y - dy)}`).join('');

/**
 * THE ORDER THE CRYSTALS COME AND GO IN. Frost arrives EDGES FIRST: the fern furthest from the
 * middle of the host grows first and the one nearest it last. It melts FROM THE MIDDLE OUT: the
 * nearest goes first and the furthest last. "Furthest from the middle" is up or down the strip,
 * because every fern is the same distance in from its side; a tie goes to the left.
 */
function byDistanceFromMiddle(
  plans: readonly { side: FrostSide; at: number }[],
): { side: FrostSide; at: number }[] {
  return [...plans].sort(
    (a, b) =>
      Math.abs(a.at - 0.5) - Math.abs(b.at - 0.5) ||
      (a.side === b.side ? 0 : a.side === 'left' ? -1 : 1),
  );
}

/** When the arrival's ferns begin; when the melt's begin, and how far apart. */
const GROW_FROM = 420;
const MELT_FROM = 300;
const MELT_STEP = 80;
/** When the first glint twinkles on, and the second after it. */
export const TWINKLE_FROM = 1080;
const TWINKLE_STEP = 120;

/* ------------------------------------------------------------------------ the corners */

/**
 * HOW FAR BELOW A HOST'S TOP A DISC OF RADIUS `pad`, CENTERED `u` IN FROM THE HOST'S SIDE, MUST SIT
 * TO BE WHOLLY INSIDE A ROUNDED CORNER OF `radius` — 0 away from the corner. Mirror it for the
 * bottom. The disc's center has to be within `radius − pad` of the arc's own center, which is
 * `radius` in from the side and `radius` down from the top.
 */
export function cornerClear(u: number, pad: number, radius: number): number {
  if (radius <= 0 || u >= radius) return 0;
  const reach = radius - pad;
  const across = radius - u;
  // too near the side for any height inside the arc: it has to be below the corner altogether
  if (reach <= across) return radius;
  return radius - Math.sqrt(reach * reach - across * across);
}

/**
 * THE BAND OF A STRIP A PIECE MAY SIT IN AND NOT BE CUT BY THE CARD'S CORNERS: `[lo, hi]` in strip
 * coordinates, for a disc of radius `pad` centered `u` in from the side. A host that is the first
 * or the last thing in a rounded card is CLIPPED to that card's corners there (`placeRim.ts`,
 * `rimClip`), so every piece near such an end is placed inside the clip rather than cut by it —
 * which is what lets a small host under a large corner (the container sheet's head, `space.md`
 * of padding under the glass skin's 26 pt) keep every crystal whole.
 */
export function clearBand(
  strip: { top: number; height: number },
  corners: FrostCorners | null | undefined,
  u: number,
  pad: number,
): { lo: number; hi: number } {
  const cut = Math.max(0, cornerClear(u, pad, corners?.radius ?? 0) - strip.top);
  return {
    lo: corners?.top ? cut : 0,
    hi: corners?.bottom ? strip.height - cut : strip.height,
  };
}

/**
 * How far a set of points (strip coordinates, `pad` round each) must move down — or up, negative —
 * to be clear of the host's corners; null when no move clears both ends at once.
 */
export function cornerShift(
  points: readonly Point[],
  side: FrostSide,
  strip: { top: number; height: number; width: number },
  corners: FrostCorners | null | undefined,
  pad: number,
): number | null {
  let down = 0;
  let up = 0;
  for (const q of points) {
    const band = clearBand(strip, corners, side === 'left' ? q.x : strip.width - q.x, pad);
    down = Math.max(down, band.lo - q.y);
    up = Math.max(up, q.y - band.hi);
  }
  if (down > 1e-9 && up > 1e-9) return null;
  return down > 1e-9 ? down : up > 1e-9 ? -up : 0;
}

/**
 * Which frost, down which sides of the host, and the card corners it is clipped to there. A card
 * whose words fill its left and leave its right empty wears its picture down the RIGHT only
 * (`placeRim.ts`, `rimZone`).
 */
export interface FrostOptions {
  recipe?: FrostRecipe;
  sides?: readonly FrostSide[];
  corners?: FrostCorners | null;
}

export function frostGeometry(
  height: number,
  rim: FrostInset,
  { recipe = FROST_RECIPE, sides = FROST_SIDES, corners = null }: FrostOptions = {},
): FrostGeometry {
  const width = Math.max(0, rim.x);
  const top = Math.max(0, rim.y);
  const S = Math.max(0, height - 2 * top);
  const strip = { top, height: S, width };
  const glaze = { rx: width, ry: S / 2, cy: S / 2 };
  // too small a strip for a crystal to sit in whole: the glaze alone, which scales to anything
  if (S < FROST_MIN_STRIP || width < FROST_MIN_RIM)
    return { strip, glaze, ferns: [], sparkles: [], drops: [] };

  const k = Math.min(1, (width - FERN_ROOT - 1) / (FERN_PLANNED_RIM - FERN_ROOT - 1));
  const drawn = FROST_SIDES.filter(side => sides.includes(side));
  // a strip too short to hold a recipe's middle ferns apart from the outer two keeps the outer two
  const plans = drawn.flatMap(side =>
    recipe.ferns[side].filter(p => !p.middle || S >= recipe.middleFrom).map(p => ({ side, ...p })),
  );
  const nearestFirst = byDistanceFromMiddle(plans);
  const pad = FERN_STROKE / 2;
  const ends = (segments: readonly (readonly [Point, Point])[]) => segments.flatMap(s => [...s]);
  const ferns = plans.flatMap((p): Fern[] => {
    const length = p.length * k;
    let root = { u: FERN_ROOT, v: p.at * S };
    let segments = fernSegments(p.side, width, root, length, p.tilt);
    // a short strip pushes a fern near its end back inside it, rather than cutting it
    const b0 = boxOf(segments, pad);
    const shift = b0.top < 0 ? -b0.top : b0.top + b0.height > S ? S - (b0.top + b0.height) : 0;
    if (shift !== 0) {
      root = { u: root.u, v: root.v + shift };
      segments = fernSegments(p.side, width, root, length, p.tilt);
    }
    // and one at a card's rounded corner moves clear of it; one that cannot, whole, is left out
    const clear = cornerShift(ends(segments), p.side, strip, corners, pad);
    if (clear === null) return [];
    if (clear !== 0) {
      root = { u: root.u, v: root.v + clear };
      segments = fernSegments(p.side, width, root, length, p.tilt);
      const b1 = boxOf(segments, pad);
      if (b1.top < -1e-9 || b1.top + b1.height > S + 1e-9) return [];
      if (cornerShift(ends(segments), p.side, strip, corners, pad) !== 0) return [];
    }
    const box = boxOf(segments, pad);
    const rank = nearestFirst.findIndex(q => q.side === p.side && q.at === p.at);
    const stem = segments[0] ?? [
      { x: 0, y: 0 },
      { x: 0, y: 0 },
    ];
    return [
      {
        side: p.side,
        root: stem[0],
        tip: stem[1],
        box,
        d: pathOf(segments, box.left, box.top),
        dStrip: pathOf(segments, 0, 0),
        segments,
        origin: { x: stem[0].x - box.left, y: stem[0].y - box.top },
        // edges first: the furthest from the middle grows first
        growAt: GROW_FROM + (plans.length - 1 - rank) * recipe.growStep,
        // middle out: the nearest melts first
        meltAt: MELT_FROM + rank * MELT_STEP,
      },
    ];
  });

  const sparkles = drawn.flatMap((side, i): Sparkle[] => {
    const p = SPARKLE_PLAN[side];
    const boxes = ferns
      .filter(fern => fern.side === side)
      .map(fern => fern.box)
      .sort((a, b) => a.top - b.top);
    // the widest gap between two neighbouring ferns: with two, the only one there is
    let from = 0;
    let to = -1;
    for (let j = 1; j < boxes.length; j += 1) {
      const upper = boxes[j - 1];
      const lower = boxes[j];
      if (upper === undefined || lower === undefined) continue;
      const a = upper.top + upper.height + SPARKLE_CLEAR;
      const b = lower.top - SPARKLE_CLEAR;
      if (b - a > to - from) [from, to] = [a, b];
    }
    if (to - from < p.size) return [];
    return [
      {
        side,
        cx: stripX(side, width, Math.min(p.inset, width - p.size / 2 - 0.5)),
        cy: (from + to) / 2,
        size: p.size,
        twinkleAt: TWINKLE_FROM + i * TWINKLE_STEP,
      },
    ];
  });

  return { strip, glaze, ferns, sparkles, drops: frostDrops(strip, drawn, corners) };
}

/**
 * THE MELT'S DROPLETS for a strip: where each runs, from and to, whole inside the strip — and clear
 * of a card's corners — at both ends of its run. Their own function, because the thawing picture
 * rests them where they ran to (`placeRim.ts`), and a drop that came to rest a point away from
 * where the thaw left it would be a jump on the motion's last frame.
 */
export function frostDrops(
  strip: { top: number; height: number; width: number },
  sides: readonly FrostSide[] = FROST_SIDES,
  corners: FrostCorners | null = null,
): Drop[] {
  const S = strip.height;
  const width = strip.width;
  if (S < FROST_MIN_STRIP || width < FROST_MIN_RIM) return [];
  // how far a drop reaches above and below its center, stretched as far as it ever is
  const half = (DROP.height / 2) * DROP_MAX_STRETCH;
  return DROP_PLAN.filter(p => sides.includes(p.side)).flatMap((p): Drop[] => {
    const u = Math.min(p.inset, width - DROP.width / 2 - 0.5);
    const band = clearBand(strip, corners, u, DROP.width / 2);
    const y0 = Math.min(Math.max(p.from * S, DROP_MARGIN, band.lo + half), S / 2);
    const y1 = Math.max(Math.min(p.to * S, S - DROP_MARGIN, band.hi - half), y0 + 1);
    // a run that a card's corners leave no room for is not run at all
    if (y0 - half < band.lo - 1e-9 || y1 + half > band.hi + 1e-9) return [];
    return [{ side: p.side, x: stripX(p.side, width, u), y0, y1, at: p.at }];
  });
}

/* ------------------------------------------------------------------------- the frames */

/** Setup's sparkle twinkle, stretched a little: on, a dip, and on again, then still. */
const TWINKLE = [0, 70, 130, 200] as const;

/**
 * The curves every picture at the rim is eased along (`placeRim.ts` reads them too, so a fridge's
 * bead runs down the way a frost's droplet does). FORMING: quick at first, then settling — most of
 * the reach in the first half.
 */
export const FORM: readonly [number, number, number, number] = [0.2, 0.7, 0.3, 1];
/** Falling, and retreating: slow away, then faster. */
export const FALL: readonly [number, number, number, number] = [0.55, 0, 0.9, 0.45];
/** The glaze's retreat to the edge: gentle at both ends. */
export const EASE: readonly [number, number, number, number] = [0.45, 0, 0.55, 1];
/** How many points an eased stretch of a frame is sampled at: enough that the eye sees a curve. */
const SAMPLES = 8;

/** The smallest a growing piece is drawn: a scale of 0 is a transform with no inverse. */
export const FROST_SPECK = 0.02;

/** A stretch of keyframes: `from` → `to` between two times (ms), along `ease`. */
export type Stretch = readonly [xs: number[], ys: number[]];

export function curve(
  t0: number,
  t1: number,
  from: number,
  to: number,
  ease: readonly [number, number, number, number] | null = null,
): Stretch {
  if (ease === null)
    return [
      [t0, t1],
      [from, to],
    ];
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i <= SAMPLES; i += 1) {
    xs.push(t0 + ((t1 - t0) * i) / SAMPLES);
    ys.push(from + (to - from) * easeAt(ease, i / SAMPLES));
  }
  return [xs, ys];
}

/** Stretches in time order as one frame on a motion's clock: ms become fractions of the motion. */
export function frameOf(total: number, ...parts: Stretch[]): Frame {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const [px, py] of parts)
    for (let i = 0; i < px.length; i += 1) {
      const x = (px[i] ?? 0) / total;
      // where two stretches meet, the first one's last point is the second one's first
      if (xs.length > 0 && x <= (xs[xs.length - 1] ?? 0)) continue;
      xs.push(x);
      ys.push(py[i] ?? 0);
    }
  return { inputRange: xs, outputRange: ys, extrapolate: 'clamp' };
}

/** A piece that fades and scales: the two values each of the pictures' parts are driven by. */
export interface PieceFrames {
  opacity: Frame;
  scale: Frame;
}

export interface DropFrames {
  opacity: Frame;
  /** It swells as it forms. */
  scale: Frame;
  /** How far its center has run down from `y0`, in points. */
  y: Frame;
  /** How long it is drawn, as it falls. */
  stretch: Frame;
  /** The trail behind it: how much of the run it covers, and how strongly it shows. */
  trail: Frame;
  trailOpacity: Frame;
}

export interface MotionFrames {
  /** Each side's glaze: `scale` is along x only, from the edge. */
  glaze: Readonly<Record<FrostSide, PieceFrames>>;
  /** In the order of `FrostGeometry.ferns`. */
  ferns: readonly PieceFrames[];
  sparkles: readonly PieceFrames[];
  /** The melt's droplets; the arrival has none. */
  drops: readonly DropFrames[];
}

export type FrostFrames = Readonly<Record<FrostMotion, MotionFrames>>;

/**
 * HOW MUCH OF A WET LINE A THAW LEAVES. A melt dries its drops' lines to nothing — the frost is
 * gone and the row rests in the next place's picture — but a THAW leaves them at this, and the
 * thawing picture draws them at this (`PlaceRim.tsx`), so the thaw's last frame and the still
 * picture it rests in are one picture.
 */
export const THAW_TRAIL = 0.45;

/** When each side's glaze starts creeping in: the left a beat before the right, as frost does. */
const GLAZE_IN: Readonly<Record<FrostSide, number>> = {
  left: FROST_HOLD_MS,
  right: FROST_HOLD_MS + 50,
};

export function frostFrames(g: FrostGeometry): FrostFrames {
  const C = FROST_MS.creep;
  const M = FROST_MS.melt;
  const creepGlaze = (side: FrostSide): PieceFrames => {
    const t = GLAZE_IN[side];
    return {
      opacity: frameOf(C, curve(t, t + 260, 0, 1, FORM)),
      scale: frameOf(C, curve(t, t + 640, FROST_SPECK, 1, FORM)),
    };
  };
  const meltGlaze: PieceFrames = {
    opacity: frameOf(M, curve(820, 1260, 1, 0)),
    scale: frameOf(M, curve(520, 1240, 1, 0.08, EASE)),
  };
  const creep: MotionFrames = {
    glaze: { left: creepGlaze('left'), right: creepGlaze('right') },
    ferns: g.ferns.map(fern => ({
      opacity: frameOf(C, curve(fern.growAt, fern.growAt + 140, 0, 1)),
      scale: frameOf(C, curve(fern.growAt, fern.growAt + 360, FROST_SPECK, 1, FORM)),
    })),
    sparkles: g.sparkles.map(s => ({
      opacity: frameOf(C, [TWINKLE.map(d => s.twinkleAt + d), [0, 1, 0.35, 1]]),
      scale: frameOf(C, [TWINKLE.map(d => s.twinkleAt + d), [0.3, 1.25, 0.8, 1]]),
    })),
    drops: [],
  };
  /*
    THE MELT AND THE THAW ARE ONE MOTION UNTIL THE WATER HAS RUN. Then a melt's droplets dry and
    go — the row rests in whatever picture comes next — and a thaw's stay where they ran to, their
    wet lines faded to `THAW_TRAIL`: the thawing picture, drawn still, is exactly that frame.
  */
  const leaving = (stays: boolean): MotionFrames => ({
    glaze: { left: meltGlaze, right: meltGlaze },
    ferns: g.ferns.map(fern => ({
      opacity: frameOf(M, curve(fern.meltAt + 120, fern.meltAt + 300, 1, 0)),
      scale: frameOf(M, curve(fern.meltAt, fern.meltAt + 300, 1, FROST_SPECK, FALL)),
    })),
    // the glints go first: the moment ice starts to melt, it stops shining
    sparkles: g.sparkles.map(() => ({
      opacity: frameOf(M, curve(FROST_HOLD_MS, 400, 1, 0)),
      scale: frameOf(M, curve(FROST_HOLD_MS, 400, 1, 0.6)),
    })),
    drops: g.drops.map((d): DropFrames => {
      const run = d.y1 - d.y0;
      const t = d.at;
      return {
        opacity: stays
          ? frameOf(M, curve(t, t + 60, 0, 1))
          : frameOf(M, [
              [t, t + 60, t + 520, t + 600],
              [0, 1, 1, 0],
            ]),
        scale: frameOf(M, curve(t, t + 60, 0.4, 1)),
        // it hangs and sags, lets go, and falls faster as it goes
        y: frameOf(
          M,
          curve(t + 60, t + 150, 0, DROP_SAG),
          curve(t + 150, t + 520, DROP_SAG, run, FALL),
        ),
        // a drop that stays settles back to its own round shape at the foot of its run
        stretch: frameOf(M, [
          [t + 60, t + 150, t + 400, t + 520, ...(stays ? [t + 600] : [])],
          [1, 1.1, DROP_MAX_STRETCH, 1.15, ...(stays ? [1] : [])],
        ]),
        // the trail's foot is the droplet's center: `y` over the run, the same curve
        trail: frameOf(M, curve(t + 150, t + 520, Math.min(1, DROP_SAG / run), 1, FALL)),
        trailOpacity: frameOf(M, [
          [t + 150, t + 200, t + 520, t + 800],
          [0, 0.9, 0.75, stays ? THAW_TRAIL : 0],
        ]),
      };
    }),
  });
  return { creep, melt: leaving(false), thaw: leaving(true) };
}
