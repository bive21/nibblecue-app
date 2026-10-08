/**
 * THE POUR SWITCH AS NUMBERS (the owner, 2026-09-27, of setup's "Feeding and milk": *"make
 * animation on the toogle on the feeding: feeding and milk page. make it more interesting think
 * about what animation would fit for the toggle"*). Pure TypeScript, so every claim here is tested
 * in node (`pourSwitch.test.ts`); `PourSwitch.tsx` only hands these numbers to views and to
 * `Animated.Value#interpolate`, the way `BellSwitch.tsx` hands over `bellSwitch.ts`'s.
 *
 * WHAT IT IS. An ordinary switch, right is on, whose track fills like a bottle. Turned ON, the
 * module's own color pours in: it rises from the foot of the track to the brim while the knob
 * slides across, its surface a small wave that travels the way the knob goes; the knob lands with
 * a little squash against the end, and once the track is full a soft glow of the same color
 * blooms round it and fades. Turned OFF, the milk drains out the way it came, the wave running
 * back, and nothing celebrates: switching a way of feeding off is not news (`wakingIcon.ts` keeps
 * the same rule for the icons beside it). Once each time; at rest it is still.
 *
 * WHY A POUR, OF THE THREE IDEAS WEIGHED. A drop landing on the knob needs room ABOVE the switch to
 * fall through, and the row gives it six points; a bounce alone is what every switch does. A track
 * that fills from the bottom up is the one picture that reads at a glance at 56 points and says
 * the thing the page is about, milk going into a bottle, and it moves on a different axis from the
 * knob, so it does not read as the platform switch's own color change played slowly.
 *
 * FIVE VALUES, AND WHY THE WAVE IS A LOOSE ONE:
 *
 *   pos    0 to 1, the knob: where it is, and how much of its "on" color shows.
 *   level  0 to 1, the milk: empty (its layer wholly under the track) to full (its surface wholly
 *          above the brim, so the track is one color edge to edge).
 *   wave   a number that only ever moves on: +1 per fill, -1 per drain. The wave's offset is its
 *          FRACTION (`Animated.modulo`, which the native driver carries), and the wave repeats
 *          every wavelength, so the offset never jumps however many times the switch has turned:
 *          a tap mid-pour turns the ripples round where they are.
 *   land   a clock, 0 to 1 once per fill: the knob's squash as it lands.
 *   bloom  a clock, 0 to 1 once per fill: the glow.
 *
 * `pos`, `level` and `wave` animate from wherever they are, so a second tap mid-move turns
 * everything round from where it stands. The two clocks are decoration: a new tap, reduce motion
 * or the switch going away sets them straight back to rest (a knob left squashed or a halo frozen
 * mid-bloom would be worse than no move at all).
 *
 * REDUCE MOTION AND THE AMBER NIGHT (`motionStill`): the end state and no movement, as every
 * other move in setup (docs/DESIGN_SYSTEM.md §7). The glow is never drawn in Night at all, and not
 * on a design that draws no shadows (Paper), where a halo would be a second material: the same
 * rule `moduleCard.ts` keeps for the lit card (`theme/pour.ts` holds it).
 *
 * NOTHING HERE IS ABOUT THE BABY. The pour answers a parent's tap on a settings switch. It draws
 * no amount, marks nothing as enough or not, and is tied to nothing logged (CLAUDE.md §2 rules 3
 * and 6).
 */
import type { Frame } from './dayNightSwitch';
import { keyFrame, sampleFrame, type Key } from './keyframes';
import { easeAt } from './themeSkyToggle';

/* ---------------------------------------------------------------------------- the size */

/**
 * The pill: the bell switch's own 56 × 32 (`BELL_SIZE`), so every drawn switch in the app is one
 * size, a few points wider than the platform's 51 × 31 so the milk has a track to fill. The knob
 * sits `inset` inside every edge.
 */
export const POUR_SIZE = { width: 56, height: 32, inset: 3 } as const;

/**
 * The milk's surface: a sine wave `length` points from crest to crest and `amplitude` points either
 * side of its middle. Three and a half crests across the track, low enough to read as a liquid
 * settling rather than as a zigzag.
 */
export const POUR_WAVE = { length: 16, amplitude: 1.8 } as const;

/**
 * How far past the track's edge the milk rests, in points, at both ends: an antialiased edge
 * exactly ON the brim or the foot would leave a hairline of milk in an empty track, or of the
 * empty track in a full one.
 */
export const POUR_REST_MARGIN = 1;

