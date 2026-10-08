/**
 * THE WHEEL'S PLANE GEOMETRY — bearings to points, an arc between two of them, and where every
 * caption on the ring is allowed to stand.
 *
 * Split out of `ScheduleWheel.tsx` for the reason every other pure seam in this package exists:
 * the node suite cannot parse a file that imports React Native, and this is the math a device
 * catches eventually and a test catches in a second.
 *
 * Bearings are degrees clockwise from twelve o'clock, which is what `@nibblecue/core`'s
 * `wheelDegrees` produces.
 */

/** Degrees clockwise from twelve o'clock → a point on a circle of radius `r` about `(cx, cy)`. */
export function wheelPoint(
  deg: number,
  r: number,
  cx: number,
  cy: number,
): { x: number; y: number } {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

/**
 * An SVG arc from one bearing to another, traveling the way the ring runs.
 *
 * The direction is not a detail: with the day drawn counter-clockwise (core's `WHEEL_DIRECTION`),
 * an arc from the bed mark to the wake mark taken the OTHER way round is the whole waking day
 * painted in the night's color. So the sweep flag follows the ring, and the large-arc flag falls
 * out of how far it actually travels.
 */
export function arcPath(
  fromDeg: number,
  toDeg: number,
  r: number,
  cx: number,
  cy: number,
  direction: 1 | -1,
): string {
  const a = wheelPoint(fromDeg, r, cx, cy);
  const b = wheelPoint(toDeg, r, cx, cy);
  const swept = direction > 0 ? (toDeg - fromDeg + 360) % 360 : (fromDeg - toDeg + 360) % 360;
  const sweep = direction > 0 ? 1 : 0;
  const large = swept > 180 ? 1 : 0;
  return `M ${a.x} ${a.y} A ${r} ${r} 0 ${large} ${sweep} ${b.x} ${b.y}`;
}

/* --------------------------------------------------------------- houses and their captions */

/** A stop's house: the same fixed height whatever it holds, ScheduleWheel's own bead on a string. */
export const HOUSE_H = 26;
/** The widest a caption box may be; it is centered on its own point or aligned to one edge of it. */
export const CAPTION_WIDTH = 68;
/** A caption is two lines at most: the time and a word. Its box, for placing it above a house. */
export const CAPTION_H = 32;
/** The same caption cut to its first line, the time alone: what a crowded stop falls back to. */
export const CAPTION_H_ONE = 18;
/** The clear space between a house's edge and the caption beside it. */
const CAPTION_GAP = 5;
/** How far from straight up or down a stop must be before its caption is TRIED beside the house. */
const SIDE_FROM = 0.35;

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

export type CaptionSide = 'right' | 'left' | 'above' | 'below';

/**
 * THE HUB THE RING IS DRAWN ROUND — the disc in the middle that says how long the day is. A
 * caption may never stand on it (the owner, 2026-09-26, with a screenshot of "3:32 PM to 6:30 PM"
 * half under the disc: "It can't be behind the circle"). The disc is drawn over the captions, so a
 * box on it is not merely crowded: its words are cut off.
 */
export interface WheelHub {
  x: number;
  y: number;
  r: number;
}
/**
 * How far a caption's box may reach into the hub's edge. None: the box is 68 wide for the widest
 * time, and the words inside it are aligned away from the hub, so a box that only touches the disc
 * keeps its text clear of it — which is what lets the smallest wheel still find the moon a place.
 */
const HUB_GAP = 0;
/** What standing on the hub costs a caption that must be placed somewhere: more than any overlap. */
const HUB_COST = 1e6;

export interface CaptionPlacement {
  left: number;
  top: number;
  align: 'left' | 'center' | 'right';
  side: CaptionSide;
  /** Only the first line fits here: draw the time and leave its word out. */
  compact?: boolean;
}

/** One house on the ring, as the placement pass sees it. */
export interface WheelHouse {
  /** Degrees clockwise from twelve o'clock — which side of the ring it sits on. */
  deg: number;
  /** The house's CENTER, in the wheel box's own pixels. */
  x: number;
  y: number;
  /** How wide the house is drawn. Height is always `HOUSE_H`. */
  width: number;
  /** How tall this one's caption is. One line is shorter than a time range over two. */
  captionHeight?: number;
  /**
   * How tall its first line is on its own. Given, a caption that fits nowhere whole is tried again
   * as that one line — the time without its word — before it is dropped or, for the sun and the
   * moon, made to stand somewhere it overlaps.
   */
  compactHeight?: number;
  /**
   * Captions are handed out in this order, lowest first, and a later one gives way to an earlier
   * one. The sun and the moon come first of all: the ring's two anchors are never dropped.
   */
  priority?: number;
  /** A caption that may never be dropped — the sun and the moon. */
  required?: boolean;
}

const houseRect = (h: WheelHouse): Box => ({
  left: h.x - h.width / 2,
  top: h.y - HOUSE_H / 2,
  width: h.width,
  height: HOUSE_H,
});

const intersects = (a: Box, b: Box): boolean =>
  a.left < b.left + b.width &&
  b.left < a.left + a.width &&
  a.top < b.top + b.height &&
  b.top < a.top + a.height;

const overlapArea = (a: Box, b: Box): number => {
  const w = Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left);
  const h = Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top);
  return w > 0 && h > 0 ? w * h : 0;
};

