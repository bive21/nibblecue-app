/**
 * WHETHER IT IS THE PHONE'S DAYTIME, 8 a.m. TO 9 p.m. (core's `isDaytimeHour`, the trial sheets'
 * hours), for the rules that keep to it: Calm motion's "At night" (`AppearanceProvider`) and the
 * celebration sheet's rising (`CelebrationSlot`).
 *
 * WHAT IT RETURNS IS THE ANSWER, NOT THE TIME (`useDayKey.ts`, `appearance/useAutoDark.ts`: the same
 * shape, for the same reason). It reads the app's one minute clock, which also looks again the moment
 * the app comes back to the foreground, and React re-renders a reader only when the answer changed:
 * `useDaytime` twice a day, at eight and at nine, and `usePhoneHour` once an hour.
 *
 * WHY THE MINUTE AND NOT A TIMEOUT AIMED AT NINE: a timeout aimed at an edge is wrong whenever the
 * wall clock moves under it (a change to summer time, a flight, a phone that slept through it), and
 * the failure is an app still calm at ten in the morning with nothing on the screen to say why. The
 * minute is cheap and corrects itself, and it lands on each edge within a minute of it.
 *
 * THE PHONE'S OWN CLOCK, never the household's zone: this is about the room the phone is in.
 */
import { isDaytimeHour } from '@nibblecue/core';
import { useSyncExternalStore } from 'react';
import { subscribeToMinuteClock } from './useDayKey';

const readHour = (): number => new Date().getHours();
const readDaytime = (): boolean => isDaytimeHour(readHour());

/** The phone's local hour, 0 to 23. */
export function usePhoneHour(): number {
  return useSyncExternalStore(subscribeToMinuteClock, readHour, readHour);
}

/** It is 8 a.m. to 9 p.m. on the phone. */
export function useDaytime(): boolean {
  return useSyncExternalStore(subscribeToMinuteClock, readDaytime, readDaytime);
}
