/**
 * THE HOUSEHOLD'S PEOPLE AND THEIR PICTURES, FROM THE LOCAL MIRROR (migration 0148): every seat the
 * pull brought (`household_members`, pulled whole) beside the three picture columns of the person's
 * profile (pulled by delta). Local first, like every read here: the top bar, who's on and the log
 * draw a person's picture on a train as they do at home.
 *
 * EVERY SEAT, THE ENDED ONES INCLUDED, and which of them are somebody NOW is decided by whoever
 * reads it, with the clock it holds (`seatLive`): a seat that ended, or a member who left, is drawn
 * with the initial and their picture is swept off this phone (`sweepMemberPhotos`), because the
 * server lets nobody read it any more (`member_photo_read`).
 */
import type { Db } from '../driver';

export interface MemberPictureSeat {
  id: string;
  removed_at: string | null;
  expires_at: string | null;
  avatar_path: string | null;
  avatar_preset: string | null;
  avatar_updated_at: string | null;
}

export async function memberPictureSeats(
  db: Db,
  householdId: string,
): Promise<MemberPictureSeat[]> {
  return db.all<MemberPictureSeat>(
    `select m.user_id as id, m.removed_at as removed_at, m.expires_at as expires_at,
            p.avatar_path as avatar_path, p.avatar_preset as avatar_preset,
            p.avatar_updated_at as avatar_updated_at
       from household_members m
       left join profiles p on p.id = m.user_id
      where m.household_id = ? and m.deleted_at is null
      order by m.user_id`,
    [householdId],
  );
}

/** A seat that is somebody now: not left, and not past its end — `app.is_member`'s clause. */
export const seatLive = (
  seat: Pick<MemberPictureSeat, 'removed_at' | 'expires_at'>,
  nowMs: number,
): boolean =>
  seat.removed_at === null && (seat.expires_at === null || !(Date.parse(seat.expires_at) <= nowMs));
