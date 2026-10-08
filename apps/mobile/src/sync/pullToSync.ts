/**
 * PULL TODAY DOWN TO SYNC (the owner, 2026-09-26, approving the delight list): the same two halves
 * the Sync inspector's "Sync now" runs — send what this phone owes (`flush('manual')`), then read
 * what the other phones wrote (`pullNow`). EVERYTHING it owes (2026-09-28): an entry waiting out a
 * retry's backoff is sent too (`dueNow`), because a pull that sent only what was already due left
 * the owner looking at "7 queued" after a pull that said it had synced. The top bar's sync chip starts nothing (it is a status,
 * not a button, docs/DESIGN_SYSTEM.md §14), so this is the one sync a parent can ask for by hand
 * outside a developer build.
 *
 * IT NEVER HOLDS THE PAGE. The page stays scrollable and every tap works while it runs — the
 * spinner is the platform's refresh control, which blocks nothing — and the spinner is let go
 * after `maxMs` whatever the network is doing: the sync carries on behind it, the queue records
 * whatever happens (a flush that fails is the banner's business, not this spinner's), and a
 * parent is never left watching a spinner that a dead connection would keep turning. It shows for
 * at least `minMs`, so a sync that finishes at once is still seen to have happened.
 *
 * IT NEVER THROWS: whatever the sync does, the pull resolves. And with no runtime to ask — the
 * engine not built yet, or the developer switch EXPO_PUBLIC_OFF=sync, which promises nothing talks
 * to the server — the pull is only the spinner's short turn.
 */
import type { SyncRuntime } from './status';

export const PULL_SYNC = {
  /** The spinner turns at least this long: a sync that is over at once is still seen. */
  minMs: 600,
  /** And at most this long: the sync may carry on, the page is let go. */
  maxMs: 8_000,
} as const;

const wait = (ms: number): Promise<void> =>
  new Promise(resolve => {
    setTimeout(resolve, ms);
  });

/** Send, then read; resolves between `minMs` and `maxMs` later, and never rejects. */
export async function syncFromPull(
  runtime: Pick<SyncRuntime, 'flush' | 'pullNow' | 'dueNow'> | null,
  sleep: (ms: number) => Promise<void> = wait,
): Promise<void> {
  const work =
    runtime === null
      ? Promise.resolve()
      : Promise.resolve()
          // a wait that could not be cleared is no reason not to send what is due
          .then(() => runtime.dueNow())
          .then(
            () => undefined,
            () => undefined,
          )
          .then(() => runtime.flush('manual'))
          .then(() => runtime.pullNow())
          .then(
            () => undefined,
            () => undefined,
          );
  await Promise.all([Promise.race([work, sleep(PULL_SYNC.maxMs)]), sleep(PULL_SYNC.minMs)]);
}
