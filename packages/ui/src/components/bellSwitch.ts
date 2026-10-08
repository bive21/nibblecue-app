/**
 * The bell switch as numbers: its size, the bell it draws, which way the bell faces for each
 * value, how a change becomes a move, and what every layer looks like at every point of the four
 * values that animate it (the owner, 2026-09-25, of the "that's cool" list, idea 5: *"might not
 * necessarily be useful, but it's cool … Let's try doing everything. I will then review"*). Pure
 * TypeScript, so all of it is tested in node — this package's tests cannot render React Native —
 * and `BellSwitch.tsx` only hands these numbers to views and to `Animated.Value#interpolate`.
 *
 * WHAT IT IS. An ordinary switch — the platform switch's own track, its own two knob colors,
 * right is on — whose knob carries a small bell. Turning a reminder ON wakes the bell: it stands
 * up as the knob slides across and rings on arrival, three swings that die away, the clapper a
 * beat behind so it strikes the rim. Turning it OFF puts the bell to sleep: it tips over onto its
 * side as the knob stops, rocks once, and a couple of "z"s drift up out of it and fade. Once each
 * time; at rest it is still.
 *
 * AWAKE IS NOT ALWAYS ON (`BellMapping`), and that is the one idea here that is not decoration.
 * A reminder switch is on when the phone will ring, so its bell is awake when it is on. Do not
 * disturb and quiet hours were drawn the inverse way — ON means the phone keeps quiet, so their bell
 * slept while the switch was on — until 2026-09-26, when the owner read that on the phone as a
 * switch saying OFF ("the bell is sleeping when on, when it should be the other way"): the bell is
 * read before the track, and asleep is how every other switch says off. Since then every switch in
 * the app is `awake-when-on`, and the bell pictures whether the setting is at work
 * (`RemindersScreen`'s `switchRow` says why that is also the truer picture). The inverse mapping and
 * its frames stay, tested, for a switch whose ON silences the phone the moment it is turned. The
 * switch itself stays an ordinary switch either way: right and filled is on, whatever the bell is
 * doing. The caller says which it is, in the props, with no default.
 *
 * FOUR VALUES, NOT ONE, and the reason is that the two acts are not each other's reverse. Setup's
 * day/night switch runs one value back and forth because night is day played backwards; here a
 * ring and a fall asleep are different pictures, and each has to be able to start from the middle
 * of the other when a parent taps twice. So:
 *
 *   pos     0 → 1, the knob: where it is, and how much of the "on" colors show.
 *   awake   1 upright, 0 lying on its side. It overshoots on the way down (the rock as it lands).
 *   ring    a clock, 0 → 1 once per wake: the swings. Multiplied by `awake`, so a bell that is
 *           tipped over mid-ring stops swinging as it goes down instead of snapping still.
 *   z       a clock, 0 → 1 once per sleep: the "z"s. Multiplied by 1 − `awake`, so a bell woken
 *           mid-snore takes its "z"s with it as it stands up.
 *
 * Every value animates from wherever it is on the native driver, so a second tap mid-move turns
 * the knob round where it is; the two clocks are only ever reset at a moment their layer is at
 * rest and invisible, so no reset is ever seen.
 *
 * WHICH WAY IT FALLS, AND WHICH WAY IT SWINGS (`bellLean`). A bell carried along and stopped keeps
 * going: arriving at the left end its top carries on to the left, so it tips over that way, with
 * its mouth toward the open track where the "z"s come out; arriving at the right end hanging, its
 * bottom carries on to the right, so the first swing is that way. Both come from one sign per
 * mapping, because the side a bell sleeps on is fixed by it.
 */
import type { Frame } from './dayNightSwitch';
import { keyFrame, sampleFrame, type Key } from './keyframes';
import { easeAt } from './themeSkyToggle';

/**
 * WHAT THE BELL MEANS BY ON (see the header): `awake-when-on` for every switch the app has,
 * quiet hours included since 2026-09-26; `asleep-when-on` for a switch whose ON silences at once.
 */
export type BellMapping = 'awake-when-on' | 'asleep-when-on';

/** Every mapping, for a test or a picker that wants both. */
export const BELL_MAPPINGS: readonly BellMapping[] = ['awake-when-on', 'asleep-when-on'];

/**
 * The pill. The platform switch is 51 × 31; this is a few points wider so that the "z"s have the
 * open track to drift out over, and a point taller so the bell on the knob can be read. The knob
 * sits `inset` inside every edge.
 */
