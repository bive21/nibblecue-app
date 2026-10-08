/**
 * The child chip's "Both" as numbers (the owner, 2026-09-25, of the "that's cool" list — *"might
 * not necessarily be useful, but it's cool … Let's try doing everything. I will then review"*;
 * idea #8, twins "Both"). When the top bar switches to Both, the one avatar in the chip splits into
 * the babies' own discs, which slide apart into their pair; switching back to one baby slides them
 * together again under that baby's avatar. Pure TypeScript, so all of it is tested in node — this
 * package's tests cannot render React Native — and `ChildChip.tsx` only hands these numbers to
 * views and to `Animated.Value#interpolate`, as `DayNightSwitch.tsx` does with its own.
 *
 * THE PAIR LIVES IN THE AVATAR'S OWN SQUARE, and everything below follows from that. The chip is
 * capped at 126 points on a narrow phone (`chipMaxWidth`), and after its padding, the avatar, the
 * gaps and the chevron that leaves the words 50. A second 31 circle beside the first — the obvious
 * way to draw two babies — would leave them 30, and "Both" in the chip's bold 14 is about 30 wide
 * before the phone's text size grows it: the name the chip exists to show would lose its end at the
 * one moment it changes. So the discs are smaller and sit on the DIAGONAL of the 31 square, where
 * two circles have the most room, and the chip keeps exactly its width. Nothing in the bar moves
 * when the pair arrives; only what is drawn in one square of it.
 *
 * ONE VALUE DRIVES IT, `split`: 0 is the one avatar, 1 is the pair, and every layer is a
 * piecewise-linear function of it — so the merge is the split played backwards, and a switch made
 * while the discs are still moving just sends the same value back the way it came.
 *
 *   - the ONE AVATAR shrinks to a disc's size as it fades, so it hands over to the discs rather
 *     than vanishing off them;
 *   - the DISCS, stacked at its center under it, slide out to their places and settle a hair past
 *     them and back — the curve `DayNightSwitch` uses, with a little more spring for a shorter trip;
 *   - the RING that parts an overlapping disc from the one behind it comes in as they part, so the
 *     stacked discs under a fading avatar are one shape and not a target of rings.
 *
 * Under REDUCE MOTION, and in the amber NIGHT theme, nothing moves: the value is set to where it
 * ends and the chip simply IS one avatar or the pair (docs/DESIGN_SYSTEM.md §7 — "disables
 * transforms and transitions but never hides content"; docs/MOBILE.md §5 — at 3 a.m. nothing on
 * the screen moves that is not information).
 */
import type { Frame } from './dayNightSwitch';
import { TOP_BAR_AVATAR } from './topBarLayout';

/** The square the pair is drawn in: the chip's own 31 avatar, which keeps its place in the row. */
export const PAIR_BOX = TOP_BAR_AVATAR;

/** More babies than this are drawn as the first three: a fourth disc in 31 points is a smudge. */
export const PAIR_MAX = 3;

/** A disc's center, in the avatar square's own coordinates (0,0 its top left). */
export interface PairPoint {
  x: number;
  y: number;
}

export interface PairGeometry {
  count: 2 | 3;
  /** The avatar square's side. */
  box: number;
  /** One disc's diameter. */
  disc: number;
  /**
   * The ring round every disc drawn over another, in the chip's own surface color: it is what
   * makes two overlapping circles of one gradient read as two, the way the notification badge's
   * border does on the bell beside it (TopBar.tsx).
   */
  ring: number;
  /** The initial's size on a disc. */
  letter: number;
  /** Back to front: the first is drawn first and the rest overlap it. */
  centers: readonly PairPoint[];
  /** Where the one avatar's center is: every disc starts the split there and ends the merge there. */
  origin: PairPoint;
}

/**
 * TWO: 21 points each, their centers 16.5 apart on the 45° diagonal — the most two circles can
 * have in a 31 square with room for both letters. The front disc's ring reaches 12 from its center,
 * so the back disc's initial (a 9.5 letter, 3.5 either side of its center) is clear of it by a
 * point, and the discs still overlap by 4.5: a pair, not two dots.
 *
 * The pair is centered half a point right of and below the square's center, and that is the
 * chip's shape, not taste: the chip is a pill, its left end is a half circle, and the back disc
 * sits inside that curve. Leaning away from it keeps the disc a point and a half inside the rim
 * at the chip's smallest height, where the curve is tightest (`childPair.test.ts` walks it).
 *
 * THREE: 18 points each on a triangle 14.5 a side, point up, for the same room and the same
 * clearance at a smaller letter — triplets are rarer than twins, and the chip still reads "Both"
 * for them, which the switcher does not (its row says "All 3 at once"). The triangle leans a
 * whole point right, because its lower-left disc is the one in the curve, and it carries past its
 * place on the way in: centered, that disc's ring touched the rim at the top of the settle.
 */
