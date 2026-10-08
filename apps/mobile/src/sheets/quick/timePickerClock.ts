/**
 * WALL CLOCK ↔ DATE for the platform time picker (`timePicker.tsx`).
 *
 * The picker only ever answers "which hour and minute": the sheet's `applyCustom` decides which
 * day a chosen 11:50 PM belongs to. These helpers keep that contract pure so a Done tap on iOS
 * cannot invent a different minute from a stale React render (`timePickerClock.test.ts`).
 */
import type { WallClock } from '@nibblecue/ui';

/** Hours and minutes from a Date the platform picker produced (device-local). */
export const wallClockFromDate = (d: Date): WallClock => ({
  hours: d.getHours(),
  minutes: d.getMinutes(),
});

/**
 * A Date carrying the given wall clock on the calendar day of `nowMs` (device-local). Only hour
 * and minute are read back; seconds are cleared so a spinner and a chip agree on the minute.
 */
export function dateFromWallClock(w: WallClock, nowMs: number = Date.now()): Date {
  const d = new Date(nowMs);
  d.setHours(w.hours, w.minutes, 0, 0);
  return d;
}

/**
 * THE VALUE DONE MUST KEEP on iOS: the last time `onValueChange` reported, not the Date React
 * last painted into the button's closure. Android never needs this — its dialog settles inside
 * `onValueChange` with the event's own Date. On iPhone the spinner updates state while the
 * parent scrolls, and Done can fire in the same turn before that state has re-rendered, so a
 * closure over `ios` still held the opening time (often the timer's "now") and the earlier
 * start never applied.
 */
export function settleWallClock(
  latest: Date | null,
  fromDate: (d: Date) => WallClock = wallClockFromDate,
): WallClock | null {
  return latest === null ? null : fromDate(latest);
}
