/**
 * THE BOTTLE TOGGLE AS NUMBERS (the owner, 2026-09-25, idea 3 of the "that's cool" list: the
 * bottle sheet's "Finished it / Some left" as a bottle that DRAINS). The shared track — the pill,
 * the two words, the knob's travel, `pos` and `sway` — is `pictureToggle.ts`; this is the bottle
 * that rides in it and the milk inside the bottle. Pure TypeScript, tested in node
 * (`bottleToggle.test.ts`); `BottleToggle.tsx` only hands these numbers to views.
 *
 * WHAT THE PICTURE SAYS. The knob is a baby bottle standing upright. On the drained stop ("Finished
 * it") it is empty. On the other ("Some left") the milk stands at a LINE — the leftover over the
 * bottle, when the sheet knows both (`leftFraction`), and a nominal third when it does not — and
 * the line follows the leftover stepper as the parent changes it. A change of answer slides the
 * bottle to the other end, leaning into the push and rocking upright as it stops, while the milk
 * drains to nothing or rises to its line, its surface lagging the bottle's lean the way a liquid
 * does. It is a picture of the answer the parent gave, and nothing more: it draws no amount, adds
 * no mark for finishing, and says nothing about what the baby took (CLAUDE.md §2 rules 3 and 6).
 *
 * THE MILK IS ITS OWN VALUE, `level` (0 empty, 1 full to the collar), because it moves when the
 * choice has not changed — the leftover stepper — and a frame of the knob's `pos` could never draw
 * that. A toggle drives it on the move's own curve and clock, so the milk arrives with the bottle;
 * a leftover change drives it alone, quickly (`planLevel`).
 */
import type { Frame } from './dayNightSwitch';
import { PICTURE_EASE, pictureFrame, swayFrame } from './pictureToggle';

/* ---------------------------------------------------------------------------- the size */

/**
 * The bottle's slot: its collar and a point and a quarter of air either side. As narrow as the
 * bottle, because every point of it is taken from the words' halves at both ends of the pill.
 */
export const BOTTLE_SLOT = 20;
/**
 * How far in from the pill's inset the bottle rests at either end. The pill's ends are half
 * circles, and a bottle is a tall thing with square shoulders: at the inset its bottom corner
 * would cross the rim. Four points in, it clears it by the width of its own outline — the
 * placement test walks every point of the drawing against the curve, at rest and on the move.
 */
export const BOTTLE_END_PAD = 4;

/**
 * THE BOTTLE, drawn in the knob's box (`BOTTLE_SLOT` × 48, y down): a teat on a collar on a
 * body. The body is what holds the milk — its box is the milk's clip — and everything above it
 * covers the top of the body, so milk "full" meets the collar and never shows above it.
 */
export const BOTTLE = {
  /** The teat: a flared base on the collar, narrowing to a rounded nipple. */
  teat:
    'M5 12.2L5 10.6C5 8.6 7.6 8 8.2 5.9C8.4 5.1 7.9 4.2 7.9 3.2C7.9 1.8 8.8 0.8 10 0.8' +
    'C11.2 0.8 12.1 1.8 12.1 3.2C12.1 4.2 11.6 5.1 11.8 5.9C12.4 8 15 8.6 15 10.6L15 12.2Z',
  collar: { x: 2.5, y: 11.6, width: 15, height: 6.4, r: 2 },
  body: { x: 3, y: 17, width: 14, height: 29.4, r: 4.6 },
  /** The outline's width, round the body, the collar and the teat. */
  stroke: 1.3,
  /**
   * Three graduations up the left of the glass, at a quarter, a half and three quarters of the
   * body — a bottle's own markings, and what makes "a line" read as a level rather than a stripe.
   */
  ticks: [0.25, 0.5, 0.75] as const,
  tick: { from: 1.3, to: 4.3, width: 1 },
  /** The light down the right of the glass (not in the amber Night: nothing there is lit). */
  shine: { x: 13, y: 20.5, width: 1.6, height: 19.4, r: 0.8 },
} as const;

/** The top of the milk: a line across the glass, drawn as the milk's own top edge. */
export const MILK_SURFACE = 1.4;

/**
 * The GHOST — the bottle drawn in outline at the stop the knob is not at, smaller, so the pill
 * shows where the bottle can go and what it looks like there without a second bottle competing
 * with the real one: the theme toggle's glyphs, as the knob's own outline.
 */
export const BOTTLE_GHOST_SCALE = 0.72;

/**
 * THE BOTTLE ITSELF, A LITTLE SMALLER THAN ITS KNOB (the owner, 2026-10-06: "make the bottle icon on
 * the finished it or some left smaller, it is too big, almost hitting the border"): drawn at 82%
 * about the knob's middle, so it stands clear of the pill's edge above and below.
 */
export const BOTTLE_KNOB_SCALE = 0.82;

/* --------------------------------------------------------------------------- the level */

/**
 * The milk's level on the "some left" stop when the sheet cannot say: a third, which reads as
 * "some" at a glance and as neither empty nor full.
 */
