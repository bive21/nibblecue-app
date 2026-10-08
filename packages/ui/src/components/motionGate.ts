/**
 * WHEN A LOOP MAY TURN, as rules (the owner, 2026-09-26: *"does the app running a lot heavier now
 * with these animations? do we need to worry about it?"*). Pure TypeScript, so every answer is a
 * node test; `MotionGate.tsx` only reads the three facts off React Native and the tree and asks
 * these functions (docs/DESIGN_SYSTEM.md §7.1, "Motion and performance").
 *
 * AN IDLE LOOP IS HOW MOTION BECOMES WEIGHT. A move that plays once costs a fraction of a second
 * and is gone. A loop — a breathing dot, a drifting "z", a ticking clock — costs something on every
 * frame for as long as it runs, and the tabs stay mounted behind the bar: a loop on Today keeps
 * turning while the parent is on the Schedule, and with the phone in a pocket, unless something
 * stops it. So every loop asks one question, and the answer is yes only while somebody can see it:
 *
 *   AWAKE   the screen it is on is the one in front (`focused`, from the nearest `MotionGate`), and
 *           the app is open (`appActive`). A clock that feeds only the eye — a timer's ticking
 *           digits, a loader — runs only then, but it is not stopped by reduce motion or Night,
 *           because a timer's digits are information, not motion (§7: they tick, never animate).
 *   ACTIVE  awake, and not still (`motionStill`: the phone asked for less motion, or the amber
 *           Night). A decorative loop — a breath, a drift, a pulse — runs only then.
 *
 * A PAUSED LOOP IS NOT A STILL ONE. Still draws the end state and keeps it; paused only stops the
 * clock, because nobody is there to see it, and starts it again on the way back. The components
 * keep the two apart: what they DRAW follows still, whether their clock TURNS follows active.
 */
import type { ThemeName } from '../theme/theme';
import { motionStill } from './tickDraw';

/** What React Native's `AppState` reports, or nothing yet; kept loose so this file stays pure. */
export type AppStateLike = string | null | undefined;

/**
 * PUT AWAY, as far as a loop goes: in the background, or behind the system's own sheet (iOS's
 * `inactive`, which is also the app switcher). Anything else — including the `unknown` some builds
 * report before the first change, and no answer at all — is open: a loop that never hears a change
 * must not be treated as put away forever.
 */
export const appPutAway = (state: AppStateLike): boolean =>
  state === 'background' || state === 'inactive';

/** A gate inside a closed gate is closed: a page nested in a hidden one is hidden with it. */
export const gateOpen = (outer: boolean, own: boolean): boolean => outer && own;

export interface MotionWatch {
  /** The screen the loop is on is in front — every `MotionGate` above it is open. */
  focused: boolean;
  /** The app is open (`!appPutAway(AppState.currentState)`). */
  appActive: boolean;
}

/** Somebody can see it: the screen in front, the app open. */
export const motionAwake = (w: MotionWatch): boolean => w.focused && w.appActive;

/** A decorative loop may turn: awake, and neither reduce motion nor the amber Night. */
export const loopRuns = (w: MotionWatch & { reduceMotion: boolean; theme: ThemeName }): boolean =>
  motionAwake(w) && !motionStill(w.reduceMotion, w.theme);
