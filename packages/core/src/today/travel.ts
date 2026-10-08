/**
 * THE PHONE'S OWN CLOCK, WHEREVER IT IS. The owner, 2026-09-23: *"use the phone's time zone while
 * traveling."*
 *
 * WHAT CHANGED. Every screen used to read times, and draw the edge of "today", in the household's
 * home zone (`households.home_time_zone`), so a family six hours east of home saw a breakfast
 * bottle logged at 1:30 a.m. and a "today" that ended at six in the evening. The spec's answer was
 * a bar asking once whether to switch (PRODUCT_SPEC §13, as it was); the owner's answer is that
 * the app does what every other app on the phone does and follows its clock. Nothing stored
 * changes — an entry is a UTC instant and always was — so two phones in two zones show one entry
 * at two local times, which is what a phone call between them would say too.
 *
 * ONE WAY OUT, AND IT IS PER TRIP. The rule gets one case wrong: a parent who flies WITHOUT the
 * baby. The baby's 7 a.m. bottle is still 7 a.m. at home, and following the phone would put it at
 * 7 a.m. wherever that parent landed. So a phone that is away can keep home time instead — and the
 * choice is remembered FOR THE ZONE IT WAS MADE IN (`keepHomeIn`), so it lapses by itself when the
 * phone comes home or goes somewhere else, and a work trip's choice cannot carry quietly into the
 * family holiday after it.
 *
 * THE HOME ZONE STAYS what the household's server work runs in (the materialiser, and reminders
 * sent by push once there is a push worker), what an entry falls back to when this phone has no
 * record of where it was, and what "away" is measured from.
 *
 * AND THE PHONE REMEMBERS WHERE IT WAS (`ZoneSpan`), so the nap outlook can read each sleep on the
 * clock of the zone it happened in (`schedule/naps.local.ts`). The record stays on the phone: a
 * list of zones a family's phone has been in is a travel history, and nothing here needs a server
 * to know it.
 */
import { zoneOffsetMs } from './day';

/** Which zone a phone reads times in: its own, unless it is away and was told to keep home time. */
export function phoneZone(input: {
  /** The zone the phone's own settings are in right now. */
  device: string;
  /** `households.home_time_zone`, once read; null before. */
  home: string | null;
  /** The zone in which this phone was asked to keep home time, if it was. */
  keepHomeIn: string | null;
}): string {
  const { device, home, keepHomeIn } = input;
  return home !== null && keepHomeIn === device && device !== home ? home : device;
}

/**
 * Whether the phone's clock reads differently from home's right now. Compared by OFFSET, not by
 * name: `Europe/Paris` and `Europe/Berlin` are two names for one clock, and a family from Berlin
 * spending a weekend in Paris has nothing to be told.
 */
export function isAway(device: string, home: string | null, atMs: number): boolean {
  if (home === null || device === home) return false;
  try {
    return zoneOffsetMs(device, atMs) !== zoneOffsetMs(home, atMs);
  } catch {
    // an identifier this runtime does not know: nothing to compare, so nothing to announce
    return false;
  }
}

/**
 * Whether the platform knows a zone by this name — the phone's stand-in for the server's check
 * against Postgres's own list (`set_home_time_zone`, migration 0107). A name Intl cannot format in
 * is one the server would refuse too.
 */
export function isKnownZone(zone: string): boolean {
  if (zone.length === 0 || zone.length > 64) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/**
 * A zone as a person says it: the city its IANA name ends in (`America/New_York` → "New York").
 * The fixed-offset `Etc/GMT±N` zones are POSIX-signed — `Etc/GMT+5` is five hours BEHIND UTC — so
 * they are spelled out the way a clock would show them.
 */
export function zoneCity(zone: string): string {
  if (/^(Etc\/)?(UTC|UCT|GMT|Zulu|Universal|Greenwich)$/.test(zone)) return 'UTC';
  const fixed = /^Etc\/GMT([+-])(\d{1,2})$/.exec(zone);
  if (fixed !== null) return `UTC${fixed[1] === '+' ? '−' : '+'}${Number(fixed[2])}`;
  const tail = zone.split('/').pop() ?? zone;
  return tail.replace(/_/g, ' ');
}

/* ------------------------------------------------------------------ where the phone has been */

/** From `fromMs` on, this phone read times in `zone`. */
export interface ZoneSpan {
  fromMs: number;
  zone: string;
}

/**
 * How many zone changes a phone keeps. The nap outlook reads two weeks back, and two weeks is a
 * handful of changes even for a family that flies a lot; the cap only stops a record growing for
 * ever on a phone that crosses a border every day.
 */
export const ZONE_RECORD_CAP = 32;

/** The zone in force at `ms` by the phone's record; `fallback` before the record begins. */
export function zoneAt(record: readonly ZoneSpan[], ms: number, fallback: string): string {
  let zone = fallback;
  for (const span of record) {
    if (span.fromMs > ms) break;
    zone = span.zone;
  }
  return zone;
}

/**
 * The record with `zone` noted from `atMs` on — the same array when the phone was already there,
 * so a caller can tell "nothing to save" by identity.
 */
export function noteZone(
  record: readonly ZoneSpan[],
  zone: string,
  atMs: number,
  cap = ZONE_RECORD_CAP,
): readonly ZoneSpan[] {
  const last = record[record.length - 1];
  if (last !== undefined && last.zone === zone) return record;
  // a phone whose clock was set back must not write a span that sorts before the one it follows
  const fromMs = last !== undefined && atMs < last.fromMs ? last.fromMs : atMs;
  const next = [...record, { fromMs, zone }];
  return next.length > cap ? next.slice(next.length - cap) : next;
}

/**
 * The record out of storage, or an empty one. Whatever an older build or a damaged value left
 * there is dropped span by span rather than trusted: the worst a bad record can do is send an
 * entry to the home zone, which is where it would have been read before the record existed.
 */
export function parseZoneRecord(text: string | null | undefined): ZoneSpan[] {
  if (typeof text !== 'string' || text.length === 0) return [];
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  const out: ZoneSpan[] = [];
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue;
    const { fromMs, zone } = item as { fromMs?: unknown; zone?: unknown };
    if (typeof fromMs !== 'number' || !Number.isFinite(fromMs)) continue;
    if (typeof zone !== 'string' || zone.length === 0) continue;
    const last = out[out.length - 1];
    if (last !== undefined && fromMs < last.fromMs) continue;
    out.push({ fromMs, zone });
  }
  return out.slice(-ZONE_RECORD_CAP);
}
