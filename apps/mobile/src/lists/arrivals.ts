/**
 * THE LINES PUT ON THE SHOPPING LIST ON THIS PHONE, a moment ago — so the list can pop each one
 * into its place the next time it is in front of the parent (the owner, 2026-09-26: *"add
 * animation in shopping list to make it more fun"*; `listMotion.ts` has the pop's rules).
 *
 * A LINE IS NOTED WHERE IT IS WRITTEN, by the id the write hands back: the Supplies page's +, the
 * list's own picker, the supply sheet's switch, "running low" and the dashed one-off row. The list
 * reads the notes when it draws, so a line added on the Supplies page — a page pushed over the
 * tabs, with the list out of sight under it — pops when the parent comes back to the list, rather
 * than behind the page where nobody sees it. A line the other phone adds is never noted: it is
 * simply drawn, as a tick from the other phone is drawn and never celebrated.
 *
 * IN MEMORY, AND NEVER WRITTEN ANYWHERE: a note is about a moment on this phone, and it is gone
 * once its pop has played, or a minute after it was made (`ARRIVAL_FRESH_MS`), whichever is first.
 * Nothing about the list itself — its lines, their ids, what is saved — depends on it.
 */
import { ARRIVAL_FRESH_MS } from '../screens/lists/listMotion';

export interface Arrivals {
  /** A line was put on the list here, now. */
  note(id: string, at?: number): void;
  /** The lines noted and still fresh at `now`, oldest first. Stale notes are dropped. */
  fresh(now?: number): string[];
  /** Their pops have played: forget them. */
  forget(ids: Iterable<string>): void;
}

/** A store of notes: one for the app (`arrivals`), and a fresh one per test. */
export function createArrivals(): Arrivals {
  const noted = new Map<string, number>();
  return {
    note(id, at = Date.now()) {
      noted.set(id, at);
    },
    fresh(now = Date.now()) {
      const out: [string, number][] = [];
      for (const [id, at] of noted) {
        if (now - at > ARRIVAL_FRESH_MS || at > now + ARRIVAL_FRESH_MS) noted.delete(id);
        else out.push([id, at]);
      }
      return out.sort((a, b) => a[1] - b[1]).map(([id]) => id);
    },
    forget(ids) {
      for (const id of ids) noted.delete(id);
    },
  };
}

/** This phone's notes. */
export const arrivals: Arrivals = createArrivals();