export const BELL_SIZE = { width: 56, height: 32, inset: 3 } as const;

/**
 * THE BELL, on a 24-unit grid and drawn at `BELL_BOX` points on the knob. Its body is the outline
 * of the app's own bell glyph (`icons/paths.ts`, `bell`: the level pills on the same page draw it),
 * filled so it reads on a 26 pt disc, with a crown at the top to hang from and a clapper under the
 * rim to ring with.
 */
export const BELL_GRID = 24;
export const BELL_BOX = 18;
export const BELL_BODY = 'M18 15.2V10a6 6 0 1 0-12 0v5.2L4.4 18.4h15.2z';
export const BELL_CROWN = { cx: 12, cy: 3.2, r: 1.6 } as const;
export const BELL_CLAPPER = { cx: 12, cy: 20.5, r: 1.8 } as const;
/** Where it hangs from — the crown — and so what it swings about. */
export const BELL_HANG = { x: 12, y: 3.2 } as const;

/**
 * The drawing's outermost points on the grid — the rim's two ends, the dome's sides and
 * shoulders, the top of the crown, the clapper's sides and foot — so a test can hold every one of
 * them on the knob at every frame, whichever way the bell is turned.
 */
export const BELL_OUTLINE: readonly { x: number; y: number }[] = [
  { x: 4.4, y: 18.4 },
  { x: 19.6, y: 18.4 },
  { x: 6, y: 10 },
  { x: 18, y: 10 },
  { x: 12 - 6 * Math.SQRT1_2, y: 10 - 6 * Math.SQRT1_2 },
  { x: 12 + 6 * Math.SQRT1_2, y: 10 - 6 * Math.SQRT1_2 },
  { x: BELL_CROWN.cx, y: BELL_CROWN.cy - BELL_CROWN.r },
  { x: BELL_CROWN.cx - BELL_CROWN.r, y: BELL_CROWN.cy },
  { x: BELL_CROWN.cx + BELL_CROWN.r, y: BELL_CROWN.cy },
  { x: BELL_CLAPPER.cx - BELL_CLAPPER.r, y: BELL_CLAPPER.cy },
  { x: BELL_CLAPPER.cx + BELL_CLAPPER.r, y: BELL_CLAPPER.cy },
  { x: BELL_CLAPPER.cx, y: BELL_CLAPPER.cy + BELL_CLAPPER.r },
];

/** A "z": a top bar, a diagonal and a foot, drawn as one stroke in a 10-unit box. */
export const Z_VIEWBOX = '0 0 10 10';
export const Z_PATH = 'M2.2 2.2h5.6L2.2 7.8h5.6';
/** Its stroke in the same units: thick enough to be a mark at 6 pt, not a hairline. */
export const Z_STROKE = 2;

export interface BellGeometry {
  width: number;
  height: number;
  inset: number;
  /** The knob's diameter. */
  knob: number;
  /** How far the knob's left edge moves, off to on. */
  travel: number;
  /** The bell's drawing box, and how far in from the knob's edge it sits. */
  box: number;
  boxInset: number;
  /** The crown, from the box's center, in points: the swing turns about it. */
  hang: { x: number; y: number };
  /** Points per grid unit. */
  unit: number;
}

export function bellGeometry(size: typeof BELL_SIZE = BELL_SIZE): BellGeometry {
  const knob = size.height - 2 * size.inset;
  const unit = BELL_BOX / BELL_GRID;
  return {
    width: size.width,
    height: size.height,
    inset: size.inset,
    knob,
    travel: size.width - knob - 2 * size.inset,
    box: BELL_BOX,
    boxInset: (knob - BELL_BOX) / 2,
    hang: { x: (BELL_HANG.x - BELL_GRID / 2) * unit, y: (BELL_HANG.y - BELL_GRID / 2) * unit },
    unit,
  };
}

/** Whether the bell is awake for this value, by the mapping (see the header). */
export const bellAwake = (value: boolean, bell: BellMapping): boolean =>
  (bell === 'awake-when-on') === value;

/**
 * THE ONE SIGN BOTH MOVES TAKE (see the header): −1 for a bell that sleeps at the LEFT (a
 * reminder, asleep when off) — it tips over counter-clockwise and its first swing, awake at the
 * right, is counter-clockwise too; +1 for one that sleeps at the RIGHT (quiet hours, asleep when
 * on), the mirror of it. Positive is clockwise, as React Native turns things.
 */
export const bellLean = (bell: BellMapping): -1 | 1 => (bell === 'awake-when-on' ? -1 : 1);

