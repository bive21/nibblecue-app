/**
 * WHICH ENTRY A CAPTURE SHEET IS CORRECTING, when it is correcting one — the edit's sibling of
 * `SlotBinding`, handed down by the edit host (`EditEntrySheet`) and read in the few shared places
 * a sheet's behavior turns on it, so the sheets themselves change as little as possible:
 *
 *   * `useQuickWrite` — the sheet's one Save writes a CORRECTION of this entry (`save`), not a new
 *     row, and is off for someone who may not change it (`canChange`);
 *   * `useQuickTime` — the time row opens on the entry's own time, as a Custom time, and a time
 *     picked on it lands on the day nearest the entry's, not on today (`pickedNear`);
 *   * `useLoggingFor` — no Logging-for row: an entry is one baby's and stays that baby's;
 *   * `useTimerSheet` — no running panel and no Start: an edit is of something already finished.
 *
 * Each sheet reads `form` for what to open on (`forms.ts`), and hides the few controls that belong
 * to a NEW entry only — a timed sheet's two path cards, the bottle's stash draw, the pump's second
 * pour into the stash.
 */
import { createContext, useContext } from 'react';
import type { ActivityFields } from '../../../data/activities';
import type { WriteOutcome } from '../../../data/repository';
import type { EntryRecord } from '../../../db/queries/today';
import type { FormStart } from './forms';

export interface EditBinding {
  /** The entry as the mirror held it when the sheet opened. */
  record: EntryRecord;
  /** What the sheet opens on. */
  form: FormStart;
  /**
   * Whether this person may change the entry: an owner or a parent any entry, a caregiver only
   * their own (PRODUCT_SPEC §11) — the server's rule, asked before a Save is offered.
   */
  canChange: boolean;
  /**
   * The sheet's Save, as a correction of this entry: its fields, written through the editor's
   * write path (`editEntry`) — only what changed, stamped with who changed it. Resolves with the
   * outcome when an edit was written, and null when nothing was (nothing had changed, and the sheet
   * is closed; or the edit was refused, and the sheet stays up with the reason said).
   */
  save(fields: ActivityFields): Promise<WriteOutcome | null>;
  /**
   * THE COMPLETED-LOG FORMS' OWN FOOT (diaper, breastfeed and sleep, the owner's Option 2 of
   * 2026-10-05): who added and changed the entry, folded into Entry details, and Delete entry as
   * quiet words under Save changes. The edit host hands them in; the other sheets keep the host's
   * own byline and Delete button, and these stay unset for them.
   */
  details?: string | null;
  remove?: () => void;
  deleting?: boolean;
}

export const EditBindingContext = createContext<EditBinding | null>(null);

/** The entry this sheet is correcting, or null for a new entry. */
export const useEditBinding = (): EditBinding | null => useContext(EditBindingContext);
