/**
 * SWITCHING FAMILY WHILE ON (0153 with 0113 and 0115; the verification sweep of 2026-10-08).
 *
 * THE HOLE. A phone plans local reminders only for the family on screen (one file, one engine, one
 * planner at a time), and the server's push is not live until the owner's APNs and FCM credentials
 * exist. Being ON for a family means its other phones go quiet, once this phone has CONFIRMED the
 * list (0115, `routeFor`). So a person on for Lee's family who switched to their own went quiet for
 * Lee's on this phone too, while every other phone of Lee's family stayed quiet because the list
 * said this phone had it: a night that rang nowhere, the one failure who's-on exists to prevent.
 *
 * THE FIX, IN TWO PARTS:
 *
 *   1. ASKED, NEVER SILENT. A switch away from a family this person is on for (now, or later in a
 *      split night) stops before anything changes and says so (`on_duty`), with when it ends. The
 *      switcher asks: "You're on for Lee's family until 2:00 AM. Switch anyway?"
 *   2. CONFIRMED, THE SHIFT IS HANDED BACK. This person's shifts are taken off the list, written as a
 *      new arrangement exactly as "End now" writes one (`saveDuty`: a fresh `rev`, `base` the list
 *      this phone holds, the shifts it replaced in `was`), and the switch's own flush sends it before
 *      the family leaves the screen. A shift of somebody else's on the same list stays as it was.
 *
 * WHY END THE SHIFT RATHER THAN WITHDRAW THIS PHONE'S CONFIRMATION. Withdrawing is not something the
 * data model can say: the server MERGES a confirmation into the stored list's `seen` and never
 * removes an entry from it (0115's WHAT 2, `app.duty_with_seen`), so a "no longer seen" write would
 * be dropped. And even if it could be said, it would only bring back the ONE phone that set the list
 * (`routeFor` rule 3), while ending the shift brings back every parent's phone: with nobody on, each
 * parent's reminders ring on their own phone at their own level (duty.ts rule 1). It is also the
 * write the app already makes and the server already checks, so no migration is needed.
 *
 * WHAT IT CANNOT DO. The other phones learn the new list when they next sync: at once while their
 * app is open (the realtime nudge), and otherwise when it next opens. That is the same as every
 * "End now" until push is live, and it is why the sentence says the reminders "go back to the
 * parents' phones" rather than promising a ring tonight.
 *
 * OFFLINE: the hand-back is not written. Written and left in the queue, it would end the shift on
 * this phone alone (a caregiver's phone then rings nothing) while every other phone still holds the
 * list that says this phone has it. So with no connection nothing changes and the switcher says so.
 * One narrow race is left: the connection drops between this check and the switch's flush. The
 * switch then answers `owed`, the family stays on screen with the hand-back queued, and the outbox
 * sends it the moment the phone is back online; until then a caregiver's phone holds a list with
 * nobody on. Closing it would mean writing the old list back, a second change for every phone to
 * follow, for a window of a second or two; not done, on purpose.
 *
 * Pure but for the calls it is handed, so every branch is a node test (`switchDuty.test.ts`).
 */
import { liveShifts, type DutyShift } from '@nibblecue/core';
import { eligibleOf, type DutyRaw } from '../duty/view';

/** The stretch this person is on for, in the family being left. */
export interface OnDuty {
  /** When their first shift still to run began, or begins. */
  fromMs: number;
  /** When their last shift still to run ends. */
  untilMs: number;
  /** Whether they are on right now, rather than later in a split night. */
  started: boolean;
}

/** The household's list and people, as `dutyRead` answers them. */
export type DutyHere = Pick<DutyRaw, 'list' | 'people'>;

/**
 * WHETHER THIS PERSON IS ON IN THIS FAMILY: a shift still to run that names them, counted the way
 * the planner counts it (`liveShifts` over the people who can still be on), so a shift for a seat
 * that has ended, or for somebody removed, never stops a switch.
 */
export function onDutyOf(here: DutyHere, userId: string, nowMs: number): OnDuty | null {
  const mine = liveShifts(here.list.shifts, nowMs, eligibleOf(here.people, nowMs)).filter(
    s => s.userId === userId,
  );
  const first = mine[0];
  const last = mine[mine.length - 1];
  if (first === undefined || last === undefined) return null;
  return { fromMs: first.fromMs, untilMs: last.untilMs, started: first.fromMs <= nowMs };
}

/** The list with this person's shifts taken off: everybody else's, still to run, as they were. */
export const shiftsWithout = (here: DutyHere, userId: string, nowMs: number): DutyShift[] =>
  liveShifts(here.list.shifts, nowMs, eligibleOf(here.people, nowMs)).filter(
    s => s.userId !== userId,
  );

/**
 * WHAT THE DUTY STEP OF A SWITCH CAME TO:
 *
 *   clear        not on in the family being left: the switch goes on as it always did
 *   on_duty      on, and not confirmed: nothing was written, the switcher asks
 *   offline      on, confirmed, and no connection: nothing was written (header, OFFLINE)
 *   handed_back  on, confirmed: the new list is written, and the switch's flush sends it
 *   failed       the list could not be read or written: nothing changes
 */
export type DutyStep =
  | { kind: 'clear' }
  | { kind: 'on_duty'; duty: OnDuty }
  | { kind: 'offline'; duty: OnDuty }
  | { kind: 'handed_back'; duty: OnDuty }
  | { kind: 'failed' };

export interface DutyStepDeps {
  /** The family on screen's list and people, from this phone's mirror; null when there is none. */
  read(): Promise<DutyRaw | null>;
  /** Whether the phone has a connection right now. */
  online(): Promise<boolean>;
  /** Write `shifts` as the new arrangement replacing the list `read` answered (`saveDuty`). */
  handBack(shifts: DutyShift[], here: DutyRaw): Promise<void>;
  now(): number;
}

export async function dutyBeforeSwitch(
  deps: DutyStepDeps,
  userId: string,
  handBack: boolean,
): Promise<DutyStep> {
  let here: DutyRaw | null;
  try {
    here = await deps.read();
  } catch {
    // a mirror that cannot be read cannot say who is on: the switch is not made on a guess
    return { kind: 'failed' };
  }
  if (here === null) return { kind: 'clear' };
  const now = deps.now();
  const duty = onDutyOf(here, userId, now);
  if (duty === null) return { kind: 'clear' };
  if (!handBack) return { kind: 'on_duty', duty };
  if (!(await deps.online().catch(() => false))) return { kind: 'offline', duty };
  try {
    await deps.handBack(shiftsWithout(here, userId, now), here);
  } catch {
    return { kind: 'failed' };
  }
  return { kind: 'handed_back', duty };
}