/**
 * The caption box for ONE side of a house — the raw position, before it is clamped into the card
 * or tested against anything.
 *
 * Each branch reads only the ONE house dimension its own direction needs. A "beside" caption
 * travels sideways at the house's own height and never touches the house's half-height; an
 * "above" caption travels up at the house's own center and never touches its half-width. Blending
 * the two (the first draft did) is the right distance along the stop's diagonal and the wrong
 * distance in both of the directions a rectangle actually has.
 */
function boxOn(side: CaptionSide, h: WheelHouse, captionH: number, shift = 0): CaptionPlacement {
  // a shifted box above or below reads from the house's own center outward, not centered on it
  const shiftedAlign = shift > 0 ? 'left' : 'right';
  switch (side) {
    case 'right':
      return {
        left: h.x + h.width / 2 + CAPTION_GAP,
        top: h.y - captionH / 2,
        align: 'left',
        side,
      };
    case 'left':
      return {
        left: h.x - h.width / 2 - CAPTION_GAP - CAPTION_WIDTH,
        top: h.y - captionH / 2,
        align: 'right',
        side,
      };
    case 'above':
      return {
        left: h.x - CAPTION_WIDTH / 2 + shift,
        top: h.y - HOUSE_H / 2 - CAPTION_GAP - captionH,
        align: shift === 0 ? 'center' : shiftedAlign,
        side,
      };
    default:
      return {
        left: h.x - CAPTION_WIDTH / 2 + shift,
        top: h.y + HOUSE_H / 2 + CAPTION_GAP,
        align: shift === 0 ? 'center' : shiftedAlign,
        side,
      };
  }
}

/**
 * WHICH SIDES TO TRY, IN ORDER, for a house at this bearing.
 *
 * The first is the one that reads best — away from the middle of the ring, so the time belongs to
 * its house rather than floating over the hub. The rest are the fallbacks, and having them is the
 * whole fix: at the far right of a phone-width ring there is simply no room for a 68-point box
 * beside a wide house, and the old code CLAMPED it back inside the card, which put it straight
 * back on top of the house it had just cleared (the owner's screenshot, 2026-09-22 — "3:15 PM"
 * printed through its own three-cell house, and the same at 5:15 and 7:15). A caption that cannot
 * stand beside its house goes above or below it instead; one that cannot stand anywhere is
 * dropped, and the house keeps its place. The dot is the fact; the words are the convenience.
 */
interface Candidate {
  side: CaptionSide;
  /** For a box above or below: how far it is slid outward, off the house's center. */
  shift: number;
}

/*
 * AND, SINCE 2026-09-26, TWO MORE BEFORE THE INWARD ONE: above and below again, slid half a
 * caption OUTWARD, so a stop at the ring's flank whose own box is blocked by the house above or
 * below it can still stand at its outer shoulder. The inward side comes last because inward is
 * where the hub is, and a caption on the hub is never taken (`placeCaptions`).
 */
