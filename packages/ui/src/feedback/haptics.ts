/**
 * HAPTICS, AS ONE CALL (the owner, 2026-09-25, of the "that's cool" list: "Let's try doing
 * everything" — a soft tick per stepper step, a firm tap on Save, a double tap when a timer
 * starts, a click at each stop of the theme switch).
 *
 * Every component in this package that wants to be felt calls `haptic(kind)` and nothing else.
 * It never imports `expo-haptics`: this package's tests run in node, where there is no motor to
 * drive, and a component that reached for the native module would pull React Native's runtime
 * into every one of them. The app installs the real DRIVER once at boot (`setHapticsDriver`), and
 * until it does — in node, in a test, on a platform with no motor — every call is a no-op.
 *
 * THE KINDS ARE MEANINGS, NOT MOTOR SETTINGS, so a call site says what happened and the driver
 * decides how that feels on each platform:
 *
 *   tick     one step of something that moves in steps: a stepper, a picker detent, a stop of a
 *            switch. The lightest there is, because it can fire many times a second.
 *   tap      a press that did something small: a chip chosen, a switch flipped.
 *   thud     a press that did something that stays and is not yet done: a pump stopped.
 *   double   a thing that STARTED and will keep going: a timer. Two taps, close together.
 *   success  a thing finished well: an entry saved (its Save's check drawing itself — it was a
 *            `thud` until 2026-09-26), a timer's entry written, the last item ticked, a list sent.
 *   warning  a thing refused: a locked option, a save that could not be made.
 *
 * ONE SWITCH TURNS ALL OF IT OFF (`setHapticsEnabled`), read from the parent's own setting by the
 * app. A haptic is decoration: it must never throw, never wait, and never be the only way
 * something is said — whatever it marks is always also on the screen.
 */

export type HapticKind = 'tick' | 'tap' | 'thud' | 'double' | 'success' | 'warning';

export type HapticsDriver = (kind: HapticKind) => void;

let driver: HapticsDriver | null = null;
let enabled = true;

/** Installed once by the app with the platform's motor; null takes it out again (tests). */
export function setHapticsDriver(next: HapticsDriver | null): void {
  driver = next;
}

/** The parent's own setting: off means nothing is felt, anywhere. */
export function setHapticsEnabled(on: boolean): void {
  enabled = on;
}

export function hapticsEnabled(): boolean {
  return enabled;
}

/** Feel `kind`, if a motor is installed and the parent has not turned it off. Never throws. */
export function haptic(kind: HapticKind): void {
  if (!enabled || driver === null) return;
  try {
    driver(kind);
  } catch {
    // a haptic is never worth an error: whatever it marked is already on the screen
  }
}
