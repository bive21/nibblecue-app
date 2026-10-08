/**
 * ONE WRITE PER TIMER AT A TIME (the audit of 2026-09-24: care M1, timers 16 and 17).
 *
 * A double tap on "Woke up" — on Today's card, on the sticky timer bar, in the sheet — ran two
 * stops of the same timer, and each wrote a sleep entry: two live rows until the server's D26 check
 * adopted one, and offline both stayed. A double tap on a Start card wrote two timers for one baby.
 * A CueCoin read twice did the same. None of those surfaces had a busy flag, and the ones that did
 * kept it in React state, which a second tap in the same frame reads before the first has set it.
 *
 * So the guard is here, OUTSIDE React: a set of the writes that are under way, shared by every
 * component that holds `useTimerActions` — Today, the bar, the sheets, the long-run card and the
 * link router all stop the same timer through the same key, whichever one is tapped. A second
 * request for a key that is already running is dropped (it resolves to null, which every caller
 * already reads as "nothing written"), and the key is let go when the write settles, success or
 * not, so a failed stop can be tried again.
 *
 * It covers the taps that overlap. The ones that do not — a stale card tapped after its timer has
 * gone — are the data layer's to refuse (`stopTimer` checks the row is still there; `startTimer`
 * checks no timer of that kind is running for that child).
 */

export interface InFlight {
  /** Run `write` unless a write with the same key is still under way; then null. */
  run<T>(key: string, write: () => Promise<T>): Promise<T | null>;
  /** Whether a write with this key is under way. */
  has(key: string): boolean;
}

export function createInFlight(): InFlight {
  const busy = new Set<string>();
  return {
    async run<T>(key: string, write: () => Promise<T>): Promise<T | null> {
      if (busy.has(key)) return null;
      busy.add(key);
      try {
        return await write();
      } finally {
        busy.delete(key);
      }
    },
    has: (key: string) => busy.has(key),
  };
}

/** The app's one set: every timer write in every component goes through it. */
export const timerWrites: InFlight = createInFlight();

/** The key a stop, a pump's finish or a discard holds — one timer, whichever of them runs. */
export const endKey = (timerId: string): string => `end:${timerId}`;

/** The key a start holds: one timer of a kind per child (one pump per household). */
export const startKey = (type: string, childId: string | null): string =>
  `start:${type}:${childId ?? 'household'}`;
