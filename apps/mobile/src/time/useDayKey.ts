/**
 * WHICH CALENDAR DAY IT IS, as `yyyy-mm-dd`, for a surface that changes at midnight and at no other
 * time — the top bar's month-day party hat, and the age the child chip reads beside it.
 *
 * WHAT IT RETURNS IS THE ANSWER, NOT THE TIME (`appearance/useAutoDark.ts` has the same shape, for
 * the same reason). One clock for the whole app looks once a minute and again the moment the app
 * comes back to the foreground, and every reader asks it for the day; React compares the answer and
 * re-renders a reader only when it changed — at midnight, or when a parent comes back to the app on
 * a new day or changes the phone's date — never sixty times an hour.
 *
 * WHY THE MINUTE AND NOT A TIMEOUT TO MIDNIGHT: a timeout aimed at midnight is wrong whenever the
 * wall clock moves under it (a flight, a clock change, a phone that slept through it), and the
 * foreground listener covers the timer that never fired while the phone was away.
 *
 * `timeZone` is the household's zone (`useTimeZone`) for anything dated the way the log is — the
 * month-day is the celebration calendar's day, and that is read where the household is. `null`
 * reads the phone's own clock, which is what `ageLabel` counts days on.
 */
import { localDayKey } from '@nibblecue/core';
import { useCallback, useSyncExternalStore } from 'react';
import { AppState, type NativeEventSubscription } from 'react-native';

const MINUTE = 60_000;

/** The phone's own calendar day: the local fields `ageLabel` and `daysOld` count on. */
export function deviceDayKey(nowMs: number): string {
  const at = new Date(nowMs);
  const p2 = (n: number): string => String(n).padStart(2, '0');
  return `${at.getFullYear()}-${p2(at.getMonth() + 1)}-${p2(at.getDate())}`;
}

/** The day `nowMs` falls on in `timeZone`, or on the phone's own clock. */
export const dayKeyAt = (timeZone: string | null, nowMs: number): string =>
  timeZone === null ? deviceDayKey(nowMs) : localDayKey(timeZone, nowMs);

/*
  ONE CLOCK FOR EVERY READER: started by the first, stopped with the last. Two kinds of reader hang
  off it. An ANSWER reader (the day, the daytime, the hour) is told every minute and the moment the
  app comes back to the foreground, and asks its own question. A MINUTE reader (`useMinuteTick`) is
  told every minute and nothing else — as its own interval used to tell it — and is handed the one
  instant the minute was taken at, so every screen that reads the minute reads the same one.
*/
const readers = new Set<() => void>();
const minuteReaders = new Set<(atMs: number) => void>();
let every: ReturnType<typeof setInterval> | null = null;
let foreground: NativeEventSubscription | null = null;

const tell = () => {
  for (const r of readers) r();
};

const everyMinute = () => {
  const at = Date.now();
  for (const r of [...minuteReaders]) r(at);
  tell();
};

function start(): void {
  if (every !== null) return;
  every = setInterval(everyMinute, MINUTE);
  foreground = AppState.addEventListener('change', state => {
    if (state === 'active') tell();
  });
}

function stopIfUnread(): void {
  if (readers.size > 0 || minuteReaders.size > 0 || every === null) return;
  clearInterval(every);
  every = null;
  foreground?.remove();
  foreground = null;
}

function subscribe(reader: () => void): () => void {
  readers.add(reader);
  start();
  return () => {
    readers.delete(reader);
    stopIfUnread();
  };
}

/**
 * THE MINUTE ITSELF, off the same one clock (`time/useMinuteTick.ts`): `reader` is handed the
 * instant each minute was taken at. Never told on a return to the foreground — a minute reader
 * never was.
 */
export function subscribeToMinute(reader: (atMs: number) => void): () => void {
  minuteReaders.add(reader);
  start();
  return () => {
    minuteReaders.delete(reader);
    stopIfUnread();
  };
}

export function useDayKey(timeZone: string | null): string {
  // the answer is the day itself, a string: React re-renders only when it is a different day
  const read = useCallback(() => dayKeyAt(timeZone, Date.now()), [timeZone]);
  return useSyncExternalStore(subscribe, read, read);
}

/**
 * The same one clock, for another answer read off it (`useDaytime.ts`: whether it is the phone's
 * daytime). Two answers on one clock are one interval, not two.
 */
export { subscribe as subscribeToMinuteClock };
