/**
 * A TIMER THAT HAS BEEN RUNNING LONGER THAN THE ACTIVITY PLAUSIBLY LASTS (the owner,
 * 2026-09-20: *"add the prompt when activities are still ongoing and ask to adjust. For
 * example, pumping for more than 2 hours continuously is not correct. Same with tummy time
 * more than hours straight. When this happens, send the warning ask if it's ended and the
 * option to adjust the correct end time"*).
 *
 * WHAT THIS IS A CLAIM ABOUT, AND WHAT IT IS NOT (CLAUDE.md §2, rules 1 and 3). It is a claim
 * about A TIMER IN THIS APP: a stopwatch left running is the most common wrong row in any
 * tracker, and an app is allowed to notice its own stopwatch. It says nothing about the baby,
 * nothing about the parent, and nothing about whether a session of any length is good, normal
 * or advisable — a three-hour cluster feed is a real thing that happens, and the app's answer
 * to one is to ask, once, whether the timer is still running, and then to take whatever answer
 * it is given. The copy that goes with it (`longRun.copy.ts`) is held to that by its own test.
 *
 * THE LIMITS ARE DELIBERATELY GENEROUS, for the same reason. They are not "how long this should
 * take"; they are the point past which a LEFT-ON TIMER is likelier than a real session, and
 * they are set so that a parent having an unusually long real session is asked at most once and
 * can say "still going" in one tap. Two of them are the owner's own numbers.
 *
 * NOTHING HERE READS A CLOCK OR A DATABASE. `nowMs` is passed in, paused time is subtracted the
 * same way every elapsed display does it (CLAUDE.md rule 12: timers are timestamps), and the
 * caller decides what to do with the answer.
 */
import type { TimerType } from '../sync/types';

/**
 * How long each kind of timer may run before the app asks whether it is still going, in
 * minutes.
 *
 *   * **pump — 2 h.** The owner's number. A pump session is minutes, not hours; two hours is
 *     already several times the longest real one.
 *   * **tummy — 1 h.** The owner's ("same with tummy time more than hours straight"). Tummy
 *     time is measured in minutes at every age this app covers. It stays at an hour once tummy
 *     time has become Playtime and its goal goes up to three hours: the goal is the DAY'S total,
 *     made of several sessions, and one session that runs an hour straight is the one worth a
 *     "still going?" (the owner, 2026-09-27: *"Playtime limit of 3 hrs shouldn't be all at the
 *     same time, keep this."*).
 *   * **breastfeed — 3 h.** Longer than the pump on purpose: cluster feeding is real, an evening
 *     of it can run for hours with the timer legitimately on, and a parent holding a feeding
 *     baby is the person least able to answer a prompt. Three hours still catches the timer
 *     left on overnight.
 *   * **sleep — 15 h.** A night's sleep is legitimately twelve, and the first weeks' nights are
 *     longer than the app's idea of a night. This one exists for the nap timer started at two
 *     in the afternoon and found the next morning, which is the only sleep case a threshold can
 *     be sure about.
 */
export const LONG_RUN_LIMIT_MIN: Readonly<Record<TimerType, number>> = {
  pump: 120,
  tummy: 60,
  breastfeed: 180,
  sleep: 900,
};

export interface LongRunInput {
  type: TimerType;
  /** Epoch ms, as the row holds it. */
  startedAtMs: number;
  /** Banked paused time, excluded from the run the same way the card excludes it. */
  pausedMs?: number;
  nowMs: number;
  /**
   * When the parent said "still going", in epoch ms. The ask does not come back until the timer
   * has run a whole limit again past that point — one more ask on a genuinely long session, not
   * a prompt every time the screen is opened.
   */
  snoozedAtMs?: number | null;
}

export interface LongRun {
  /** Minutes the timer has actually been running, paused time excluded. */
  elapsedMin: number;
  /** The limit it passed. */
  limitMin: number;
  /**
   * Where the time picker opens when the parent says it ended: the moment the session stopped
   * being plausible, which is the latest end worth offering. Every correction from there moves
   * BACKWARD, which is the direction a forgotten timer is wrong in — and it is a starting point
   * for a picker, never a time the app writes on its own.
   */
  suggestedEndMs: number;
}

/**
 * The ask, or `null` when there is nothing to ask about.
 *
 * `null` covers all three quiet cases: inside the limit, snoozed and not yet a whole limit past
 * it, and a timer whose start is in the future (a corrected start, a device clock that moved),
 * which is a bug to be robust about rather than a session to ask about.
 */
export function longRunning(input: LongRunInput): LongRun | null {
  const { type, startedAtMs, nowMs } = input;
  const paused = Math.max(0, input.pausedMs ?? 0);
  const limitMin = LONG_RUN_LIMIT_MIN[type];
  const runMs = nowMs - startedAtMs - paused;
  if (runMs <= 0) return null;
  const limitMs = limitMin * 60_000;
  if (runMs < limitMs) return null;

  const snoozedAtMs = input.snoozedAtMs ?? null;
  if (snoozedAtMs !== null && nowMs - snoozedAtMs < limitMs) return null;

  return {
    elapsedMin: Math.floor(runMs / 60_000),
    limitMin,
    suggestedEndMs: startedAtMs + paused + limitMs,
  };
}

/**
 * THE NEXT INSTANT `longRunning`'S ANSWER CAN CHANGE, for the same timer and snooze — so the card
 * that draws it can wake then and at no other time (docs/DESIGN_SYSTEM.md §7.1: a clock lives in
 * the smallest thing that shows it, and ticks no faster than what it shows).
 *
 * The card used to re-read the clock every second to answer a question whose answer moves at an
 * hour boundary at the soonest: a second-by-second render of the whole card, beside the timer
 * card's own tick, for every running timer, for as long as it ran. As time passes with the inputs
 * fixed the answer only ever moves forward, at two kinds of instant:
 *
 *   * quiet — when the ask starts: the later of the limit and the snooze's own limit;
 *   * asking — when the minute on it turns ("Running 2h 05m"); nothing else on it moves, and it
 *     never goes quiet again by itself (a later snooze, a stop or a pause is a new input).
 *
 * Always later than `nowMs`, and the answer is the same at every instant before it.
 */
export function longRunNextChangeMs(input: LongRunInput): number {
  const paused = Math.max(0, input.pausedMs ?? 0);
  const runsFrom = input.startedAtMs + paused;
  const asked = longRunning(input);
  if (asked !== null) return runsFrom + (asked.elapsedMin + 1) * 60_000;
  const limitMs = LONG_RUN_LIMIT_MIN[input.type] * 60_000;
  const snoozedAtMs = input.snoozedAtMs ?? null;
  return Math.max(
    runsFrom + limitMs,
    snoozedAtMs === null ? Number.NEGATIVE_INFINITY : snoozedAtMs + limitMs,
  );
}

/**
 * Is `endMs` a time this timer could have ended? The picker hands back a wall clock resolved
 * against today, so both ends need checking: an end before the start is a typo, and an end in
 * the future is a clock the parent cannot have meant.
 *
 * A one-minute floor rather than a strict `>`: a session of zero minutes is a discard, and this
 * flow is not the place to make one by accident.
 */
export function validEnd(startedAtMs: number, endMs: number, nowMs: number): boolean {
  return endMs >= startedAtMs + 60_000 && endMs <= nowMs;
}
