/**
 * `PendingWrites` and `LocalSetting` for a screen (`pendingWrites.ts` has the whole reasoning):
 * made once, drawn again whenever what they show may have changed.
 */
import { useEffect, useReducer, useState } from 'react';
import { LocalSetting, PendingWrites } from './pendingWrites';

export function usePendingWrites<K, V, S>(
  snapshot: S,
  read: (key: K) => V,
  same: (a: V, b: V) => boolean,
): PendingWrites<K, V, S> {
  const [, draw] = useReducer((n: number) => n + 1, 0);
  const [writes] = useState(() => new PendingWrites<K, V, S>({ snapshot, read, same }, draw));
  // told each time the screen reads the database again, and whenever what it derived from that
  // read changes: a write that lands judges against the newest. `observe` looks over a handful of
  // keys and draws again only when it drops one.
  useEffect(() => {
    writes.observe({ snapshot, read, same });
  }, [writes, snapshot, read, same]);
  return writes;
}

/**
 * A phone-only setting: its value to draw, and the `LocalSetting` to write it through. `load` runs
 * once, when the screen opens; a tap made before it answers is not overwritten by it.
 */
export function useLocalSetting<T extends object>(
  initial: T,
  load: () => Promise<T>,
): [T, LocalSetting<T>] {
  const [value, setValue] = useState(initial);
  const [setting] = useState(() => new LocalSetting<T>(initial, setValue));
  useEffect(() => {
    let live = true;
    void load().then(stored => {
      if (live) setting.arrived(stored);
    });
    return () => {
      live = false;
    };
    // once, when the screen opens: `load` is the caller's inline arrow, and re-reading storage on
    // every render would put a stored value back over the parent's taps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setting]);
  return [value, setting];
}
