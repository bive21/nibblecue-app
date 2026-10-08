/**
 * HOLD TO STOP, AS NUMBERS (the owner, 2026-09-26, of the running timers' small delights: *"makes
 * the app look more fun"*). Pure TypeScript, so every claim here is tested in node — this package's
 * tests cannot render React Native — and `StopButton.tsx` only hands these numbers to one SVG path,
 * one bubble and `Animated.Value#interpolate`, the way `TickMark.tsx` hands `tickDraw.ts`'s.
 *
 * WHAT IT IS. The one control that ends a running record — Woke up, Finish, Stop — is
 * pressed and HELD: a ring runs round the inside of the button from the top of it, clockwise, and
 * closes in `fillMs`; the moment it closes, the stop the tap used to make is made, and nothing else
 * happens differently. Let go before that and the ring runs back (`drainMs`) and a small "Hold to
 * stop" sits beside the button for `hintMs`, so a tap that did nothing says why.
 *
 * WHY A HOLD, for the one button on Today whose mistake costs the most: a stopped sleep is an entry
 * written and a clock that has to be restarted by hand, and this button sits on the card a thumb
 * scrolls Today by. A hold of a little over half a second is short enough to be the ordinary way to
 * press it and long enough that a scroll which starts on it lets go first.
 *
 * WHAT DOES NOT CHANGE. The stop is the caller's, untouched, and it is felt the way it always was —
 * the thud of the entry it writes, once (`apps/mobile/src/feedback/haptics.test.ts`); the button
 * adds no haptic of its own. A SCREEN READER'S ACTIVATE STOPS AT ONCE, with no hold: a double tap
 * is already a deliberate act, and a hold that VoiceOver or TalkBack would have to be talked
 * through is a wall, not a safeguard (`HOLD_COPY.a11yHint` says so to the person listening).
 *
 * THE RING IS A PROGRESS INDICATOR, NOT A DECORATION, and that settles what reduce motion and the
 * amber Night do to it. It still fills — a hold with no sign of how long is left is a guessing game
 * — at an even speed, which is what it does anyway, because an eased ring would say the hold is
 * nearly done when it is not. What goes is the flourish: the little swell when it closes, the ring
 * running back and the hint fading in and out. Under reduce motion and in Night the ring simply
 * clears and the hint simply appears (`holdStep`). Night draws the ring in its own amber ink with
 * nothing lit (`theme/timerMotion.ts`).
 *
 * THE DRAW is one dash the length of the ring sliding along it (`holdRing`): at 0 the whole loop
 * sits in the gap between two dashes, round caps and all; at 1 it is one dash end to end. A dash
 * offset is a prop of the SVG path, not a style, so it is the one value here the native driver
 * cannot carry — `TickMark` makes the same trade for the same reason — and it only runs while a
 * finger is on the button. The swell and the hint are opacity and scale, on the native driver.
 */
import type { Frame } from './dayNightSwitch';

/* ------------------------------------------------------------------------------ the timing */

export const HOLD = {
  /** How long a finger holds to stop: the ring closes in this, at an even speed. */
  fillMs: 600,
  /** How long a CLOSED ring would take to run back; a part-filled one takes its share. */
  drainMs: 180,
  /** How long "Hold to stop" stays after a press that let go too soon. */
  hintMs: 1500,
  /** Its fade in and out, where anything may fade. */
  hintInMs: 120,
  hintOutMs: 220,
  /** The swell as the ring closes: this much bigger, and back, once. */
  popScale: 1.05,
  popMs: 240,
} as const;

/**
 * THE WORDS. The hint is drawn beside the button, not read out as a label — the button keeps its
 * own name ("Woke up, ends the sleep timer"), and a screen reader hears the hint below in its place.
 */
export const HOLD_COPY = {
  hint: 'Hold to stop',
  a11yHint: 'Double tap to stop at once, no hold needed',
} as const;

/* -------------------------------------------------------------------------------- the ring */

export const HOLD_RING = {
  /** The ring's width: a mark a thumb's edge does not hide, thin enough to leave the words room. */
  stroke: 3,
  /**
   * How far inside the button's edge the ring's OUTER edge runs: on the button's own surface, clear
   * of the hairline some buttons draw round themselves (Night's, and the sticky bar's).
   */
  inset: 1,
  /** The track the ring runs over while a finger is down: the ring's own ink at this share. */
  track: 0.2,
} as const;

