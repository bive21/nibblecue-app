/**
 * The words an edit adds to a capture sheet. Everything else on the sheet is the sheet's own — its
 * time row, its fields, its Save — which is the point (`forms.ts`): a correction reads exactly like
 * the entry it corrects. The toasts and the read-only line are the editor's, unchanged
 * (`sheets/entry/editor.ts`), so the Log and the sheet say the same thing about the same write.
 *
 * Plain words, sentence case, nothing about the baby.
 */
export const EDIT_COPY = {
  /** "Edit bottle", "Edit tummy time" — in the household's own word for the module. */
  title: (word: string): string => `Edit ${word}`,
  /** The title for the moment before the entry has been read. */
  titleLoading: 'Edit entry',
  /** Another phone deleted it while it was being opened. */
  gone: 'This entry is no longer here.',
  delete: 'Delete entry',
  /** The Save of a module whose own sheet has retired (`PlainEntryForm`). */
  save: 'Save',
} as const;
