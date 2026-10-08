/**
 * Counts of what happened against what was scheduled (docs/SCHEDULE_LOGIC.md §10). Counts
 * only: no streaks, no scores, no "you're doing great". A missed slot is a fact about a day,
 * not a verdict on a parent.
 */
import type { Occurrence } from './types';

export interface Adherence {
  scheduled: number;
  done: number;
  late: number;
  missed: number;
  skipped: number;
  /** slots a GAP stood for, added so the arithmetic stays right */
  expectedFromGaps: number;
  /** done + late over everything scheduled (gaps included), 0–100 */
  completionPct: number;
  /**
   * SLOTS THAT HAVE ACTUALLY COME ROUND — done, late and missed, without the ones still ahead.
   *
   * `completionPct` divides by the WHOLE day, so at three in the afternoon a household that had
   * logged every slot so far read "29% of today's slots" and the Schedule tab's headline read
   * "7 of 24 done today" (the schedule audit's B2, 2026-09-19). Both are arithmetically true and
   * both say a thing about the parent that is false: the other seventeen have not happened yet.
   * A percentage of a day that is still running is not a measurement, and this app does not keep
   * a score of anybody — §10's "counts only, no streaks, no 'you're doing great'" cuts the same
   * way when the number is low.
   *
   * A SKIP IS NOT IN EITHER COLUMN. It was a decision, not a failure and not a success, which is
   * the whole reason `skipped` is counted apart (§3).
   */
  passed: number;
  /** done + late over `passed`, 0–100; 0 when nothing has come round yet. */
  passedPct: number;
  /** Slots still ahead of the household today. */
  toCome: number;
  /**
   * SLOTS FROM BEFORE THE HOUSEHOLD EXISTED, left unanswered on its first day (`beforeStart`;
   * the owner, 2026-09-25). They are in NO other number here — not `scheduled`, not `skipped`,
   * not the day's "x of y": nobody was asked about them, so they are not a share of the day in
   * either direction. The day's list still shows each one, and the moment one is answered with
   * its real time it is an ordinary done slot and counts like one.
   */
  beforeStart: number;
}

export function adherence(occurrences: readonly Occurrence[]): Adherence {
  const listed = occurrences.filter(o => !o.future);
  const beforeStart = listed.filter(o => o.beforeStart === true).length;
  const today = listed.filter(o => o.beforeStart !== true);
  const done = today.filter(o => o.status === 'DONE').length;
  const late = today.filter(o => o.status === 'LATE').length;
  const missed = today.filter(o => o.status === 'MISSED').length;
  const skipped = today.filter(o => o.status === 'SKIPPED').length;
  const expectedFromGaps = today
    .filter(o => o.status === 'GAP')
    .reduce((s, o) => s + o.expectedCount, 0);
  const scheduled = today.filter(o => o.status !== 'GAP').length + expectedFromGaps;
  const passed = done + late + missed + expectedFromGaps;
  return {
    scheduled,
    done,
    late,
    missed,
    skipped,
    expectedFromGaps,
    completionPct: scheduled === 0 ? 0 : Math.round(((done + late) / scheduled) * 100),
    passed,
    passedPct: passed === 0 ? 0 : Math.round(((done + late) / passed) * 100),
    toCome: Math.max(0, scheduled - passed - skipped),
    beforeStart,
  };
}