/** Where everything rests for a value: the knob right when on, the bell as the mapping says. */
export interface BellRest {
  pos: 0 | 1;
  awake: 0 | 1;
}

export const bellRest = (value: boolean, bell: BellMapping): BellRest => ({
  pos: value ? 1 : 0,
  awake: bellAwake(value, bell) ? 1 : 0,
});

/**
 * THE TIMING, in ms. The knob takes the platform switch's own quarter second. Waking, the bell
 * stands up while it slides and starts to ring as it arrives, so the swings are the knob's
 * stopping and not a second event after it. Falling asleep, it tips as the knob stops and the
 * "z"s start once it is down. The ring is over in three quarters of a second; the "z"s linger a
 * little past a second, because drifting off is slow and nothing waits on them.
 */
export const BELL_MS = {
  slide: 240,
  right: 260,
  ringDelay: 170,
  ring: 560,
  tipDelay: 60,
  tip: 360,
  zDelay: 300,
  z: 760,
} as const;

/**
 * The curves, as `Easing.bezier`'s control points. The knob eases out and stops dead — the bell
 * on it does the settling. Standing up eases both ways. Tipping over OVERSHOOTS: its last control
 * point past 1 carries `awake` a little below 0, which is the bell lying a few degrees past its
 * rest and rocking back onto it (`bellSwitch.test.ts` measures how far).
 */
export const BELL_EASE = {
  slide: [0.3, 0, 0.2, 1],
  right: [0.45, 0, 0.35, 1],
  tip: [0.4, 0, 0.3, 1.55],
} as const satisfies Record<string, readonly [number, number, number, number]>;
export type BellEase = keyof typeof BELL_EASE;

/** How far over a sleeping bell lies, in degrees: on its side, resting on the rim. */
export const ASLEEP_DEG = 80;

/**
 * THE RING, as turning points in degrees for a bell that leans +1 (`keyframes.ts`): three swings
 * each smaller than the last, then still. The clapper hangs from the same crown a beat behind and
 * a little wider, so each swing ends with it against the rim — which is what makes it a ring
 * rather than a wobble.
 */
export const RING_KEYS: readonly Key[] = [
  [0, 0],
  [0.14, 18],
  [0.36, -13],
  [0.58, 8],
  [0.8, -3.5],
  [1, 0],
];
export const CLAPPER_KEYS: readonly Key[] = [
  [0, 0],
  [0.2, 24],
  [0.42, -17],
  [0.64, 10],
  [0.86, -4],
  [1, 0],
];

/** What a change does. */
export type BellAct = 'wake' | 'sleep';

export interface BellStep {
  delay: number;
  duration: number;
}

export interface BellPlan {
  /** False under reduce motion and in the amber theme: every value is set to rest, at once. */
  animate: boolean;
  act: BellAct;
  to: BellRest;
  slide: BellStep;
  awake: BellStep & { ease: BellEase };
  /** A wake's ring: the clock is reset to 0, where the swing is still, and run to 1. */
  ring: BellStep | null;
  /** A sleep's "z"s: the clock is reset to 0, where they are not yet drawn, and run to 1. */
  z: BellStep | null;
  /** When the last of it is over. */
  total: number;
}

/**
 * WHAT A CHANGE OF VALUE DOES. Every change is a wake or a sleep — the mapping is fixed, so the
 * bell's state flips whenever the value does. `still` is reduce motion or the amber night theme:
 * nothing is animated, the values are set to where the move ends, and the picture simply IS on or
 * off (docs/DESIGN_SYSTEM.md §7 — "disables transforms and transitions but never hides content").
 */
export function bellPlan(value: boolean, bell: BellMapping, still: boolean): BellPlan {
  const to = bellRest(value, bell);
  const act: BellAct = to.awake === 1 ? 'wake' : 'sleep';
  if (still) {
    const none = { delay: 0, duration: 0 };
    return {
      animate: false,
      act,
      to,
      slide: none,
      awake: { ...none, ease: act === 'wake' ? 'right' : 'tip' },
      ring: null,
      z: null,
      total: 0,
    };
  }
  const slide = { delay: 0, duration: BELL_MS.slide };
  if (act === 'wake') {
    const ring = { delay: BELL_MS.ringDelay, duration: BELL_MS.ring };
    return {
      animate: true,
      act,
      to,
      slide,
      awake: { delay: 0, duration: BELL_MS.right, ease: 'right' },
      ring,
      z: null,
      total: Math.max(slide.duration, BELL_MS.right, ring.delay + ring.duration),
    };
  }
  const z = { delay: BELL_MS.zDelay, duration: BELL_MS.z };
  return {
    animate: true,
    act,
    to,
    slide,
    awake: { delay: BELL_MS.tipDelay, duration: BELL_MS.tip, ease: 'tip' },
    ring: null,
    z,
    total: Math.max(slide.duration, BELL_MS.tipDelay + BELL_MS.tip, z.delay + z.duration),
  };
}

