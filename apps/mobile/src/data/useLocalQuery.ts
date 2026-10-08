/**
 * A screen's read of the local mirror, re-run when a write invalidates it.
 *
 * The store (store.ts) carries no data, only versions: a write bumps the keys it touched and
 * a subscriber re-reads. This hook is that subscriber for a component — `load` runs on mount,
 * again whenever any of `keys` is invalidated, and its result is dropped if the component has
 * since unmounted or the keys changed. Errors resolve to the initial value rather than
 * throwing into a render: a Today that cannot read one card still paints the rest.
 *
 * A READ THAT COMES BACK UNCHANGED CHANGES NOTHING (2026-09-28). Every write re-runs every read
 * under its keys, and most of those reads return what they returned before — a bottle re-reads
 * the care list, a pulled page re-applies rows the phone already had. Each used to land as a new
 * value, and a new value re-renders every reader and re-runs every memo keyed on it, the
 * schedule's included, to arrive where it already was. So the value is kept when the new one is
 * the same data (`sameValue`), or the same by the caller's own measure (`same`).
 */
import { useEffect, useState } from 'react';
import { crumb } from '../app/boot';
import { openLocalDb } from '../db';
import type { Db } from '../db/driver';
import { landed, sameValue } from './sameValue';
import { store, subscribeKeys } from './store';

export function useLocalQuery<T>(
  keys: readonly string[],
  load: (db: Db) => Promise<T>,
  initial: T,
  /** Whether a new value says nothing the held one does not; content equality by default. */
  same: (held: T, next: T) => boolean = sameValue,
): T {
  const [value, setValue] = useState<T>(initial);
  // one string, so a caller's fresh array each render does not re-subscribe
  const keyList = keys.join('|');
  useEffect(() => {
    let live = true;
    // the updater form, so a read is compared with the value before it even when two land
    // between renders; never with `initial`, which callers tell apart by identity (`landed`)
    const land = (next: T) => setValue(held => landed(held, next, initial, same));
    /*
      ONE READ IN FLIGHT AT A TIME (2026-10-06, "make sure app runs lightly"). A save invalidates
      its keys, then its outbox row, then the sync's acknowledgement, often inside one read's
      lifetime, and each used to start a read of its own: three of the same query racing on the
      one database connection for every reader on screen. Now an invalidation that lands while a
      read runs only marks it stale, and one more read follows the one in flight — which always
      starts after the last write, so the value that lands is never older than it was.
    */
    let reading = false;
    let stale = false;
    const run = () => {
      if (reading) {
        stale = true;
        return;
      }
      reading = true;
      stale = false;
      void openLocalDb()
        .then(db => load(db))
        .then(next => {
          if (live && !stale) land(next);
        })
        .catch((err: unknown) => {
          // resolved to the initial value, never thrown into a render — but named, because an
          // empty strip is also what a broken query looks like
          crumb(`query failed — ${keyList}: ${err instanceof Error ? err.message : String(err)}`);
          if (live && !stale) land(initial);
        })
        .finally(() => {
          reading = false;
          if (live && stale) run();
        });
    };
    run();
    // ONE listener under every key, so a write that names three of them is one read, not three
    // (`subscribeKeys`, and `store.test.ts` for what it cost when it was not)
    const unsubscribe = subscribeKeys(store, keyList.split('|'), run);
    return () => {
      live = false;
      unsubscribe();
    };
    // `load`, `initial` and `same` are read through the closure on purpose: a caller passes an
    // inline arrow and a fresh literal every render, and re-subscribing on each would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyList]);
  return value;
}
