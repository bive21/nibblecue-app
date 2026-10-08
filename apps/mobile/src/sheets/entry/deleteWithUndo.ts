/**
 * DELETING AN ENTRY FROM A SCREEN, ONE WAY (2026-09-29). Every door to a delete goes through here:
 * the entry sheet's **Delete entry**, the Activity log's long press, and the Delete behind a swiped
 * row of Today's log or of the Activity log (the owner, 2026-09-29: *"add the ability where user
 * can swipe or bring the log row to the left and it shows the button option to delete. But have
 * confirmation pop up"*). The sheet and the log each carried their own copy of these lines until
 * then; a third copy for the swipe would have been three deletes that drift, so there is one.
 *
 * WHAT IT DOES, in order, exactly as the sheet always did:
 *
 *  1. the write context (who, which household, which phone), or nothing at all without one;
 *  2. the caller's `before` — the Log keeps the row on the page, so the delete's own re-read cannot
 *     take it away before it crumples — and at once, with nothing awaited, the write:
 *  3. `deleteEntry` — a soft delete and a DELETE op, and a stash bottle's milk put back beside it
 *     (CLAUDE.md rule 7: soft deletes with undo), refused BEFORE anything is written when it is not
 *     this person's to delete (`EntryNotYoursError`), which is said in the app's one sentence for
 *     that refusal;
 *  4. written or not, the caller hears which (`notWritten`, `written`) before anything is said;
 *  5. `Entry deleted`, with the 5.2 s Undo that is the data layer's restore (`restoreEntry`) and
 *     says `Entry restored` — or the reason it could not be undone.
 *
 * NOTHING HERE IS FELT. A delete is felt, if at all, where it always was: the toast's own Undo.
 *
 * Pure of React Native, so node runs it end to end against a real database (`deleteWithUndo.test.ts`);
 * the screens reach it through `useDeleteEntry`, which hands it the app's context and toast.
 */
import type { ActivityType, Clock } from '@nibblecue/core';
import { deleteEntry, EntryNotYoursError, restoreEntry } from '../../data/entries';
import { systemClock, type WriteOutcome } from '../../data/repository';
import { failedPermission } from '../../sync/copy';
import type { SheetWriteContext } from '../quick/useWriteContext';
import { ENTRY_DELETED, ENTRY_RESTORED } from './editor';

/** The entry to delete, as every screen that shows one already holds it. */
export interface EntryToDelete {
  activityId: string;
  /** null for a household-scoped entry: a pump session. */
  childId: string | null;
  type: ActivityType;
}

/** What the delete acts through: the app's own on a phone, a test's in node. */
export interface DeleteHands {
  /** The write context, or null when nobody is signed in (`useWriteContext`). */
  context(): Promise<SheetWriteContext | null>;
  /** Say a sentence, with an Undo where there is one (the toast). */
  show(message: string, options?: { undo?: () => void }): void;
  /** The clock the write and its Undo are stamped by: the phone's, unless a test turns its own. */
  clock?: Clock;
}

/** What a screen does around the write: never the write itself, and never the toast. */
export interface DeleteSteps {
  /** Just before the write, with the context in hand (the Log keeps the row it is about to lose). */
  before?: () => void;
  /** Nothing was written: refused, or not committed (the Log lets the row be the row again). */
  notWritten?: () => void;
  /** Written, before the toast says so (the sheet closes, the Log crumples the row). */
  written?: () => void;
}

/** Deletes `entry` with its Undo; true once the delete is written. */
export async function deleteWithUndo(
  hands: DeleteHands,
  entry: EntryToDelete,
  steps: DeleteSteps = {},
): Promise<boolean> {
  const c = await hands.context();
  if (c === null) return false;
  const { db, ...w } = c;
  const clock = hands.clock ?? systemClock;
  steps.before?.();
  let outcome: WriteOutcome;
  try {
    outcome = await deleteEntry(db, clock, {
      ...w,
      activityId: entry.activityId,
      childId: entry.childId,
      type: entry.type,
    });
  } catch (err) {
    steps.notWritten?.();
    // a caregiver's delete of someone else's entry is refused BEFORE it is written
    // (`EntryNotYoursError` in data/entries.ts): the entry stays, and so does the milk it poured,
    // and the sentence is the one the app already says for this refusal
    if (err instanceof EntryNotYoursError) {
      hands.show(failedPermission);
      return false;
    }
    throw err;
  }
  if (!outcome.committed) {
    steps.notWritten?.();
    return false;
  }
  steps.written?.();
  hands.show(ENTRY_DELETED, {
    undo: () =>
      void restoreEntry(db, clock, outcome)
        .then(() => hands.show(ENTRY_RESTORED))
        .catch((err: unknown) =>
          hands.show(err instanceof Error ? err.message : 'That could not be undone'),
        ),
  });
  return true;
}
