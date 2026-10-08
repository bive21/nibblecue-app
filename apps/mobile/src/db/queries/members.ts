/**
 * THE HOUSEHOLD'S SEATS, READ FROM THE LOCAL MIRROR of `household_members` (pulled whole every pass,
 * `PULL_STRATEGY` `full`), for the Log together card (docs/SHARED_CARE.md §6).
 *
 * EVERY ROW, THE REMOVED INCLUDED. The server returns a member who left with `removed_at` set, so
 * the name on every entry they logged survives (migration 0113), and the card reads that too: a
 * parent who has left is a household the card must never ask "parenting with someone?". Which of
 * the rows are somebody NOW (not removed, not on a seat that has ended) is core's arithmetic,
 * `householdCompany`, so it is tested in node with a clock the test holds.
 *
 * Local first, like every read in this app: the card is decided on a train as it is at home.
 */
import type { HouseholdSeat, Role } from '@nibblecue/core';
import type { Db } from '../driver';

export async function householdSeats(db: Db, householdId: string): Promise<HouseholdSeat[]> {
  const rows = await db.all<{
    user_id: string;
    role: Role;
    removed_at: string | null;
    expires_at: string | null;
  }>(
    `select user_id, role, removed_at, expires_at
       from household_members
      where household_id = ? and deleted_at is null
      order by user_id`,
    [householdId],
  );
  return rows.map(r => ({
    userId: r.user_id,
    role: r.role,
    removedAt: r.removed_at ?? null,
    expiresAt: r.expires_at ?? null,
  }));
}
