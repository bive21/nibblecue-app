/**
 * THE TRIP'S LAST TICK, as numbers (the owner, 2026-09-26: *"try everything, if i dont like it, i
 * will ask you to remove"* — S4 of the shopping list's batch). When the parent's own tap puts the
 * last thing still to buy in the basket, a little cart rolls along the progress line from its left
 * end to its right, and "All done" appears over where it stops; a moment later both fade away.
 * Pure TypeScript, tested in node like `cartFlight.ts`; `AllDone.tsx` only hands these numbers to
 * `interpolate`.
 *
 * CALM, AND BRIEF: one cart, no sparkle, no sound of its own and no haptic — the tick that finished
 * the list was already felt as a finish. It rolls for 800 ms on an ease-in-out, leaning back a few
 * degrees as it sets off and forward as it stops, the way a cart rocks on its wheels; the words come
 * up beside where it stops as it gets there; and after a second and a half at rest the two fade out
 * together. 2.4 s from its start to nothing on the screen.
 *
 * THE WORDS ARE A FACT, NOT A GRADE: "All done" says the list has nothing left on it, which is what
 * the card under it already counts. No praise (`CELEBRATION_PRAISE_BANNED` in core), no "!".
 *
 * WHEN IT PLAYS IS THE CALLER'S (`listMotion.ts` in the app): only for the tap that finished the
 * list on this phone, once that tap's write has landed, and never for a list that is empty for any
 * other reason — opened empty, cleared, or emptied from the other phone. UNDER REDUCE MOTION AND IN
 * THE AMBER NIGHT none of it is drawn (`motionStill`): its end state is nothing on the screen.
 */
import type { Frame } from './dayNightSwitch';
import { easeAt } from './themeSkyToggle';

/** The cart's box, in points: small beside the line, and its drawing fits the card's gap over it. */
export const DONE_CART = 14;
/**
 * How far the glyph's wheels stand above the bottom of its box, in points: `paths.ts` draws them
 * at y 19 with a 1.4 radius and a 1.7 stroke on a 24 grid — (24 − 19 − 1.4 − 0.85) / 24 of it.
 */
export const DONE_WHEEL_GAP = ((24 - 19 - 1.4 - 0.85) / 24) * DONE_CART;

/** The cart rolls from the line's left end to its right in this. */
export const DONE_ROLL_MS = 800;
/** It is seen for this long in all, and nothing is drawn after. */
export const DONE_MS = 2400;
/** It and the words fade out over the last of it. */
export const DONE_FADE_MS = 300;
/** It fades in as it sets off. */
export const DONE_IN_MS = 120;
/** The words come up over this, centered on the cart's stop. */
export const DONE_WORD_IN_MS = 300;
/** And rise this far as they do, in points. */
export const DONE_WORD_RISE = 4;
/** Every curve here is sampled this often. */
export const DONE_STEP_MS = 10;

/** The roll: a soft start and a soft stop, as a push and a brake are. */
export const DONE_ROLL_EASE = [0.45, 0, 0.35, 1] as const;

/** The cart's rock, in degrees, over the roll: back as it sets off, forward as it brakes, and still. */
export const DONE_ROCK_KEYS: readonly (readonly [number, number])[] = [
  [0, 0],
  [140, -5],
  [380, 0],
  [640, 4],
  [DONE_ROLL_MS, 0],
];

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

const sampleTimes = (): number[] => {
  const out: number[] = [];
  for (let ms = 0; ms < DONE_MS; ms += DONE_STEP_MS) out.push(ms);
  out.push(DONE_MS);
  return out;
};

const frame = (keys: readonly (readonly [number, number])[]): Frame => ({
  inputRange: keys.map(([ms]) => ms / DONE_MS),
  outputRange: keys.map(([, v]) => v),
  extrapolate: 'clamp',
});

/** How far along the line the cart is at `ms`, 0 → 1. */
export function doneRollAt(ms: number): number {
  return easeAt(DONE_ROLL_EASE, clamp(ms / DONE_ROLL_MS, 0, 1));
}

/** The cart's rock at `ms`, in degrees: a half cosine between the keys, so each lean is round. */
export function doneRockAt(ms: number): number {
  const keys = DONE_ROCK_KEYS;
  for (let i = 1; i < keys.length; i += 1) {
    const [t0, v0] = keys[i - 1] ?? [0, 0];
    const [t1, v1] = keys[i] ?? [DONE_ROLL_MS, 0];
    if (ms <= t1) {
      const u = clamp((ms - t0) / (t1 - t0), 0, 1);
      return v0 + (v1 - v0) * (1 - Math.cos(Math.PI * u)) * 0.5;
    }
  }
  return 0;
}

/** When the words start to come up: so that they are half up as the cart stops. */
export const DONE_WORD_AT = DONE_ROLL_MS - DONE_WORD_IN_MS / 2;

export interface AllDoneFrames {
  /** Of the one value, 0 → 1 over `DONE_MS`: the cart's `translateX`, in points along the line. */
  x: Frame;
  cartOpacity: Frame;
  /** Degrees of `rotate`. */
  rock: Frame;
  wordOpacity: Frame;
  /** Points of `translateY`. */
  wordY: Frame;
}

/**
 * The frames for a line `travel` points long — the line's width less the cart's own, so the cart
 * stops with its back wheel on the line's right end. A line not yet measured is none: the cart
 * rocks where it starts.
 */
export function allDoneFrames(travel: number): AllDoneFrames {
  const room = Number.isFinite(travel) ? Math.max(0, travel) : 0;
  const times = sampleTimes();
  const out = DONE_MS - DONE_FADE_MS;
  const wordUp = DONE_WORD_AT + DONE_WORD_IN_MS;
  return {
    x: frame(times.map(ms => [ms, room * doneRollAt(ms)] as const)),
    rock: frame(times.map(ms => [ms, doneRockAt(ms)] as const)),
    cartOpacity: frame([
      [0, 0],
      [DONE_IN_MS, 1],
      [out, 1],
      [DONE_MS, 0],
    ]),
    wordOpacity: frame([
      [0, 0],
      [DONE_WORD_AT, 0],
      [wordUp, 1],
      [out, 1],
      [DONE_MS, 0],
    ]),
    wordY: frame(
      times.map(
        ms =>
          [
            ms,
            DONE_WORD_RISE *
              (1 -
                easeAt([0.22, 0.8, 0.28, 1], clamp((ms - DONE_WORD_AT) / DONE_WORD_IN_MS, 0, 1))),
          ] as const,
      ),
    ),
  };
}
