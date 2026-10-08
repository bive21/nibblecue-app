/**
 * FIXED and RELATIVE rules (docs/SCHEDULE_LOGIC.md §5; NOTIFICATIONS.md §2–§3): a clock time
 * per local day that does not move, or an offset from an event of the day. Status uses the
 * same windows as an interval slot; a MISSED fixed slot never shifts tomorrow's.
 *
 * Matching across rules is `scheduleToday`'s job (nearest open slot wins, one session per
 * slot); this file computes the slot's instant and, given the session assigned to it, its
 * status.
 */
import { repeatsOn } from './repeat';
import { sessionsFor } from './sessions';
import { isBeforeStart, slotsBeginAt } from './start';
import { atWallTime, dayStartOf, dowOf } from './time';
import {
  MIN,
  RULE_DEFAULTS,
  missAtOf,
  occurrence,
  skipKey,
  type EngineContext,
  type Occurrence,
  type Rule,
  type Session,
} from './types';

/** The day's anchor events, resolved from the log (NOTIFICATIONS §2). */
export interface Anchors {
  wakeMs: number | null;
  lastFeedMs: number | null;
  bedtimeMs: number | null;
}

/**
 * WAKE = the end of the NIGHT sleep that overlaps the day start, else the first sleep end
 * today; LAST_FEED = the latest bottle or breastfeed start at or before now; BEDTIME = the
 * start of the NIGHT sleep begun today.
 */
export function resolveAnchors(
  sessions: readonly Session[],
  ctx: EngineContext,
  childId: string | null,
): Anchors {
  const { nowMs, dayStartMs } = ctx;
  const mine = sessions.filter(
    s => childId === null || s.childId === null || s.childId === childId,
  );
  const sleeps = mine.filter(s => s.type === 'sleep' && !s.running);
  const night = sleeps.find(
    s => s.sleepKind === 'NIGHT' && s.startMs < dayStartMs && (s.endMs ?? nowMs) >= dayStartMs,
  );
  const firstEnd = sleeps
    .filter(s => s.endMs !== null && s.endMs >= dayStartMs && s.endMs <= nowMs)
    .sort((a, b) => (a.endMs ?? 0) - (b.endMs ?? 0))[0];
  const feeds = mine
    .filter(s => (s.type === 'bottle' || s.type === 'breastfeed') && s.startMs <= nowMs)
    .sort((a, b) => b.startMs - a.startMs);
  const bed = sleeps.find(
    s => s.sleepKind === 'NIGHT' && s.startMs >= dayStartMs && s.startMs <= nowMs,
  );
  return {
    wakeMs: night?.endMs ?? firstEnd?.endMs ?? null,
    lastFeedMs: feeds[0]?.startMs ?? null,
    bedtimeMs: bed?.startMs ?? null,
  };
}

/** The slot's instant for the day, or null when the rule is not on today. `provisional`
 *  marks a RELATIVE slot computed from the household default because the event has not
 *  happened yet. */
export function slotTime(
  rule: Rule,
  ctx: EngineContext,
  anchors: Anchors,
): { atMs: number; provisional: boolean } | null {
  const { timeZone, dayStartMs, nowMs } = ctx;
  if (!repeatsOn(rule, dowOf(timeZone, dayStartMs))) return null;
  let atMs: number;
  let provisional = false;
  if (rule.ruleType === 'FIXED') {
    if (rule.atLocalTime === null) return null;
    atMs = atWallTime(timeZone, dayStartMs, rule.atLocalTime);
  } else if (rule.ruleType === 'RELATIVE') {
    const offset = (rule.offsetMinutes ?? 0) * MIN;
    let base: number | null;
    switch (rule.relativeTo) {
      case 'WAKE':
        base = anchors.wakeMs;
        if (base === null) {
          base = atWallTime(timeZone, dayStartMs, RULE_DEFAULTS.wakeDefault);
          provisional = true;
        }
        break;
      case 'BEDTIME':
        base = anchors.bedtimeMs;
        if (base === null) {
          base = atWallTime(timeZone, dayStartMs, RULE_DEFAULTS.bedtimeDefault);
          provisional = true;
        }
        break;
      case 'LAST_FEED':
        base = anchors.lastFeedMs;
        if (base === null) {
          base = nowMs;
          provisional = true;
        }
        break;
      default:
        return null;
    }
    atMs = base + offset;
  } else {
    return null;
  }
  // slots before the rule existed are not slots (CARE_ITEMS §4, every rule type) — except that a
  // rule the household started with lays its first day out whole, so the part before the
  // household can be skipped and fixed rather than vanish (`slotsBeginAt`, `start.ts`)
  if (atMs < slotsBeginAt(rule, ctx)) return null;
  return { atMs, provisional };
}

