/**
 * ASLEEP OR PLAYING, NEVER BOTH (the owner, 2026-09-27: *"also the logic is, if baby sleeping, then
 * they cannot be playing. when user try to add tummy time or playtime when baby is sleeping, ask if
 * you would like us to end sleeping log?"*). Pure, so the rule is a table test
 * (`sleepPlay.test.ts`); `useTimerActions.endRivals` asks the question (`askSleepPlay`) and writes
 * the end through the card's own stop.
 *
 * WHAT CLASHES: one baby's sleep and the SAME baby's tummy time — "Playtime" once graduated, the
 * same module under the household's word. They are the one pair of timers that say contradictory
 * things about where a baby is. Twins are two babies, so Liam's nap never stands in the way of
 * Emma's playtime; a pump is the parent's (no baby at all) and a breastfeed is nobody's rival, so
 * neither ever asks.
 *
 *   - STARTING TUMMY TIME while that baby's sleep runs — the owner's own case. Asked, and on "End
 *     sleep" the sleep is stopped where the tummy time begins, then the tummy time starts.
 *   - SAVING A FINISHED TUMMY SESSION ("Already finished") whose span overlaps that sleep. The same
 *     question; the sleep ends where the session began (below), then the session is saved.
 *   - STARTING A SLEEP while that baby's tummy time runs: the owner's rule read the other way. They
 *     stated it both ways ("if baby sleeping, then they cannot be playing") but asked for the first
 *     only, so this one is an ADDITION, flagged to them, and declined by taking `sleep` out of
 *     `RIVAL` below.
 *
 * NOT ASKED: a finished SLEEP typed in over running tummy time. Ending the tummy timer where that
 * sleep began would end the play that is happening now, after the sleep; what would fix that
 * record is a later START for the tummy timer, which is a different question nobody has asked.
 *
 * WHERE THE RUNNING ONE ENDS (`rivalEndMs`): where the new one BEGINS, never before the running
 * one's own start, and never after now —
 *
 *     end = min(now, max(new start, running start))
 *
 *   - a start tapped now ends it at the tap: the new timer starts from that same instant, so the two
 *     meet exactly and nothing overlaps, however long the question stayed on the screen;
 *   - a finished tummy session ends the sleep at the session's own start;
 *   - a sleep started from a picked time ends tummy time at that time.
 *
 * THE CLAMP TO THE RUNNING ONE'S OWN START is the case where what is added began BEFORE the running
 * timer did — a tummy session typed in as 1:50 to 2:10 over a sleep timer started at 2:00. No end
 * for the sleep is both after its start and before the session's; the one that keeps the record
 * whole is its own start, so it is saved as a sleep of no length (0m) at 2:00, which the parent can
 * see, correct or delete. Dropping the sleep instead would lose a log (CLAUDE.md rule 7), and the
 * data layer refuses an end before a start (`stopTimer`) in any case.
 *
 * NOTHING IS WRITTEN UNTIL THE PARENT ANSWERS: the question comes first, and Cancel — or a dialog
 * dismissed — writes nothing, neither the end nor the new entry. It needs no network: the answer is
 * a local dialog and both writes are the local-first writes every stop and start already are.
 */
import type { TimerType } from '@nibblecue/core';
import { SLEEP_PLAY } from './copy';

/**
 * WHICH RUNNING TIMER STANDS IN THE WAY of one being added: tummy time's is the same baby's sleep,
 * and — the addition above — a sleep's is the same baby's tummy time. Every other timer has none.
 */
export const RIVAL: Readonly<Partial<Record<TimerType, TimerType>>> = {
  tummy: 'sleep',
  sleep: 'tummy',
};

/** Just enough of a running timer to match one. `TimerNow` satisfies it. */
export interface RivalTimer {
  id: string;
  type: TimerType;
  childId: string | null;
  /** Epoch ms. */
  startedAtMs: number;
}

/**
 * What a parent is about to add, for one baby: a timer that runs from `startMs` on (no `endMs`),
 * or a session already finished, `startMs` to `endMs`.
 */
export interface Adding {
  type: TimerType;
  childId: string | null;
  startMs: number;
  endMs?: number;
}

/**
 * THE RUNNING TIMER WHAT IS BEING ADDED WOULD OVERLAP, or null. A timer that starts overlaps its
 * rival from now on, whenever that began; a finished session only when its span and the rival's —
 * its start to now, since it is still running — overlap by more than an instant: a session that
 * ended as the sleep began, or began once the sleep had ended (never, while it runs), sits beside it.
 */
export function rivalFor<T extends RivalTimer>(
  running: readonly T[],
  adding: Adding,
  nowMs: number,
): T | null {
  const type = RIVAL[adding.type];
  // a household timer — a pump — is nobody's, and nobody's rival
  if (type === undefined || adding.childId === null) return null;
  const rival = running.find(t => t.type === type && t.childId === adding.childId);
  if (rival === undefined) return null;
  if (adding.endMs === undefined) return rival;
  return adding.endMs > rival.startedAtMs && adding.startMs < nowMs ? rival : null;
}

/** Where the running timer is ended on "End sleep": see the header's rule. */
export function rivalEndMs(
  adding: Pick<Adding, 'startMs'>,
  rival: Pick<RivalTimer, 'startedAtMs'>,
  nowMs: number,
): number {
  return Math.min(nowMs, Math.max(adding.startMs, rival.startedAtMs));
}

/**
 * THE CLOCK IS SAID ONLY WHEN THE END IS NOT NOW: "End the sleep to start tummy time?" for a start
 * tapped this minute, "End the sleep at 2:45 PM to save tummy time?" for a session that began a
 * quarter of an hour ago — where "End the sleep" alone would read as now.
 */
export const endIsNow = (endMs: number, nowMs: number): boolean => nowMs - endMs < 60_000;

export interface SleepPlayQuestion {
  title: string;
  body: string;
  /** The button that ends the running timer and goes on. */
  confirm: string;
  cancel: string;
}

/**
 * THE QUESTION, in the household's own word for tummy time. `rival` is what would be ENDED;
 * `finished` says whether what is added is a session already over ("to save") or a start.
 */
export function sleepPlayQuestion(input: {
  rival: TimerType;
  /** The baby's name; the app's word for a baby with none. */
  name: string | null;
  /** The household's word for tummy time inside a sentence: "tummy time", "playtime". */
  playWord: string;
  finished: boolean;
  /** The end as a clock, or null when it is now (`endIsNow`). */
  endClock: string | null;
}): SleepPlayQuestion {
  const who = input.name?.trim() || SLEEP_PLAY.someone;
  if (input.rival === 'sleep')
    return {
      title: SLEEP_PLAY.asleep(who),
      body: SLEEP_PLAY.endSleep(input.playWord, input.finished ? 'save' : 'start', input.endClock),
      confirm: SLEEP_PLAY.endSleepButton,
      cancel: SLEEP_PLAY.cancel,
    };
  return {
    title: SLEEP_PLAY.playing(who, input.playWord),
    body: SLEEP_PLAY.endPlay(input.playWord, input.endClock),
    confirm: SLEEP_PLAY.endPlayButton(input.playWord),
    cancel: SLEEP_PLAY.cancel,
  };
}