export interface PourGeometry {
  width: number;
  height: number;
  inset: number;
  /** The knob's diameter. */
  knob: number;
  /** How far the knob's left edge moves, off to on. */
  travel: number;
  wave: { length: number; amplitude: number };
  /**
   * The milk's layer, drawn once: the wave's band (`band`, twice its amplitude) over a body as
   * tall as the track and the rest margin, and a wavelength wider than the track so any offset
   * of the wave still covers the track from edge to edge.
   */
  layer: { width: number; height: number; band: number };
}

export function pourGeometry(
  size: typeof POUR_SIZE = POUR_SIZE,
  wave: typeof POUR_WAVE = POUR_WAVE,
): PourGeometry {
  const knob = size.height - 2 * size.inset;
  const band = 2 * wave.amplitude;
  return {
    width: size.width,
    height: size.height,
    inset: size.inset,
    knob,
    travel: size.width - knob - 2 * size.inset,
    wave: { length: wave.length, amplitude: wave.amplitude },
    layer: {
      width: size.width + wave.length,
      height: band + size.height + POUR_REST_MARGIN,
      band,
    },
  };
}

/**
 * THE SURFACE, in the layer's own coordinates (y down): the crest at 0, the trough at `band`, and
 * the middle of the wave at the amplitude. Periodic in `length`, which is what lets the layer slide
 * a whole wavelength and look the same at both ends of the slide.
 */
export function surfaceY(g: PourGeometry, x: number): number {
  const { length, amplitude } = g.wave;
  return amplitude - amplitude * Math.sin((2 * Math.PI * x) / length);
}

const round = (v: number): number => Math.round(v * 100) / 100;

/**
 * The milk as one SVG path: the wave along the top of the layer, sampled every `step` points (a
 * straight segment one point long is shorter than the eye can find a corner in), then down the
 * right side, along the foot and up the left.
 */
export function pourWavePath(g: PourGeometry, step = 1): string {
  const w = g.layer.width;
  const n = Math.ceil(w / step);
  const top: string[] = [];
  for (let i = 0; i <= n; i += 1) {
    const x = Math.min(w, i * step);
    top.push(`${i === 0 ? 'M' : 'L'}${round(x)} ${round(surfaceY(g, x))}`);
  }
  return `${top.join('')}L${round(w)} ${round(g.layer.height)}L0 ${round(g.layer.height)}Z`;
}

/* --------------------------------------------------------------------------- the timing */

/**
 * THE TIMING, in ms. A fill: the knob takes a little over the platform's quarter second and stops
 * dead; the milk pours for 380 ms, so it is still topping up under the knob as the knob arrives;
 * the knob squashes against the end as it lands (from 240 ms, a beat before the slide is over, so
 * the squash is the stopping and not a second event); and the glow blooms from 340 ms, once the
 * milk is at the brim, and is gone at 600. A drain: the knob goes back in 240 ms and the milk runs
 * out in 280, with nothing after. Every step starts on the tap: nothing waits, and the next tap
 * can land at any frame.
 */
export const POUR_MS = {
  slide: 280,
  fill: 380,
  landDelay: 240,
  land: 240,
  bloomDelay: 340,
  bloom: 260,
  drainSlide: 240,
  drain: 280,
} as const;

/** The longest a pour or a drain takes, end to end: setup's own ceiling for a move (600 ms). */
export const POUR_MAX_MS = 600;

/**
 * The curves, as `Easing.bezier`'s control points. The knob eases out and stops dead, as the bell's
 * does. The fill starts gently, runs, and eases to the brim, the way a bottle fills. The drain
 * starts slowly and speeds up as it empties.
 */
export const POUR_EASE = {
  slide: [0.3, 0, 0.2, 1],
  fill: [0.42, 0, 0.3, 1],
  drain: [0.45, 0, 0.8, 0.6],
} as const satisfies Record<string, readonly [number, number, number, number]>;
export type PourEase = keyof typeof POUR_EASE;

/* ----------------------------------------------------------------------------- the plan */

export type PourAct = 'fill' | 'drain';

export interface PourStep {
  delay: number;
  duration: number;
}

/** Where the knob and the milk rest for a value. */
export interface PourRest {
  pos: 0 | 1;
  level: 0 | 1;
}

export const pourRestFor = (value: boolean): PourRest => ({
  pos: value ? 1 : 0,
  level: value ? 1 : 0,
});

