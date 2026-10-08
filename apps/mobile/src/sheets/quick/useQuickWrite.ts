/**
 * The one way a Quick Entry sheet writes (docs/plans/WP5.md WP5.3, WP5.6).
 *
 * Every module sheet ends in the same four steps — build the write context, decide which
 * children, call the REAL repository, show the toast with Undo — and a sheet that did any of
 * them on its own would be a second opinion about the write path. So they live here, once,
 * and a sheet calls `save()` with its fields and its toast sentence.
 *
 *   * The context is the same four values every capture path takes (`WriteContext`), with
 *     the per-install device id, so a sheet's entry is not a special case of the path the
 *     acceptance matrix runs in node (useWriteContext.ts).
 *   * The children come from the sheet's Logging-for row when it has one, else from the
 *     child chip (save.ts decides; MULTIPLES §2). Both writes one entry per child through
 *     `logActivityForChildren` — one submission id, one toast (`Logged for Emma and Liam`),
 *     one Undo that removes both.
 *   * After a single-child save in a household with exactly one other child, the toast
 *     carries `+ Liam` to Undo's left (MULTIPLES §3): the same entry for the other child, one
 *     tap, never automatic — at the current time for a point entry, at the original's own start
 *     AND end for one that has an end (`plusChildFields` says why). Its follow-up toast offers
 *     Undo (the copy) and `Undo both`.
 *   * `source: 'sheet'` — the outbox records where an entry came from; a favorite or a widget
 *     names itself differently.
 *   * A suppressed write (the second tap of a double tap inside the dedupe window) shows no
 *     toast and no Undo: the first tap's toast is the one that is true.
 *
 * Nothing here awaits the network. The write is local; the sync engine's own trigger notices
 * the commit (sync/triggers.ts) and the byline has already said where the entry went.
 *
 * A SHEET OPENED TO CORRECT AN ENTRY SAVES HERE TOO (the owner, 2026-09-26: editing from the log
 * looks the same as logging — `sheets/quick/edit`). With an edit binding, `save()` hands the
 * sheet's fields to the edit instead of logging a new row: one write path per sheet, so a sheet
 * does not have to know which of the two it is doing to save the way it always has. An edit is
 * one baby's entry, never a fan-out, and never offers "+ Liam"; and `ready` is false for someone
 * who may not change it, which is what turns the sheet's Save off.
 */
import type { ModuleId } from '@nibblecue/core';
import { useCallback, useMemo } from 'react';
import { logActivity, logActivityForChildren, type ActivityFields } from '../../data/activities';
import { systemClock, type WriteOutcome } from '../../data/repository';
import { logBottleFromStash, type BottleFromStashInput } from '../../data/stash';
import { useChild } from '../../household/ChildContext';
import { loggedFor, plusChild, UNDO_BOTH } from './copy';
import { useEditBinding } from './edit/binding';
import { otherChild, plusChildFields, savePlan, type SavePlan, type Selection } from './save';
import { useWriteContext } from './useWriteContext';

export interface SaveArgs {
  fields: ActivityFields;
  /** `Saved: 4 oz breast milk at 1:02 PM`. Shown once, with Undo, when the write commits. */
  toast: string;
  /** Per-child overrides for a fan-out (twins take different volumes; WP5.6). */
  perChild?: (childId: string) => { quantity?: number | null; detail?: Record<string, unknown> };
  /**
   * ASKED BEFORE THE "+ LIAM" COPY IS WRITTEN, for the child it is for; false writes nothing. The
   * copy is the same session for the other twin, and tummy time must not land on that twin's
   * running sleep unasked (2026-09-27, `sleepPlay.ts`) — so the sheet that knows hands its question
   * in here, and every other sheet leaves it out and copies exactly as before.
   */
  beforeCopy?: (childId: string) => Promise<boolean>;
}

export interface StashSaveArgs {
  input: Omit<
    BottleFromStashInput,
    'householdId' | 'createdBy' | 'deviceId' | 'source' | 'childId'
  >;
  toast: string;
}

