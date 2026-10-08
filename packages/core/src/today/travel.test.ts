/**
 * The phone's own clock, wherever it is (the owner, 2026-09-23), and the record of where it was.
 */
import { describe, expect, it } from 'vitest';
import {
  isAway,
  isKnownZone,
  noteZone,
  parseZoneRecord,
  phoneZone,
  zoneAt,
  zoneCity,
  ZONE_RECORD_CAP,
  type ZoneSpan,
} from './travel';

const NY = 'America/New_York';
const PARIS = 'Europe/Paris';

describe('which zone a phone reads times in', () => {
  it('is the phone’s own — at home, away, and before the household’s zone is read', () => {
    expect(phoneZone({ device: NY, home: NY, keepHomeIn: null })).toBe(NY);
    expect(phoneZone({ device: PARIS, home: NY, keepHomeIn: null })).toBe(PARIS);
    expect(phoneZone({ device: PARIS, home: null, keepHomeIn: PARIS })).toBe(PARIS);
  });

  it('is home’s only where the phone was told to keep home time', () => {
    expect(phoneZone({ device: PARIS, home: NY, keepHomeIn: PARIS })).toBe(NY);
  });

  it('forgets that choice by itself on the next trip, and at home', () => {
    // the work trip's choice does not follow the phone to the family holiday
    expect(phoneZone({ device: 'Asia/Tokyo', home: NY, keepHomeIn: PARIS })).toBe('Asia/Tokyo');
    expect(phoneZone({ device: NY, home: NY, keepHomeIn: PARIS })).toBe(NY);
  });
});

describe('away is a different clock, not a different name', () => {
  const september = Date.UTC(2026, 8, 23, 12);
  it('is away six hours east of home', () => {
    expect(isAway(PARIS, NY, september)).toBe(true);
  });

  it('is not away in another city on the same clock', () => {
    expect(isAway(PARIS, 'Europe/Berlin', september)).toBe(false);
  });

  it('follows the clocks through the year: Phoenix keeps no summer time and Denver does', () => {
    expect(isAway('America/Phoenix', 'America/Denver', Date.UTC(2027, 0, 15, 12))).toBe(false);
    expect(isAway('America/Phoenix', 'America/Denver', Date.UTC(2027, 6, 15, 12))).toBe(true);
  });

  it('is never away before the household’s zone is known, or from a zone it cannot read', () => {
    expect(isAway(PARIS, null, september)).toBe(false);
    expect(isAway('Not/AZone', NY, september)).toBe(false);
  });
});

describe('a zone the platform knows', () => {
  it('knows the real names and refuses the rest', () => {
    expect(isKnownZone(PARIS)).toBe(true);
    expect(isKnownZone('UTC')).toBe(true);
    expect(isKnownZone('Mars/Olympus_Mons')).toBe(false);
    expect(isKnownZone('')).toBe(false);
    expect(isKnownZone('x'.repeat(65))).toBe(false);
  });
});

describe('a zone as a person says it', () => {
  it('names the city', () => {
    expect(zoneCity(NY)).toBe('New York');
    expect(zoneCity(PARIS)).toBe('Paris');
    expect(zoneCity('America/Argentina/Buenos_Aires')).toBe('Buenos Aires');
  });

  it('spells the fixed offsets the way a clock shows them, not the way POSIX signs them', () => {
    expect(zoneCity('UTC')).toBe('UTC');
    expect(zoneCity('Etc/UTC')).toBe('UTC');
    expect(zoneCity('Etc/GMT+5')).toBe('UTC−5');
    expect(zoneCity('Etc/GMT-3')).toBe('UTC+3');
  });
});

describe('where the phone has been', () => {
  const record: ZoneSpan[] = [
    { fromMs: 1_000, zone: PARIS },
    { fromMs: 5_000, zone: NY },
  ];

  it('is home before the record begins, and the span in force after', () => {
    expect(zoneAt(record, 999, 'Home/Zone')).toBe('Home/Zone');
    expect(zoneAt(record, 1_000, 'Home/Zone')).toBe(PARIS);
    expect(zoneAt(record, 4_999, 'Home/Zone')).toBe(PARIS);
    expect(zoneAt(record, 5_000, 'Home/Zone')).toBe(NY);
    expect(zoneAt([], 5_000, 'Home/Zone')).toBe('Home/Zone');
  });

  it('notes a new zone, and hands back the same record when the phone had not moved', () => {
    expect(noteZone(record, NY, 9_000)).toBe(record);
    expect(noteZone(record, PARIS, 9_000)).toEqual([...record, { fromMs: 9_000, zone: PARIS }]);
  });

  it('never writes a span that sorts before the one it follows, when the phone’s clock was set back', () => {
    expect(noteZone(record, PARIS, 2_000).at(-1)).toEqual({ fromMs: 5_000, zone: PARIS });
  });

  it('keeps the newest spans when the record is full', () => {
    let r: readonly ZoneSpan[] = [];
    for (let i = 0; i < ZONE_RECORD_CAP + 5; i++) r = noteZone(r, i % 2 ? NY : PARIS, i * 1_000);
    expect(r).toHaveLength(ZONE_RECORD_CAP);
    expect(r.at(-1)?.fromMs).toBe((ZONE_RECORD_CAP + 4) * 1_000);
  });

  it('reads a stored record back, dropping what it cannot trust rather than failing', () => {
    expect(parseZoneRecord(JSON.stringify(record))).toEqual(record);
    expect(parseZoneRecord(null)).toEqual([]);
    expect(parseZoneRecord('')).toEqual([]);
    expect(parseZoneRecord('{not json')).toEqual([]);
    expect(parseZoneRecord('{"fromMs":1}')).toEqual([]);
    expect(
      parseZoneRecord(
        JSON.stringify([
          { fromMs: 1_000, zone: PARIS },
          { fromMs: 'soon', zone: NY },
          { fromMs: 500, zone: NY }, // out of order
          { fromMs: 2_000, zone: '' },
          null,
          { fromMs: 3_000, zone: NY },
        ]),
      ),
    ).toEqual([
      { fromMs: 1_000, zone: PARIS },
      { fromMs: 3_000, zone: NY },
    ]);
  });
});
