/**
 * ONE READ FOR EVERY READER OF THE SAME THING (2026-09-28; the owner: *"app needs to run as smooth
 * as fast and as light as possible"*).
 *
 * `useLocalQuery` is one read per mounted reader, and some things are read by a dozen readers at
 * once: the household's running timers (Today, the timer sheets, the nap outlook, the link router,
 * the reminder planner, the celebration and trial-sheet watchers…), the household's words for its
 * modules (every tile, sheet and row that names tummy time), the milk unit (every amount on every
 * screen), the waking window, the routine's own rows (Today, the widget, the shade, the planner,
 * and the Schedule, Stash and Reports tabs). Each reader re-read on every write that named its key,
 * so one timer started ran the same `select` thirteen times, and a sheet opening mounted five
 * readers of the same settings row that each read it again, each landing as a render of the sheet
 * while it was still sliding up — on top of a first frame drawn with the default in its place.
 *
 * Here a read is keyed by WHAT it reads (`share`: every value its loader closes over, and the store
 * keys it watches), and every reader of that key holds the one entry:
 *
 *   · the first reader starts the read; a reader that arrives while one is in flight waits for
 *     that one, and a reader that arrives later starts with the value already there — on its very
 *     first frame, with no default in its place — and asks for one fresh read behind it, so a
 *     reader that mounts is never older than a reader that mounts under `useLocalQuery`;
 *   · a write that names any of its keys runs the read ONCE for all of them, and a write during a
 *     read runs it once more when that read is done — never two at a time, so a slow read can
 *     never land after a newer one and put the older answer back;
 *   · what lands, lands exactly as `useLocalQuery`'s does (`landed`): a read that came back with
 *     what was held changes nothing and wakes nobody, and a failed read lands the caller's own
 *     `initial` and says so in the boot log;
 *   · the last reader to go lets the entry go, keys and all: nothing is kept for a screen that is
 *     not there, and the next reader reads afresh.
 *
 * NO REACT AND NO EXPO. This is the whole of the behavior, in a class node can run
 * (`sharedReads.test.ts`); the hook is `useSharedLocalQuery.ts`, which only binds it to the app's
 * store and database.
 */
import type { Db } from '../db/driver';
import { landed, sameValue } from './sameValue';
import { subscribeKeys, type Store } from './store';

/** What a reader asks for: the read, and what it means by "nothing read yet". */
export interface SharedSpec<T> {
  /** The store keys a write bumps when this read may have changed (`useLocalQuery`'s `keys`). */
  keys: readonly string[];
  load: (db: Db) => Promise<T>;
  initial: T;
  same?: (held: T, next: T) => boolean;
}

interface Entry {
  id: string;
  /** `UNREAD` until the first read lands. */
  value: unknown;
  readers: Set<() => void>;
  spec: SharedSpec<unknown>;
  off: () => void;
  inFlight: boolean;
  /** A write, or a reader that wanted a fresh read, arrived during the read in flight. */
  again: boolean;
}

const UNREAD: unique symbol = Symbol('unread');

export interface SharedReadsDeps {
  store: Store;
  open: () => Promise<Db>;
  /** A read that threw: named, like `useLocalQuery`'s, because an empty card is what it looks like. */
  onError?: (id: string, err: unknown) => void;
}

export class SharedReads {
  private readonly entries = new Map<string, Entry>();
  /** How many reads have been started, for the tests and for nothing else. */
  started = 0;

  constructor(private readonly deps: SharedReadsDeps) {}

  /**
   * The entry's value, or `initial` before its first read has landed (or when no reader holds it).
   * Stable between changes, which is what `useSyncExternalStore` needs of a snapshot.
   */
  value<T>(id: string, initial: T): T {
    const entry = this.entries.get(id);
    return entry === undefined || entry.value === UNREAD ? initial : (entry.value as T);
  }

  /** One reader of `id`. Returns its unsubscribe; `onChange` is called when the value changes. */
  subscribe<T>(id: string, spec: SharedSpec<T>, onChange: () => void): () => void {
    let entry = this.entries.get(id);
    if (entry === undefined) {
      const created: Entry = {
        id,
        value: UNREAD,
        readers: new Set(),
        spec: spec as SharedSpec<unknown>,
        off: () => undefined,
        inFlight: false,
        again: false,
      };
      // one listener under every key, so a write that names three of them is one read (`store.ts`)
      created.off = subscribeKeys(this.deps.store, spec.keys, () => this.run(created));
      this.entries.set(id, created);
      entry = created;
      entry.readers.add(onChange);
      this.run(entry);
    } else {
      // the newest loader: the same read by construction (`id` names everything it closes over)
      entry.spec = spec as SharedSpec<unknown>;
      entry.readers.add(onChange);
      // a reader arriving later reads no older than it would have alone: one fresh read behind
      // the value it starts with — unless a read is already on its way, which is fresh enough
      if (!entry.inFlight) this.run(entry);
    }
    const held = entry;
    return () => {
      held.readers.delete(onChange);
      if (held.readers.size > 0) return;
      held.off();
      if (this.entries.get(id) === held) this.entries.delete(id);
    };
  }

  /** How many readers hold `id` right now (tests). */
  readers(id: string): number {
    return this.entries.get(id)?.readers.size ?? 0;
  }

  private run(entry: Entry): void {
    if (entry.inFlight) {
      entry.again = true;
      return;
    }
    entry.inFlight = true;
    entry.again = false;
    this.started += 1;
    const { load, initial } = entry.spec;
    void this.deps
      .open()
      .then(db => load(db))
      .then(
        next => this.land(entry, next),
        (err: unknown) => {
          this.deps.onError?.(entry.id, err);
          this.land(entry, initial);
        },
      )
      .finally(() => {
        entry.inFlight = false;
        // one more read for whatever arrived meanwhile, and only while somebody still holds it
        if (entry.again && entry.readers.size > 0) this.run(entry);
      });
  }

  private land(entry: Entry, next: unknown): void {
    // let go of while it was reading: nobody is holding the answer
    if (entry.readers.size === 0) return;
    const { initial, same = sameValue } = entry.spec;
    const out =
      entry.value === UNREAD ? next : landed(entry.value, next, initial, same as typeof sameValue);
    if (Object.is(out, entry.value)) return;
    entry.value = out;
    for (const reader of [...entry.readers]) reader();
  }
}

/** The one key a shared read is held under: what it reads, and what bumps it. */
export const sharedReadId = (share: string, keys: readonly string[]): string =>
  `${share}#${keys.join('|')}`;