export interface PourPlan {
  /** False under reduce motion and in the amber Night: the values are set, at once. */
  animate: boolean;
  act: PourAct;
  to: PourRest;
  slide: PourStep & { ease: PourEase };
  level: PourStep & { ease: PourEase };
  /** The wave's travel: one wavelength, the way the knob goes (+1 filling, -1 draining). */
  wave: PourStep & { by: 1 | -1 };
  /** A fill's squash as the knob lands: the clock reset to 0, where the knob is round, and run to 1. */
  land: PourStep | null;
  /** A fill's glow: the clock reset to 0, where it is not drawn, and run to 1. Never in Night. */
  bloom: PourStep | null;
  /** When the last of it is over. */
  total: number;
}

const NONE: PourStep = { delay: 0, duration: 0 };

/**
 * WHAT A CHANGE OF VALUE DOES. On is a fill, off is a drain. `still` is reduce motion or the amber
 * Night: nothing is animated, the values are set where the move ends, and the switch simply IS on
 * or off. `glows` is whether this switch may draw its glow at all (`pourColors(...).glow`): not in
 * Night, not on a design with no shadows.
 */
export function pourPlan(value: boolean, still: boolean, glows: boolean): PourPlan {
  const to = pourRestFor(value);
  const act: PourAct = value ? 'fill' : 'drain';
  const by: 1 | -1 = value ? 1 : -1;
  if (still)
    return {
      animate: false,
      act,
      to,
      slide: { ...NONE, ease: 'slide' },
      level: { ...NONE, ease: act },
      wave: { ...NONE, by },
      land: null,
      bloom: null,
      total: 0,
    };
  if (act === 'fill') {
    const land = { delay: POUR_MS.landDelay, duration: POUR_MS.land };
    const bloom = glows ? { delay: POUR_MS.bloomDelay, duration: POUR_MS.bloom } : null;
    return {
      animate: true,
      act,
      to,
      slide: { delay: 0, duration: POUR_MS.slide, ease: 'slide' },
      level: { delay: 0, duration: POUR_MS.fill, ease: 'fill' },
      wave: { delay: 0, duration: POUR_MS.fill, by },
      land,
      bloom,
      total: Math.max(
        POUR_MS.slide,
        POUR_MS.fill,
        land.delay + land.duration,
        bloom === null ? 0 : bloom.delay + bloom.duration,
      ),
    };
  }
  return {
    animate: true,
    act,
    to,
    slide: { delay: 0, duration: POUR_MS.drainSlide, ease: 'slide' },
    level: { delay: 0, duration: POUR_MS.drain, ease: 'drain' },
    wave: { delay: 0, duration: POUR_MS.drain, by },
    land: null,
    bloom: null,
    total: Math.max(POUR_MS.drainSlide, POUR_MS.drain),
  };
}

/* --------------------------------------------------------------------------- the frames */

/**
 * The knob's squash as it lands, as turning points (`keyframes.ts`): wider and flatter against the
 * end it has hit, back past round, and still. About the knob's right edge (`POUR_LAND_PIVOT`, in
 * knobs from its center), because that is the edge it lands on: the squash never pushes it past
 * the end of the track.
 */
export const LAND_X: readonly Key[] = [
  [0, 1],
  [0.3, 1.12],
  [0.62, 0.96],
  [0.84, 1.02],
  [1, 1],
];
export const LAND_Y: readonly Key[] = [
  [0, 1],
  [0.3, 0.88],
  [0.62, 1.04],
  [0.84, 0.99],
  [1, 1],
];
export const POUR_LAND_PIVOT = { x: 0.5, y: 0 } as const;

/**
 * THE GLOW: a halo of the milk's color the track's own shape, under the track, growing by `spread`
 * points on every side as it fades, so only a soft ring outside the track is ever seen. In quickly
 * and out slowly; its strength is the color's own alpha (`theme/pour.ts`), so the frame runs 0 to 1.
 */
export const GLOW_SPREAD = 5;
export const GLOW_KEYS: readonly Key[] = [
  [0, 0],
  [0.3, 1],
  [1, 0],
];

export interface PourFrames {
  /** Of `pos`: the knob's travel, clamped to the two ends. */
  knobX: Frame;
  /** Of `pos`: the knob's "on" color over its "off" one. */
  on: Frame;
  /** Of `level`: where the milk's layer stands in the track, from under the foot to over the brim. */
  milkY: Frame;
  /**
   * Of the wave's FRACTION (0 to 1): the layer's sideways offset, a wavelength to none. Rising, the
   * ripples move right, the way a fill's knob goes.
   */
  milkX: Frame;
  /** Of `land`: the knob's width and height as a multiple of its own. */
  squashX: Frame;
  squashY: Frame;
  /** Of `bloom`: the glow's opacity, and its growth across and down. */
  glow: Frame;
  glowX: Frame;
  glowY: Frame;
}

