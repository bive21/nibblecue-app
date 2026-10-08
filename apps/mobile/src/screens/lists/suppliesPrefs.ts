/**
 * How this phone sorts the supply catalog (the shopping brief §2: "options: By category / A–Z /
 * By shop; persist choice").
 *
 * IT BELONGS TO THE PHONE, NOT THE HOUSEHOLD, for the same reason the stash's open cards do:
 * which order you read a list in is not a fact about the list, and syncing it would mean one
 * parent's tap re-sorting the other parent's screen mid-scroll. `prefsStore` is the store Today's
 * sections and the stash's places already use, and the key is deliberately not device-level, so
 * signing out clears it with everything else that is somebody's.
 *
 * AN UNREADABLE VALUE IS "BY CATEGORY". A stored blob is data and never trusted — a write from an
 * older build, a newer one, or one that failed halfway reads as the default rather than as an
 * empty screen.
 */
import { useCallback, useEffect, useState } from 'react';
import type { KeyValueStore } from '../../prefs';
import { prefsStore } from '../../prefs/async-storage';

const SUPPLY_SORT_KEY = 'supplies_sort';

export type SupplySort = 'category' | 'az' | 'shop';

const SUPPLY_SORTS: readonly SupplySort[] = ['category', 'az', 'shop'];

const DEFAULT_SUPPLY_SORT: SupplySort = 'category';

const parseSupplySort = (raw: string | null): SupplySort =>
  raw !== null && (SUPPLY_SORTS as readonly string[]).includes(raw)
    ? (raw as SupplySort)
    : DEFAULT_SUPPLY_SORT;

export interface SupplySortApi {
  sort: SupplySort;
  set(next: SupplySort): void;
}

export function useSupplySort(store: KeyValueStore = prefsStore): SupplySortApi {
  const [sort, setSort] = useState<SupplySort>(DEFAULT_SUPPLY_SORT);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const raw = await store.get(SUPPLY_SORT_KEY);
      if (alive) setSort(parseSupplySort(raw));
    })();
    return () => {
      alive = false;
    };
  }, [store]);

  const set = useCallback(
    (next: SupplySort) => {
      setSort(next);
      // fire and forget: a tap must never wait on a write, and a lost one costs one re-pick
      void store.set(SUPPLY_SORT_KEY, next);
    },
    [store],
  );

  return { sort, set };
}
