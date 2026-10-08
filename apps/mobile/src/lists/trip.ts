/**
 * THE SHOPPING TRIP'S EDGES, as the screens hold them: the household's own days for the writes that
 * finish a trip (`finishTrip`, `putOnList` in `data/lists.ts`), and the one toast every add says
 * when it started a new list.
 *
 * THE DAYS ARE THE HOUSEHOLD'S, never the device's (`useTimeZone`, like the checklist and Today): a
 * bought supply records the day its line went into the basket, and a caregiver in another zone
 * must record the household's day, not their own.
 *
 * Pure apart from the toast it is handed, so the scenarios run it in node as the screens run it.
 */
import { localDayKey } from '@nibblecue/core';
import type { FinishedTrip } from '../data/lists';
import type { ToastValue } from '../ui/toast';
import { SHOPPING } from './copy';

export interface TripDays {
  /** The household's day now, `YYYY-MM-DD`. */
  today: string;
  /** The household's day for an instant. */
  dayOf: (ms: number) => string;
}

/** The household's day for an instant — or the UTC one for a zone this device's ICU cannot read. */
function dayIn(timeZone: string, ms: number): string {
  try {
    return localDayKey(timeZone, ms);
  } catch {
    return new Date(ms).toISOString().slice(0, 10);
  }
}

export function tripDays(timeZone: string, nowMs: number = Date.now()): TripDays {
  return { today: dayIn(timeZone, nowMs), dayOf: ms => dayIn(timeZone, ms) };
}

/**
 * WHAT AN ADD SAYS. On its own, what it always said. When it started a new list, the same sentence
 * with the trip that ended beside it, and the Undo that puts that trip back — the lines return to
 * the basket and each item's previous date is restored. The line just added stays: it was asked for.
 */
export function sayPutOn(
  toast: Pick<ToastValue, 'show'>,
  said: string,
  finished: FinishedTrip | null,
  putBack: (trip: FinishedTrip) => Promise<unknown>,
): void {
  if (finished === null || finished.lineIds.length === 0) {
    toast.show(said);
    return;
  }
  toast.show(SHOPPING.newList(said, finished.lineIds.length), {
    undo: () => void putBack(finished).then(() => toast.show(SHOPPING.tripUndone)),
  });
}
