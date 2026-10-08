/**
 * The arithmetic behind the two measurement histories (the owner, 2026-09-18: "when clicking
 * it option, let user have the option to see history … same with temperature, let users access
 * history for all entry").
 *
 * What is asserted here is mostly what is ABSENT. `temperatureLog` returns the readings, their
 * order, their methods and the gaps between them — and no average, no extreme and no count of
 * anything over a threshold, because each of those is the app forming an opinion about a
 * temperature (CLAUDE.md §2 rules 1 and 3). The shape of the returned object is the promise, so
 * the shape is what the test pins.
 */
import { describe, expect, it } from 'vitest';
import { zonedToUtc } from '../today/day';
import type { TodayActivity } from '../today/rows';
import { growthInsight, temperatureLog } from './insights';

const TZ = 'America/Los_Angeles';
const at = (h: number, m = 0, day = 14): number => zonedToUtc(TZ, 2026, 9, day, h, m);

let seq = 0;
const row = (over: Partial<TodayActivity> & Pick<TodayActivity, 'type' | 'startMs'>) => {
  seq += 1;
  return {
    id: `a${seq}`,
    childId: 'kid',
    endMs: null,
    isPrivate: false,
    createdBy: 'dana',
    ...over,
  } as TodayActivity;
};

const temp = (startMs: number, cHundredths: number, method: string | null = 'Axillary') =>
  row({ type: 'temp', startMs, tempCHundredths: cHundredths, tempMethod: method });

describe('temperatureLog — the readings, and nothing said about them', () => {
  const rows = [
    // a single afternoon of checks, then one nine days later: the shape temperature actually has
    temp(at(14, 0, 5), 3780, 'Axillary'),
    temp(at(14, 20, 5), 3810, 'Forehead'),
    temp(at(18, 0, 5), 3750, 'Axillary'),
    temp(at(9, 0, 14), 3690, 'Axillary'),
  ];

  it('returns every reading oldest first, canonical, with the method as it was chosen', () => {
    const log = temperatureLog(rows);
    expect(log.count).toBe(4);
    expect(log.readings.map(r => r.cHundredths)).toEqual([3780, 3810, 3750, 3690]);
    expect(log.readings.map(r => r.method)).toEqual([
      'Axillary',
      'Forehead',
      'Axillary',
      'Axillary',
    ]);
    // canonical in, canonical out: nothing here knows what °F is (CLAUDE.md §6)
    expect(log.readings.every(r => Number.isInteger(r.cHundredths))).toBe(true);
  });

  it('measures the gap to the PREVIOUS reading, and leaves the first one null', () => {
    const log = temperatureLog(rows);
    // the 5th at 18:00 to the 14th at 09:00 is 8 days and 15 hours, in minutes
    expect(log.readings.map(r => r.sinceLastMinutes)).toEqual([null, 20, 220, 8 * 1440 + 15 * 60]);
  });

  it('counts how they were taken, most first, with ties in alphabetical order', () => {
    expect(temperatureLog(rows).byMethod).toEqual([
      { method: 'Axillary', count: 3 },
      { method: 'Forehead', count: 1 },
    ]);
    const tied = temperatureLog([temp(at(9), 3700, 'Rectal'), temp(at(10), 3700, 'Ear')]);
    expect(tied.byMethod.map(m => m.method)).toEqual(['Ear', 'Rectal']);
  });

  it('spans first to last in whole days, and carries both instants', () => {
    const log = temperatureLog(rows);
    expect(log.firstAtMs).toBe(at(14, 0, 5));
    expect(log.lastAtMs).toBe(at(9, 0, 14));
    expect(log.spanDays).toBe(9);
  });

  it('sorts rows the caller handed over newest-first, and ignores everything else', () => {
    const mixed = [
      row({ type: 'bottle', startMs: at(8, 0, 5), consumedMl: 120 }),
      temp(at(18, 0, 5), 3750),
      temp(at(14, 0, 5), 3780),
      // an entry whose reading never made it: not a reading, so not in the log
      row({ type: 'temp', startMs: at(19, 0, 5) }),
    ];
    const log = temperatureLog(mixed);
    expect(log.count).toBe(2);
    expect(log.readings.map(r => r.atMs)).toEqual([at(14, 0, 5), at(18, 0, 5)]);
  });

  it('is empty rather than broken with nothing logged, and with one reading', () => {
    const none = temperatureLog([]);
    expect(none).toEqual({
      readings: [],
      count: 0,
      firstAtMs: null,
      lastAtMs: null,
      spanDays: 0,
      byMethod: [],
    });
    const one = temperatureLog([temp(at(9), 3700, null)]);
    expect(one.spanDays).toBe(0);
    expect(one.readings[0]?.sinceLastMinutes).toBeNull();
    // an entry saved without a method is a reading with no method, never "Axillary" by default
    expect(one.readings[0]?.method).toBeNull();
    expect(one.byMethod).toEqual([]);
  });

  it('two readings on the same stamp are 0 minutes apart, which is a fact and not a null', () => {
    const log = temperatureLog([temp(at(9), 3700), temp(at(9), 3720)]);
    expect(log.readings.map(r => r.sinceLastMinutes)).toEqual([null, 0]);
  });

  /**
   * THE LINT, AND THE REASON THIS FILE EXISTS. Every one of these would be a clinical
   * judgment, and each is the field a well-meaning edit reaches for first.
   */
  it('offers no average, no extreme and no threshold to read a verdict off', () => {
    const log = temperatureLog(rows) as unknown as Record<string, unknown>;
    for (const forbidden of [
      'average',
      'averageCHundredths',
      'mean',
      'max',
      'maxCHundredths',
      'highest',
      'min',
      'lowest',
      'peak',
      'overThreshold',
      'elevated',
      'fever',
      'feverCount',
      'status',
      'tone',
      'severity',
    ]) {
      expect(Object.keys(log), forbidden).not.toContain(forbidden);
    }
  });
});

describe('a growth point carries the entry it came from', () => {
  const rows = [
    row({ id: 'g1', type: 'growth', startMs: at(9, 0, 1), weightG: 4200 }),
    row({ id: 'g2', type: 'growth', startMs: at(9, 0, 15), weightG: 4600 }),
  ];

  it('so a measurement in a list can be opened and corrected', () => {
    expect(growthInsight(rows, 'weight')?.points.map(p => p.id)).toEqual(['g1', 'g2']);
  });

  it('and the ids follow the sort rather than the order they arrived in', () => {
    const backwards = [rows[1] as TodayActivity, rows[0] as TodayActivity];
    expect(growthInsight(backwards, 'weight')?.points.map(p => p.id)).toEqual(['g1', 'g2']);
  });
});
