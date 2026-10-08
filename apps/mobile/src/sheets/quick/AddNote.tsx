/**
 * ADD NOTE — the note on every log sheet, folded to one row until it is wanted (the owner,
 * 2026-09-25, on the sleep form: "Collapsed optional field / + Add note").
 *
 * ONE ROW ON EVERY SHEET (the owner, 2026-10-06: "all add a note should look the same as in sleep
 * module add note button. I noticed the add note in bottle looks different"). This was a "+ Add
 * note" link of its own while the completed-log forms drew `NoteRow`, and the bottle and the bath
 * still showed an open field. Every sheet now draws the sleep form's row: the note glyph, Add note,
 * the chevron, on the soft ground — and the same field once it is tapped (`NoteRow`).
 *
 * The note is the parent's own sentence, read back by nothing (`ENTRY_NOTE`); most entries never
 * get one, and an open multi-line field is the tallest thing on a form.
 */
import { NoteRow } from './completedForm';

export interface AddNoteProps {
  value: string;
  onChangeText: (text: string) => void;
  testID?: string;
}

export function AddNote({ value, onChangeText, testID = 'quick.note' }: AddNoteProps) {
  return <NoteRow value={value} onChangeText={onChangeText} testID={testID} />;
}
