/**
 * THE GROWTH SHEET'S TAPE AND SCALE, as numbers (the owner's delight list, 2026-09-26): under the
 * length the parent enters, a small tape whose marker slides to that length; under the weight, a
 * small dial whose needle swings to that weight and settles. Pure TypeScript, so every mark and
 * every move is a node test — this package's tests cannot render React Native — and
 * `GrowthGauges.tsx` only hands these numbers to one SVG and to the native driver.
 *
 * THE PARENT'S NUMBER ON A NEUTRAL SCALE, AND NOTHING ELSE (CLAUDE.md §2 rules 1 and 3). A tape
 * from zero, a dial from zero; graduations, a few numbers and the unit the sheet itself shows
 * (cm or in, kg or lb). No percentile band, no "normal range", no mark at any particular length or
 * weight, no color that changes with the number, no word. Every color is a neutral role of the
 * palette — the surfaces, the text inks — so the marker is a pencil line and the needle a
 * needle, the same at every reading (`gaugeColors`; `growthGauge.test.ts` holds them to it).
 *
 * THE ENDS ARE THE STEPPERS' OWN (the growth sheet's `WEIGHT_RANGE` and `LENGTH_RANGE`, the widest
 * a scale or tape plausibly reads), rounded up to a whole graduation: 130 cm or 52 in, 30 kg or
 * 70 lb. A reading past an end pins the marker or the needle there, the way a dial meets its stop;
 * the stepper above still writes it in full.
 *
 * WHAT MOVES, frame by frame:
 *   - the TAPE appears (the length switched on): its marker slides from zero to the length on an
 *     ease-out, longer the further it goes (280–700 ms); a step of the stepper glides it from
 *     wherever it is (160–420 ms), so a held stepper is followed rather than pulsed after.
 *   - the SCALE appears (the weight switched on): its needle swings up from zero and settles on the
 *     weight — a damped spring that passes it by about a sixth of the swing and is still within 2%
 *     of it by half a second (`NEEDLE_SPRING`); a step swings it again from where it is.
 * Reduce motion and the amber Night draw the marker and the needle at the reading; nothing moves.
 */
import type { Palette, ThemeName } from '../theme/theme';

/* ------------------------------------------------------------------------------ the ruler */

export type RulerUnit = 'cm' | 'in';

/** A tape's graduations: where it ends, the small and the long marks, and which are numbered. */
export interface Graduation {
  max: number;
  minor: number;
  major: number;
  every: number;
}

/**
 * THE TAPE, BY UNIT. Centimeters: a mark every 5, a long one every 10, a number every 20, to 130.
 * Inches: a mark every inch, a long one every 5, a number every 10, to 52.
 */
export const RULER_SCALE: Readonly<Record<RulerUnit, Graduation>> = {
  cm: { max: 130, minor: 5, major: 10, every: 20 },
  in: { max: 52, minor: 1, major: 5, every: 10 },
};

/**
 * The tape's box. The marker's cap stands on top of it; the marks hang from its top edge and the
 * numbers sit under them, inside the tape. Zero is `inset` in from the tape's left end, the far end
 * `inset` in from its right, so the first and last numbers stand on the tape, not past it.
 */
export const TAPE = {
  height: 36,
  tapeTop: 8,
  tapeHeight: 24,
  /** The tape's own ends, in from the box. */
  edge: 4,
  /** Zero and the far end, in from the box. */
  inset: 12,
  minorTick: 4,
  majorTick: 7,
  /** Where the numbers' line starts, and its height. */
  numberTop: 17,
  numberHeight: 13,
  /** The numbers' size, and how far they may grow with the phone's text. */
  numberSize: 10,
  numberGrow: 1.3,
  /** A number's box: centered on its mark. */
  numberBox: 28,
  /** The marker: its line through the tape, and the cap above it. */
  marker: 2,
  cap: 5,
  rim: 1,
} as const;

