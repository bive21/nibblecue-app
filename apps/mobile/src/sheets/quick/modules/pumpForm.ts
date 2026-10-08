/**
 * The pump sheet's arithmetic (PRODUCT_SPEC.md §6.3; DESIGN_SYSTEM §15), kept out of the
 * component so each rule is a table test. Both forms that finish a session, the stopped timer's
 * and "Already finished", hold one `PumpState` and move it only through the transitions below.
 *
 * BY SIDE OR TOTAL ONLY, ONE SMALL SWITCH (the owner, 2026-10-01, of the finished form: *"fix the
 * UI, because right now, there are too much numbers, especially with the grey bar that you put"*;
 * `setMode`, and `PumpAmounts` for the screen).
 *
 * From 2026-09-18 to 2026-10-01 there was no switch (the owner then: "just keep the 'one total' in
 * the same display, there is no need to pick one whether left and right or one total. Just add a
 * plus and minus in the total oz … and if the user clicks the plus or minus button in the total
 * instead, then the left and right module automatically turns off"). Every stepper stood on the
 * screen at once and the mode followed the stepper touched last, so the total was ALWAYS a
 * stepper: a second, full-width one under the two sides, its typed box a gray bar across the
 * sheet, saying the sum the sides already made — and the finished form said it a third time in a
 * pill. A parent who pumps by side read the same amount three ways; a parent whose pump gives one
 * number read two dimmed sides marked "not counted" over the one number they meant.
 *
 * So the way the pump reports is chosen, once, and the form shows only that way: By side, the two
 * sides are the steppers and their sum is said once as plain words; Total only, the total is the
 * one stepper and no side is drawn. A parent whose pump gives one number taps Total only once, and
 * the phone remembers it for the next pump (`pumpPrefill.ts`). Nothing is lost by the switch: it
 * moves the mode and never an amount, so the sides wait under Total only and a typed total waits
 * under By side, and a switch there and back changes nothing.
 *
 * "Total only" is still what gets WRITTEN for a one-number pump: both sides null and the total as
 * typed — never split in half, which would be a claim the parent did not make.
 */
const MIN = 60_000;

export type PumpMode = 'side' | 'total';

export interface PumpAmounts {
  leftMl: number;
  rightMl: number;
  totalMl: number;
}

export interface PumpState {
  mode: PumpMode;
  amounts: PumpAmounts;
}

/**
 * What the total reads right now: the parent's own number in total mode, the live sum in side
 * mode. One function so the readout, the stepper's value and the saved total cannot disagree.
 */
export const shownTotal = ({ mode, amounts }: PumpState): number =>
  mode === 'total' ? amounts.totalMl : amounts.leftMl + amounts.rightMl;

/**
 * THE SWITCH: By side or Total only. It moves the mode and NOTHING ELSE (see the header).
 *
 *   * To Total only, the total stepper starts on the total the form holds: the sides' sum, which
 *     `setSide` keeps it equal to, or a total typed before a trip to By side that touched no side.
 *   * To By side, the sides are what they were. A total is never split into them: half of 4 oz on
 *     each side is a claim the parent did not make, so a form that only ever held a total shows
 *     its sides at nothing, and the readout says so.
 *
 * So the amounts are carried, untouched, both ways, and every reader goes through `shownTotal`.
 */
export const setMode = (s: PumpState, mode: PumpMode): PumpState =>
  s.mode === mode ? s : { mode, amounts: s.amounts };

/**
 * The parent moved the TOTAL stepper (drawn only under Total only). The sides are not cleared,
 * because clearing them would throw away a number the parent typed, and they are the thing to
 * return to.
 */
export const setTotal = (s: PumpState, totalMl: number): PumpState => ({
  mode: 'total',
  amounts: { ...s.amounts, totalMl },
});

/**
 * The parent moved a SIDE stepper (drawn only By side). The total follows the sides immediately,
 * in the same state update: a total that lagged one tap behind the sides was the first bug this
 * form had (2026-09-18).
 *
 * A form that held only a total keeps the other side as it was, usually zero, which is honest: a
 * parent who typed 90 into the total and then sets Left to 50 has said the left side was 50. They
 * have not said the right was 40, and the app must not say it for them.
 */
export function setSide(s: PumpState, side: 'left' | 'right', ml: number): PumpState {
  const amounts = side === 'left' ? { ...s.amounts, leftMl: ml } : { ...s.amounts, rightMl: ml };
  return { mode: 'side', amounts: { ...amounts, totalMl: amounts.leftMl + amounts.rightMl } };
}

/** What gets written: the two sides, or the one total with no invented split. */
export function pumpOutput(
  mode: PumpMode,
  a: PumpAmounts,
): { leftMl: number | null; rightMl: number | null; totalOnlyMl: number | null; totalMl: number } {
  if (mode === 'total') {
    return { leftMl: null, rightMl: null, totalOnlyMl: a.totalMl, totalMl: a.totalMl };
  }
  return {
    leftMl: a.leftMl > 0 ? a.leftMl : null,
    rightMl: a.rightMl > 0 ? a.rightMl : null,
    totalOnlyMl: null,
    totalMl: a.leftMl + a.rightMl,
  };
}

/**
 * A FINISHED SESSION TYPED IN, COUNTED BACK FROM ITS END (the owner, 2026-09-26: *"it shouldn't be
 * start time logically i think, it would make more sense to do 'end time' now since we are recording
 * 'already finished' event, and simplify the words Start time to become end time, just finished to
 * now"*).
 *
 * The pump's "Already finished" row is the session's END, as the sleep, breastfeed and tummy-time
 * rows are: `end` is the row's instant — Now, −15m, −30m, Custom, or a slot's time plus the
 * length until the row is touched (`finishedEnd`) — and `start = end − How long`. Stored as ever:
 * `start_at` and `end_at`, the same two columns meaning the same two things.
 *
 * It was a START until then (the owner's own earlier word: prototype block 44, UX_AUDIT §4.44),
 * with a first chip of "Just finished" (2026-09-25) to stop "Now" meaning a session that had only
 * just begun — and with it a rule that moved a start whose session would still be running back to
 * end now, and a sentence to say so. A parent answering "already finished" knows when they
 * stopped; they had to work out when they began. From the end, the default (Now) is a session that ended as the sheet
 * opened with nothing to move, and every chip is a time that has already happened.
 *
 * NEVER AN END IN THE FUTURE — the guarantee the start row kept by moving the start, kept here the
 * same way: an end past `nowMs` is held at `nowMs`, the length the parent typed is kept, and the
 * start moves back with it. Every way the row is set already lands at or before now (the presets
 * resolve against the sheet's opening, a picked time later than now is last night's, a slot's end
 * is capped at the opening), so this only ever takes in the seconds a picked minute runs ahead of
 * the sheet's 15-second clock, or the minute of slack a correction's pick allows (`pickedNear`) —
 * which is why nothing on the sheet announces it any more.
 */
export function pumpSession(
  endAtMs: number,
  minutes: number,
  nowMs: number,
): { startMs: number; endMs: number } {
  const length = Math.max(0, minutes) * MIN;
  const endMs = Math.min(endAtMs, nowMs);
  return { startMs: endMs - length, endMs };
}
