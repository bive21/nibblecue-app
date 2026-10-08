/**
 * The sync chip's words (docs/OFFLINE_SYNC.md §6, docs/DESIGN_SYSTEM.md §14, §18).
 *
 * Split out of `SyncChip.tsx` so the copy is testable in the node suite: `packages/ui`'s vitest
 * config collects `src/**\/*.test.ts` in a node environment, and a module that imports
 * `react-native` at the top cannot be collected at all. The component keeps the pill; this file
 * keeps the sentences, which are the part a parent reads at 3 a.m. and the part a reviewer of
 * this package can argue with.
 *
 * FIVE STATES, NOT FOUR. `docs/UX_AUDIT.md` §4.33 narrowed the chip to "appears only when there
 * is something to report", and that stays: `ok` renders nothing. But `queued` alone cannot tell
 * "the queue is waiting for a network" from "the queue is being sent right now", and those are
 * different answers to the only question the chip exists to answer — *is my log safe and is it
 * moving?* So `syncing` was added (WP4.9; owner stop point, default-ship recorded in the change
 * report), and it is still a state with something to report.
 *
 * Every state carries its WORD as well as its color (§12 rule 7: status is never color alone),
 * and the accessible name is a sentence rather than the chip's shorthand, because a screen
 * reader saying "2 queued" tells a parent nothing about whether anything is lost.
 */

export type SyncState = 'ok' | 'syncing' | 'offline' | 'queued' | 'error';

/** The chip's word, in the `badge` role (which sets it uppercase). */
export function syncChipText(state: Exclude<SyncState, 'ok'>, count?: number): string {
  switch (state) {
    case 'syncing':
      return 'Syncing';
    case 'offline':
      return 'Offline';
    case 'queued':
      return count !== undefined && count > 0 ? `${count} queued` : 'Queued';
    /*
      `Not synced`, NOT `Sync error` (the owner, 2026-09-19). "Error" is the app's word for its
      own trouble and it lands on the parent as a word about THEIRS — something they did, or
      something lost. Nothing is lost: the entries are on the phone and the queue has stopped
      getting them away. "Not synced" is the state, in the words a person would use, and the
      banner under it now carries the action (`SyncRuntime.retry`).
    */
    case 'error':
      return 'Not synced';
  }
}

/** What a screen reader says: a sentence, never the chip's shorthand. */
export function syncChipLabel(state: Exclude<SyncState, 'ok'>, count?: number): string {
  switch (state) {
    case 'syncing':
      return 'Syncing your entries.';
    case 'offline':
      return 'Offline. Entries are kept on this phone and sync later.';
    case 'queued':
      return count === 1
        ? '1 entry waiting to sync'
        : count !== undefined && count > 0
          ? `${count} entries waiting to sync`
          : 'Entries waiting to sync';
    case 'error':
      /*
        THE CHIP STATES, IT DOES NOT INSTRUCT. An earlier draft of this line ended "tap the
        banner to try again" and the copy test refused it, rightly: §6 forbids "try again" in
        this file because the chip is a STATUS, and a status that tells a parent to do something
        reads as their job to fix. The banner carries the action and its own words; this says
        the two facts a person actually wants at a glance — it has not gone, and nothing is lost.
      */
      return 'Not synced. Your entries are kept on this phone.';
  }
}
