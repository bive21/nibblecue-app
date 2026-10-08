/**
 * `isoDateIn` reads the day off the kept zone offset (`localDayKey`) instead of building an ICU
 * formatter per call (2026-10-08). It must say exactly what that formatter said, so it is held to
 * one here: every three hours for two years (each a minute either side too), in zones either side of the date line, with DST and with
 * half-hour and 45-minute offsets.
 */
import { describe, expect, it } from 'vitest';
import { zonedToUtc } from '../today/day';
import { isoDateIn } from './date';

// one reference formatter per zone: building one per call is the cost being removed, and two
// years of them would be a minute of this test
const reference = new Map<string, Intl.DateTimeFormat>();
const viaIntl = (timeZone: string, ms: number): string => {
  let f = reference.get(timeZone);
  if (f === undefined) {
    f = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    reference.set(timeZone, f);
  }
  const parts = f.formatToParts(ms);
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
};

const ZONES = [
  'UTC',
  'America/New_York',
  'America/Los_Angeles',
  'Europe/Berlin',
  'Asia/Kolkata',
  'Asia/Kathmandu',
  'Australia/Lord_Howe',
  'Pacific/Auckland',
  'Pacific/Kiritimati',
  'Pacific/Pago_Pago',
];

describe('isoDateIn', () => {
  it('names the same day the en-CA formatter it replaced named, every three hours', () => {
    const from = Date.UTC(2025, 0, 1);
    const to = Date.UTC(2027, 0, 1);
    for (const zone of ZONES) {
      for (let ms = from; ms < to; ms += 3 * 3_600_000) {
        for (const at of [ms - 60_000, ms, ms + 60_000]) {
          const got = isoDateIn(zone, at);
          // compared by hand and asserted only on a miss: 175,000 expects would be the whole run
          if (got !== viaIntl(zone, at))
            expect([zone, at, got]).toEqual([zone, at, viaIntl(zone, at)]);
        }
      }
    }
  }, 30_000);

  it('turns the day at each zone’s own midnight, a minute either side, every day of 2026', () => {
    for (const zone of ZONES) {
      for (let day = 0; day < 365; day++) {
        const d = new Date(Date.UTC(2026, 0, 1 + day));
        const midnight = zonedToUtc(zone, d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
        for (const at of [midnight - 60_000, midnight, midnight + 60_000]) {
          expect(isoDateIn(zone, at), `${zone} ${at}`).toBe(viaIntl(zone, at));
        }
      }
    }
  });

  it('still refuses a zone the platform does not know', () => {
    expect(() => isoDateIn('Not/A_Zone', Date.UTC(2026, 9, 8))).toThrow();
  });
});
