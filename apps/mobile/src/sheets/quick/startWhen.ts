/**
 * WHEN A TIMER STARTED: the arithmetic behind the start row every timer sheet draws (the owner,
 * 2026-09-29: *"we had starting time confirmation when starting sleeping, pumping, and
 * tummytime/playtime. This was removed, but the feedback says that this is helpful. especially
 * since there were distractions, so when start activity, user can easily choose what the start
 * time was"*). Pure, so every rule is a table test (`startWhen.test.ts`); the row, the shortcut
 * line and the preview draw it (`StartedRow.tsx`), `useStartWhen` holds it for a sheet, and
 * `useTimerActions.start` writes what it decides.
 *
 * WHAT WAS THERE, AND WHY IT WENT. From the first build (2026-09-15) every start raised a toast
 * that named its time, "Emma — nap started 1:02 PM". On 2026-09-16 the owner reported "an empty
 * white small box" after Start pumping and asked for nothing to show "for an activity started (not
 * ended)", so the start toast was taken out. The next day the box was found to be the toast host
 * collapsing EVERY toast, a save's too (fixed 2026-09-17, `ui/toast.tsx`), but the start's
 * sentence never came back. Sleep alone kept a way to say it began earlier (2026-09-18, "Started ·
 * Now", one chip that opened the clock wheel). This file is what replaces both, on all four.
 *
 * THE CHOICES ARE FEW AND IN MINUTES. A parent held up by a crying baby is minutes late, not
 * hours: Now, −5m, −10m, and Custom for the clock wheel. Four chips fit one
 * line on a 360 dp phone (`startedRow.test.ts` measures it), which the owner asked of the time row
 * every sheet has (2026-09-26: "the options should show in 1 row").
 *
 * AN OFFSET IS PLACED WHEN IT IS TAPPED, as a picked time is (the audit of 2026-09-24, care M4). "10
 * min ago" tapped at 9:41 is 9:31, and stays 9:31 however long the sheet then sits open: the
 * clock beside the chips, the Start button's words and the start written are one instant.
 * "Now" is the tap on Start itself, exactly as a start always was.
 *
 * THREE LIMITS, each said before the tap and never applied in silence:
 *   * NEVER IN THE FUTURE. Every chip is in the past; a picked time later than now is last night
 *     (`applyCustom`), and a start is never later than the tap that writes it.
 *   * NEVER FURTHER BACK THAN THE EARLIER-START LIMIT (`START_EARLIER_FLOOR_MIN`, at least 2 h for
 *     every activity, and the kind's long-run limit when that is longer). Sleep has no earlier-start
 *     limit: a night can have begun many hours ago. It still cannot be in the future, and it is
 *     still held at the end of the last sleep. This is not `LONG_RUN_LIMIT_MIN`. That constant
 *     still decides only when the card asks "Still pumping?" and is left alone here.
 *   * NEVER INSIDE THE SAME BABY'S LAST ENTRY OF THE SAME KIND. A baby is not in two sleeps at once
 *     and a parent does not pump two sessions at once, so a start that would begin before that
 *     entry ended is HELD at its end, and the line under the chips says so (`TIMER_START.held`).
 *     The entry the parent logged first is the one the app keeps whole; either can be corrected.
 *
 * WHAT IS NOT CHECKED HERE: another RUNNING timer. The same kind for the same baby cannot run twice
 * (one per type and child, `startTimer`), and a sleep and tummy time of one baby are asked about in
 * `sleepPlay.ts`, which already ends the running one where the backdated start begins.
 */
import { LONG_RUN_LIMIT_MIN, type TimerType } from '@nibblecue/core';

export type StartChoice = 'now' | 'm5' | 'm15' | 'm30' | 'earlier';
/** A chip other than "Now": a start the parent said began earlier. */
export type EarlierChoice = Exclude<StartChoice, 'now'>;
export type OffsetChoice = 'm5' | 'm15' | 'm30';

/** The row's chips, in their order. */
// −5m · −15m · −30m since 2026-10-06 (the owner: "the gaps between −5 −10 −15 is too close. make it
// −5 −15 −30"), the five sharing the row equally (`SlotRow`)
export const START_CHOICES: readonly StartChoice[] = ['now', 'm5', 'm15', 'm30', 'earlier'];
/** The line under the two path tiles: every chip but "Now", which the Start tile already is. */
export const START_SHORTCUTS: readonly EarlierChoice[] = ['m5', 'm15', 'm30', 'earlier'];
export const START_OFFSET_MIN: Readonly<Record<OffsetChoice, number>> = { m5: 5, m15: 15, m30: 30 };

const MIN = 60_000;

export const isOffset = (c: StartChoice): c is OffsetChoice =>
  c === 'm5' || c === 'm15' || c === 'm30';

/**
 * A START THE PARENT CHOSE: which chip, the instant it came to, and when it was chosen. Null
 * anywhere this is held means "Now".
 */
export interface StartPick {
  choice: EarlierChoice;
  atMs: number;
  pickedAtMs: number;
}

/** An offset chip, placed when it is tapped (see the header). */
export function offsetPick(choice: OffsetChoice, pickedAtMs: number): StartPick {
  return { choice, atMs: pickedAtMs - START_OFFSET_MIN[choice] * MIN, pickedAtMs };
}

/**
 * WHERE CUSTOM OPENS THE CLOCK WHEEL when nothing earlier is chosen yet: forty-five minutes back,
 * the first quarter hour past the chips (−30m is the last of them since 2026-10-06), so the wheel starts where the parent's answer is likely to
 * be rather than at the one time they have just said is wrong. A place for a wheel to start, never
 * a time the app writes: nothing is taken until they choose one.
 */
