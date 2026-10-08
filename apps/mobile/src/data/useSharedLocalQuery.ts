/**
 * `useLocalQuery`, for a read many readers make at once: one read, held by every reader of the
 * same thing (`sharedReads.ts` says what that saves and how it lands).
 *
 * `share` names WHAT is read — the loader's every input: the household, the zone, the scope. Two
 * readers with the same `share` and the same `keys` must be making the same read, because they get
 * one answer between them. A reader that closes over something `share` does not name wants
 * `useLocalQuery`, which reads for itself.
 *
 * Its first frame already has the value when another reader holds it, so a sheet that mounts over
 * Today starts on the household's words, its unit and its timers instead of on a default that
 * changes a frame later.
 */
import { useCallback, useRef, useSyncExternalStore } from 'react';
import { crumb } from '../app/boot';
import { openLocalDb } from '../db';
import type { Db } from '../db/driver';
import { sameValue } from './sameValue';
import { SharedReads, sharedReadId, type SharedSpec } from './sharedReads';
import { store } from './store';

/** The app's one set of shared reads, over the app's store and database. */
export const sharedReads = new SharedReads({
  store,
  open: openLocalDb,
  onError: (id, err) =>
    crumb(`query failed — ${id}: ${err instanceof Error ? err.message : String(err)}`),
});

export function useSharedLocalQuery<T>(
  share: string,
  keys: readonly string[],
  load: (db: Db) => Promise<T>,
  initial: T,
  same: (held: T, next: T) => boolean = sameValue,
): T {
  const id = sharedReadId(share, keys);
  // the newest loader and stand-in, read when the entry is made or joined; `id` carries every
  // input they close over, so a fresh arrow each render is the same read, never a new one
  const spec = useRef<SharedSpec<T>>({ keys, load, initial, same });
  spec.current = { keys, load, initial, same };
  const subscribe = useCallback(
    (onChange: () => void) => sharedReads.subscribe(id, spec.current, onChange),
    [id],
  );
  const snapshot = (): T => sharedReads.value(id, spec.current.initial);
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
