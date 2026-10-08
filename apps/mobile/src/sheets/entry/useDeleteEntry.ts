/**
 * THE ONE DELETE, WITH THE APP'S HANDS (`deleteWithUndo.ts` says what it does and why there is one):
 * the signed-in write context and the toast. The entry sheet, the Activity log and Today's log all
 * delete through this, so a swiped row's Delete and the sheet's Delete are the same write, the same
 * refusal and the same Undo.
 */
import { useCallback } from 'react';
import { useToast } from '../../ui/toast';
import { useWriteContext } from '../quick/useWriteContext';
import { deleteWithUndo, type DeleteSteps, type EntryToDelete } from './deleteWithUndo';

export function useDeleteEntry(): (entry: EntryToDelete, steps?: DeleteSteps) => Promise<boolean> {
  const { context } = useWriteContext();
  const toast = useToast();
  return useCallback(
    (entry: EntryToDelete, steps?: DeleteSteps) =>
      deleteWithUndo({ context, show: (m, o) => toast.show(m, o) }, entry, steps),
    [context, toast],
  );
}
