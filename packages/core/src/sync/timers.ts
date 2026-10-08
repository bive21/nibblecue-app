/**
 * Timer arithmetic and the overlapping-timer merge.
 *
 * Hard rule 12: timers are timestamps, not intervals. Elapsed is always derived from
 * `started_at` and `paused_ms`, so a timer survives app kill, lock, reboot and handover, and a
 * timer started offline shows the right elapsed time the moment it syncs.
 */
import type { TimerType } from './types';

/** The mergeable fields of `running_timers`; `meta`, `created_at` and `updated_at` are the
 *  server's and never participate. */
export interface TimerState {
  id: string;
  household_id: string;
  child_id: string | null;
  type: TimerType;
  started_at: string;
  paused_ms: number;
  active_side: 'LEFT' | 'RIGHT' | null;
  side_started_at: string | null;
  left_seconds: number;
  right_seconds: number;
  started_by: string;
}

function at(iso: string, what: string): number {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) throw new TypeError(`${what} is not a parseable timestamp: ${iso}`);
  return ms;
}

/**
 * Resolve two running timers of the same type for the same child into one.
 *
 * `running_timers_uniq` makes two such rows impossible server-side, so when two devices start one
 * offline the second insert hits the constraint. It is not rejected: a parent's real start time is
 * the truth, so the EARLIER `started_at` wins and carries `started_by`, `active_side` and
 * `side_started_at` with it. The counters take `greatest()` because each device only ever counted
 * up — taking the winner's would throw away minutes the other device genuinely observed.
 *
 * A tie on `started_at` is broken by the lower `id` so that both devices, and the server, reach
 * the same answer without another round trip.
 */
export function mergeTimers(a: TimerState, b: TimerState): TimerState {
  const aAt = at(a.started_at, 'a.started_at');
  const bAt = at(b.started_at, 'b.started_at');
  const winner = aAt < bAt || (aAt === bAt && a.id <= b.id) ? a : b;
  return {
    ...winner,
    paused_ms: Math.max(a.paused_ms, b.paused_ms),
    left_seconds: Math.max(a.left_seconds, b.left_seconds),
    right_seconds: Math.max(a.right_seconds, b.right_seconds),
  };
}

/**
 * ONE TIMER PER SCOPE, out of a mirror that is allowed to hold two.
 *
 * `running_timers_uniq` makes a duplicate impossible ON THE SERVER, and two local reads were
 * written against that fact — `runningTimerFor`'s docblock said "this at most one row", and
 * `timersNow` mapped every row it found. The LOCAL mirror can genuinely hold two, deliberately:
 * `./local/apply.ts`'s `sweep` keeps a row this device still owes the server alongside the row the
 * server returned, because deleting it "would take a running timer off the screen mid-nap and,
 * if that op later FAILED, lose it outright". That is rules 7 and 12 in one, and it is right.
 *
 * So the divergence is by design and the mirror must NOT carry the server's unique index — an
 * insert during that window would throw and stall the pull. What the SCREEN must not do is show
 * two running sleep timers for one baby, or bind a sheet to whichever of the two SQLite happened
 * to return first. This folds them with `mergeTimers`, so the phone shows the row the server will
 * arbitrate to, before the round trip that proves it.
 *
 * Generic over the row so a caller's extra columns (`meta`) survive the fold: the merge decides
 * WHICH row wins and what the three counters are, and the winner's own row carries the rest.
 */
export function collapseTimers<T extends TimerState>(rows: readonly T[]): T[] {
  if (rows.length < 2) return [...rows];
  const byScope = new Map<string, T>();
  for (const row of rows) {
    // NUL-joined: a household id, a type and a child id can none of them contain one, so two
    // different scopes can never collide on the key the way `${a}-${b}` lets them
    const key = `${row.household_id}\u0000${row.type}\u0000${row.child_id ?? ''}`;
    const held = byScope.get(key);
    if (held === undefined) {
      byScope.set(key, row);
      continue;
    }
    const merged = mergeTimers(held, row);
    const winner = merged.id === held.id ? held : row;
    byScope.set(key, {
      ...winner,
      paused_ms: merged.paused_ms,
      left_seconds: merged.left_seconds,
      right_seconds: merged.right_seconds,
    });
  }
  return [...byScope.values()];
}

/** `now - started_at - paused_ms`, never negative. The only definition of elapsed in the product. */
export function elapsedMs(
  timer: Pick<TimerState, 'started_at' | 'paused_ms'>,
  nowMs: number,
): number {
  return Math.max(0, nowMs - at(timer.started_at, 'started_at') - timer.paused_ms);
}

/**
 * Per-side milliseconds for a breastfeed timer: the banked seconds plus, for whichever side is
 * running, the time since it started. A paused timer has no `side_started_at` and simply banks.
 */
export function sideMs(
  timer: Pick<TimerState, 'active_side' | 'side_started_at' | 'left_seconds' | 'right_seconds'>,
  nowMs: number,
): { left: number; right: number } {
  const banked = { left: timer.left_seconds * 1000, right: timer.right_seconds * 1000 };
  if (timer.active_side === null || timer.side_started_at === null) return banked;
  const running = Math.max(0, nowMs - at(timer.side_started_at, 'side_started_at'));
  return timer.active_side === 'LEFT'
    ? { left: banked.left + running, right: banked.right }
    : { left: banked.left, right: banked.right + running };
}
