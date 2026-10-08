/**
 * The sample entry card 2 opens when the run has nothing else to open (`trialEntry.ts`; the owner,
 * 2026-09-27: *"replace this step with asking user to scroll down and check it's entry"*). That it is
 * written through the app's own path, reaches the log and is taken back with the tour's other trial
 * entries is `apps/mobile/src/tour/tourWrites.test.ts`, against the real local database.
 */
import { describe, expect, it } from 'vitest';
import { MODULE_BY_ID, MODULES, type ModuleId } from '../modules/module-registry';
import { needsTrialEntry, TRIAL_ENTRIES, TRIAL_ENTRY_NOTE, trialEntryFor } from './trialEntry';

const ALL = MODULES.map(m => m.id);
const without = (...off: ModuleId[]): ModuleId[] => ALL.filter(m => !off.includes(m));

describe('the sample entry on the card about Today’s log', () => {
  it('is a wet diaper, or a bath for a household that does not track diapers, and else nothing', () => {
    expect(trialEntryFor(ALL)?.type).toBe('diaper');
    expect(trialEntryFor(new Set(ALL))?.type).toBe('diaper');
    expect(trialEntryFor(without('diaper'))?.type).toBe('bath');
    expect(trialEntryFor(without('diaper', 'bath'))).toBeNull();
    expect(trialEntryFor([])).toBeNull();
    expect(trialEntryFor(['diaper'])?.detail).toEqual({
      kind: 'WET',
      color: null,
      consistency: null,
      rash: false,
    });
    expect(trialEntryFor(['bath'])?.metadata).toEqual({ hair_washed: false });
  });

  /**
   * NOTHING THE APP MADE UP MAY SAY HOW A BABY IS FED, HOW MUCH, OR WHAT IT WAS GIVEN (CLAUDE.md
   * §2): no feed, no pump, no medicine, no reading — and nothing a schedule is built on first, so Up
   * next is as the parent left it while the sample stands (a bath only for a household without
   * diapers, whose own bath rhythm the sample then answers until the tour ends).
   */
  it('never says anything about a feed, a medicine or a reading', () => {
    const types = TRIAL_ENTRIES.map(e => e.type);
    expect(types).toEqual(['diaper', 'bath']);
    for (const banned of ['bottle', 'breastfeed', 'pump', 'solids', 'med', 'temp', 'growth']) {
      expect(types as readonly string[], banned).not.toContain(banned);
    }
    // the diaper, the one every household with diapers gets, is on no schedule and in no reminder
    expect(MODULE_BY_ID.diaper.schedulable).toBe(false);
    expect(MODULE_BY_ID.diaper.remindable).toBe(false);
    // and no sample carries an amount
    for (const e of TRIAL_ENTRIES)
      expect(JSON.stringify(e), e.type).not.toMatch(/ml|quantity|amount/);
  });

  it('says what it is, in the note its own sheet shows', () => {
    expect(TRIAL_ENTRY_NOTE).toBe('Sample entry');
    for (const e of TRIAL_ENTRIES) expect(e.notes, e.type).toBe(TRIAL_ENTRY_NOTE);
  });

  it('is put up only when nothing was logged before the card in the run', () => {
    // card 1 answered by a timer: nothing heard, nothing claimed
    expect(needsTrialEntry({ heard: 0, claimed: 0 })).toBe(true);
    // card 1 answered by an entry, in this launch or one before it
    expect(needsTrialEntry({ heard: 1, claimed: 0 })).toBe(false);
    expect(needsTrialEntry({ heard: 0, claimed: 1 })).toBe(false);
    expect(needsTrialEntry({ heard: 2, claimed: 1 })).toBe(false);
  });
});
