/**
 * THE DAY WHEEL DRAWS ITSELF, ONCE — as numbers (the owner, 2026-09-26: *"Think about on boarding
 * process too, surely there are things we can do to make it better with certain animation"*). At
 * the foot of setup's "How often?" the parent's answers are laid round a ring (`ScheduleWheel`'s
 * preview); the first time that ring scrolls into view it is DRAWN rather than shown: the ring
 * sweeps clockwise from the sun, and every stop's house pops onto it as the sweep reaches it, in
 * the order the day runs; the moon lands when the sweep reaches bedtime. Pure TypeScript, tested in
 * node (`wheelDraw.test.ts`); the component only hands these numbers to two values.
 *
 * IT IS THE PREVIEW'S AND NOBODY ELSE'S. `ScheduleWheel` draws the entrance only when it is asked
 * for (`entrance`, default `rest`), and only setup asks. The live ring on Routine is left exactly as
 * it was — a clock hand for that ring is a separate idea and would be a separate prop.
 *
 * TWO VALUES, TWO DRIVERS, the way the checklist's tick is drawn (`tickDraw.ts`): the ring's two
 * arcs are drawn with a dash sliding along each path, and a dash offset is a prop of an SVG path,
 * which the native driver cannot carry — so that one value is on the JavaScript driver, for less
 * than a second, once. Everything else — every house, every caption, the sun, the moon, the middle
 * — is opacity and transforms of ONE native clock, each in its own window of it.
 *
 * THE SWEEP IS EASED, THE POPS FOLLOW IT. The front moves on `WHEEL_SWEEP_EASE` (quick off the sun,
 * settling as it comes back round), and a house pops when the front REACHES it, so the pops are
 * worked out by inverting the curve rather than spaced evenly — and never closer together than
 * `WHEEL_STAGGER_MS`, so two houses near each other are still two pops.
 *
 * NOTHING IS HIDDEN FOR LONG: the whole entrance is over in `WHEEL_DRAW_MAX_MS` whatever the plan,
 * and the words in the middle are in by the time the sweep is a third of the way round. Under
 * reduce motion and in the amber Night there is no entrance at all: the ring is simply there.
 */
import { tickDash, type TickDash } from './tickDraw';
import { keyFrame, keysWithin, type Key } from './keyframes';
import type { Frame } from './dayNightSwitch';

/**
 * Where a wheel stands. `rest`: drawn, and nothing will move (the default, and Routine's). `waiting`:
 * asked for an entrance that has not been started — nothing on the ring is drawn yet. `draw`: the
 * entrance plays once, and the ring stays drawn after it.
 */
export type WheelEntrance = 'rest' | 'waiting' | 'draw';

/** The sweep, all the way round. */
export const WHEEL_SWEEP_MS = 840;
/** Quick off the sun, settling as it comes back round to it. */
export const WHEEL_SWEEP_EASE = [0.3, 0, 0.25, 1] as const;
/** One house's pop: in, a little past its size, and settled. */
export const WHEEL_POP_MS = 300;
/** Never two pops closer together than this, however close their houses are. */
export const WHEEL_STAGGER_MS = 34;
/** The middle's figure and words: in over this, from the start. */
export const WHEEL_HUB_MS = 320;
/** The whole entrance, whatever the ring holds. */
export const WHEEL_DRAW_MAX_MS = 1200;

/** A house's pop, as its scale and its strength over its own window. */
export const WHEEL_POP_SCALE: readonly Key[] = [
  [0, 0.4],
  [0.55, 1.1],
  [0.8, 0.97],
  [1, 1],
];
export const WHEEL_POP_OPACITY: readonly Key[] = [
  [0, 0],
  [0.35, 1],
];
/** The middle comes up and grows the last little way into place. */
export const WHEEL_HUB_SCALE: readonly Key[] = [
  [0, 0.92],
  [1, 1],
];
export const WHEEL_HUB_OPACITY: readonly Key[] = [
  [0, 0],
  [1, 1],
];

/** How far round from `fromDeg` a bearing is, 0 → 1, travelling the way the ring runs. */
export function shareFrom(fromDeg: number, deg: number, direction: 1 | -1): number {
  const swept = direction > 0 ? deg - fromDeg : fromDeg - deg;
  return (((swept % 360) + 360) % 360) / 360;
}

/** A cubic Bézier at parameter `s` — one coordinate of it. */
const bez = (s: number, a: number, b: number) =>
  3 * (1 - s) ** 2 * s * a + 3 * (1 - s) * s * s * b + s ** 3;

/**
 * WHEN THE FRONT REACHES `share` of the ring, as a fraction of the sweep: the eased curve read
 * backwards. The curve's output rises with its parameter (both control points' y inside [0, 1]),
 * so halving the parameter finds the one point whose output is `share`, and its x is the time.
 */
export function sweepTimeAt(
  share: number,
  ease: readonly [number, number, number, number] = WHEEL_SWEEP_EASE,
): number {
  if (share <= 0) return 0;
  if (share >= 1) return 1;
  const [x1, y1, x2, y2] = ease;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 48; i += 1) {
    const mid = (lo + hi) / 2;
    if (bez(mid, y1, y2) < share) lo = mid;
    else hi = mid;
  }
  return bez((lo + hi) / 2, x1, x2);
}

export interface WheelDrawStop {
  key: string;
  deg: number;
}

export interface WheelDrawPlan {
  /** The share of the ring the day's arc takes: where the sweep hands over to the night's. */
  dayShare: number;
  /** When the moon pops, in ms: the sweep reaching bedtime. */
  moonAt: number;
  /** When each house pops, in ms, in the order the day runs from the sun. */
  stops: readonly { key: string; at: number }[];
  /** The whole entrance, in ms: the clock every pop is a window of. */
  totalMs: number;
}

