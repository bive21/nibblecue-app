/**
 * THE SAMPLE ENTRY THE CARD ABOUT TODAY'S LOG OPENS WHEN THE RUN HAS NOTHING ELSE TO OPEN (the owner,
 * 2026-09-27: *"replace this step with asking user to scroll down and check it's entry, mention this
 * is where you can fix each entry to enter if you need to make changes to it."*).
 *
 * Card 2 brings Today's log into view and asks the parent to open the entry card 1 made (the tour
 * scrolls there since 2026-09-28; the parent did until then). But a run can reach it with nothing of
 * its own in the log, the plainest way through a timer card 1 started whose stop was not on Today to
 * point at (a third timer is a row under "Also running"): the start answers card 1 after its grace,
 * and a running timer is not in the log until it stops. Then there would be nothing in the log to
 * open, and the card would wait its grace and vanish.
 *
 * So the tour puts up ONE sample entry as that card arrives, the way the shopping card puts one sample
 * supply in an empty catalog (`trialList.ts`): a REAL row, written through the app's own write path
 * (`apps/mobile/src/tour/tourWrites.ts`, `seedTrialEntry`), so the row in the log is the log's own and
 * the sheet it opens is the real editor. Never a row drawn for show. The card says so (`prefilled`),
 * and the entry is claimed by its ops and taken back with every other trial entry when the tour ends.
 *
 * A TIMER CARD 1 STARTED IS NOT ONE OF THOSE RUNS (the owner, 2026-09-28: *"if user started
 * something for step 1, make sure tutorial tells user to stop it too by holding the button and save
 * entry"*; and 2026-10-01, *"if the timer still runs, the box won't go to step 2 yet"*). Card 1 asks
 * for that timer to be stopped before it is answered (`TourStop` in `steps.ts`), and the entry the
 * stop writes is the one card 2 then asks to be opened: a sample beside it would be a second entry
 * the parent never made.
 *
 * A DIAPER, OR A BATH, AND NOTHING ELSE. A sample is a thing the app made up, so it must be the kind of
 * entry that says nothing about how a baby is fed, how much, or what it was given: no bottle, no
 * breastfeed, no medicine, no temperature (CLAUDE.md §2). A wet diaper is the plainest entry there
 * is, and it is on no schedule (`schedulable: false`), so Up next is untouched while it stands; a bath
 * is the next plainest, for a household that does not track diapers. A household with neither gets no
 * sample, and the card, with nothing to point at, is passed over as any card is whose control never
 * appears. It says "Sample entry" in its note, which the editor shows, so the parent who opens it
 * reads what it is.
 */
import type { ModuleId } from '../modules/module-registry';

/** The note the sample carries, which the entry's own sheet shows when it is opened. */
export const TRIAL_ENTRY_NOTE = 'Sample entry';

/** The sample, as the write path takes it: the module, its detail row or its metadata, and the note. */
export interface TrialEntry {
  type: Extract<ModuleId, 'diaper' | 'bath'>;
  /** The detail row's own fields, for a module that has one (a diaper's kind). */
  detail?: Readonly<Record<string, unknown>>;
  /** The activity's own metadata, for a module that keeps its fields there (a bath's hair). */
  metadata?: Readonly<Record<string, unknown>>;
  notes: string;
}

/**
 * The samples, in the order they are chosen: the first whose module this household has on. The
 * fields are the ones the module's own sheet writes (`DiaperSheet`, `BathSheet`), so the editor opens
 * the sample as it opens any entry of that kind.
 */
export const TRIAL_ENTRIES: readonly TrialEntry[] = [
  {
    type: 'diaper',
    detail: { kind: 'WET', color: null, consistency: null, rash: false },
    notes: TRIAL_ENTRY_NOTE,
  },
  { type: 'bath', metadata: { hair_washed: false }, notes: TRIAL_ENTRY_NOTE },
];

/** The sample this household gets, or null when it has neither module on. */
export function trialEntryFor(
  enabled: ReadonlySet<ModuleId> | readonly ModuleId[],
): TrialEntry | null {
  const on: ReadonlySet<ModuleId> = enabled instanceof Set ? enabled : new Set(enabled);
  return TRIAL_ENTRIES.find(e => on.has(e.type)) ?? null;
}

/**
 * WHETHER THE RUN NEEDS ONE: no entry logged in it before the card — none heard as it was written,
 * and none claimed by an earlier card, which is what a run resumed after the app was killed still
 * knows. A run whose first card was answered by a saved entry points at that entry instead.
 */
export function needsTrialEntry(run: { heard: number; claimed: number }): boolean {
  return run.heard === 0 && run.claimed === 0;
}
