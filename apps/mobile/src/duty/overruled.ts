/**
 * TWO PHONES CHANGED WHO'S ON AT ONCE (migration 0115; the handoff audit's M1) — pure, so it is
 * proven in node (`duty.test.ts`); `useDuty` reads it.
 */
import type { DutyList } from '@nibblecue/core';
import type { DutyWriteRow } from '../db/queries/duty';

/** How long after this phone's change a different list reads as "just changed" rather than as news. */
const OVERRULED_WINDOW_MS = 30 * 60_000;

/**
 * WHETHER THIS PHONE'S LAST CHANGE LOST TO SOMEONE ELSE'S. The server keeps a list only if it was
 * written knowing the one it replaces, so a change made on two phones at once leaves the later of
 * them unstored — answered, not refused, because a refusal would sit in the sync queue as an
 * error that nobody can fix.
 *
 * The mark of it is two changes MADE FROM THE SAME STARTING POINT: the list the household holds
 * now was written by someone else, from the same `base` this phone's change was, and is not this
 * phone's change. A list somebody wrote after seeing this phone's change has this change as its
 * base, and is news, not a clash. A confirmation (its `base` is its own `rev`) is not a change.
 */
export function overruledBy(
  lastWrite: DutyWriteRow | null,
  list: DutyList,
  viewerId: string | null,
  nowMs: number,
): { by: string; atMs: number | null; rev: string } | null {
  if (lastWrite === null || lastWrite.rev === null || viewerId === null) return null;
  if (lastWrite.rev === lastWrite.base) return null;
  if (lastWrite.state === 'PENDING' || lastWrite.state === 'SENDING') return null;
  if (lastWrite.createdAtMs === null || nowMs - lastWrite.createdAtMs > OVERRULED_WINDOW_MS)
    return null;
  const { meta } = list;
  if (meta.rev === null || meta.by === null || meta.by === viewerId) return null;
  if (meta.rev === lastWrite.rev || meta.base !== lastWrite.base) return null;
  return { by: meta.by, atMs: meta.atMs, rev: meta.rev };
}