const TWO = { disc: 21, ring: 1.5, letter: 9.5, step: 16.5, at: { x: 16, y: 16 } } as const;
const THREE = { disc: 18, ring: 1.5, letter: 8, side: 14.5, at: { x: 16.5, y: 16 } } as const;

export function pairGeometry(count: number): PairGeometry {
  const origin = { x: PAIR_BOX / 2, y: PAIR_BOX / 2 };
  if (count >= PAIR_MAX) {
    const r = THREE.side / Math.sqrt(3);
    const { x, y } = THREE.at;
    const half = THREE.side / 2;
    return {
      count: 3,
      box: PAIR_BOX,
      disc: THREE.disc,
      ring: THREE.ring,
      letter: THREE.letter,
      centers: [
        { x, y: y - r },
        { x: x - half, y: y + r / 2 },
        { x: x + half, y: y + r / 2 },
      ],
      origin,
    };
  }
  const d = TWO.step / 2 / Math.SQRT2;
  return {
    count: 2,
    box: PAIR_BOX,
    disc: TWO.disc,
    ring: TWO.ring,
    letter: TWO.letter,
    centers: [
      { x: TWO.at.x - d, y: TWO.at.y - d },
      { x: TWO.at.x + d, y: TWO.at.y + d },
    ],
    origin,
  };
}

/** Whether the chip draws a pair: it is showing Both and was handed at least two babies' faces. */
export const pairShown = (isBoth: boolean, faces: readonly unknown[] | undefined): boolean =>
  isBoth && faces !== undefined && faces.length >= 2;

/* --------------------------------------------------------------------------- the move */

/** One split or merge. Shorter than the day/night flip: the discs travel eight points, not thirty. */
export const PAIR_MS = 480;

/**
 * The curve, as `Easing.bezier`'s four control points: `DayNightSwitch`'s slow start, and a little
 * more carry at the end (its last control point 1.45, not 1.3) so a trip this short still visibly
 * settles. About 9% past: two thirds of a point, which `childPair.test.ts` holds inside the pill.
 */
export const PAIR_EASE = [0.5, 0, 0.25, 1.45] as const;

/**
 * THE SWITCHER SHEET'S EXIT, waited out. The parent chooses Both in a sheet, and the chip is behind
 * that sheet's scrim while it slides away — a split started at once plays its first half dimmed.
 * So a split the switcher asked for starts when the sheet has gone: `BottomSheet`'s own 220 ms
 * (`SHEET_DURATION_MS`, which the test reads from its source so the two cannot drift apart).
 */
export const PAIR_AFTER_SHEET_MS = 220;

/**
 * What a change of Both does. `still` is reduce motion or the amber night theme: nothing is
 * animated, the value is set where it ends, and the end is the same either way.
 */
export function pairMove(
  both: boolean,
  still: boolean,
): { to: 0 | 1; animate: boolean; duration: number } {
  return { to: both ? 1 : 0, animate: !still, duration: still ? 0 : PAIR_MS };
}

/* ------------------------------------------------------------------------- the frames */

const frame = (
  inputRange: readonly number[],
  outputRange: readonly number[],
  extrapolate: Frame['extrapolate'] = 'clamp',
): Frame => ({ inputRange, outputRange, extrapolate });

export interface PairFrames {
  /** The one avatar: whole at 0, gone by a third of the way, shrinking to a disc's size as it goes. */
  single: { opacity: Frame; scale: Frame };
  /** Every disc: on almost at once, under the avatar, so they are there to be revealed. */
  discOpacity: Frame;
  /** The rings: in as the discs part, so the stack under the fading avatar is one shape. */
  ringOpacity: Frame;
  /** Each disc's offset from where it rests, in points: all at the avatar's center at 0, home at 1. */
  discs: readonly { x: Frame; y: Frame }[];
}

export function pairFrames(g: PairGeometry): PairFrames {
  return {
    single: {
      opacity: frame([0, 0.35], [1, 0]),
      scale: frame([0, 0.35], [1, g.disc / g.box]),
    },
    discOpacity: frame([0, 0.06], [0, 1]),
    ringOpacity: frame([0.15, 0.5], [0, 1]),
    // `extend`: the curve's carry past 1 is MEANT to show here — the discs settle a hair past
    // their places and back. Everything else is clamped, since an opacity past 1 means nothing.
    discs: g.centers.map(c => ({
      x: frame([0, 1], [g.origin.x - c.x, 0], 'extend'),
      y: frame([0, 1], [g.origin.y - c.y, 0], 'extend'),
    })),
  };
}
