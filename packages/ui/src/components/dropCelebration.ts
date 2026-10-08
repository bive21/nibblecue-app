/**
 * A THING DROPPED INTO ITS PLACE, AS NUMBERS (the owner, 2026-09-26: *"for new mom's, adding to milk
 * stash is quite a proud moment. when user click add milk or add stored milk button, lets do some
 * animation"*). Pure TypeScript, so every frame is a node test (`dropCelebration.test.ts`) and
 * `DropCelebration.tsx` only hands these tables to `Animated.Value#interpolate`, on the native
 * driver — one clock from 0 to `DROP_MS.total`, every part reading its own stretch of it.
 *
 * THE MOMENT, FRAME BY FRAME (ms):
 *
 *     0–160    a soft veil over the sheet, and the place's card rises into view
 *    80–520    the container falls from above, turning a little as it goes, faster as it falls
 *      520     it lands on the card: the card gives under it and settles, the container bounces
 *              twice, smaller each time — and the moment is felt, once (`success`)
 *   520–1120   a few sparkles burst from where it landed — or, for a freezer, frost motes drift
 *              out and down
 *  580–1260    the amount — "+5 oz" — rises from above the container and fades
 *  1260–1440   everything fades, and the sheet closes as it always has
 *
 * THE SAME MOMENT FOR EVERY AMOUNT. Nothing here scales with how much milk there was: a quarter
 * ounce lands exactly as a whole bag does, and the only thing that differs is the number, said as a
 * fact. No word of praise is anywhere in it (the batch's rule: no judgement of a number).
 *
 * STILL WHEN IT MUST BE: under reduce motion, in the amber Night, and with a screen reader on, none
 * of this plays — the sheet simply closes, and the save's own toast says what was added.
 */
import { SPARKLE_PATH } from './dayNightSwitch';

export { SPARKLE_PATH };

/** When each part of the moment happens, in ms from the tap that saved. */
export const DROP_MS = {
  /** The veil and the card are in. */
  enter: 160,
  /** The container starts to fall … */
  fall: 80,
  /** … and lands. */
  land: 520,
  /** The bounces are over. */
  settle: 820,
  /** The amount starts to rise, is fully there, starts to fade, and is gone. */
  labelIn: 580,
  labelFull: 720,
  labelOut: 1100,
  labelGone: 1260,
  /** How long a mote lives, from its own start. */
  mote: 520,
  /** Everything fades from here … */
  exit: 1260,
  /** … and the moment is over: the sheet closes. */
  total: 1440,
} as const;

/** The stage the moment plays on, in points: centered on the screen. */
export const DROP_STAGE = {
  width: 220,
  height: 240,
  /** The place's card, at the foot of the stage. */
  target: { width: 132, height: 100 },
  /** The container, at rest: its size, and how far it sits into the card from the card's top. */
  item: { height: 72, sink: 38, offsetX: 18 },
  /** How far above its rest the container starts its fall. */
  drop: 170,
  /** The amount's pill: its rest above the container, and how far it rises. */
  label: { top: 18, rise: 30 },
} as const;

/** Where the card sits on the stage, and where the container rests on it. */
export const DROP_TARGET_TOP = DROP_STAGE.height - DROP_STAGE.target.height;
export const DROP_ITEM_TOP = DROP_TARGET_TOP + DROP_STAGE.item.sink - DROP_STAGE.item.height;
/** The point the motes burst from: the foot of the container, as it lands. */
export const DROP_LANDING = {
  x: DROP_STAGE.width / 2 + DROP_STAGE.item.offsetX,
  y: DROP_TARGET_TOP + DROP_STAGE.item.sink - 6,
} as const;

/** One animated property: `Animated.Value#interpolate`'s two ranges, over the one clock. */
export interface Keys {
  input: number[];
  output: number[];
}

/**
 * A stretch from `a` to `b` between `t0` and `t1`, eased, as a few samples — a curve the native
 * driver can draw from a linear clock, without an easing function of its own per part.
 */
export function eased(
  t0: number,
  t1: number,
  a: number,
  b: number,
  ease: (x: number) => number,
  samples = 6,
): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i <= samples; i += 1) {
    const x = i / samples;
    out.push([t0 + (t1 - t0) * x, a + (b - a) * ease(x)]);
  }
  return out;
}

export const easeInQuad = (x: number): number => x * x;
export const easeOutQuad = (x: number): number => 1 - (1 - x) * (1 - x);

/**
 * Stitch stretches into one table: points in time order, a point at the same moment as the one
 * before it dropped (interpolate wants its input strictly increasing), and the clock's two ends
 * always present so every part holds still before it starts and after it ends.
 */
export function keys(points: readonly [number, number][]): Keys {
  const sorted = [...points].sort((p, q) => p[0] - q[0]);
  const input: number[] = [];
  const output: number[] = [];
  for (const [t, v] of sorted) {
    if (input.length > 0 && t <= input[input.length - 1]!) continue;
    input.push(t);
    output.push(v);
  }
  if (input[0]! > 0) {
    input.unshift(0);
    output.unshift(output[0]!);
  }
  if (input[input.length - 1]! < DROP_MS.total) {
    input.push(DROP_MS.total);
    output.push(output[output.length - 1]!);
  }
  return { input, output };
}

