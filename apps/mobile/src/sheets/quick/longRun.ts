/**
 * "STILL GOING" — where the answer lives (the long-run ask; `packages/core/schedule/longRun.ts`
 * has the arithmetic and why the ask is about a timer rather than about a person).
 *
 * The same store shape as `stopped.ts`, and for the same reason: two surfaces show the ask —
 * the card on Today and the running panel inside the Quick Entry sheet — and the nearest parent
 * they share is the app. A parent who says "still going" on one has said it on both.
 *
 * IT IS DELIBERATELY NOT PERSISTED. The snooze is a fact about this sitting: the ask comes back
 * a whole limit later anyway, and a timer that survives a restart is exactly the timer somebody
 * should be asked about again. Nothing here is a log entry, so nothing here is lost by being
 * forgotten (CLAUDE.md rule 7 is about entries, and this is not one).
 */
import { useSyncExternalStore } from 'react';

const snoozes = new Map<string, number>();
const listeners = new Set<() => void>();
/** Rebuilt only when something changed: `useSyncExternalStore` compares snapshots by identity. */
let snapshot: Readonly<Record<string, number>> = Object.freeze({});
const EMPTY: Readonly<Record<string, number>> = Object.freeze({});

const announce = (): void => {
  snapshot = Object.freeze(Object.fromEntries(snoozes));
  for (const fn of listeners) fn();
};

/** The parent said the session is still running, at `atMs`. */
export function snoozeLongRun(timerId: string, atMs: number): void {
  if (snoozes.get(timerId) === atMs) return;
  snoozes.set(timerId, atMs);
  announce();
}

function subscribeLongRun(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Every snoozed timer, by id — a map rather than one id, because Today draws a card per timer. */
export function useLongRunSnoozes(): Readonly<Record<string, number>> {
  return useSyncExternalStore(
    subscribeLongRun,
    () => snapshot,
    () => EMPTY,
  );
}
