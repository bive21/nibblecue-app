/**
 * THE SOLIDS SHEET'S LITTLE PLATE, as numbers (the owner's delight list, 2026-09-26): each food the
 * parent writes on the list drops onto a plate beside "What they ate", lands with a small bounce and
 * settles among the others; taking a food off the list lifts it off the plate. Pure TypeScript, so
 * every pose is a node test — this package's tests cannot render React Native — and `FoodPlate.tsx`
 * only hands these numbers to views and to `Animated.Value#interpolate`.
 *
 * IT IS THE LIST, DRAWN. One morsel per food line that has a name, in the list's order, carrying
 * the food's first letter; the first six stand on the plate and the rest are counted in a "+3" chip
 * beside it. Nothing about it is a portion, a verdict or a goal: the plate never "fills", a morsel
 * is the same size whatever amount was typed, and its color comes from its first letter only
 * (`morselRole`), so a banana is not greener than a pea for any reason (CLAUDE.md §2). The list
 * stays the control and the only thing a screen reader hears; the plate is hidden from it.
 *
 * THE MOVES, frame by frame (`plateMotion`):
 *   - a food ARRIVES: its morsel falls from above the plate into its place (gravity: slow off the
 *     mark, fastest at the plate), squashes a little on landing, bounces up four points and settles
 *     with one smaller hop — 440 ms. It lands at 220 ms, which is when the sheet may feel it
 *     (`haptic('tap')`, once per change the parent made, however many foods it brought).
 *   - the plate MAKES ROOM: the morsels stand in one row centered on the plate, so a new one moves
 *     the others aside and a lifted one lets them close up — each glides to its new place in 260 ms.
 *   - a food LEAVES: its morsel lifts off and fades, 240 ms.
 *   - a morsel already on the list when the plate first draws is simply there; nothing plays that
 *     the parent did not cause.
 * Reduce motion and the amber Night set every end state and play nothing (`motionStill`).
 */
import { easeAt } from './themeSkyToggle';
import type { Frame } from './dayNightSwitch';
import type { Palette, ThemeName } from '../theme/theme';

/* ------------------------------------------------------------------------------ the picture */

/**
 * The strip beside the list's heading: the plate, and room at its right for the count of the
 * rest. 44 pt tall — the brief's ceiling is 56, and the heading's row is the only height it adds
 * to the sheet.
 */
export const PLATE_STRIP = { width: 168, height: 44 } as const;

/** The plate, seen from a little above: an outer rim, the well inside it, a soft shadow under it. */
export const PLATE = {
  cx: 64,
  cy: 30,
  rx: 62,
  ry: 11,
  /** The well: where the food sits. */
  wellRx: 50,
  wellRy: 7,
  /** The shadow's ellipse, just under the plate's foot. */
  shadowRy: 2.5,
  rim: 1.5,
} as const;

/** A morsel: a small round piece with the food's first letter on it. */
export const MORSEL = {
  d: 18,
  rim: 1.5,
  /** Centers this far apart: a hair closer than a morsel is wide, so the row reads as a pile. */
  gap: 16.5,
  /** At most this many on the plate; the rest are counted beside it. */
  max: 6,
  /** How far above its place a morsel starts its fall. */
  fall: 22,
  /** How high the first bounce goes, and the second. */
  bounce: 4,
  hop: 1.2,
  /** How far a leaving morsel lifts before it is gone. */
  lift: 18,
} as const;

/** The count of the foods past the sixth: a small pill at the plate's right. */
export const PLATE_CHIP = { left: 134, width: 32, height: 18 } as const;

/**
 * Where a morsel rests: `i` of `n` on the plate, the row centered on the plate, each a point up or
 * down from its neighbor so the row sits like food rather than a string of beads. The morsel's
 * foot rests on the well's middle line.
 */
const JITTER = [0, -2, 1, -1, 2, -1.5] as const;

export function morselRest(i: number, n: number): { x: number; y: number } {
  const count = Math.max(1, Math.min(n, MORSEL.max));
  const at = Math.max(0, Math.min(i, count - 1));
  const x = PLATE.cx + (at - (count - 1) / 2) * MORSEL.gap;
  const y = PLATE.cy + 2 - MORSEL.d / 2 + (JITTER[at] ?? 0);
  return { x, y };
}

