/**
 * The Logging-for row's state (docs/MULTIPLES.md §2): every child-scoped sheet opens with one
 * chip per child plus Both / All n, and is changed in the sheet without touching the top bar —
 * the sheet decides who this entry is for, the bar decides whose day is on screen.
 *
 * WHERE IT STARTS is `loggingForStart`: a slot's own baby; else the bar's baby; and with the bar on
 * Both / All n, Both itself wherever the module fans out (the owner, 2026-09-30), except a medicine
 * and a breastfeed, which start on the baby who is UP NEXT (the owner's 2026-09-25 rule, kept for
 * a dose, where a false record makes someone skip one, and for a feed at the breast, where Both is
 * a tandem nobody chose). Every chip stays one tap away on the row.
 *
 * DECIDED ONCE, AS THE SHEET MOUNTS, from what is already in memory: the slot's binding, the bar,
 * and each baby's last entries, which the sheet's host read before the sheet was asked for
 * (`recency.ts` says why there and not here). The first value is `useState`'s initializer and
 * nothing sets it afterwards but the parent's own tap, so the row never opens on one baby and
 * moves to another under a thumb.
 *
 * A SHEET CORRECTING AN ENTRY HAS NO ROW AT ALL (`sheets/quick/edit`): an entry is one baby's, and
 * a correction is of that entry — it is not moved to the other twin, and never becomes "Both". The
 * selection is the entry's own baby, so whatever the sheet reads for "this baby" (the last bottle,
 * a medicine's count today, a meal's "first time") is about the baby whose entry it is.
 */
import { allChildrenLabel, type ModuleId } from '@nibblecue/core';
import { useMemo, useState } from 'react';
import { useChild } from '../../household/ChildContext';
import { groupLast, loggingForStart, startsOnAll } from './loggingForStart';
import { useEditBinding } from './edit/binding';
import { useRecency } from './recency';
import { useSlotBinding } from './slotBinding';
import {
  ALL,
  loggingForOptions,
  selectionFor,
  type LoggingForOption,
  type Selection,
} from './save';

export interface LoggingFor {
  options: LoggingForOption[];
  value: string;
  setValue: (value: string) => void;
  /** What the plan reads. */
  selection: Selection;
}

export function useLoggingFor(moduleId: ModuleId): LoggingFor {
  const { children, selectedId, isAll } = useChild();
  const options = useMemo(
    () => loggingForOptions(moduleId, children, allChildrenLabel(children.length)),
    [moduleId, children],
  );
  // a sheet opened for a slot starts on the slot's own baby (`slotBinding.ts`), not the bar's
  const slotChild = useSlotBinding()?.childId ?? null;
  // each baby's last entries, read by the host before this sheet existed (`recency.ts`)
  const recency = useRecency();
  const [value, setValue] = useState<string>(() =>
    loggingForStart({
      children,
      isAll,
      selectedId: isAll ? null : selectedId,
      slotChildId: slotChild,
      lastOf: childId => groupLast(recency, moduleId, childId),
      startOnAll: startsOnAll(
        moduleId,
        options.some(o => o.value === ALL),
      ),
    }),
  );
  // a value the chips do not hold — a baby removed on another phone while the sheet was open —
  // lands on the first chip rather than writing for nobody the row can show
  const effective =
    options.length > 0 && !options.some(o => o.value === value)
      ? (options[0]?.value ?? value)
      : value;
  const editChild = useEditBinding()?.record.activity.child_id;
  const selection = useMemo<Selection>(
    () =>
      editChild === undefined
        ? { children, ...selectionFor(effective) }
        : { children, selectedId: editChild, isAll: false },
    [children, effective, editChild],
  );
  if (editChild !== undefined) return { options: [], value: editChild ?? '', setValue, selection };
  return { options, value: effective, setValue, selection };
}
