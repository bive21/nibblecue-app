/**
 * WHAT CHOOSING ONE OF A FEW FEELS LIKE — one rule for every control that offers options: the
 * segmented control's pills, the color swatches, the theme toggle's three stops (the owner,
 * 2026-09-25, of the "that's cool" list: "Let's try doing everything" — among it "a click at each
 * theme-switch stop"; `haptics.ts` has the kinds and what each one means).
 *
 *   a LOCKED option        `warning`. Nothing is chosen and the caller opens the gate — and the
 *                          lock was on the screen before the tap (CLAUDE.md §4), so the buzz
 *                          repeats what the eye was already told rather than telling it first.
 *   the option already ON  nothing. Nothing moved, so nothing is felt — even where the tap still
 *                          means something to the caller (the theme toggle reports a tap on its
 *                          checked stop, which turns "Match phone" off, and the switch below it
 *                          moving is what says so).
 *   a NEW option           the control's own kind: `tap` for a pill or a swatch, `tick` for a
 *                          stop of something that moves in steps.
 *
 * ONE CALL PER CHOICE, made where the press is handled and nowhere else — not again when the
 * value arrives back as a prop, and not by the caller on top of the control's own. A theme jump
 * from Light to Dark rolls the knob THROUGH Night and ticks once: a tick in the middle would say
 * the knob had stopped there.
 */
import { haptic, type HapticKind } from './haptics';

export interface Choice {
  /** Behind a gate: drawn with its lock, and still reported so the caller can open it. */
  locked: boolean;
  /** Already the chosen one: the tap moves nothing. */
  current: boolean;
  /** How a new choice feels on this control. */
  kind: Extract<HapticKind, 'tap' | 'tick'>;
}

/** What the tap is felt as, or null for nothing (see the header). Pure, for the test. */
export function choiceHaptic({ locked, current, kind }: Choice): HapticKind | null {
  if (locked) return 'warning';
  return current ? null : kind;
}

/** Feel the tap on an option — call it from the press handler, before reporting the choice. */
export function feelChoice(choice: Choice): void {
  const kind = choiceHaptic(choice);
  if (kind !== null) haptic(kind);
}