export interface HoldRing {
  /** The ring's middle line, from the top middle, clockwise. */
  path: string;
  /** Its length. */
  length: number;
  /** One dash as long as the ring and a gap longer than the ring by both caps and a little slack. */
  dasharray: readonly [number, number];
  /** The dash offset at 0 (nothing drawn, not even a cap's dot) and at 1 (the loop closed). */
  from: number;
  to: 0;
}

/** Past both caps, so no renderer's rounding leaves a dot of the next dash at the seam. */
const DASH_SLACK = 0.5;

const n = (v: number): string => String(Math.round(v * 1000) / 1000);

/**
 * THE RING INSIDE A BUTTON `width` × `height` whose ends are round — the pill on a running card and
 * the sticky bar, or the disc of the ring layouts, which is a pill as wide as it is tall. Its middle
 * line runs `inset + stroke / 2` inside the edge, so the ring's outer edge is `inset` in.
 *
 * FROM THE TOP MIDDLE, CLOCKWISE, and each round end as two quarter turns: a single half-circle arc
 * joins two points exactly opposite each other, which leaves the renderer to pick the side, and a
 * ring that closes round the wrong end once in a while is the kind of fault nobody can reproduce.
 */
export function holdRing(
  width: number,
  height: number,
  stroke: number = HOLD_RING.stroke,
  inset: number = HOLD_RING.inset,
): HoldRing {
  const h = Math.max(0, height);
  // never narrower than round: a first frame's measurement can be anything
  const w = Math.max(width, h);
  const i = Math.min(inset + stroke / 2, h / 2);
  const r = Math.max(0, h / 2 - i);
  const straight = Math.max(0, w - 2 * i - 2 * r);
  const [top, bottom, left, right, mid] = [i, h - i, i, w - i, w / 2];
  const path = [
    `M${n(mid)} ${n(top)}`,
    `H${n(right - r)}`,
    `A${n(r)} ${n(r)} 0 0 1 ${n(right)} ${n(h / 2)}`,
    `A${n(r)} ${n(r)} 0 0 1 ${n(right - r)} ${n(bottom)}`,
    `H${n(left + r)}`,
    `A${n(r)} ${n(r)} 0 0 1 ${n(left)} ${n(h / 2)}`,
    `A${n(r)} ${n(r)} 0 0 1 ${n(left + r)} ${n(top)}`,
    'Z',
  ].join('');
  const length = 2 * straight + 2 * Math.PI * r;
  const cap = stroke / 2;
  return {
    path,
    length,
    dasharray: [length, length + 2 * cap + DASH_SLACK],
    from: length + cap,
    to: 0,
  };
}

/** Of the hold, 0 → 1: the dash offset, `from` → 0 — clamped, so nothing draws past the seam. */
export function holdRingFrames(ring: HoldRing): { offset: Frame; track: Frame } {
  return {
    offset: { inputRange: [0, 1], outputRange: [ring.from, ring.to], extrapolate: 'clamp' },
    // the track is there while anything of the hold is, and gone when it has run back to nothing
    track: { inputRange: [0, 0.001, 1], outputRange: [0, 1, 1], extrapolate: 'clamp' },
  };
}

/** The ring's visible length at `progress` (a test's copy of what the dash offset draws). */
export const ringDrawn = (ring: HoldRing, progress: number): number => {
  const p = Math.min(1, Math.max(0, progress));
  const offset = ring.from + (ring.to - ring.from) * p;
  return Math.max(0, Math.min(ring.length, ring.length - offset));
};

/* ----------------------------------------------------------------------------- the plans */

const clamp01 = (v: number): number => Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0));

/**
 * The rest of a fill, from where the ring stands: a press that comes back to a ring still running
 * back picks it up there, and closes it in the time that is left — never a fresh 600 ms.
 */
export const fillMs = (progress: number): number =>
  Math.round(HOLD.fillMs * (1 - clamp01(progress)));

/** Running back from where it stands, in its share of `drainMs`. */
export const drainMs = (progress: number): number => Math.round(HOLD.drainMs * clamp01(progress));