/** The food's first letter, as the morsel writes it: one character, in capitals. */
export function morselInitial(name: string): string {
  const first = Array.from(name.trim())[0] ?? '';
  return first.toLocaleUpperCase();
}

/**
 * THE MORSEL'S COLOR, BY ITS FIRST LETTER AND NOTHING ELSE — six of the palette's own module pairs
 * (a pale fill, its ink for the rim), so a food keeps its color while its name is typed and two
 * foods starting with the same letter match. The color says nothing about the food.
 */
export const MORSEL_ROLES = ['solids', 'feed', 'milk', 'breastfeed', 'tummy', 'sleep'] as const;
export type MorselRole = (typeof MORSEL_ROLES)[number];

export function morselRole(initial: string): MorselRole {
  const code = initial.codePointAt(0) ?? 0;
  return MORSEL_ROLES[code % MORSEL_ROLES.length] ?? 'solids';
}

/* ------------------------------------------------------------------------------ the colors */

export interface PlateColors {
  /** The plate's face and its well: the palette's own surfaces. */
  face: string;
  well: string;
  /** The plate's rim: a mark, 3:1 on the sheet the plate stands on. */
  rim: string;
  /** The shadow under the plate; null in the amber Night, where nothing is lifted off the page. */
  shadow: string | null;
  /** A morsel's letter: text, 4.5:1 on every morsel's fill. */
  letter: string;
  /** The "+3" chip: its fill, its edge, and its words (4.5:1 on its fill). */
  chip: string;
  chipEdge: string;
  chipText: string;
}

/**
 * THE PLATE'S COLORS, FROM THE PALETTE AND NOTHING ELSE: its surfaces for the face and the well,
 * `text3` for the rim (the quietest ink that is still a mark on every sheet), the text ink for the
 * letters and the chip. A scheme overlays none of these (theme.ts), so one measurement per theme
 * holds in all six schemes; the test walks them anyway.
 */
export function plateColors(palette: Palette, theme: ThemeName): PlateColors {
  const night = theme === 'night';
  return {
    face: theme === 'light' ? palette.surfaceSolid : palette.surface3,
    well: palette.surface2,
    rim: palette.text3,
    shadow: night ? null : palette.line,
    letter: palette.text,
    chip: palette.surface2,
    chipEdge: palette.text3,
    chipText: palette.text2,
  };
}

/** A morsel's fill and rim: the module pair its letter picked. */
export function morselColors(palette: Palette, role: MorselRole): { fill: string; rim: string } {
  return { fill: palette[`${role}Soft`], rim: palette[role] };
}

/* ------------------------------------------------------------------------------ the moves */

export const PLATE_MOTION = {
  dropMs: 440,
  /** Where in the drop the morsel first touches the plate: the moment the sheet may feel it. */
  landAt: 0.5,
  glideMs: 260,
  liftMs: 240,
  /** `Easing.bezier`'s points for a glide and a lift: off at speed, settling into place. */
  ease: [0.33, 1, 0.68, 1] as const,
  /** Samples of the fall: every 11 ms of it. */
  steps: 20,
} as const;

/** When the landing is felt, from the moment the food was added. */
export const landMs = (): number => Math.round(PLATE_MOTION.dropMs * PLATE_MOTION.landAt);

const frame = (
  inputRange: readonly number[],
  outputRange: readonly number[],
  extrapolate: Frame['extrapolate'] = 'clamp',
): Frame => ({ inputRange, outputRange, extrapolate });

export interface DropFrames {
  /** Of the drop's value, 0 → 1: how far above its place the morsel is (negative is up). */
  y: Frame;
  opacity: Frame;
  /** The squash as it lands: wider and shorter for a moment, then round again. */
  scaleX: Frame;
  scaleY: Frame;
}

/**
 * THE DROP. The fall is gravity — the height goes as the square of the time, so it leaves slowly
 * and reaches the plate at its fastest — sampled finely enough that `interpolate`'s straight lines
 * are shorter than a frame; then two bounces, each a half cosine up and back, the second a third
 * of the first. It is faded in over the first fifth, so it seems to come from nowhere rather than
 * from the words above.
 */
