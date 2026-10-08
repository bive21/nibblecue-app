/**
 * THE DAY A MEASUREMENT WAS TAKEN, AS AN INSTANT (PRODUCT_SPEC.md §6.9): midday on the chosen
 * day, IN THE HOUSEHOLD'S ZONE — the zone every other time on the sheet is read in.
 *
 * The growth sheet's date row is a day, not a time ("you're not going to measure the baby every
 * hour" — the owner, 2026-09-16), and §6.9 writes it as midday so a record made at 11 p.m. and
 * one made at 7 a.m. the same day sort together. The audit of 2026-09-24 found both halves of
 * that missed: "today" was saved at the moment the sheet opened, and a picked day was turned into
 * midday in the PHONE's zone — a family keeping home time abroad, or a phone whose zone had not
 * caught up after a flight, got a measurement on a day either side of the one they chose.
 *
 * Pure, so the arithmetic is a node test; the date picker itself speaks in `yyyy-mm-dd` keys and
 * never in instants, so nothing between the picker and here can shift a day.
 */
import { localDayKey, zonedToUtc } from '@nibblecue/core';

/** `yyyy-mm-dd` for the household's day containing `atMs` — what the date picker opens on. */
export const measuredDayKey = (atMs: number, timeZone: string): string =>
  localDayKey(timeZone, atMs);

/** Midday on a `yyyy-mm-dd` day in the household's zone; null for a key that is not a date. */
export function middayOn(dayKey: string, timeZone: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey);
  if (m === null) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return zonedToUtc(timeZone, y, mo, d, 12);
}

/** Midday on the household's day containing `atMs` — what "today" means on a date row. */
export function middayOfDay(atMs: number, timeZone: string): number {
  return middayOn(measuredDayKey(atMs, timeZone), timeZone) ?? atMs;
}