/** The veil over the sheet and the stage on it: in, held, out. */
export const stageOpacity = (): Keys =>
  keys([
    [0, 0],
    [DROP_MS.enter, 1],
    [DROP_MS.exit, 1],
    [DROP_MS.total, 0],
  ]);

/** The card rising into view, giving under the container as it lands, and settling. */
export const targetScale = (): Keys =>
  keys([
    ...eased(0, DROP_MS.enter, 0.92, 1, easeOutQuad, 3),
    [DROP_MS.land, 1],
    [DROP_MS.land + 60, 0.95],
    [DROP_MS.land + 180, 1.02],
    [DROP_MS.land + 280, 1],
  ]);

/** The container's fall, faster as it goes, then two bounces, each smaller. */
export const itemFall = (): Keys =>
  keys([
    [0, -DROP_STAGE.drop],
    ...eased(DROP_MS.fall, DROP_MS.land, -DROP_STAGE.drop, 0, easeInQuad),
    ...eased(DROP_MS.land, DROP_MS.land + 90, 0, -16, easeOutQuad, 3),
    ...eased(DROP_MS.land + 90, DROP_MS.land + 180, -16, 0, easeInQuad, 3),
    ...eased(DROP_MS.land + 180, DROP_MS.land + 240, 0, -5, easeOutQuad, 2),
    ...eased(DROP_MS.land + 240, DROP_MS.settle, -5, 0, easeInQuad, 2),
  ]);

/** The container, turning a little as it falls and upright as it lands. */
export const itemTurn = (): Keys =>
  keys([[0, -7], [DROP_MS.fall, -7], ...eased(DROP_MS.fall, DROP_MS.land, -7, 0, easeOutQuad, 3)]);

/** The container, there from its first frame of falling to the fade. */
export const itemOpacity = (): Keys =>
  keys([
    [0, 0],
    [DROP_MS.fall, 1],
    [DROP_MS.exit, 1],
    [DROP_MS.total, 0],
  ]);

/** The amount: in, rising, out. */
export const labelOpacity = (): Keys =>
  keys([
    [0, 0],
    [DROP_MS.labelIn, 0],
    [DROP_MS.labelFull, 1],
    [DROP_MS.labelOut, 1],
    [DROP_MS.labelGone, 0],
  ]);

export const labelRise = (): Keys =>
  keys([
    [0, 0],
    [DROP_MS.labelIn, 0],
    ...eased(DROP_MS.labelIn, DROP_MS.labelGone, 0, -DROP_STAGE.label.rise, easeOutQuad),
  ]);

/* ---------------------------------------------------------------------------- the motes */

export type MoteKind = 'sparkle' | 'frost';

/** One mote: where it goes from the landing point, how big, and when it starts after the landing. */
export interface Mote {
  dx: number;
  dy: number;
  size: number;
  delay: number;
}

/**
 * A BURST, NOT A SHOWER: six sparkles round the landing, a little more of them upward; or eight
 * frost motes that drift out and settle DOWN, as cold air does. Fixed positions — the moment is the
 * same every time, and a test can hold every mote inside the stage.
 */
export function motes(kind: MoteKind): Mote[] {
  if (kind === 'sparkle') {
    const angles = [-160, -120, -75, -30, 15, 165];
    return angles.map((deg, i) => {
      const r = 46 + (i % 2) * 10;
      const a = (deg * Math.PI) / 180;
      return {
        dx: Math.round(r * Math.cos(a)),
        dy: Math.round(r * Math.sin(a)) - 6,
        size: i % 2 === 0 ? 12 : 9,
        delay: (i % 3) * 30,
      };
    });
  }
  const spread = [-58, -42, -26, -10, 10, 26, 42, 58];
  return spread.map((dx, i) => ({
    dx,
    dy: 14 + (i % 3) * 8,
    size: i % 2 === 0 ? 5 : 3.5,
    delay: (i % 4) * 40,
  }));
}

/** A mote's frames: out to its place, swelling then shrinking (a sparkle) or fading (frost). */
export function moteKeys(
  m: Mote,
  kind: MoteKind,
): {
  x: Keys;
  y: Keys;
  scale: Keys;
  opacity: Keys;
} {
  const t0 = DROP_MS.land + m.delay;
  const t1 = t0 + DROP_MS.mote;
  const rise = kind === 'frost' ? -10 : 0;
  return {
    x: keys([[t0, 0], ...eased(t0, t1, 0, m.dx, easeOutQuad, 4)]),
    // frost lifts a little in the burst, then drifts down past where it began
    y: keys(
      kind === 'frost'
        ? [
            [t0, 0],
            ...eased(t0, t0 + 160, 0, rise, easeOutQuad, 2),
            ...eased(t0 + 160, t1, rise, m.dy, easeInQuad, 3),
          ]
        : [[t0, 0], ...eased(t0, t1, 0, m.dy, easeOutQuad, 4)],
    ),
    scale: keys(
      kind === 'sparkle'
        ? [
            [t0, 0],
            [t0 + 160, 1],
            [t1, 0],
          ]
        : [
            [t0, 0.6],
            [t0 + 120, 1],
          ],
    ),
    opacity: keys([
      [t0, 0],
      [t0 + 60, 1],
      [t1 - 140, 1],
      [t1, 0],
    ]),
  };
}