/** Where a length stands on a tape `width` wide: zero at the inset, the far end at the other. */
export function rulerX(value: number, unit: RulerUnit, width: number): number {
  const { max } = RULER_SCALE[unit];
  const run = Math.max(0, width - 2 * TAPE.inset);
  const v = Number.isFinite(value) ? Math.min(max, Math.max(0, value)) : 0;
  return TAPE.inset + (v / max) * run;
}

export interface RulerMark {
  value: number;
  x: number;
  long: boolean;
}

/**
 * The marker's cap, in its own box (`TAPE.cap` either side of the line): a small triangle whose
 * point rests on the tape's top edge, over the length.
 */
export function markerCapPath(): string {
  const top = TAPE.tapeTop - TAPE.cap - 1;
  return `M0 ${top}L${TAPE.cap * 2} ${top}L${TAPE.cap} ${TAPE.tapeTop}Z`;
}

/** Every mark on the tape, zero to the end. */
export function tapeMarks(unit: RulerUnit, width: number): RulerMark[] {
  const g = RULER_SCALE[unit];
  const out: RulerMark[] = [];
  for (let v = 0; v <= g.max + 1e-9; v += g.minor) {
    const value = Math.round(v * 1000) / 1000;
    out.push({ value, x: rulerX(value, unit, width), long: value % g.major === 0 });
  }
  return out;
}

/** The numbered marks: zero and every `every` after it. */
export function rulerNumbers(unit: RulerUnit, width: number): RulerMark[] {
  const g = RULER_SCALE[unit];
  return tapeMarks(unit, width).filter(m => m.value % g.every === 0);
}

/* ------------------------------------------------------------------------------ the scale */

export type DialUnit = 'kg' | 'lb';

/** The dial, by unit: a mark every 1 kg (2 lb), a long one every 5 (10), a number every 10 (20). */
export const DIAL_SCALE: Readonly<Record<DialUnit, Graduation>> = {
  kg: { max: 30, minor: 1, major: 5, every: 10 },
  lb: { max: 70, minor: 2, major: 10, every: 20 },
};

/**
 * The dial's box: a half-disc face over a flat foot, the needle turning about a pivot on the foot.
 * The marks run 150° round it — from 75° left of straight up to 75° right — so the numbers at the
 * two ends stand clear of the foot.
 */
export const DIAL = {
  width: 140,
  height: 72,
  px: 70,
  py: 64,
  /** The face. */
  face: 64,
  /** The marks hang in from here. */
  r: 58,
  minorTick: 4,
  majorTick: 8,
  /** The numbers' ring, and their box. */
  numberR: 41,
  numberBox: 26,
  numberHeight: 13,
  numberSize: 10,
  numberGrow: 1.3,
  /** The needle: its reach from the pivot, its weight, and the hub it turns on. */
  needle: 53,
  stroke: 2,
  hub: 4.5,
  /** Half the sweep: a bearing of ±75° is an end. */
  half: 75,
  rim: 1,
} as const;

/**
 * Where the needle points for a weight, as a bearing — degrees clockwise from straight up: −75 at
 * zero, +75 at the end, a weight past the end pinned there.
 */
export function dialBearing(value: number, unit: DialUnit): number {
  const { max } = DIAL_SCALE[unit];
  const v = Number.isFinite(value) ? Math.min(max, Math.max(0, value)) : 0;
  return -DIAL.half + (2 * DIAL.half * v) / max;
}

/** A point `radius` out from the pivot at a bearing. */
export function dialPoint(bearing: number, radius: number): { x: number; y: number } {
  const rad = (bearing * Math.PI) / 180;
  return { x: DIAL.px + radius * Math.sin(rad), y: DIAL.py - radius * Math.cos(rad) };
}

export interface DialMark {
  value: number;
  bearing: number;
  long: boolean;
}

export function dialMarks(unit: DialUnit): DialMark[] {
  const g = DIAL_SCALE[unit];
  const out: DialMark[] = [];
  for (let v = 0; v <= g.max + 1e-9; v += g.minor) {
    const value = Math.round(v * 1000) / 1000;
    out.push({ value, bearing: dialBearing(value, unit), long: value % g.major === 0 });
  }
  return out;
}

