import { localDayKey } from '@nibblecue/core';
import { getCalendars, getLocales } from 'expo-localization';

export function deviceLocale(): string {
  return getLocales()[0].languageTag || 'en-US';
}

export function deviceTimeZone(): string {
  return getCalendars()[0].timeZone ?? 'UTC';
}

/**
 * Today's calendar date in the device's zone, as YYYY-MM-DD — the input every date rule takes.
 *
 * Read through core's `localDayKey`, which keeps the zone's offset, rather than a new en-CA
 * formatter per call (2026-10-08, speed): Today asks for it at every render, and on a phone each
 * formatter is a trip across JNI into ICU. The same day, by `vaccines/date.test.ts` in core.
 */
export function todayIso(now: Date = new Date(), timeZone: string = deviceTimeZone()): string {
  try {
    return localDayKey(timeZone, now.getTime());
  } catch {
    return now.toISOString().slice(0, 10);
  }
}
