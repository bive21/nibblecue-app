import { describe, expect, it } from 'vitest';
import { syncChipLabel, syncChipText, type SyncState } from './sync-chip-copy';

/** Every state the chip can be in. `ok` has no word: the chip is not drawn at all. */
const REPORTABLE: readonly Exclude<SyncState, 'ok'>[] = ['syncing', 'offline', 'queued', 'error'];

describe('the sync chip copy (docs/OFFLINE_SYNC.md §6, docs/UX_AUDIT.md §4.33)', () => {
  it('has a word and a sentence for every state that is drawn', () => {
    for (const state of REPORTABLE) {
      expect(syncChipText(state), state).not.toBe('');
      expect(syncChipLabel(state), state).not.toBe('');
    }
  });

  it('says the four words verbatim', () => {
    expect(syncChipText('syncing')).toBe('Syncing');
    expect(syncChipText('offline')).toBe('Offline');
    expect(syncChipText('queued')).toBe('Queued');
    // `Not synced`, not `Sync error` (the owner, 2026-09-19): "error" is the app's word for
    // its own trouble and lands as a word about the parent's
    expect(syncChipText('error')).toBe('Not synced');
  });

  it('counts the queue in the word and in the sentence, singular and plural', () => {
    expect(syncChipText('queued', 1)).toBe('1 queued');
    expect(syncChipText('queued', 2)).toBe('2 queued');
    expect(syncChipLabel('queued', 1)).toBe('1 entry waiting to sync');
    expect(syncChipLabel('queued', 2)).toBe('2 entries waiting to sync');
    // the acceptance line of WP4.9's demo, read aloud
    expect(syncChipLabel('queued', 2)).toBe('2 entries waiting to sync');
  });

  it('falls back to the wordless forms when no count is known, and never says "0 queued"', () => {
    expect(syncChipText('queued')).toBe('Queued');
    expect(syncChipText('queued', 0)).toBe('Queued');
    expect(syncChipLabel('queued')).toBe('Entries waiting to sync');
    expect(syncChipLabel('queued', 0)).toBe('Entries waiting to sync');
  });

  it("syncing is the state `queued` alone could not express, and says so in a parent's words", () => {
    expect(syncChipText('syncing')).toBe('Syncing');
    expect(syncChipLabel('syncing')).toBe('Syncing your entries.');
    expect(syncChipText('syncing')).not.toBe(syncChipText('queued'));
  });

  it('the offline sentence promises the entry is kept, because that is the fear', () => {
    expect(syncChipLabel('offline')).toBe(
      'Offline. Entries are kept on this phone and sync later.',
    );
  });

  it('never blames the parent and never asks for a re-entry (OFFLINE_SYNC §6)', () => {
    const forbidden = /sync failed|data lost|unknown error|re-?enter|try again|your fault/i;
    for (const state of REPORTABLE) {
      expect(forbidden.test(syncChipText(state, 3)), state).toBe(false);
      expect(forbidden.test(syncChipLabel(state, 3)), state).toBe(false);
    }
    // non-vacuous: the detector has to fire on a sentence that breaks the rule
    expect(forbidden.test('Sync failed — please re-enter the feed')).toBe(true);
  });

  it('is US English, in the spellings DESIGN_SYSTEM §18 names', () => {
    const british = /\b(cancelled|colour|favourite|grey|centre|analyse|customise|synchronise)\b/i;
    for (const state of REPORTABLE) {
      expect(british.test(`${syncChipText(state, 2)} ${syncChipLabel(state, 2)}`), state).toBe(
        false,
      );
    }
    expect(british.test('the colour is grey')).toBe(true);
  });
});