/** The status of a fixed slot given the session assigned to it (or none). */
export function fixedStatus(
  rule: Rule,
  atMs: number,
  matched: Session | null,
  ctx: EngineContext,
): Pick<Occurrence, 'status' | 'matchedId' | 'matchedAtMs' | 'minutesLate' | 'beforeStart'> {
  const win = rule.matchWindowMinutes * MIN;
  const none = {
    matchedId: null,
    matchedAtMs: null,
    minutesLate: null,
    beforeStart: false,
  } as const;
  if (ctx.skipped?.has(skipKey(rule.id, atMs))) {
    return { status: 'SKIPPED', ...none };
  }
  if (matched) {
    const late = matched.startMs > atMs + win;
    return {
      status: late ? 'LATE' : 'DONE',
      matchedId: matched.id,
      // the grid time is `atMs`; this is the minute it really happened
      matchedAtMs: matched.startMs,
      minutesLate: late ? Math.round((matched.startMs - atMs) / MIN) : null,
      beforeStart: false,
    };
  }
  // a slot from before the household existed, that nothing answered: skipped, never missed or
  // due — derived here every time, never stored (`Occurrence.beforeStart`, `start.ts`)
  if (isBeforeStart(rule, atMs, ctx)) return { status: 'SKIPPED', ...none, beforeStart: true };
  // MISSED begins where the late window closes — `missAtOf` says why the two used to disagree
  if (atMs + missAtOf(rule) < ctx.nowMs) return { status: 'MISSED', ...none };
  if (atMs <= ctx.nowMs) return { status: 'DUE', ...none };
  return { status: 'UPCOMING', ...none };
}

/**
 * Whether a session can satisfy a slot: inside ±window, or late inside the late window.
 *
 * A `DAY`-scoped rule asks a different question — "was it done today?" — so any session on the
 * slot's own local day satisfies it, however far from the clock time (§5b). `fixedStatus` still
 * calls it LATE outside the match window, which is the honest word: it was done, later than
 * planned. Without the zone (callers that have no context) a DAY rule falls back to the minute
 * windows rather than guessing at a day boundary.
 */
export function withinSlot(
  rule: Rule,
  atMs: number,
  s: Session,
  timeZone?: string | undefined,
): boolean {
  if (rule.matchScope === 'DAY' && timeZone !== undefined) {
    return dayStartOf(timeZone, s.startMs) === dayStartOf(timeZone, atMs);
  }
  const win = rule.matchWindowMinutes * MIN;
  const late = rule.lateWindowMinutes * MIN;
  return s.startMs >= atMs - win && (s.startMs <= atMs + win || s.startMs < atMs + late);
}

/**
 * One rule on its own — the tests' and the pump card's entry point. Matching is the nearest
 * session inside the window, the earliest late one otherwise; a second session in the same
 * window is an extra (§3 "Sessions that match no slot").
 */
export function fixedOccurrence(
  rule: Rule,
  sessions: readonly Session[],
  ctx: EngineContext,
  anchors: Anchors = resolveAnchors(sessions, ctx, rule.childId),
): Occurrence | null {
  const slot = slotTime(rule, ctx, anchors);
  if (slot === null) return null;
  const win = rule.matchWindowMinutes * MIN;
  const pool = sessionsFor(rule, sessions).filter(s => s.startMs <= ctx.nowMs);
  const onTime = pool
    .filter(s => Math.abs(s.startMs - slot.atMs) <= win)
    .sort((a, b) => Math.abs(a.startMs - slot.atMs) - Math.abs(b.startMs - slot.atMs))[0];
  const lateHit = onTime ? undefined : pool.find(s => withinSlot(rule, slot.atMs, s, ctx.timeZone));
  const matched = onTime ?? lateHit ?? null;
  return occurrence(rule, slot.atMs, 'UPCOMING', {
    ...fixedStatus(rule, slot.atMs, matched, ctx),
    provisional: slot.provisional,
  });
}
