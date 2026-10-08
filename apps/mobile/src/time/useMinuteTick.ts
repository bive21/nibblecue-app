/**
 * ONE MINUTE CLOCK FOR THE WHOLE APP (2026-09-28; the owner: *"app needs to run as smooth as fast
 * and as light as possible"*).
 *
 * Every elapsed label ("2h 42m ago"), every schedule, the nap outlook, the heads-up, the lists'
 * "late" and the stash's dates read a clock that moves once a minute — and the instant a local
 * write commits, for a reader whose arithmetic must see the entry just made (`useTodayData`'s
 * header has the bug that taught it). Each reader used to keep its OWN interval, started when it
 * mounted: a dozen timers, each firing at its own second of the minute, so a phone that had
 * opened Today, the Schedule and the Stash re-drew in a dozen separate waves every minute, each
 * with the engine behind it. Now there is the app's one minute clock (`subscribeToMinute`, the
 * same one the day key and the daytime read) and one listener on the key every commit bumps: every
 * reader moves in the same moment, to the same instant, and React draws them as one wave. That
 * same instant is also what lets the screens that show the same day share one pass of the routine
 * (`schedule/sharedDay.ts`).
 *
 * WHAT A READER SEES IS UNCHANGED: the instant it mounted, then the instant of each minute after,
 * and — unless it says `onWrite: false` — the instant of each local commit. The only difference is
 * WHICH second of the minute its first tick lands on, which is the clock's rather than its own.
 * Nothing here waits on the network (`freshness.test.ts`): a commit is a local event.
 */
import { useEffect, useState } from 'react';
import { store, subscribeKeys } from '../data/store';
import { tickStampKeys } from '../screens/today/watch';
import { subscribeToMinute } from './useDayKey';

/* the commit stamp: one listener on the key every local write bumps, for every reader that asked */
const writeReaders = new Set<(atMs: number) => void>();
let offWrites: (() => void) | null = null;

function subscribeToWrites(reader: (atMs: number) => void): () => void {
  writeReaders.add(reader);
  if (offWrites === null) {
    offWrites = subscribeKeys(store, tickStampKeys(true), () => {
      const at = Date.now();
      for (const r of [...writeReaders]) r(at);
    });
  }
  return () => {
    writeReaders.delete(reader);
    if (writeReaders.size > 0 || offWrites === null) return;
    offWrites();
    offWrites = null;
  };
}

/**
 * A clock that changes once a minute — the granularity of every elapsed label on Today — AND
 * the instant a local write commits. (It was Today's own tick until 2026-09-28, in
 * `useTodayData.ts`; Today now reads this one like everything else.)
 *
 * THE WRITE HALF IS NOT A REFINEMENT; IT IS A BUG FIX. The schedule engine only counts a
 * session it has reached: `scheduleDay` and `intervalOccurrences` both filter `startMs <=
 * ctx.nowMs`, and `ctx.nowMs` was this value. A bottle logged 35 seconds after the last tick has
 * a start AFTER the engine's "now", so the engine could not see it — the tile kept its amber
 * ring, the interval did not move, and the next slot did not shift, for as long as it took the
 * minute to turn over (the owner, 2026-09-16: "logging a bottle that was due now takes about 30
 * seconds before the brown border disappears … I thought it was not recorded"). The row was in
 * the database the whole time, which is why the timeline showed it instantly: the timeline
 * reads rows, the engine reads rows AGAINST A CLOCK, and the clock was the stale one.
 *
 * `commitWrite` bumps `keys.outbox()` on every commit, so that key is "something was just
 * logged, whatever it was" without this hook needing to know what. Nothing here waits on the
 * network — the fix is local and holds offline, which is the point (docs/OFFLINE_SYNC.md §1).
 *
 * `onWrite: false` is the minute alone, for a reader whose own read already moves its clock when
 * it lands (`useScheduleDay`: `Math.max(tickMs, raw.atMs)`). A stamp there bought nothing and cost
 * a whole pass: the commit re-stamped the clock and the engine ran against the rows it already
 * had, then the read landed and it ran again against the new ones — two recomputes of the routine
 * for every save (2026-09-28).
 */
export function useMinuteTick(opts: { onWrite?: boolean } = {}): number {
  const onWrite = opts.onWrite !== false;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const stamp = (atMs: number) => setNow(atMs);
    const offMinute = subscribeToMinute(stamp);
    const offWrite = onWrite ? subscribeToWrites(stamp) : null;
    return () => {
      offMinute();
      offWrite?.();
    };
  }, [onWrite]);
  return now;
}
