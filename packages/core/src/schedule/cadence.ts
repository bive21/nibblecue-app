/**
 * CADENCE rules — rhythms measured in days (docs/SCHEDULE_LOGIC.md §5b): every N days since
 * the last logged one, or chosen weekdays, always with a reminder time. Matching is by DAY:
 * a bath at 07:00 counts for a rule set to 18:30. Overdue collapses onto today — one DUE slot,
 * never a column of MISSED days — and once today's is done the next day is generated as a
 * look-ahead row so Today can say "next bath Saturday".
 */
import { sessionsFor } from './sessions';
import { isBeforeStart } from './start';
import { atWallTime, dayPlus, dayStartOf, dowOf } from './time';
import {
  occurrence,
  skipKey,
  type EngineContext,
  type Occurrence,
  type Rule,
  type Session,
} from './types';

/** The first day at or after `dayMs` whose weekday is listed. */
function nextListedDay(timeZone: string, dayMs: number, dows: readonly number[]): number {
  for (let i = 0; i < 8; i++) {
    const d = dayPlus(timeZone, dayMs, i);
    if (dows.includes(dowOf(timeZone, d))) return d;
  }
  return dayMs;
}

export function cadenceOccurrences(
  rule: Rule,
  sessions: readonly Session[],
  ctx: EngineContext,
): Occurrence[] {
  const { timeZone, nowMs, dayStartMs } = ctx;
  const at = rule.atLocalTime ?? '18:30';
  const timeOn = (dayMs: number): number => atWallTime(timeZone, dayMs, at);
  const pool = sessionsFor(rule, sessions).filter(s => s.startMs <= nowMs);
  const last = pool[pool.length - 1] ?? null;
  const lastDay = last ? dayStartOf(timeZone, last.startMs) : null;
  const dows = rule.repeatDays ?? [];
  const useDows = dows.length > 0;
  const everyDays = Math.max(1, rule.everyDays ?? 1);

  let dueDay = useDows
    ? nextListedDay(timeZone, dayStartMs, dows)
    : lastDay !== null
      ? dayPlus(timeZone, lastDay, everyDays)
      : dayStartMs;
  // overdue collapses onto today: four days without a bath is one bath that is due
  if (!useDows && dueDay < dayStartMs) dueDay = dayStartMs;

  const out: Occurrence[] = [];
  const hit = pool.find(s => dayStartOf(timeZone, s.startMs) === dayStartMs) ?? null;
  if (hit) {
    // logged today, at any hour: today is DONE, and the next day is said (§5b worked rows)
    out.push(
      occurrence(rule, timeOn(dayStartMs), 'DONE', {
        matchedId: hit.id,
        matchedAtMs: hit.startMs,
      }),
    );
    const next = useDows
      ? nextListedDay(timeZone, dayPlus(timeZone, dayStartMs, 1), dows)
      : dayPlus(timeZone, dayStartMs, everyDays);
    out.push(occurrence(rule, timeOn(next), 'UPCOMING', { future: true }));
  } else if (dueDay === dayStartMs) {
    const atMs = timeOn(dayStartMs);
    /*
      A SKIP IS TODAY'S ANSWER, as it is for every other kind of rule (`fixedStatus`, the interval
      walk). A slot's sheet offers Skip on a bath's row like any other, and this was the one place
      that never asked `ctx.skipped`: the skip was stored, and the bath stayed on Up next, went due
      at 6:30 and rang anyway (the pre-release sweep, 2026-09-24). Nothing else changes — with no
      bath logged the rhythm is still overdue, so tomorrow's is due.
    */
    const skipped = ctx.skipped?.has(skipKey(rule.id, atMs)) === true;
    /*
      …AND ON THE HOUSEHOLD'S FIRST DAY, A TIME FROM BEFORE IT EXISTED IS SKIPPED, not due: the
      6:30 PM bath of a household that began at 7 PM was nobody's to give (`start.ts`, the owner,
      2026-09-25). Derived, never stored; a bath logged that day still makes it DONE above, and
      with none logged the rhythm is still owed, so tomorrow's is due exactly as after a skip.
    */
    if (!skipped && isBeforeStart(rule, atMs, ctx)) {
      out.push(occurrence(rule, atMs, 'SKIPPED', { beforeStart: true }));
      return out;
    }
    out.push(occurrence(rule, atMs, skipped ? 'SKIPPED' : atMs <= nowMs ? 'DUE' : 'UPCOMING'));
  } else {
    out.push(occurrence(rule, timeOn(dueDay), 'UPCOMING', { future: true }));
  }
  return out;
}
