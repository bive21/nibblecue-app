/**
 * WHEN A RUNNING TIMER REALLY ENDED, ONE RULE WHEREVER IT IS ASKED (the owner, 2026-09-29: *"on an
 * ongoing timer for pumping, i see the option to "correct start time" as i try to stop it, but
 * what happens if it should already be ended x minutes ago? … this is the same for all timer"*).
 *
 * Two places end a timer at a past instant: the long-run card's **It ended** (`LongRunCard`) and
 * the running sheet's **End time** (`RunningPanel`). Both call this and neither decides anything of
 * its own, because a second copy of the rule is how two answers to "could it have ended then?"
 * would begin — the pump's Correct the start time learned that about the stop (`startBeforeStop`).
 *
 *   * REFUSED, felt as a `warning` and said, with nothing written: an end before the start or
 *     inside its first minute (core's `validEnd`: a session of no length is a discard, and this is
 *     not the way to make one), an end later than now, and, on a feed, an end its sides were still
 *     counting at (below).
 *   * A PUMP IS ONLY STOPPED THERE (`markStopped`): its output form has to come first, frozen at
 *     that instant, and it saves the session ending then. Inside the pump's own sheet the form is
 *     already on the screen, so nothing opens; from Today it has to be opened (`openOutput`). A
 *     second end on a pump already stopped moves the stop, which is how its End time is corrected.
 *   * EVERY OTHER TIMER is the ordinary stop with a past instant (`useTimerActions.stop`): the same
 *     entry, a sleep filed nap or night by its start, the same saved toast with its Undo, and the
 *     sheet that asked closes (`onEnded`) once the entry is written.
 *
 * THE FEED'S FLOOR (2026-09-29). A breastfeed's minutes are its sides' seconds, and the stop banks
 * the side that is timing up to the end (`bankedSides`). An end before that side began counts
 * nothing for it and still saves every second the other sides banked: the parent tapped Switch at
 * that side's start, so the feed was going then, and the entry would hold more side minutes than
 * it lasted. A paused feed has no side timing, and its banked seconds need at least that much time
 * after the start. Both are refused in words, as an end before the start is.
 *
 * WHICH SENTENCE FOR WHICH BOUND. The long-run card chose between its two by "is it before the
 * start?", so an end inside the first minute was told it was later than now. The question is "is
 * it later than now?" here, and every other failure of `validEnd` is too early.
 *
 * Pure but for the two effects every refusal and every pump stop has always had (the haptic and
 * the stop store), so node can hold it: `timerEnd.test.ts`, and the scenarios in
 * `scenarios/endEarlier.scenario.test.ts`.
 */
import { validEnd } from '@nibblecue/core';
import { haptic } from '@nibblecue/ui/haptics';
import type { TimerNow } from '../../db/queries/today';
import { LONG_RUN } from './copy';
import { markStopped } from './stopped';

const SEC = 1000;

type EndingTimer = Pick<
  TimerNow,
  'type' | 'startedAtMs' | 'activeSide' | 'sideStartedAtMs' | 'leftSeconds' | 'rightSeconds'
>;

/**
 * The earliest end a feed's sides allow, or null for every other timer: the start plus every
 * second its sides have banked, and no earlier than the side that is timing now began (a paused
 * feed has none: `side_started_at` is null, the same test `bankedSides` makes).
 */
export function feedEndFloor(t: EndingTimer): number | null {
  if (t.type !== 'breastfeed') return null;
  const banked = t.startedAtMs + (t.leftSeconds + t.rightSeconds) * SEC;
  return t.activeSide !== null && t.sideStartedAtMs !== null
    ? Math.max(banked, t.sideStartedAtMs)
    : banked;
}

export type EndRefusal = 'tooEarly' | 'inFuture' | 'stillCounting';

/** Why this end cannot be the timer's, or null when it can. */
export function endRefusal(t: EndingTimer, endMs: number, nowMs: number): EndRefusal | null {
  if (!validEnd(t.startedAtMs, endMs, nowMs)) return endMs > nowMs ? 'inFuture' : 'tooEarly';
  const floor = feedEndFloor(t);
  return floor !== null && endMs < floor ? 'stillCounting' : null;
}

/** The sentence each refusal is said with. */
export const END_REFUSED: Readonly<Record<EndRefusal, string>> = {
  tooEarly: LONG_RUN.endTooEarly,
  inFuture: LONG_RUN.endInFuture,
  stillCounting: LONG_RUN.endStillCounting,
};

export interface EndAtDeps {
  /** `useTimerActions().stop`: the entry, written at `endMs`. */
  stop: (timer: TimerNow, endMs: number) => Promise<{ committed: boolean } | null>;
  /** How a refusal is said: the toast. */
  say: (sentence: string) => void;
  /** A pump stopped from outside its own sheet: open the output form. */
  openOutput?: () => void;
  /** The entry was written: the sheet that asked can close. */
  onEnded?: () => void;
}

/**
 * What an end came to: refused and nothing written; a pump `stopped` (its form saves it); another
 * timer `saved`; or a stop that wrote nothing (a double tap, a timer already gone), which says
 * nothing more, as the card's own stop does.
 */
export type EndOutcome = 'refused' | 'stopped' | 'saved' | 'unsaved';

/** End `timer` at `endMs`, the instant the parent picked, as `nowMs` sees it. */
export async function endTimerAt(
  timer: TimerNow,
  endMs: number,
  nowMs: number,
  deps: EndAtDeps,
): Promise<EndOutcome> {
  const refused = endRefusal(timer, endMs, nowMs);
  if (refused !== null) {
    // refused, and felt as refused (the owner, 2026-09-25): the sentence says which way it was off
    haptic('warning');
    deps.say(END_REFUSED[refused]);
    return 'refused';
  }
  if (timer.type === 'pump') {
    // the same two steps the card's own stop performs: fix the instant, then ask for the output
    markStopped(timer.id, endMs);
    deps.openOutput?.();
    return 'stopped';
  }
  const outcome = await deps.stop(timer, endMs);
  if (!outcome?.committed) return 'unsaved';
  deps.onEnded?.();
  return 'saved';
}