export interface QuickWrite {
  /** False until a household and a signed-in user exist, and for a view only member: no Save. */
  ready: boolean;
  householdId: string | null;
  plan: SavePlan;
  /** The children a fan-out writes for, by name, in order — for the sheet's own copy. */
  names: string[];
  save(args: SaveArgs): Promise<WriteOutcome | null>;
  /** The §6.1 stash path: one transaction, the feed and the draw (data/stash.ts). */
  saveFromStash(args: StashSaveArgs): Promise<WriteOutcome | null>;
}

export function useQuickWrite(moduleId: ModuleId, override?: Selection): QuickWrite {
  const { householdId, userId, canLog, context, announce, undoAll } = useWriteContext();
  const { children, selectedId, isAll } = useChild();
  const plan = useMemo(
    () =>
      savePlan(moduleId, override ?? { children, selectedId: isAll ? null : selectedId, isAll }),
    [moduleId, override, children, selectedId, isAll],
  );
  const edit = useEditBinding();
  // a view only member saves nothing (`canLog`): the Save is off, and `context()` refuses anyway
  const ready =
    householdId !== null &&
    userId !== null &&
    canLog &&
    plan.kind !== 'nobody' &&
    (edit?.canChange ?? true);
  const nameOf = useCallback(
    (id: string | null) => children.find(c => c.id === id)?.name ?? '',
    [children],
  );
  const names = useMemo(
    () =>
      plan.kind === 'each'
        ? plan.childIds.map(nameOf)
        : plan.kind === 'one' && plan.childId
          ? [nameOf(plan.childId)]
          : [],
    [plan, nameOf],
  );

  const save = useCallback(
    async ({ fields, toast: sentence, perChild, beforeCopy }: SaveArgs) => {
      // an edit: these fields correct the entry the sheet was opened on (see the header)
      if (edit !== null) return edit.save(fields);
      const ctx = await context();
      if (ctx === null || plan.kind === 'nobody') return null;
      const { db, ...write } = ctx;
      if (plan.kind === 'each') {
        const outcome = await logActivityForChildren(db, systemClock, {
          ...write,
          ...fields,
          entries: plan.childIds.map(childId => ({ childId, ...(perChild?.(childId) ?? {}) })),
        });
        announce(outcome, loggedFor(plan.childIds.map(nameOf)));
        return outcome;
      }
      const outcome = await logActivity(db, systemClock, {
        ...write,
        ...fields,
        childId: plan.childId,
      });
      const other = otherChild(moduleId, children, plan.childId);
      announce(
        outcome,
        sentence,
        other
          ? {
              secondary: {
                label: plusChild(other.name),
                onPress: () => {
                  void (async () => {
                    if (beforeCopy !== undefined && !(await beforeCopy(other.id))) return;
                    const copy = await logActivity(db, systemClock, {
                      ...write,
                      ...plusChildFields(fields, Date.now()),
                      childId: other.id,
                    });
                    if (!copy.committed) return;
                    announce(copy, loggedFor([other.name]), {
                      secondary: { label: UNDO_BOTH, onPress: () => void undoAll([copy, outcome]) },
                    });
                  })();
                },
              },
            }
          : {},
      );
      return outcome;
    },
    [announce, children, context, edit, moduleId, nameOf, plan, undoAll],
  );

  const saveFromStash = useCallback(
    async ({ input, toast: sentence }: StashSaveArgs) => {
      // A CORRECTION NEVER DRAWS ON THE STASH (the Log's rule since WP5.8): the milk left its
      // container when the bottle was poured, and a corrected amount is not a second pour. The
      // bottle sheet hides the stash row in an edit; were it ever reached, the bottle is corrected
      // and the ledger is left alone.
      if (edit !== null) {
        return edit.save({
          type: 'bottle',
          startAt: input.startAt,
          notes: input.notes ?? null,
          detail: {
            ...(input.kind === undefined ? {} : { kind: input.kind }),
            consumed_ml: input.consumedMl,
            offered_ml: input.offeredMl ?? null,
          },
        });
      }
      const ctx = await context();
      if (ctx === null || plan.kind !== 'one') return null;
      const { db, ...write } = ctx;
      const outcome = await logBottleFromStash(db, systemClock, {
        ...write,
        ...input,
        childId: plan.childId,
      });
      announce(outcome, sentence);
      return outcome;
    },
    [announce, context, edit, plan],
  );

  return { ready, householdId, plan, names, save, saveFromStash };
}
