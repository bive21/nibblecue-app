/**
 * AN ENTRY WAS DELETED FROM A SHEET OVER THE LOG — the entry editor's **Delete entry** — and the
 * Log, under it, should crumple the row once the sheet is out of the way (the owner, 2026-09-26,
 * "agreed": a deleted row crumples into a paper ball). The editor cannot reach the Log's list, and
 * the Log cannot see the editor's write happen, so the editor says it here, once its delete has
 * landed, and the Log listens while it is the page in front (`useCrumples`).
 *
 * A SIGNAL ABOUT A DRAWING, NOTHING MORE. The delete is written, the toast is shown and its Undo is
 * the data layer's before anyone hears this; a Log that is not listening (another tab in front, the
 * editor opened from Today) loses nothing but the paper ball, and the row simply goes, as it did.
 */
type Listener = (activityId: string) => void;

const listeners = new Set<Listener>();

/** Say that the entry `activityId` was deleted, and the delete has landed. */
export function entryDeleted(activityId: string): void {
  for (const listen of [...listeners]) listen(activityId);
}

/** Hear every landed delete from here on; the returned function stops listening. */
export function onEntryDeleted(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