export function dropFrames(): DropFrames {
  const land = PLATE_MOTION.landAt;
  const input: number[] = [];
  const output: number[] = [];
  for (let k = 0; k <= PLATE_MOTION.steps; k += 1) {
    const u = k / PLATE_MOTION.steps;
    input.push(u * land);
    output.push(MORSEL.fall * (u * u - 1));
  }
  // the two bounces: up and down again, each as half a cosine between its turning points
  const bounces: readonly (readonly [number, number])[] = [
    [0.68, -MORSEL.bounce],
    [0.84, 0],
    [0.92, -MORSEL.hop],
    [1, 0],
  ];
  let from: readonly [number, number] = [land, 0];
  for (const to of bounces) {
    for (let k = 1; k <= 6; k += 1) {
      const s = k / 6;
      input.push(from[0] + (to[0] - from[0]) * s);
      output.push(from[1] + (to[1] - from[1]) * ((1 - Math.cos(Math.PI * s)) / 2));
    }
    from = to;
  }
  return {
    y: frame(input, output),
    opacity: frame([0, 0.2, 1], [0, 1, 1]),
    scaleX: frame([0, land - 0.04, land, land + 0.08, land + 0.16, 1], [1, 1, 1.12, 0.97, 1, 1]),
    scaleY: frame([0, land - 0.04, land, land + 0.08, land + 0.16, 1], [1, 1, 0.84, 1.04, 1, 1]),
  };
}

export interface LiftFrames {
  y: Frame;
  opacity: Frame;
  scale: Frame;
}

/** THE LIFT: up and away, fading, a little smaller, on the glide's own ease-out. */
export function liftFrames(steps = 12): LiftFrames {
  const input: number[] = [];
  const y: number[] = [];
  for (let k = 0; k <= steps; k += 1) {
    const u = k / steps;
    input.push(u);
    y.push(0 - MORSEL.lift * easeAt(PLATE_MOTION.ease, u));
  }
  return {
    y: frame(input, y),
    opacity: frame([0, 0.25, 1], [1, 0.85, 0]),
    scale: frame([0, 1], [1, 0.9]),
  };
}

/* ------------------------------------------------------------------------------ the plan */

/** One food on the list, as the plate sees it. */
export interface PlateFood {
  /** The line's own key: a morsel is a line, so a name being typed never swaps its morsel. */
  key: string;
  /** What the food is called so far. */
  name: string;
}

export interface PlateMorsel {
  key: string;
  initial: string;
  role: MorselRole;
  x: number;
  y: number;
}

export interface PlatePicture {
  morsels: PlateMorsel[];
  /** How many foods the plate has no room for: the chip's number, 0 for no chip. */
  more: number;
}

/**
 * THE PLATE FOR A LIST: the named foods in the list's order, the first six on the plate in a row
 * centered on it, and a count of the rest.
 */
export function platePicture(foods: readonly PlateFood[]): PlatePicture {
  const named = foods
    .map(f => ({ key: f.key, initial: morselInitial(f.name) }))
    .filter(f => f.initial !== '');
  const shown = named.slice(0, MORSEL.max);
  return {
    morsels: shown.map((f, i) => ({
      key: f.key,
      initial: f.initial,
      role: morselRole(f.initial),
      ...morselRest(i, shown.length),
    })),
    more: Math.max(0, named.length - shown.length),
  };
}

export interface PlateChange {
  /** Morsels that were not on the plate before: they drop (the first draw drops nothing). */
  arrived: string[];
  /** Morsels that were and are not: they lift off. */
  left: PlateMorsel[];
}

/** What changed between two pictures of the plate — and whether the parent will feel it. */
export function plateChange(before: PlatePicture | null, after: PlatePicture): PlateChange {
  if (before === null) return { arrived: [], left: [] };
  const was = new Set(before.morsels.map(m => m.key));
  const now = new Set(after.morsels.map(m => m.key));
  return {
    arrived: after.morsels.filter(m => !was.has(m.key)).map(m => m.key),
    left: before.morsels.filter(m => !now.has(m.key)),
  };
}
