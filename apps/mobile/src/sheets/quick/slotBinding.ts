/**
 * WHOSE SLOT A CAPTURE SHEET WAS OPENED FOR — read by the Logging-for row (`useLoggingFor`).
 *
 * A sheet opened from the Quick grid starts on the top bar's baby — or, with the bar on Both, on
 * the baby up next for its module (`loggingForStart.ts`; the owner, 2026-09-25): the bar decides
 * whose day is on screen. A sheet opened from a schedule slot starts on the SLOT's baby instead,
 * because the slot is Emma's feed whatever the bar shows (the audits of 2026-09-24: on "Both", a
 * tap on Emma's slot logged a bottle for Emma and Liam and closed Liam's slot too). The slot sheet
 * that enforced this is gone (the owner, 2026-09-25: slots are logged on the module's own sheet),
 * so the rule moves here, to the one place every capture sheet asks who it is for. A household
 * slot (a pump) names no baby and changes nothing.
 *
 * AND WHOSE RUNNING TIMER (2026-09-26): a row of Today's "Also running" card opens its timer's
 * sheet with the timer's baby here and no time (`QuickEntryPreset.timer`), so twins asleep at once
 * each open their own running panel rather than the first twin's.
 *
 * AND WHEN IT WAS, FOR A SLOT THAT IS OVER (the owner, 2026-09-25: "yes pre-fill the slot's time
 * when tapping a past slot"). The host decides it once, as the sheet opens (`slotPrefillAt`), and
 * every form reads it where its time row's state is made (`useQuickTime`), so a sheet opened on
 * the missed 12:00 feed starts at 12:00 rather than at now.
 */
import { createContext, useContext } from 'react';

export interface SlotBinding {
  /** The slot's own baby, or null for a household slot. */
  childId: string | null;
  /**
   * The slot's own time when the slot is OVER and the sheet was opened from the day's list — its
   * time row starts there, as a Custom time — or null: the sheet starts at the moment it opened,
   * as from the Quick grid. Null too while this module's timer runs for the slot's baby: the
   * running panel is what the sheet shows then (`timerRunsFor`).
   */
  atMs: number | null;
}

export const SlotBindingContext = createContext<SlotBinding | null>(null);

export const useSlotBinding = (): SlotBinding | null => useContext(SlotBindingContext);