export const NOMINAL_LEFT = 1 / 3;

/**
 * What fraction of the bottle was left, when both amounts are known: the leftover over the
 * bottle. Null for a bottle of nothing, or a number that is not one — the picture then falls back
 * to `NOMINAL_LEFT` rather than drawing a guess. Any unit: it is a ratio.
 */
export function leftFraction(leftAmount: number, bottleAmount: number): number | null {
  if (!Number.isFinite(leftAmount) || !Number.isFinite(bottleAmount) || bottleAmount <= 0)
    return null;
  return leftAmount / bottleAmount;
}

/**
 * THE MILK'S LEVEL, 0 (empty) to 1 (full to the collar): nothing on the drained stop; on the
 * other, the fraction left, CLAMPED — more left than was in the bottle is a refusal the sheet
 * says in words, and the picture stops at full rather than drawing milk above the collar; a
 * negative number stops at empty. Unknown is the nominal third.
 */
export function bottleLevel(drained: boolean, fraction: number | null): number {
  if (drained) return 0;
  const f = fraction === null || !Number.isFinite(fraction) ? NOMINAL_LEFT : fraction;
  return Math.min(1, Math.max(0, f));
}

/** How long the milk takes to follow a leftover changed on its stepper: one short ease. */
export const FOLLOW_MS = 280;

/**
 * The curve the milk follows the stepper on: quick off the mark and soft into its line, so a tap
 * on + is answered at once. The move's own curve (`PICTURE_EASE`) is for when the bottle travels.
 */
export const FOLLOW_EASE = [0.2, 0.7, 0.3, 1] as const satisfies readonly [
  number,
  number,
  number,
  number,
];

export interface LevelPlan {
  animate: boolean;
  to: number;
  duration: number;
  ease: readonly [number, number, number, number];
}

/**
 * WHAT A NEW LEVEL DOES. A change of stop (`toggled`) takes the move's own clock and curve, so the
 * milk drains or rises while the bottle slides and lands with it; a leftover changed on its
 * stepper takes `FOLLOW_MS`. When the picture is still (reduce motion, the amber Night) the level
 * is set, never animated — the line is simply where the numbers put it.
 */
export function planLevel(to: number, toggled: boolean, moveMs: number, still: boolean): LevelPlan {
  if (still) return { animate: false, to, duration: 0, ease: PICTURE_EASE };
  return toggled
    ? { animate: true, to, duration: moveMs, ease: PICTURE_EASE }
    : { animate: true, to, duration: FOLLOW_MS, ease: FOLLOW_EASE };
}

/* ------------------------------------------------------------------------- the frames */

/**
 * How far the bottle leans at the height of a move, in degrees, about the middle of its base. A
 * bottle is tall and narrow: seven degrees reads as a push without looking like a fall.
 */
export const BOTTLE_LEAN = 7;
/**
 * How far the milk turns INSIDE the bottle against the bottle's lean. At 1.5 its surface tilts
 * half the lean the other way in the room — it piles up at the back as the bottle is pushed and
 * at the front as it stops — which is what milk does, and why the picture reads as liquid.
 */
export const SLOSH = 1.5;

export interface BottleFrames {
  /**
   * Of `level`: how far the milk's layer sits down the body. The layer's middle is the milk's
   * surface; at 0 it is the body's bottom, so all of the milk is below the glass and clipped.
   */
  milkY: Frame;
  /**
   * Of `level`: the milk's own opacity — none at empty, so a milk surface tilted by the slosh can
   * never show a sliver in an empty bottle's corner.
   */
  milk: Frame;
  /** Of `sway`: the bottle's lean, about the middle of its base. */
  lean: Frame;
  /** Of `sway`: the milk's turn inside the bottle, about the middle of its surface. */
  slosh: Frame;
}

export function bottleFrames(): BottleFrames {
  const h = BOTTLE.body.height;
  return {
    milkY: pictureFrame([0, 1], [h, 0]),
    milk: pictureFrame([0, 0.03], [0, 1]),
    lean: swayFrame(BOTTLE_LEAN),
    slosh: swayFrame(-SLOSH * BOTTLE_LEAN),
  };
}

/**
 * The milk's layer, in the body's own coordinates, with its MIDDLE on the surface — so the layer
 * turns about the middle of the surface — and its lower half the milk (`milk`, below). Twice the
 * body's width, so a tilted surface still reaches both walls; and the milk is twice the body's
 * height deep, not once, so that a FULL bottle tilting does not lift the milk's bottom edge off the
 * glass's bottom corner — the test turns it through every angle it can reach and finds no gap.
 */
export function milkLayer(): {
  left: number;
  top: number;
  width: number;
  height: number;
  /** The milk inside the layer: the lower half, from the surface down. */
  milk: { top: number; height: number };
} {
  const { width, height } = BOTTLE.body;
  return {
    left: -width / 2,
    top: -2 * height,
    width: width * 2,
    height: height * 4,
    milk: { top: 2 * height, height: 2 * height },
  };
}