export function pourFrames(g: PourGeometry): PourFrames {
  const margin = POUR_REST_MARGIN;
  return {
    knobX: { inputRange: [0, 1], outputRange: [0, g.travel], extrapolate: 'clamp' },
    on: { inputRange: [0, 1], outputRange: [0, 1], extrapolate: 'clamp' },
    milkY: {
      inputRange: [0, 1],
      outputRange: [g.height + margin, -(g.layer.band + margin)],
      extrapolate: 'clamp',
    },
    milkX: { inputRange: [0, 1], outputRange: [-g.wave.length, 0], extrapolate: 'clamp' },
    squashX: keyFrame(LAND_X),
    squashY: keyFrame(LAND_Y),
    glow: keyFrame(GLOW_KEYS),
    glowX: {
      inputRange: [0, 1],
      outputRange: [1, (g.width + 2 * GLOW_SPREAD) / g.width],
      extrapolate: 'clamp',
    },
    glowY: {
      inputRange: [0, 1],
      outputRange: [1, (g.height + 2 * GLOW_SPREAD) / g.height],
      extrapolate: 'clamp',
    },
  };
}

/* ------------------------------------------------------------- the picture, for the tests */

/** The five values. */
export interface PourValues {
  pos: number;
  level: number;
  wave: number;
  land: number;
  bloom: number;
}

/** The values at rest for a value: the two clocks run out, the wave wherever it last stopped. */
export const pourValuesAtRest = (value: boolean, wave = 0): PourValues => ({
  ...pourRestFor(value),
  wave,
  land: 1,
  bloom: 1,
});

/**
 * THE VALUES `ms` INTO A MOVE THAT STARTED at `from`: the planner's copy of what the native driver
 * does with `plan`, on the same curves, so a test can watch a move frame by frame. The two clocks
 * start from the reset the component makes (0); a clock the act does not run stays where it was.
 */
export function pourValuesAt(from: PourValues, plan: PourPlan, ms: number): PourValues {
  if (!plan.animate) return { ...pourValuesAtRest(plan.to.pos === 1, from.wave) };
  const along = (step: PourStep): number =>
    step.duration <= 0 ? 1 : Math.min(1, Math.max(0, (ms - step.delay) / step.duration));
  const toward = (a: number, b: number, share: number) => a + (b - a) * share;
  return {
    pos: toward(from.pos, plan.to.pos, easeAt(POUR_EASE[plan.slide.ease], along(plan.slide))),
    level: toward(from.level, plan.to.level, easeAt(POUR_EASE[plan.level.ease], along(plan.level))),
    wave: from.wave + plan.wave.by * along(plan.wave),
    land: plan.land === null ? from.land : along(plan.land),
    bloom: plan.bloom === null ? from.bloom : along(plan.bloom),
  };
}

/** The wave's fraction, as `Animated.modulo(wave, 1)` gives it: never negative. */
export const waveFraction = (wave: number): number => ((wave % 1) + 1) % 1;

/** Everything the component draws for a set of values: the same frames, sampled the same way. */
export interface PourPicture {
  knobX: number;
  on: number;
  /** The milk layer's top and its sideways offset, in the track's own points. */
  milkY: number;
  milkX: number;
  squashX: number;
  squashY: number;
  glow: number;
  glowX: number;
  glowY: number;
}

export function pourPicture(g: PourGeometry, v: PourValues): PourPicture {
  const f = pourFrames(g);
  return {
    knobX: sampleFrame(f.knobX, v.pos),
    on: sampleFrame(f.on, v.pos),
    milkY: sampleFrame(f.milkY, v.level),
    milkX: sampleFrame(f.milkX, waveFraction(v.wave)),
    squashX: sampleFrame(f.squashX, v.land),
    squashY: sampleFrame(f.squashY, v.land),
    glow: sampleFrame(f.glow, v.bloom),
    glowX: sampleFrame(f.glowX, v.bloom),
    glowY: sampleFrame(f.glowY, v.bloom),
  };
}

/**
 * Where the milk's surface stands at `x` across the track (y down, 0 the brim, `height` the foot),
 * in a picture: the layer's top plus the wave's own height there. Above 0 at every x is a full
 * track; below `height` at every x is an empty one.
 */
export const milkSurfaceAt = (g: PourGeometry, p: PourPicture, x: number): number =>
  p.milkY + surfaceY(g, x - p.milkX);
