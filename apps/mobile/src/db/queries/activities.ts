/**
 * What is left of the first activity-read layer (WP5.1): the household's home zone, and the
 * `ChildScope` the detail reads (`details.ts`) take. **The app reads local, always** (CLAUDE.md
 * §5), and every read here runs against SQLite with no network.
 *
 * THE ACTIVITY READS THEMSELVES ARE `today.ts`'s — Today's rows and each type's newest
 * (`todayActivities`, `lastActivities`), the Log's keyset pages (`timelineRows`) and the catch-up
 * card's (`catchupRows`). This file's own `lastOf`, `totalsByType`, `timelinePage`,
 * `queuedActivityIds`, `activityById` and a second `localDayBounds` went on 2026-09-26: nothing in
 * the app ran them any more, and the device budget (`sync/budget.test.ts`) that timed three of
 * them now times the reads Today and the Log really make. The rules their tests pinned — a
 * soft-deleted row is never read, a child's view includes the household's rows, pages are keyset,
 * an unconfirmed row says so — are pinned on those reads in `today.test.ts`, and the household's
 * own day (a DST gap at midnight included) on `localDayBounds` in `@nibblecue/core`.
 */
import type { Db } from '../driver';

/**
 * The household's home zone as its row holds it — null before the row has arrived. Home is what
 * "away" is measured from and what an entry falls back to when the phone has no record of where
 * it was; the zone the app READS in is `useTimeZone`'s.
 */
export async function homeTimeZone(db: Db, householdId: string): Promise<string | null> {
  const row = await db.get<{ home_time_zone: string | null }>(
    'select home_time_zone from households where id = ? and deleted_at is null',
    [householdId],
  );
  return row?.home_time_zone ?? null;
}

/** Whose rows a detail read looks at. */
export interface ChildScope {
  householdId: string;
  /** `null` reads the household-level rows (pump, and anything not child-scoped). */
  childId: string | null;
}
