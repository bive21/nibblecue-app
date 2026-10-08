/**
 * THE THREE CONTAINERS MILK IS STORED IN, AS PICTURES (the owner, 2026-09-26: *"make the bag bottle
 * container, a more interesting option"*). Pure TypeScript — the paths, where the milk can stand in
 * each, how high it stands for an amount, and the little wiggle a tap gives — so every number is a
 * node test (`milkContainers.test.ts`) and `MilkContainerArt.tsx` only hands them to an SVG.
 *
 * Each is drawn on the same 48 × 64 grid, standing on the same floor, so three of them side by side
 * read as three things of one family:
 *
 *   bag      a storage bag: the zip band across its top, a pouch a little wider at the foot, and
 *            the write-on lines a parent dates it on;
 *   bottle   a storage bottle: a ridged screw cap, a short neck, shoulders, and marks up its side;
 *   jar      a lidded container: a wide lid with a band, a straight body.
 *
 * THE MILK IS THE AMOUNT, NOT A JUDGEMENT. It stands at the amount over the container's nominal size
 * (the app says what each holds — `containerFill`), and a bag filled past its size is simply full.
 * Nothing about the level is good or bad: it is how much, drawn.
 */
import { roundTo } from './stepperMath';

export type MilkShape = 'bag' | 'bottle' | 'jar';
export const MILK_SHAPES: readonly MilkShape[] = ['bag', 'bottle', 'jar'];

/** The grid every container is drawn on. */
export const MILK_ART = { width: 48, height: 64, stroke: 2 } as const;

/** The band of the grid the milk can stand in: from `top` (full) down to `bottom` (empty). */
export interface MilkWell {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface MilkShapeArt {
  /** The container's inside, and its outline: the milk is clipped to it, and it is stroked. */
  body: string;
  /** A solid part drawn over the body's top — the zip band, the cap, the lid — and stroked too. */
  cap: string;
  /** The fine lines drawn over everything: the zip's track, the cap's ridges, the marks. */
  details: string;
  well: MilkWell;
}

/**
 * THE PATHS. Absolute commands on the 48 × 64 grid, every container on the floor at y = 59.
 * `milkContainers.test.ts` holds each inside the grid with room for its stroke, and each well inside
 * its body.
 */
export const MILK_SHAPE_ART: Readonly<Record<MilkShape, MilkShapeArt>> = {
  bag: {
    body: 'M11 13H37C38.4 13 39.4 14 39.5 15.4L41.5 52C41.8 56.2 39 59 35 59H13C9 59 6.2 56.2 6.5 52L8.5 15.4C8.6 14 9.6 13 11 13Z',
    cap: 'M9 13V7.5C9 6.1 10.1 5 11.5 5H36.5C37.9 5 39 6.1 39 7.5V13Z',
    // the zip's track, and two write-on lines where a parent dates the bag
    details: 'M11.5 9H36.5M14 20H27M14 24H22',
    well: { top: 14, bottom: 59, left: 6.5, right: 41.8 },
  },
  bottle: {
    body: 'M17 13H31V17C31 18.6 32 19.6 34 20.6C37 22.1 38.5 24.6 38.5 28V54C38.5 56.8 36.3 59 33.5 59H14.5C11.7 59 9.5 56.8 9.5 54V28C9.5 24.6 11 22.1 14 20.6C16 19.6 17 18.6 17 17Z',
    cap: 'M15 13V6.5C15 5.1 16.1 4 17.5 4H30.5C31.9 4 33 5.1 33 6.5V13Z',
    // the cap's ridges, and the marks up the bottle's side
    details:
      'M19 6.5V10.5M22.3 6.5V10.5M25.7 6.5V10.5M29 6.5V10.5M12.5 36H16.5M12.5 43H15M12.5 50H16.5',
    well: { top: 16, bottom: 59, left: 9.5, right: 38.5 },
  },
  jar: {
    body: 'M9 15H39V53C39 56.3 36.3 59 33 59H15C11.7 59 9 56.3 9 53Z',
    cap: 'M7 15V9.5C7 8.1 8.1 7 9.5 7H38.5C39.9 7 41 8.1 41 9.5V15Z',
    // the lid's band
    details: 'M7 11H41',
    well: { top: 16, bottom: 59, left: 9, right: 39 },
  },
};

/** An amount's place in a container of a size: 0 empty, 1 full, never outside them. */
export function milkFill(amount: number, capacity: number): number {
  if (!(capacity > 0) || !Number.isFinite(amount) || amount <= 0) return 0;
  return Math.min(1, amount / capacity);
}

/**
 * Where the milk's surface stands for a fill: `bottom` when empty, `top` when full, and a sliver
 * above the floor for any amount at all, so a quarter ounce in a big jar is still milk you can see.
 */
export function milkLevelY(well: MilkWell, fill: number): number {
  if (!(fill > 0)) return well.bottom;
  const span = well.bottom - well.top;
  const shown = Math.max(MILK_SLIVER / span, Math.min(1, fill));
  return roundTo(well.bottom - shown * span, 3);
}

/** The least milk drawn for an amount above nothing, in grid units. */
export const MILK_SLIVER = 2.5;

/* ------------------------------------------------------------------ the level, eased */

/** How long the milk takes to reach a new amount. */
export const MILK_RISE_MS = 240;

/** Ease-out cubic: quick to start, gentle to land — liquid finding its level. */
export const easeOut = (x: number): number => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);

/** The level `elapsed` ms into a rise from `from` to `to`; `to` itself once the rise is over. */
export function milkLevelAt(from: number, to: number, elapsed: number, ms = MILK_RISE_MS): number {
  if (elapsed >= ms || ms <= 0) return to;
  return from + (to - from) * easeOut(elapsed / ms);
}

/* ------------------------------------------------------------------ the wiggle on a tap */

/**
 * A TAP IS ANSWERED WITH A WIGGLE: the container rocks on its foot, left, right, less each time, and
 * stands still — 420 ms, as degrees against time. Never under reduce motion, and never in the amber
 * Night, where nothing moves (`motionStill`).
 */
export const WIGGLE_MS = 420;
export const WIGGLE: { readonly input: readonly number[]; readonly degrees: readonly number[] } = {
  input: [0, 70, 170, 270, 350, WIGGLE_MS],
  degrees: [0, -8, 7, -4, 2, 0],
};
