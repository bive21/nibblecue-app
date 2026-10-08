/**
 * Reads over `running_timers`. The row IS the timer (`docs/MOBILE.md` §6 rule 1): nothing here
 * computes elapsed time, because `elapsedMs` and `sideMs` in `packages/core` do that from the
 * row and a `now`, and a second implementation would be a second answer.
 *
 * There is no `deleted_at` to filter. A stop is a physical delete — `timers_write` is `for all`
 * on the server and the local row goes in the stop's own transaction — so a timer that is not
 * here is a timer that is not running. That is also why its pull strategy is `full`: absence is
 * the removal, and a tombstone can never arrive.
 */
import { collapseTimers, type TimerType } from '@nibblecue/core';
import type { Db } from '../driver';

/** A running timer as the mirror holds it: SQLite integers where the domain has booleans. */
export interface RunningTimerRow {
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
  meta: string;
}

const COLUMNS =
  'id, household_id, child_id, type, started_at, paused_ms, active_side, side_started_at, left_seconds, right_seconds, started_by, meta';

/**
 * Every timer this household has running, oldest first — and ONE PER SCOPE.
 *
 * `running_timers_uniq` makes a second timer of a type for a child impossible on the SERVER, and
 * this file used to be written as if that settled it. The mirror can hold two, on purpose: a
 * timer started in airplane mode is a local row plus a PENDING op, and `sync/apply.ts`'s `sweep`
 * refuses to delete it when a pull returns the other parent's row for the same scope first —
 * deleting it would take a running timer off the screen mid-nap and lose it if the op later
 * failed. So the DIVERGENCE IS DELIBERATE and the mirror must not carry the server's index; what
 * must not diverge is the screen, which may never show one baby with two running sleep timers.
 *
 * `collapseTimers` folds the pair with the same rule the server arbitrates with (`mergeTimers`:
 * the earlier start wins, a tie breaks on the lower id, the counters take the max), so the phone
 * shows the row the push will settle on before the round trip that settles it.
 */
export async function runningTimers(db: Db, householdId: string): Promise<RunningTimerRow[]> {
  const rows = await db.all<RunningTimerRow>(
    `select ${COLUMNS} from running_timers where household_id = ? order by started_at asc`,
    [householdId],
  );
  // the fold is by scope, so re-sort: a merged winner may be older than the row it replaced
  return collapseTimers(rows).sort((a, b) => a.started_at.localeCompare(b.started_at));
}

/**
 * The timer of one type for one child, if it is running — at most one row, because
 * `runningTimers` has already folded the reconnect-window pair above.
 *
 * It was a `db.get` over the same `where`, which returns an ARBITRARY one of two rows in that
 * window: a sheet could bind to the timer that was about to lose and show a start time the next
 * pull would move. One timer of a type per child, and pump is per household with
 * `child_id = null` (`docs/MOBILE.md` §6).
 */
export async function runningTimerFor(
  db: Db,
  householdId: string,
  type: TimerType,
  childId: string | null,
): Promise<RunningTimerRow | undefined> {
  const rows = await runningTimers(db, householdId);
  return rows.find(r => r.type === type && r.child_id === childId);
}
