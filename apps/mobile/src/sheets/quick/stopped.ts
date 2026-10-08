/**
 * A TIMER THAT HAS BEEN STOPPED BUT NOT YET FINISHED.
 *
 * The owner, 2026-09-18, for the second time: *"when stopping an ongoing pumping, the timer still
 * runs when filling out how many oz received from pumping. i've talked about this before and it
 * needs to be fix. stopping pumping will stop the time and wait until users finish the inputing
 * the qty recevived."*
 *
 * ── WHY IT CAME BACK ────────────────────────────────────────────────────────────────────────
 *
 * It was fixed inside the sheet and only inside the sheet. `RunningPanel` holds a `stoppedAtMs`
 * and freezes its own card, which is right — but Today's timer card stops a pump by OPENING that
 * sheet (`shell.openQuickEntry('pump')`), and the sheet opens with no idea that a stop has
 * happened. So the panel started counting again from zero-knowledge, and the card behind it never
 * stopped at all. Two surfaces, one fact, held in one of them.
 *
 * ── WHY IT IS HERE AND NOT IN THE DATABASE ──────────────────────────────────────────────────
 *
 * `running_timers` has `started_at` and `paused_ms` and nothing else (hard rule 12: a timer is
 * timestamps). "I have stopped and am typing the amount" is not a fact about the household — the
 * other parent's phone is not in the middle of a form — and it lasts for as long as one sheet is
 * open. Putting it in the shared row would mean a migration, a sync branch and a state that can
 * be left behind by a crash on someone else's device. A module-level map, cleared when the write
 * lands, is the honest size of the thing.
 *
 * It is subscribed to rather than passed down because the two readers — Today's card and the
 * sheet's — have no parent between them that is not the whole app.
 */
import { haptic } from '@nibblecue/ui/haptics';
import { useSyncExternalStore } from 'react';

const stops = new Map<string, number>();
/** Stops the stash-save sheet is holding — see `handStopToStash`. */
const handedOver = new Set<string>();
const listeners = new Set<() => void>();
/**
 * The snapshot readers compare by identity. `useSyncExternalStore` re-renders whenever the
 * snapshot changes, so building a fresh object on every call would loop for ever: this one is
 * rebuilt only when something actually changed.
 */
let snapshot: Readonly<Record<string, number>> = Object.freeze({});
const EMPTY: Readonly<Record<string, number>> = Object.freeze({});

const announce = (): void => {
  snapshot = Object.freeze(Object.fromEntries(stops));
  for (const fn of listeners) fn();
};

/**
 * The parent stopped this timer; every surface freezes at `atMs` until the write lands.
 *
 * AND THE STOP IS FELT HERE, as a `thud` (the owner, 2026-09-25: "a firm tap on Save, a double tap
 * when a timer starts"; a Save and every other stop have been a soft `success` since 2026-09-26,
 * when the Save's check came). Every other timer's stop
 * writes its entry and is felt through the save funnel (`announce`, useWriteContext.ts); a
 * pump's writes NOTHING until its output is typed, so this is the one place every pump stop
 * passes through — Today's card and its sticky bar, the sheet's own card, "It ended", a widget's
 * Stop, a coin — and only a NEW stop is felt: a stop already held at that instant returns above,
 * felt as nothing, as it changes nothing. The frozen clock is the screen's half of it. The
 * session's own Save is felt later, as the save it is.
 */
export function markStopped(timerId: string, atMs: number): void {
  if (stops.get(timerId) === atMs) return;
  stops.set(timerId, atMs);
  haptic('thud');
  announce();
}

/** The write landed, or the parent went back to it: the timer is live again, or gone. */
export function clearStopped(timerId: string): void {
  handedOver.delete(timerId);
  if (!stops.delete(timerId)) return;
  announce();
}

/**
 * STOPS THE STASH-SAVE SHEET IS HOLDING (the audit of 2026-09-24, feeding M2 / timers 6).
 *
 * "Choose where it goes" on a running pump closes the pump sheet and opens the sheet that asks
 * where the milk goes. The session is not written until THAT sheet saves — so the stop is still the
 * truth while it is up: the card behind it must stay frozen at the instant the parent stopped, and
 * a parent who backs out must land on their output form with the stop still in place. It used to
 * be cleared before the second sheet even opened: the card counted again behind it, and an X
 * there left the pump silently running with the typed amounts gone.
 *
 * A stop handed over here is left alone by `clearAllStopped` (the pump sheet going away is no
 * longer its end); the stash-save sheet ends it — `clearStopped` once the session is written, or
 * `takeBackStop` when the parent goes back to the output form, which owns it again.
 */
/** The stash-save sheet owns this stop now; the pump sheet closing does not end it. */
export function handStopToStash(timerId: string): void {
  if (stops.has(timerId)) handedOver.add(timerId);
}

/** The pump's output form owns this stop again (the parent backed out of the stash sheet). */
export function takeBackStop(timerId: string): void {
  handedOver.delete(timerId);
}

/** Whether the stash-save sheet is holding this stop. */
export function isHandedToStash(timerId: string): boolean {
  return handedOver.has(timerId);
}

/**
 * EVERY STOP LET GO AT ONCE — what dismissing the pump's sheet means (`QuickEntrySheet`).
 *
 * A stop only ever exists while that sheet is asking for the output, so the sheet going away is
 * the one moment every stop must end, however it goes: its X, a swipe, the scrim, Back, or another
 * sheet taking its place. It used to be released when the output PANEL unmounted, and that is not
 * the same moment: the sheet keeps its body mounted until its close animation reports finished,
 * and a reopened sheet unmounts the OLD panel only after Today has marked the NEW stop — so the
 * old panel's cleanup could wipe the stop the parent had just made. Both showed up as a frozen
 * card after the X (the owner, 2026-09-24, for the third time: "if we cancel the stop pumpin by
 * clicking X from it, the timer visually stops, until we click stop pumping again").
 *
 * The one exception is a stop handed to the stash-save sheet (`handStopToStash`): the pump sheet
 * closed to make room for it, and the output it asked for has not been written yet.
 */
export function clearAllStopped(): void {
  let changed = false;
  for (const id of [...stops.keys()]) {
    if (handedOver.has(id)) continue;
    stops.delete(id);
    changed = true;
  }
  if (changed) announce();
}

export function stoppedAt(timerId: string): number | null {
  return stops.get(timerId) ?? null;
}

export function subscribeStopped(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/**
 * Every stopped timer, by id. `useSyncExternalStore` rather than a context because the store
 * outlives every component that reads it — the sheet mounts after the card has already written
 * to it — and a map rather than one id because Today draws a card per running timer and a hook
 * cannot be called inside that loop.
 */
export function useStoppedTimers(): Readonly<Record<string, number>> {
  return useSyncExternalStore(
    subscribeStopped,
    () => snapshot,
    () => EMPTY,
  );
}

/** The stop instant for one timer. */
export function useStoppedAt(timerId: string | null): number | null {
  const all = useStoppedTimers();
  return timerId === null ? null : (all[timerId] ?? null);
}
