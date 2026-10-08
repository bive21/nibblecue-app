/**
 * THE SLEEP-OR-PLAY QUESTION, ASKED (`sleepPlay.ts` has the rule and the words).
 *
 * THE APP'S OWN CONFIRMATION (2026-09-29; it was the phone's `Alert.alert` until the owner saw
 * Android's: *"it look like an old text box that android has. why does this not follow our
 * design?"*): the question goes to whichever confirmation the caller hands in (`Confirm`, the
 * design system's `ConfirmSheet`), because where it can be drawn depends on where it is asked from.
 * The sleep and tummy time sheets hand in their own, mounted inside the capture sheet so iOS can
 * present it over it; a CueCoin tapped with no sheet up, and the toast's "+ Liam" after its sheet
 * has gone, ask through the shell's (`useTimerActions` says which is which).
 *
 * The answer is plain, not destructive, because what it does is undone from the toast like any
 * stop. It resolves true on the end button and false on Cancel, or on the sheet dismissed (its
 * Close, the scrim, a drag down, Back), and it writes nothing: the caller writes, after the answer.
 *
 * ONE QUESTION AT A TIME. Starting tummy time on Both with both babies asleep asks twice, once per
 * baby; the confirmation's own queue shows the second once the first has been answered and has
 * slid away (`confirmQueue`), so the two never stack.
 */
import type { Confirm, ConfirmRequest } from '@nibblecue/ui';
import type { SleepPlayQuestion } from './sleepPlay';

/** The question as the confirmation asks it: its words, and an action that is not a danger. */
export function sleepPlayRequest(q: SleepPlayQuestion): ConfirmRequest {
  return { title: q.title, body: q.body, action: q.confirm, cancel: q.cancel, destructive: false };
}

export function askSleepPlay(q: SleepPlayQuestion, ask: Confirm): Promise<boolean> {
  return ask(sleepPlayRequest(q));
}