/* ------------------------------------------------------------------------------ the "z"s */

/**
 * A "z": where its center appears and where it drifts to, in the switch's own box (y below 0 is
 * above the pill, in the target's own margin and the row's padding), its size once it has grown,
 * and when it lives on the z clock.
 */
export interface BellZ {
  from: { x: number; y: number };
  to: { x: number; y: number };
  size: number;
  at: number;
  life: number;
}

/** How big a "z" is as it leaves the bell, as a share of the size it grows to. */
export const Z_BORN = 0.6;

/**
 * THE TWO "Z"S: out of the sleeping bell one after the other, on the same path — up and away
 * toward the open track, the side its mouth faces — each growing as it rises, so whenever both are
 * showing the one further up is the larger, the "zZ" of every drawing of sleep. The second leaves
 * when the first is more than half way along, so the two never touch. Never past either end of the
 * pill, so they drift over the switch's own ground and never over the words beside it; and drawn
 * ABOVE the pill rather than on the track because the ground there is one color whatever the
 * switch's state is, so one ink reads on it (`theme/bell.ts`).
 */
export function bellZs(g: BellGeometry, bell: BellMapping): readonly BellZ[] {
  const sleepsRight = bellLean(bell) === 1;
  const cx = sleepsRight ? g.width - g.inset - g.knob / 2 : g.inset + g.knob / 2;
  const out = sleepsRight ? -1 : 1;
  const path = {
    from: { x: cx + out * 5, y: -2.4 },
    to: { x: cx + out * 15, y: -9.5 },
    size: 8.5,
    life: 0.62,
  };
  return [
    { ...path, at: 0 },
    { ...path, at: 0.36 },
  ];
}

/* ------------------------------------------------------------------------------- the frames */

export interface BellZFrames {
  /** Of `z`, before the component multiplies it by how asleep the bell is. */
  opacity: Frame;
  /** Of `z`: how far it has drifted from `from`, in points. */
  x: Frame;
  y: Frame;
  scale: Frame;
}

export interface BellFrames {
  /** Of `pos`: the knob's travel, clamped to the two ends so nothing carries it into the rim. */
  knobX: Frame;
  /** Of `pos`: the "on" colors — the track's fill, the knob's and the bell's ink — together. */
  on: Frame;
  /** Of `awake`, in degrees: upright at 1, lying at 0, and past it while it rocks. */
  tip: Frame;
  /** Of `awake`, clamped: how much of a swing still shows. */
  awakeness: Frame;
  /** Of `awake`, clamped: how much of the "z"s shows. */
  sleepiness: Frame;
  /** Of `ring`, in degrees, before it is multiplied by `awakeness`. */
  swing: Frame;
  clapper: Frame;
  zs: readonly BellZFrames[];
}

const lean = (keys: readonly Key[], sign: -1 | 1): Key[] => keys.map(([at, v]) => [at, v * sign]);

export function bellFrames(g: BellGeometry, bell: BellMapping): BellFrames {
  const sign = bellLean(bell);
  return {
    knobX: { inputRange: [0, 1], outputRange: [0, g.travel], extrapolate: 'clamp' },
    on: { inputRange: [0, 1], outputRange: [0, 1], extrapolate: 'clamp' },
    // extended, because the tip's overshoot is MEANT to show: a few degrees past, and back
    tip: { inputRange: [0, 1], outputRange: [sign * ASLEEP_DEG, 0], extrapolate: 'extend' },
    awakeness: { inputRange: [0, 1], outputRange: [0, 1], extrapolate: 'clamp' },
    sleepiness: { inputRange: [0, 1], outputRange: [1, 0], extrapolate: 'clamp' },
    swing: keyFrame(lean(RING_KEYS, sign)),
    clapper: keyFrame(lean(CLAPPER_KEYS, sign)),
    zs: bellZs(g, bell).map(z => {
      const end = z.at + z.life;
      return {
        // in quickly, held, out slowly: it is gone before it reaches the top of its drift
        opacity: keyFrame([
          [z.at, 0],
          [z.at + z.life * 0.2, 1],
          [z.at + z.life * 0.6, 1],
          [end, 0],
        ]),
        x: keyFrame([
          [z.at, 0],
          [end, z.to.x - z.from.x],
        ]),
        y: keyFrame([
          [z.at, 0],
          [end, z.to.y - z.from.y],
        ]),
        scale: keyFrame([
          [z.at, Z_BORN],
          [end, 1],
        ]),
      };
    }),
  };
}

