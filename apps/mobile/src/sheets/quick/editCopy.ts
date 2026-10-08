/**
 * The words on Edit → for Today's Log section, and the one piece of arithmetic behind them.
 * Both live in their own module so a node test can read them: importing them from the sheet
 * would pull React Native into a test that only wants sentences (`todayCards.test.ts`).
 */
import { MODULES, type ModuleId } from '@nibblecue/core';

/**
 * The quick-loggable modules the household has turned OFF — what the sheet lists at its foot
 * and cannot switch, because those are not on at all.
 *
 * QUICK-LOGGABLE ONLY. A module with a screen of its own — the stash, vaccines — is not a Log
 * tile whether it is on or off, so naming it under "not tracked" here would answer a question
 * nobody asked on this sheet.
 */
export const offModules = (enabled: readonly ModuleId[]): ModuleId[] => {
  const on = new Set(enabled);
  return MODULES.filter(m => m.quickLog && !on.has(m.id)).map(m => m.id);
};
export const QUICK_EDIT_COPY = {
  title: 'What shows in Log',
  lede: 'Switch on what you want on Today, and order it with the arrows. There is no limit. Past three in a row, the tiles carry on to the next one.',
  /**
   * What is on the section right now, so a switch has a visible consequence in words too.
   *
   * It said "plus More" until 2026-09-18, when the More tile was removed from the Log row (the
   * raised + opens the same sheet from every screen). The count now counts what is there.
   */
  count: (n: number): string =>
    n === 0 ? 'Nothing on the Log section yet' : `${n} tile${n === 1 ? '' : 's'} on Log`,
  footer:
    'This is only what Today shows. Everything you switch off is still in the Log sheet, and nothing you logged changes.',
  /**
   * WHERE THE CARE MODULES ARE, said once rather than left as an absence. They have no row on
   * this sheet at all (`logRow` in core says why), so a parent looking for the bath switch finds
   * nothing — and nothing is the one answer a settings screen must never give.
   */
  careNote:
    'A bath, tummy time, a medicine and a temperature are on the Care strip under Log, so they have no tile of their own. The + button logs any of them.',
  /**
   * WHAT THE HOUSEHOLD IS NOT TRACKING AT ALL, listed at the foot rather than described.
   *
   * The footer used to end "to turn a module off altogether, use Modules in More" — a sentence
   * pointing at a screen, which is the app asking a parent to go and look rather than showing
   * them (the owner, 2026-09-16: "on the bottom of everything show what modules are not
   * selected, such as if breastfeed is turned off … should they ever need to change it"). Now
   * the switches a household turned off are named here, where the question comes up, with one
   * way to the screen that owns them.
   */
  offHeader: 'Not tracked',
  offNote: 'Modules this household has turned off. Turn one back on and its tile comes with it.',
  offCta: 'What you track',
  offNone: 'Everything is on.',
  moveUp: (label: string) => `Move ${label} up`,
  moveDown: (label: string) => `Move ${label} down`,
  shown: (label: string) => `Show ${label} on the Log section`,
};
