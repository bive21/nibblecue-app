/**
 * A SETTING SHOWN AT ONCE, WRITTEN BEHIND (the owner, 2026-09-26: *"in reminders menu, there is a
 * delay when adjusting quiet hours, sometimes there is a delay when turning off or on"*).
 *
 * WHAT WAS SLOW. The Reminders page drew quiet hours and every reminder level from the DATABASE: a
 * tap wrote, and the control moved only when the write had committed and the preferences had been
 * read back. The write was one transaction per module channel, awaited in a row, and every commit
 * woke everything that listens to the preferences or the outbox — the notification planner re-planned
 * and reconciled the phone's scheduled reminders, Today and the duty queries re-read, the sync engine
 * tried a push — once per channel. So a switch waited for all of that, and turning quiet hours off
 * waited for the LAST channel, because the page reads "on" while any channel still has a window.
 * The writes are one commit now (`savePreferences`); this is the other half — the control does not
 * wait for any of it.
 *
 * HOW. A tap puts the value it asked for in an overlay, keyed by what it changes, and the screen
 * shows the overlay over the database. The write runs behind. Then one of three things:
 *
 *   · it LANDS: the entry is kept until the database has been read back since, and is then dropped —
 *     from there the database is the truth again, whatever it says (another phone may have written
 *     after us, and the database is what the planner reminds from);
 *   · it FAILS: the entry is dropped, so the control goes back to what is really stored, and the
 *     caller says so — `write` answers `lost`, and the screen shows a toast. Nothing is left showing
 *     a setting that is not saved;
 *   · a LATER TAP on the same key got there first: the later tap owns the key, and this write's
 *     answer changes nothing on screen (`superseded`) — a failure of a value the parent has already
 *     changed their mind about is not theirs to be told about.
 *
 * Pure TypeScript with no React, so all of it is tested in node (`pendingWrites.test.ts`), against
 * writes held open and released by hand; `usePendingWrites` is the one-line hook the screen uses.
 */

/** One key's value, as a tap asked for it. */
type Pending<V, S> =
  | { value: V; tap: number; landed: false }
  /** `seen` is the database's snapshot when the write landed: any later one has read it back. */
  | { value: V; tap: number; landed: true; seen: S };

export type WriteResult = 'saved' | 'lost' | 'superseded';

export interface Stored<K, V, S> {
  /** The database's latest read, as one value whose identity changes when it is read again. */
  snapshot: S;
  /** What the database holds for a key, in that snapshot. */
  read: (key: K) => V;
  /** Whether two values are the same setting (a fresh object each read is not a change). */
  same: (a: V, b: V) => boolean;
}

export class PendingWrites<K, V, S> {
  private overlay: ReadonlyMap<K, Pending<V, S>> = new Map();
  private taps = 0;
  private stored: Stored<K, V, S>;

  constructor(
    stored: Stored<K, V, S>,
    /** Called whenever what `show` answers may have changed: the screen draws again. */
    private readonly changed: () => void,
  ) {
    this.stored = stored;
  }

  /**
   * What to draw for `key`: the tap's value while one is pending, else `stored` — which the screen
   * passes in from the read it is rendering with, so the answer is never a render behind it.
   */
  show(key: K, stored: V): V {
    const p = this.overlay.get(key);
    return p === undefined ? stored : p.value;
  }

  /** Whether a tap on `key` has not been read back from the database yet. */
  pending(key: K): boolean {
    return this.overlay.has(key);
  }

  /**
   * The database was read again. A landed entry is dropped once the database has been read since
   * it landed, or as soon as the database already says the same; an entry still being written is
   * kept, because a read from before its commit does not have it yet.
   */
  observe(stored: Stored<K, V, S>): void {
    this.stored = stored;
    this.settle();
  }

  /**
   * Shows `entries` at once, then runs `commit`. Answers `saved` once it has landed, `lost` when it
   * failed and the screen went back to what is stored, or `superseded` when a later tap owns every
   * key it touched by the time it answered.
   */
  async write(
    entries: readonly (readonly [K, V])[],
    commit: () => Promise<unknown>,
  ): Promise<WriteResult> {
    const tap = (this.taps += 1);
    const keys = entries.map(([k]) => k);
    const next = new Map(this.overlay);
    for (const [k, v] of entries) next.set(k, { value: v, tap, landed: false });
    this.set(next);

    let ok: boolean;
    try {
      await commit();
      ok = true;
    } catch {
      ok = false;
    }

    const mine = keys.filter(k => this.overlay.get(k)?.tap === tap);
    if (mine.length === 0) return 'superseded';
    const after = new Map(this.overlay);
    for (const k of mine) {
      const p = after.get(k);
      if (p === undefined) continue;
      if (ok) after.set(k, { value: p.value, tap, landed: true, seen: this.stored.snapshot });
      else after.delete(k);
    }
    this.set(after);
    if (ok) this.settle();
    return ok ? 'saved' : 'lost';
  }

  private settle(): void {
    const { snapshot, read, same } = this.stored;
    let next: Map<K, Pending<V, S>> | null = null;
    for (const [k, p] of this.overlay) {
      if (!p.landed) continue;
      if (p.seen !== snapshot || same(read(k), p.value)) {
        next ??= new Map(this.overlay);
        next.delete(k);
      }
    }
    if (next !== null) this.set(next);
  }

  private set(next: ReadonlyMap<K, Pending<V, S>>): void {
    this.overlay = next;
    this.changed();
  }
}

/**
 * THE SAME PROMISE FOR A PHONE-ONLY SETTING — the heads-up, the shade, the summaries — which lives
 * in the phone's own storage rather than the database, and is held by the screen as one value.
 * These already moved at once; what they lacked was the way back. A save that fails puts the value
 * the tap replaced back, and answers `lost` — unless a later tap has been made since, whose value
 * stands (`superseded`). And the stored value, arriving after the screen opened, never overwrites a
 * tap made before it arrived.
 */
export class LocalSetting<T extends object> {
  private value: T;
  private taps = 0;

  constructor(
    initial: T,
    /** Called with every value the screen should now draw. */
    private readonly changed: (value: T) => void,
  ) {
    this.value = initial;
  }

  current(): T {
    return this.value;
  }

  /** What the phone's storage holds, read once the screen opens. A tap already made wins. */
  arrived(stored: T): void {
    if (this.taps > 0) return;
    this.set(stored);
  }

  async write(patch: Partial<T>, save: (next: T) => Promise<unknown>): Promise<WriteResult> {
    const before = this.value;
    const next = { ...before, ...patch };
    const tap = (this.taps += 1);
    this.set(next);
    try {
      await save(next);
      return 'saved';
    } catch {
      if (this.taps !== tap) return 'superseded';
      this.set(before);
      return 'lost';
    }
  }

  private set(value: T): void {
    this.value = value;
    this.changed(value);
  }
}
