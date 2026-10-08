/**
 * AN ENTRY WHOSE MODULE HAS NO SHEET ANY MORE — a note, a milestone, a water entry from before
 * those modules retired (`module-registry.ts`). Nothing can log one now, but a household that
 * logged one must still be able to correct it and delete it (CLAUDE.md rule 7): so it opens on the
 * Quick Entry skeleton every sheet is built on — the time row, its note, the Save — and nothing a
 * retired module used to ask. Its length, when it has one, moves with its start.
 */
import type { ActivityType } from '@nibblecue/core';
import { Input } from '@nibblecue/ui';
import { useState } from 'react';
import { ENTRY_NOTE, ENTRY_NOTE_HINT } from '../copy';
import type { ModuleSheetProps } from '../modules/common';
import { QuickEntry } from '../QuickEntry';
import { useTimePicker } from '../timePicker';
import { useQuickWrite } from '../useQuickWrite';
import { useEditBinding } from './binding';
import { EDIT_COPY } from './copy';

export function PlainEntryForm({
  moduleId,
  openedAtMs,
  timeZone,
  clock24,
  onDone,
}: ModuleSheetProps & { moduleId: ActivityType }) {
  const edit = useEditBinding();
  const write = useQuickWrite(moduleId);
  const picker = useTimePicker(clock24);
  const [note, setNote] = useState(edit?.form.note ?? '');
  const a = edit?.record.activity;
  // the entry's length, kept as its start moves; null for a moment
  const spanMs =
    a === undefined || a.end_at === null
      ? null
      : Math.max(0, Date.parse(a.end_at) - Date.parse(a.start_at));

  // only ever an edit: nothing logs a retired module now
  const onSave = async (atMs: number) => {
    if (edit === null) return;
    const outcome = await edit.save({
      type: moduleId,
      startAt: new Date(atMs).toISOString(),
      ...(spanMs === null ? {} : { endAt: new Date(atMs + spanMs).toISOString() }),
      notes: note.trim() || null,
    });
    if (outcome?.committed) onDone();
  };

  return (
    <>
      <QuickEntry
        openedAtMs={openedAtMs}
        timeZone={timeZone}
        clock24={clock24}
        saveLabel={EDIT_COPY.save}
        onSave={onSave}
        saveDisabled={!write.ready}
        onPickTime={picker.pick}
        testID="quick.entry"
      >
        <Input
          label={ENTRY_NOTE}
          value={note}
          onChangeText={setNote}
          placeholder={ENTRY_NOTE_HINT}
          multiline
          maxLength={2000}
          testID="quick.entry.note"
        />
      </QuickEntry>
      {picker.element}
    </>
  );
}
