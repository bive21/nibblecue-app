/**
 * THE HEALTH NOTE SHEET'S ARITHMETIC (the owner, 2026-10-08), pure so every rule is a node test.
 *
 *   * `movedToDay` — the start's day. The time row (`Now · −15m · −30m · Custom`) answers "what
 *     time", and a Custom later than now is last night (D13), which covers the parent's own example
 *     ("solid food was eaten at 7pm. and allergic showed up the next day"). A note written two days
 *     on needs the day too, so the row under it moves the start to another day at the same clock
 *     time, never later than now (`pickedDate`, the editor's own rule for a measurement's day).
 *   * `endProblem` — a stop before the start, or later than now, is said and never saved.
 *   * `lookBackDays` — the look back's list in days, oldest first, the way the Log groups by day.
 *
 * Nothing here interprets: a time is what the parent chose.
 */
import { dayHeading, localDayKey, type LookBackItem, type TodayActivity } from '@nibblecue/core';
import { END_AFTER_NOW, END_BEFORE_START, pickedDate } from '../../../entry/editor';

/** A minute of slack for "now", as the editor allows (`rangeError`). */
const NOW_SLACK_MS = 60_000;

/** The same clock time on the day picked (`yyyy-mm-dd`), in the household's zone, never past now. */
export function movedToDay(dayKey: string, atMs: number, nowMs: number, timeZone: string): number {
  return pickedDate(dayKey, atMs, nowMs, timeZone);
}

/** Why the stop cannot be saved, or null. Still going (no end) is always fine. */
export function endProblem(startMs: number, endMs: number | null, nowMs: number): string | null {
  if (endMs === null) return null;
  if (endMs < startMs) return END_BEFORE_START;
  if (endMs > nowMs + NOW_SLACK_MS) return END_AFTER_NOW;
  return null;
}

/** Today, Yesterday or `Mon, Oct 5` — the Log's own words for a day. */
export const dayLabel = (atMs: number, nowMs: number, timeZone: string): string =>
  dayHeading(localDayKey(timeZone, atMs), nowMs, timeZone);

export interface LookBackDay<T extends TodayActivity> {
  dayKey: string;
  heading: string;
  items: LookBackItem<T>[];
}

/** The look back's items, oldest first, in days. The order is core's; this only draws the days. */
export function lookBackDays<T extends TodayActivity>(
  items: readonly LookBackItem<T>[],
  nowMs: number,
  timeZone: string,
): LookBackDay<T>[] {
  const days: LookBackDay<T>[] = [];
  for (const item of items) {
    const dayKey = localDayKey(timeZone, item.entry.startMs);
    const last = days[days.length - 1];
    if (last !== undefined && last.dayKey === dayKey) last.items.push(item);
    else days.push({ dayKey, heading: dayHeading(dayKey, nowMs, timeZone), items: [item] });
  }
  return days;
}