/* ------------------------------------------------------------- the picture, for the tests */

/** The four values. */
export interface BellValues {
  pos: number;
  awake: number;
  ring: number;
  z: number;
}

/** The values at rest: the two clocks run out. */
export const restValues = (rest: BellRest): BellValues => ({ ...rest, ring: 1, z: 1 });

/**
 * THE VALUES `ms` INTO A MOVE THAT STARTED AT REST at `from` — the planner's copy of what the
 * native driver does with `plan`, on the same curves, so a test can watch a move frame by frame.
 * The two clocks start from the reset the component makes (0), and a clock the act does not run
 * stays where it was.
 */
export function bellValuesAt(from: BellValues, plan: BellPlan, ms: number): BellValues {
  if (!plan.animate) return restValues(plan.to);
  const along = (step: BellStep): number =>
    step.duration <= 0 ? 1 : Math.min(1, Math.max(0, (ms - step.delay) / step.duration));
  const eased = (step: BellStep, ease: BellEase) => easeAt(BELL_EASE[ease], along(step));
  const toward = (a: number, b: number, share: number) => a + (b - a) * share;
  return {
    pos: toward(from.pos, plan.to.pos, eased(plan.slide, 'slide')),
    awake: toward(from.awake, plan.to.awake, eased(plan.awake, plan.awake.ease)),
    ring: plan.ring === null ? from.ring : along(plan.ring),
    z: plan.z === null ? from.z : along(plan.z),
  };
}

/** One "z" as it is drawn: its center, its drawn size, its opacity. */
export interface DrawnZ {
  x: number;
  y: number;
  size: number;
  opacity: number;
}

/** Everything the component draws, for a set of values: the same frames, sampled the same way. */
export interface BellPicture {
  knobX: number;
  on: number;
  /** Degrees. */
  tip: number;
  swing: number;
  clapper: number;
  zs: readonly DrawnZ[];
}

export function bellPicture(g: BellGeometry, bell: BellMapping, v: BellValues): BellPicture {
  const f = bellFrames(g, bell);
  const awakeness = sampleFrame(f.awakeness, v.awake);
  const sleepiness = sampleFrame(f.sleepiness, v.awake);
  const zs = bellZs(g, bell);
  return {
    knobX: sampleFrame(f.knobX, v.pos),
    on: sampleFrame(f.on, v.pos),
    tip: sampleFrame(f.tip, v.awake),
    swing: sampleFrame(f.swing, v.ring) * awakeness,
    clapper: sampleFrame(f.clapper, v.ring) * awakeness,
    zs: f.zs.map((zf, i) => {
      const z = zs[i];
      return {
        x: (z?.from.x ?? 0) + sampleFrame(zf.x, v.z),
        y: (z?.from.y ?? 0) + sampleFrame(zf.y, v.z),
        size: (z?.size ?? 0) * sampleFrame(zf.scale, v.z),
        opacity: sampleFrame(zf.opacity, v.z) * sleepiness,
      };
    }),
  };
}

/**
 * Where a point of the bell's drawing (on its grid) lands on the knob, from the knob's center, in
 * points — the component's two turns in its order: the swing about the crown inside the tip about
 * the box's center. The clapper swings by its own angle; pass it as `swing` for its points.
 */
export function bellPointOnKnob(
  g: BellGeometry,
  point: { x: number; y: number },
  tipDeg: number,
  swingDeg: number,
): { x: number; y: number } {
  const turn = (p: { x: number; y: number }, c: { x: number; y: number }, deg: number) => {
    const a = (deg * Math.PI) / 180;
    const dx = p.x - c.x;
    const dy = p.y - c.y;
    return {
      x: c.x + dx * Math.cos(a) - dy * Math.sin(a),
      y: c.y + dx * Math.sin(a) + dy * Math.cos(a),
    };
  };
  const local = {
    x: (point.x - BELL_GRID / 2) * g.unit,
    y: (point.y - BELL_GRID / 2) * g.unit,
  };
  return turn(turn(local, g.hang, swingDeg), { x: 0, y: 0 }, tipDeg);
}