/**
 * THE PLAN: when the moon and every house pop. The houses in the order the day runs from the sun,
 * each at the moment the eased front reaches it, pushed on to keep `WHEEL_STAGGER_MS` from the one
 * before, and held back so the last pop is over by `WHEEL_DRAW_MAX_MS` — a ring of twenty houses
 * compresses its stagger rather than running long.
 */
export function wheelDrawPlan(
  wakeDeg: number,
  bedDeg: number,
  stops: readonly WheelDrawStop[],
  direction: 1 | -1,
): WheelDrawPlan {
  const dayShare = shareFrom(wakeDeg, bedDeg, direction);
  const latest = WHEEL_DRAW_MAX_MS - WHEEL_POP_MS;
  const ordered = stops
    .map(s => ({ key: s.key, share: shareFrom(wakeDeg, s.deg, direction) }))
    .sort((a, b) => a.share - b.share || a.key.localeCompare(b.key));
  // the stagger a crowded ring can afford inside the ceiling, never more than the design's own
  const stagger =
    ordered.length > 1 ? Math.min(WHEEL_STAGGER_MS, latest / (ordered.length - 1)) : 0;
  // forward: each at the moment the front reaches it, and never within the stagger of the last
  const at: number[] = [];
  for (const s of ordered) {
    const reach = sweepTimeAt(s.share) * WHEEL_SWEEP_MS;
    const prev = at[at.length - 1];
    at.push(prev === undefined ? reach : Math.max(reach, prev + stagger));
  }
  // backward: the last inside the ceiling, and each before it a stagger earlier if it has to be —
  // a crowded end of the ring pops a little ahead of the front rather than all at once
  for (let i = at.length - 1; i >= 0; i -= 1) {
    const next = at[i + 1];
    const ceiling = next === undefined ? latest : next - stagger;
    at[i] = Math.max(0, Math.min(at[i] ?? 0, ceiling));
  }
  const out = ordered.map((s, i) => ({ key: s.key, at: at[i] ?? 0 }));
  const moonAt = Math.min(latest, sweepTimeAt(dayShare) * WHEEL_SWEEP_MS);
  const lastPop = Math.max(moonAt, ...out.map(s => s.at)) + WHEEL_POP_MS;
  return {
    dayShare,
    moonAt,
    stops: out,
    totalMs: Math.min(WHEEL_DRAW_MAX_MS, Math.max(WHEEL_SWEEP_MS, lastPop, WHEEL_HUB_MS)),
  };
}

/** How long an arc is, on a ring of radius `r`, from one bearing to another the way it runs. */
export const arcLength = (fromDeg: number, toDeg: number, r: number, direction: 1 | -1): number =>
  ((shareFrom(fromDeg, toDeg, direction) * 360 * Math.PI) / 180) * r;

/**
 * THE DASH THAT DRAWS AN ARC: the tick's own (`tickDash`), for a path this long at this stroke —
 * one dash a point LONGER than the arc, so whatever length the renderer measures for it, the whole
 * arc is inked at rest and not a hair short of the sun or the moon.
 */
export const arcDash = (length: number, stroke: number): TickDash => tickDash(length + 1, stroke);

/** An arc too short to be drawn in: it is simply there (a day that is all waking has no night). */
export const ARC_MIN = 0.5;

/** One arc drawn in: its dash pattern, and its dash offset over the sweep value. */
export interface ArcDraw {
  dasharray: readonly [number, number];
  offset: Frame;
}

export interface WheelArcFrames {
  /** The day's arc, sun to moon. Null: not drawn in — it is simply there. */
  day: ArcDraw | null;
  /** The night's, moon back round to the sun. */
  night: ArcDraw | null;
}

/** The two arcs over the sweep value (0 → 1): the day's first, handing over at `dayShare`. */
export function arcFrames(
  dayShare: number,
  day: { length: number; stroke: number },
  night: { length: number; stroke: number },
): WheelArcFrames {
  const draw = (from: number, to: number, length: number, stroke: number): ArcDraw => {
    const dash = arcDash(length, stroke);
    return {
      dasharray: dash.dasharray,
      offset: { inputRange: [from, to], outputRange: [dash.from, dash.to], extrapolate: 'clamp' },
    };
  };
  const hand = Math.min(1, Math.max(0, dayShare));
  return {
    day: day.length > ARC_MIN && hand > 0 ? draw(0, hand, day.length, day.stroke) : null,
    night: night.length > ARC_MIN && hand < 1 ? draw(hand, 1, night.length, night.stroke) : null,
  };
}

export interface PopFrames {
  scale: Frame;
  opacity: Frame;
}

/** One pop's frames over the entrance's clock: its window is `[at, at + WHEEL_POP_MS]`. */
export function popWindowFrames(at: number, totalMs: number): PopFrames {
  const from = Math.max(0, Math.min(1, at / totalMs));
  const to = Math.max(from, Math.min(1, (at + WHEEL_POP_MS) / totalMs));
  // sampled finely: a pop is a small window of a long clock
  return {
    scale: keyFrame(keysWithin(WHEEL_POP_SCALE, from, to), 'clamp', 160),
    opacity: keyFrame(keysWithin(WHEEL_POP_OPACITY, from, to), 'clamp', 160),
  };
}

/** The middle's frames over the entrance's clock. */
export function hubFrames(totalMs: number): PopFrames {
  const to = Math.min(1, WHEEL_HUB_MS / totalMs);
  return {
    scale: keyFrame(keysWithin(WHEEL_HUB_SCALE, 0, to), 'clamp', 160),
    opacity: keyFrame(keysWithin(WHEEL_HUB_OPACITY, 0, to), 'clamp', 160),
  };
}
