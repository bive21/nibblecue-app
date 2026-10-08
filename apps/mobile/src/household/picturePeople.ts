/**
 * WHOSE PICTURES THIS PHONE DRAWS, AND WHICH READING OF EACH IT BELIEVES (migration 0148). Pure, so
 * every rule is a node test (`picturePeople.test.ts`); `MemberPictures.tsx` turns the answer into
 * files.
 *
 * THREE SOURCES, ONE PERSON EACH:
 *   - the mirror's seats (`memberPictureSeats`): everyone the household's pull brought, whose seat
 *     is live now (`seatLive`);
 *   - rows a screen read itself (the Family page's roster, `household_roster`): live by
 *     definition, and fresher than the mirror when it was read after the last pull;
 *   - the viewer's own account read, which is fresh after every change the viewer makes.
 * Where two name the same person, the later stamp wins (`laterPicture`); the stamp moves on every
 * change, a removal included, so the later one is the later truth.
 *
 * NOBODY ELSE: a member who left, or whose seat ended, is not in the answer. They are drawn with the
 * initial, and whatever this phone kept of their picture is swept (`sweepMemberPhotos`).
 */
import {
  laterPicture,
  memberPictureOf,
  type MemberPicture,
  type MemberPictureColumns,
} from '@nibblecue/core';
import { seatLive, type MemberPictureSeat } from '../db/queries/memberPictures';
import type { WaitingPicture } from './pictureWaiting';

/** A row a screen read with a person's picture on it: the roster's `MemberRow` has this shape. */
export interface LearnedPicture extends MemberPictureColumns {
  user_id: string;
}

const columnsOf = (c: MemberPictureColumns): MemberPictureColumns => ({
  avatar_path: c.avatar_path ?? null,
  avatar_preset: c.avatar_preset ?? null,
  avatar_updated_at: c.avatar_updated_at ?? null,
});

export function picturePeople(input: {
  viewer: string | null;
  /** The viewer's own profile from the account read, or null before one. */
  account: MemberPictureColumns | null;
  seats: readonly MemberPictureSeat[];
  learned: readonly LearnedPicture[];
  nowMs: number;
}): Map<string, MemberPictureColumns> {
  const out = new Map<string, MemberPictureColumns>();
  for (const seat of input.seats) {
    if (!seatLive(seat, input.nowMs)) continue;
    out.set(seat.id.toLowerCase(), columnsOf(seat));
  }
  for (const row of input.learned) {
    const id = row.user_id.toLowerCase();
    const seen = out.get(id);
    // the screen's own read first: on a tie it is the fresher of the two
    out.set(id, seen === undefined ? columnsOf(row) : laterPicture(columnsOf(row), seen));
  }
  if (input.viewer !== null) {
    const id = input.viewer.toLowerCase();
    const seen = out.get(id);
    const own = input.account === null ? null : columnsOf(input.account);
    out.set(
      id,
      own === null ? (seen ?? columnsOf({})) : seen === undefined ? own : laterPicture(own, seen),
    );
  }
  return out;
}

/** Which of the three the viewer's picture is: what the picture sheet marks as chosen. */
export type MyPicture = { kind: 'photo' } | { kind: 'drawing'; id: string } | { kind: 'initial' };

/** What the viewer's picture is now, the choice still waiting for the network first. */
export function myPicture(
  viewer: string,
  columns: MemberPictureColumns | undefined,
  waiting: WaitingPicture | null,
): MyPicture {
  if (waiting !== null) {
    if (waiting.kind === 'photo') return { kind: 'photo' };
    if (waiting.kind === 'drawing') return { kind: 'drawing', id: waiting.id };
    return { kind: 'initial' };
  }
  const now: MemberPicture = memberPictureOf(viewer, columns ?? {});
  return now.kind === 'photo' ? { kind: 'photo' } : now;
}

/** What changing the picture set asks the resolution pass to do again: every input, as text. */
export function pictureKey(
  people: ReadonlyMap<string, MemberPictureColumns>,
  viewer: string | null,
  waiting: WaitingPicture | null,
): string {
  const rows = [...people.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(
      ([id, c]) =>
        `${id}:${c.avatar_path ?? ''}:${c.avatar_preset ?? ''}:${c.avatar_updated_at ?? ''}`,
    );
  const wait =
    waiting === null
      ? ''
      : `${waiting.kind}:${waiting.kind === 'drawing' ? waiting.id : ''}:${waiting.token}`;
  return `${viewer ?? ''}|${wait}|${rows.join('|')}`;
}
