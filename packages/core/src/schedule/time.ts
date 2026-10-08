/**
 * Wall-clock arithmetic in the household's home zone (docs/NOTIFICATIONS.md §3.1–3.2;
 * SCHEDULE_LOGIC.md §8). `at_local_time` is an intent about the clock on the wall, so it is
 * re-resolved per local date through `zonedToUtc` — which shifts a spring-forward gap to the
 * instant the clock jumps to and picks the first of a fall-back pair — and never as
 * "yesterday + 24 h". Intervals are pure ms arithmetic and ignore all of this on purpose.
 */
import { localDayBounds, shiftDay, wallClock, zoneOffsetMs, zonedToUtc } from '../today/day';
import { DAY, MIN } from './types';

const HHMM = /^(\d{2}):(\d{2})$/;

/** Minutes since midnight of an `HH:MM`. */
export function hm(hhmm: string): number {
  const m = HHMM.exec(hhmm);
  if (!m) throw new RangeError(`not a time of day: ${hhmm}`);
  return Number(m[1]) * 60 + Number(m[2]);
}

export const hhmmOf = (minutes: number): string =>
  `${String(Math.floor(minutes / 60) % 24).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

/** Minutes since local midnight at the instant. */
export function wallMinutes(timeZone: string, atMs: number): number {
  const w = wallClock(timeZone, atMs);
  return w.hour * 60 + w.minute;
}

/** First instant of the local day containing `atMs`. */
export const dayStartOf = (timeZone: string, atMs: number): number =>
  localDayBounds(timeZone, atMs).startMs;

/** 0 = Sunday, in the household's zone. */
export function dowOf(timeZone: string, atMs: number): number {
  const w = wallClock(timeZone, atMs);
  // Date.UTC of the wall-clock date gives its weekday without the zone getting in the way
  return new Date(Date.UTC(w.year, w.month - 1, w.day)).getUTCDay();
}

/** The instant the wall clock reads `hhmm` on the local date containing `dayMs`. */
export function atWallTime(timeZone: string, dayMs: number, hhmm: string): number {
  const w = wallClock(timeZone, dayMs);
  const m = hm(hhmm);
  const t = zonedToUtc(timeZone, w.year, w.month, w.day, Math.floor(m / 60), m % 60);
  if (wallMinutes(timeZone, t) === m) return t;
  // The wall time does not exist today — it sits in the hour a spring-forward skips, and
  // `zonedToUtc` answered with the same wall time an hour on. NOTIFICATIONS §3.1: shift to the
  // FIRST existing instant, the moment the clock jumps. Find it as the earliest instant in the
  // three hours before the answer that already carries the answer's offset.
  const after = zoneOffsetMs(timeZone, t);
  let lo = t - 3 * 60 * MIN;
  let hi = t;
  while (hi - lo > MIN) {
    const mid = lo + Math.floor((hi - lo) / 2 / MIN) * MIN;
    if (zoneOffsetMs(timeZone, mid) === after) hi = mid;
    else lo = mid;
  }
  return hi;
}

/** The first instant strictly after `ts` at which the wall clock reads `hhmm`. */
export function atTimeAfter(timeZone: string, ts: number, hhmm: string): number {
  const today = atWallTime(timeZone, dayStartOf(timeZone, ts), hhmm);
  if (today > ts) return today;
  return atWallTime(timeZone, shiftDay(timeZone, ts, 1).startMs, hhmm);
}

/** Whether the wall clock at `ts` is inside the wrapping window [from, to). An empty window
 *  (from = to) contains nothing. */
export function inWindow(timeZone: string, ts: number, from: string, to: string): boolean {
  const f = hm(from);
  const t = hm(to);
  if (f === t) return false;
  const m = wallMinutes(timeZone, ts);
  return f < t ? m >= f && m < t : m >= f || m < t;
}

/** The instant the window closes after `ts` (the next reading of `to`). */
export const windowEndAfter = (timeZone: string, ts: number, to: string): number =>
  atTimeAfter(timeZone, ts, to);

/** `n` local days after the day containing `dayMs`, as a day start. Never "+ n × 24 h". */
export const dayPlus = (timeZone: string, dayMs: number, n: number): number =>
  shiftDay(timeZone, dayMs + 12 * 60 * MIN, n).startMs;

/** Whole local days from the day of `fromMs` to the day of `toMs` (0 for the same day). */
export function localDaysBetween(timeZone: string, fromMs: number, toMs: number): number {
  const a = dayStartOf(timeZone, fromMs);
  const b = dayStartOf(timeZone, toMs);
  return Math.round((b - a) / DAY);
}
