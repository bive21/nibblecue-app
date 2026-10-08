/**
 * ── THE WRITES A NIBBLECUE SCREEN MAKES, WITH CUDDLECUE'S OWN TOAST AND UNDO ───────────────────
 *
 * Every save takes its context from `useWriteContext` (the one gate a view-only seat is refused
 * at), goes through `writes.ts` (CuddleCue's one writer underneath), and is announced the way a
 * CuddleCue save is: felt, said in a toast, and undone from it.
 */
import type { FoodResponse } from '@nibblecue/core';
import type {
  Food,
  Form,
  MealName,
  NibbleProfileInput,
  PlanMark,
  RecordKind,
  RecordWriteInput,
} from '@nibblecue/core/nibble';
import { useCallback, useMemo } from 'react';
import { systemClock, type WriteOutcome } from '../data/repository';
import { useWriteContext } from '../sheets/quick/useWriteContext';
import { deleteRecord, logServed, saveNoticed, saveRecord, type NoticedInput } from './writes';

export interface ServeInput {
  childId: string;
  meal: MealName;
  atIso: string;
  foods: {
    food: Food;
    form: Form | null;
    response: FoodResponse | null;
    planItem: string | null;
  }[];
}

export function useNibbleWrites() {
  const w = useWriteContext();
  const { context, announce } = w;

  const save = useCallback(
    async <K extends RecordKind>(
      input: {
        recordId?: string;
        childId: string | null;
        kind: K;
        body: RecordWriteInput<K>['body'];
      },
      sentence: string | null,
    ): Promise<WriteOutcome | null> => {
      const c = await context();
      if (c === null) return null;
      const out = await saveRecord(c.db, systemClock, c, input);
      if (sentence !== null) announce(out, sentence);
      return out;
    },
    [context, announce],
  );

  const remove = useCallback(
    async (
      input: { recordId: string; kind: RecordKind; childId: string | null },
      sentence: string | null,
    ): Promise<WriteOutcome | null> => {
      const c = await context();
      if (c === null) return null;
      const out = await deleteRecord(c.db, systemClock, c, input);
      if (sentence !== null) announce(out, sentence);
      return out;
    },
    [context, announce],
  );

  const serve = useCallback(
    async (input: ServeInput, sentence: string): Promise<WriteOutcome | null> => {
      const c = await context();
      if (c === null) return null;
      const out = await logServed(c.db, systemClock, c, input);
      announce(out, sentence);
      return out;
    },
    [context, announce],
  );

  const noticed = useCallback(
    async (input: NoticedInput, sentence: string): Promise<boolean> => {
      const c = await context();
      if (c === null) return false;
      const out = await saveNoticed(c.db, systemClock, c, input);
      // the Health note is the half that matters (`saveNoticed`): it is what is said and undone
      announce(out.note, sentence, { undoable: false });
      return out.note.committed;
    },
    [context, announce],
  );

  const saveProfile = useCallback(
    (
      childId: string,
      recordId: string | undefined,
      body: NibbleProfileInput,
      sentence: string | null,
    ) =>
      save(
        {
          ...(recordId !== undefined ? { recordId } : {}),
          childId,
          kind: 'profile',
          body: body as RecordWriteInput<'profile'>['body'],
        },
        sentence,
      ),
    [save],
  );

  const mark = useCallback(
    (childId: string, body: PlanMark, sentence: string | null) =>
      save({ childId, kind: 'plan_mark', body }, sentence),
    [save],
  );

  return useMemo(
    () => ({ ...w, save, remove, serve, noticed, saveProfile, mark }),
    [w, save, remove, serve, noticed, saveProfile, mark],
  );
}