export const EARLIER_OPENS_BACK_MS = 45 * MIN;

/**
 * How far back "Custom" may place a start, in minutes, before it is turned into milliseconds.
 * At least two hours for every activity. A kind whose "still going?" window is already longer
 * (a feed, three hours) keeps that longer window. Sleep is absent: no earlier-start limit.
 */
export const START_EARLIER_FLOOR_MIN = 120;

/** How far back a start may go, or null when the kind has no earlier-start limit (sleep). */
export const startLimitMs = (type: TimerType): number | null =>
  type === 'sleep' ? null : Math.max(START_EARLIER_FLOOR_MIN, LONG_RUN_LIMIT_MIN[type]) * MIN;

export type EarlierVerdict =
  { ok: true; pick: StartPick } | { ok: false; reason: 'tooEarly'; limitMs: number };

/**
 * "EARLIER…": a time off the clock wheel, already placed on its day by `applyCustom` against the
 * moment it was picked — or refused, when it lies further back than the kind's limit. It is never
 * later than the pick: `applyCustom` makes a later wall clock last night, and this holds it anyway.
 */
export function earlierPick(type: TimerType, atMs: number, pickedAtMs: number): EarlierVerdict {
  const limitMs = startLimitMs(type);
  const at = Math.min(atMs, pickedAtMs);
  if (limitMs !== null && pickedAtMs - at > limitMs)
    return { ok: false, reason: 'tooEarly', limitMs };
  return { ok: true, pick: { choice: 'earlier', atMs: at, pickedAtMs } };
}

/**
 * HELD AT THE END OF THE LAST ENTRY OF THE KIND (see the header): the chosen start, or that end
 * when the chosen start falls before it — never later than the tap.
 */
export function heldStart(chosenMs: number, lastEndMs: number | null, tapMs: number): number {
  if (lastEndMs === null || lastEndMs <= chosenMs) return chosenMs;
  return Math.min(lastEndMs, tapMs);
}

/** Whether the chosen start is held at the last entry's end, for the line that says so. */
export const isHeld = (chosenMs: number, lastEndMs: number | null): boolean =>
  lastEndMs !== null && lastEndMs > chosenMs;

/**
 * A ONE-TAP "STARTED EARLIER?" CHIP THAT WOULD BE HELD IS SAID BEFORE THE TAP (the owner, 2026-10-08:
 * "the button to start pump −30m does not work"). Since 2026-10-06 the chip under the tiles starts
 * its timer at once (pump, sleep, tummy time), and the StartBlock that used to say "The last pump
 * session ended at 9:35 PM, so the timer counts from then" before its Start went with the live page.
 * So a −30m tapped twenty minutes after the last pump ended was held at that end in silence: the
 * toast said a time a moment ago and the chip seemed dead. Now such a chip is faded and takes no tap
 * (the pump's end chips' answer to the same report, `PumpEndedRow`), and a line says why.
 *
 * `shortcutFloor` is the instant before which EVERY baby's start would be held — the earliest of
 * their last ends, or null when one of them has none (that baby's start would not be held, so the
 * chip still means something).
 */
export function shortcutFloor(lastEnds: readonly (number | null)[]): number | null {
  let floor: number | null = null;
  for (const end of lastEnds) {
    if (end === null) return null;
    floor = floor === null ? end : Math.min(floor, end);
  }
  return floor;
}

/** Whether an offset chip tapped at `nowMs` would be held at `floorMs` (see `shortcutFloor`). */
export const shortcutHeld = (
  choice: OffsetChoice,
  floorMs: number | null,
  nowMs: number,
): boolean => floorMs !== null && isHeld(nowMs - START_OFFSET_MIN[choice] * MIN, floorMs);

/**
 * THE START A TIMER IS WRITTEN WITH, for one baby, at the tap: "Now" is the tap; a pick is
 * the instant it was placed at, never later than the tap; and either is held at the end of that
 * baby's last entry of the kind.
 */
export function startAtTap(
  pick: StartPick | null,
  tapMs: number,
  lastEndMs: number | null,
): number {
  const chosen = pick === null ? tapMs : Math.min(pick.atMs, tapMs);
  return heldStart(chosen, lastEndMs, tapMs);
}

/**
 * A RUNNING TIMER IS STILL YOUNG for its first five minutes — the smallest offset. Its sheet then
 * offers the same chips to move its start (`RunningPanel`): a timer started with one tap, on a
 * Start tile or a CueCoin, whose parent says a moment later that it began ten minutes ago. Past
 * that, "−5m" would no longer mean what it says, and the sheet offers the start and the end
 * side by side. A pump's running sheet does neither: it asks when the pump ended (`pumpEnd.ts`).
 */
export const YOUNG_TIMER_MS = START_OFFSET_MIN.m5 * MIN;
export const isYoungTimer = (startedAtMs: number, nowMs: number): boolean =>
  nowMs - startedAtMs < YOUNG_TIMER_MS;

/**
 * A CHIP IN A YOUNG TIMER'S SHEET: counted back from the start as the sheet found it (`anchorMs`),
 * so tapping "−10m" twice moves it once, and "Now" puts it back where it was.
 */
export function correctionAt(choice: 'now' | OffsetChoice, anchorMs: number): number {
  return choice === 'now' ? anchorMs : anchorMs - START_OFFSET_MIN[choice] * MIN;
}