export function dialNumbers(unit: DialUnit): DialMark[] {
  const g = DIAL_SCALE[unit];
  return dialMarks(unit).filter(m => m.value % g.every === 0);
}

/** The face, as an SVG path: a half-disc over the pivot's line. */
export function dialFacePath(): string {
  const { px, py, face } = DIAL;
  return `M${px - face} ${py}A${face} ${face} 0 0 1 ${px + face} ${py}Z`;
}

/* ------------------------------------------------------------------------------ the moves */

export const GAUGE_MOTION = {
  /** The marker's arrival from zero: longer the further it goes. */
  arrive: { min: 280, max: 700 },
  /** A step's glide, by the points it travels. */
  glide: { min: 160, max: 420, perPoint: 3 },
  /** `Easing.bezier`'s points: off at speed, settling onto the reading. */
  ease: [0.33, 1, 0.68, 1] as const,
} as const;

/** How long the marker takes to slide in from zero to a length `fraction` of the tape along. */
export const markerArriveMs = (fraction: number): number =>
  Math.round(
    GAUGE_MOTION.arrive.min +
      (GAUGE_MOTION.arrive.max - GAUGE_MOTION.arrive.min) * Math.min(1, Math.max(0, fraction)),
  );

/** How long a step's glide takes, for the points the marker moves. */
export const markerGlideMs = (points: number): number =>
  Math.round(
    Math.min(
      GAUGE_MOTION.glide.max,
      GAUGE_MOTION.glide.min + GAUGE_MOTION.glide.perPoint * Math.abs(points),
    ),
  );

/**
 * THE NEEDLE'S SPRING, on a value in degrees: damping ratio ½ — it passes the weight by about a
 * sixth of the swing and comes back — and 16 rad/s, so the swing has died to within 2% of itself
 * by half a second. `Animated.spring`'s own parameters, so the phone runs exactly this.
 */
export const NEEDLE_SPRING = { stiffness: 256, damping: 16, mass: 1 } as const;

/**
 * Where the spring holds the needle `ms` after it set off from `from` toward `to`, at rest: the
 * underdamped solution, for the tests to walk the swing the phone will draw.
 */
export function needleAt(from: number, to: number, ms: number): number {
  const { stiffness: k, damping: c, mass: m } = NEEDLE_SPRING;
  const w0 = Math.sqrt(k / m);
  const zeta = c / (2 * Math.sqrt(k * m));
  const wd = w0 * Math.sqrt(1 - zeta * zeta);
  const t = Math.max(0, ms) / 1000;
  const x0 = from - to;
  const envelope = Math.exp(-zeta * w0 * t);
  return to + envelope * (x0 * Math.cos(wd * t) + ((zeta * w0 * x0) / wd) * Math.sin(wd * t));
}

/** Whether nothing may move: the parent asked for less motion, or the app is in the amber Night. */
export const gaugeStill = (reduceMotion: boolean, theme: ThemeName): boolean =>
  reduceMotion || theme === 'night';

/* ------------------------------------------------------------------------------ the colors */

export interface GaugeColors {
  /** The tape and the dial's face: a surface of the palette's own. */
  fill: string;
  /** Their edge: a mark on the sheet. */
  rim: string;
  /** The graduations: marks, 3:1 on the fill. */
  tick: string;
  /** The numbers and the unit: text, 4.5:1 on the fill. */
  number: string;
  /** The marker and the needle, and the needle's hub: the page's own text ink, on every reading. */
  pointer: string;
}

/**
 * NEUTRAL, FROM THE PALETTE AND NOTHING ELSE: a surface for the tape and the face, `text3` for the
 * edges and the marks, `text2` for the numbers, the text ink for the marker and the needle. No
 * module hue, no status hue — nothing here can say a length is long or a weight is light — and a
 * scheme overlays none of them, so one measurement per theme holds in all six schemes.
 */
export function gaugeColors(palette: Palette, theme: ThemeName): GaugeColors {
  return {
    fill: theme === 'light' ? palette.surface2 : palette.surface3,
    rim: palette.text3,
    tick: palette.text3,
    number: palette.text2,
    pointer: palette.text,
  };
}