/* ------------------------------------------------------------------------- the lifecycle */

/**
 * Where a hold is: at REST, FILLING under a finger, DRAINING after one let go too soon, or HELD —
 * closed, the stop made, the finger still down.
 */
export type HoldPhase = 'rest' | 'filling' | 'draining' | 'held';

/**
 * What can happen to it: a finger comes down, lifts off the button (`release` — a tap let go too
 * soon), or leaves without lifting there (`cancel` — the page took the touch for a scroll, or the
 * finger slid off); the ring closes or finishes running back; or a screen reader (or a keyboard,
 * or a switch) activates the button.
 */
export type HoldEvent = 'press' | 'release' | 'cancel' | 'filled' | 'drained' | 'activate';

/**
 * What the button does about it, in order:
 *
 *   fill    run the ring on from where it stands (`fillMs`), and put any hint away
 *   drain   run it back from where it stands (`drainMs`)
 *   clear   set it to nothing, at once
 *   hint    show "Hold to stop" for `hintMs`
 *   stop    make the caller's stop — the one thing here that is not a picture
 *   pop     the swell as it closes
 */
export type HoldEffect = 'fill' | 'drain' | 'clear' | 'hint' | 'stop' | 'pop';

export interface HoldStep {
  phase: HoldPhase;
  effects: readonly HoldEffect[];
}

/**
 * THE WHOLE OF THE BUTTON'S BEHAVIOR, as one table, so the component carries it out and a test can
 * read it. `still` is reduce motion or the amber Night (`motionStill`): the ring still fills — it
 * is the answer to "how much longer" — but there is no swell, and a ring let go of clears rather
 * than running back.
 *
 * ONE STOP PER HOLD, whatever arrives after it: a ring that has closed is HELD until the finger
 * lifts, so nothing that happens while it is held can make the stop again — and the lift clears it
 * without a hint, because the press did what it was for. (A stop that did not end the timer — a
 * pump's, which opens the output form and leaves the card standing — leaves a clean button behind.)
 */
export function holdStep(phase: HoldPhase, event: HoldEvent, still: boolean): HoldStep {
  switch (event) {
    case 'press':
      return phase === 'rest' || phase === 'draining'
        ? { phase: 'filling', effects: ['fill'] }
        : { phase, effects: [] };
    case 'release':
    case 'cancel': {
      // only a tap is told to hold: a touch the page took for a scroll is not a press at all
      const told: HoldEffect[] = event === 'release' ? ['hint'] : [];
      if (phase === 'filling')
        return still
          ? { phase: 'rest', effects: ['clear', ...told] }
          : { phase: 'draining', effects: ['drain', ...told] };
      if (phase === 'held') return { phase: 'rest', effects: ['clear'] };
      return { phase, effects: [] };
    }
    case 'filled':
      return phase === 'filling'
        ? { phase: 'held', effects: still ? ['stop'] : ['stop', 'pop'] }
        : { phase, effects: [] };
    case 'drained':
      return phase === 'draining' ? { phase: 'rest', effects: [] } : { phase, effects: [] };
    case 'activate':
      // at once, with no hold, and never a second time over a hold that has already stopped. Under
      // a finger still down (a screen reader's pass-through), it is HELD until that finger lifts,
      // as a closed ring is, so nothing more that arrives before then can stop again.
      if (phase === 'held') return { phase, effects: [] };
      if (phase === 'filling') return { phase: 'held', effects: ['clear', 'stop'] };
      return { phase: 'rest', effects: phase === 'rest' ? ['stop'] : ['clear', 'stop'] };
  }
}

/* ---------------------------------------------------------------------------- the swell */

/** Of the swell's own clock, 0 → 1: the button's scale, out and back, on the native driver. */
export const popFrame = (): Frame => ({
  inputRange: [0, 0.4, 1],
  outputRange: [1, HOLD.popScale, 1],
  extrapolate: 'clamp',
});

/* ----------------------------------------------------------------------------- the hint */

/** Where the hint sits: above the button on a card's foot, below it on the bar across the top. */
export type HoldHintAt = 'above' | 'below';

/** The room between the hint and the button. */
export const HINT_GAP = 6;