function sidesFor(deg: number): Candidate[] {
  const rad = ((deg - 90) * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const outward: CaptionSide = cos > 0 ? 'right' : 'left';
  const inward: CaptionSide = cos > 0 ? 'left' : 'right';
  const vertical: CaptionSide = sin < 0 ? 'above' : 'below';
  const antiVertical: CaptionSide = sin < 0 ? 'below' : 'above';
  const out = (cos > 0 ? 1 : -1) * (CAPTION_WIDTH / 2);
  const at = (side: CaptionSide, shift = 0): Candidate => ({ side, shift });
  return Math.abs(cos) >= SIDE_FROM
    ? [
        at(outward),
        at(vertical),
        at(vertical, out),
        at(antiVertical),
        at(antiVertical, out),
        at(inward),
      ]
    : [
        at(vertical),
        at(outward),
        at(vertical, out),
        at(inward),
        at(antiVertical),
        at(antiVertical, out),
      ];
}

/** True when a box comes within `HUB_GAP` of the hub's disc. */
const onHub = (b: Box, hub: WheelHub): boolean => {
  const nx = Math.max(b.left, Math.min(hub.x, b.left + b.width));
  const ny = Math.max(b.top, Math.min(hub.y, b.top + b.height));
  const dx = hub.x - nx;
  const dy = hub.y - ny;
  return dx * dx + dy * dy < (hub.r + HUB_GAP) ** 2;
};

/** Slid back inside the card, which a caption at the rim always needs. */
function clamp(p: CaptionPlacement, captionH: number, size: number): CaptionPlacement {
  return {
    ...p,
    left: Math.min(Math.max(0, p.left), Math.max(0, size - CAPTION_WIDTH)),
    top: Math.min(Math.max(0, p.top), Math.max(0, size - captionH)),
  };
}

const rectOf = (p: CaptionPlacement, captionH: number): Box => ({
  left: p.left,
  top: p.top,
  width: CAPTION_WIDTH,
  height: captionH,
});

/**
 * EVERY CAPTION ON THE RING AT ONCE — the pass that replaced one stop deciding for itself.
 *
 * `captionBox` used to be a pure function of ONE stop, and that is why a ring drawn from real
 * intervals came out the way the owner's screenshot showed. A caption that clears its own house
 * knows nothing about the house of the stop forty minutes later, or about the caption already
 * standing where it wants to go, or about the sun and the moon; and when the card's edge left no
 * room it was clamped back in, on top of the very house it had cleared.
 *
 * So placement is a layout over the whole ring: every house rectangle is known before any caption
 * is placed, captions are handed out in priority order, and a candidate is taken only when it
 * lands inside the card, clear of EVERY house, of every caption already standing and of the hub
 * (the disc in the middle, which is drawn over them and would cut their words off). A
 * stop that cannot be captioned anywhere keeps its house and loses its words — which is the same
 * bargain `layoutWheel` already makes, now measured in the pixels it actually happens in rather
 * than in degrees of arc, which cannot express the difference between two captions side by side
 * at the top of the ring and two stacked at its flank.
 *
 * `required` houses (the sun and the moon) are never dropped: when nothing is clear they take the
 * least-overlapping candidate, because a ring without its two anchors is not readable at all.
 */
export function placeCaptions(
  houses: readonly WheelHouse[],
  size: number,
  hub?: WheelHub,
): (CaptionPlacement | null)[] {
  const rects = houses.map(houseRect);
  const order = houses
    .map((h, i) => ({ i, priority: h.priority ?? 1 }))
    .sort((a, b) => a.priority - b.priority || a.i - b.i);

  const out: (CaptionPlacement | null)[] = houses.map(() => null);
  const taken: Box[] = [];

  for (const { i } of order) {
    const h = houses[i] as WheelHouse;
    const full = h.captionHeight ?? CAPTION_H;
    // the whole caption first; then, if there is one, its first line alone
    const heights =
      h.compactHeight !== undefined && h.compactHeight < full ? [full, h.compactHeight] : [full];
    let best: { p: CaptionPlacement; cost: number; height: number } | null = null;
    let placed: { p: CaptionPlacement; height: number } | null = null;

    for (const captionH of heights) {
      for (const { side, shift } of sidesFor(h.deg)) {
        const raw = clamp(boxOn(side, h, captionH, shift), captionH, size);
        const p = captionH === full ? raw : { ...raw, compact: true };
        const box = rectOf(p, captionH);
        const cost =
          rects.reduce((sum, r) => sum + overlapArea(box, r), 0) +
          taken.reduce((sum, r) => sum + overlapArea(box, r), 0) +
          (hub !== undefined && onHub(box, hub) ? HUB_COST : 0);
        if (cost === 0) {
          placed = { p, height: captionH };
          break;
        }
        if (best === null || cost < best.cost) best = { p, cost, height: captionH };
      }
      if (placed !== null) break;
    }

    if (placed === null && h.required === true && best !== null) placed = best;
    if (placed === null) continue;
    out[i] = placed.p;
    taken.push(rectOf(placed.p, placed.height));
  }

  return out;
}

/** Exported for the tests that measure what the pass produced. */
export const __geometry = { houseRect, intersects, onHub, rectOf };
