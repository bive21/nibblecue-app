import { describe, expect, it } from 'vitest';
import {
  applyCustom,
  isPreset,
  labels,
  PRESET_LABELS,
  PRESET_SPOKEN,
  PRESETS,
  resolvePreset,
  wallClockOf,
  wallClockParts,
} from './timePresets';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/**
 * ONE ROW, IN THE OWNER'S WORDS, ON EVERY SHEET (2026-09-26: *"the options should show in 1 row,
 * 'Now', '~15 min', '~30 min' 'Custom' then the actual hour"*). The finished forms' own chips
 * ("15 min ago") and the moment row's fifth ("−1 hour") are gone with it: one set of four.
 */
describe('presets', () => {
  it('are in the order the row shows them, with the copy the owner named', () => {
    expect(PRESETS).toEqual(['now', 'm15', 'm30', 'custom']);
    expect(PRESETS.map(p => PRESET_LABELS[p])).toEqual(['Now', '\u221215m', '\u221230m', 'Custom']);
  });
  it('export the label map under the contract name too', () => {
    expect(labels).toBe(PRESET_LABELS);
    expect(labels.m15).toBe('\u221215m');
  });
  it('give a screen reader a sentence for each chip, never "tilde"', () => {
    for (const p of PRESETS) {
      expect(PRESET_SPOKEN[p], p).not.toMatch(/~/);
      expect(PRESET_SPOKEN[p], p).not.toBe('');
    }
    expect(PRESET_SPOKEN.m15).toBe('15 minutes ago');
  });
  it('resolve against the clock they are given', () => {
    const now = Date.UTC(2026, 8, 14, 20, 4);
    expect(resolvePreset('now', now)).toBe(now);
    expect(resolvePreset('m15', now)).toBe(now - 15 * MIN);
    expect(resolvePreset('m30', now)).toBe(now - 30 * MIN);
  });
  it('custom keeps the picked value and falls back to now before a pick', () => {
    const now = Date.UTC(2026, 8, 14, 20, 4);
    expect(resolvePreset('custom', now)).toBe(now);
    expect(resolvePreset('custom', now, now - 3 * HOUR)).toBe(now - 3 * HOUR);
  });
  it('guards a stored value — the hour chip that went is not one any more', () => {
    expect(isPreset('m15')).toBe(true);
    expect(isPreset('h1')).toBe(false);
    expect(isPreset('yesterday')).toBe(false);
    expect(isPreset(15)).toBe(false);
  });
});

describe('applyCustom (named zone — deterministic)', () => {
  it('a time earlier than now is today at that time', () => {
    const now = Date.UTC(2026, 8, 14, 20, 4); // 8:04 PM UTC
    expect(applyCustom({ hours: 18, minutes: 30 }, now, 'UTC')).toBe(Date.UTC(2026, 8, 14, 18, 30));
  });
  it('a time later than now rolls back one day', () => {
    const now = Date.UTC(2026, 8, 14, 0, 10); // 12:10 AM UTC
    expect(applyCustom({ hours: 23, minutes: 40 }, now, 'UTC')).toBe(Date.UTC(2026, 8, 13, 23, 40));
  });
  it('the same minute as now is now (not yesterday)', () => {
    const now = Date.UTC(2026, 8, 14, 20, 4);
    expect(applyCustom({ hours: 20, minutes: 4 }, now, 'UTC')).toBe(now);
  });
  it('rolls back across a month boundary', () => {
    const now = Date.UTC(2026, 9, 1, 0, 5); // Oct 1, 12:05 AM
    expect(applyCustom({ hours: 22, minutes: 0 }, now, 'UTC')).toBe(Date.UTC(2026, 8, 30, 22, 0));
  });
  it('uses the wall clock of the given zone', () => {
    // 2026-09-14 20:04 in New York is 2026-09-15 00:04 UTC; "18:30" must mean 18:30 New York time
    const now = Date.UTC(2026, 8, 15, 0, 4);
    expect(wallClockParts(now, 'America/New_York')).toMatchObject({
      day: 14,
      hours: 20,
      minutes: 4,
    });
    expect(applyCustom({ hours: 18, minutes: 30 }, now, 'America/New_York')).toBe(
      Date.UTC(2026, 8, 14, 22, 30),
    );
  });
  it('rolls back a calendar day, not 24 hours, across a DST change', () => {
    // New York falls back on 2026-11-01 at 2:00 AM: Oct 31 is 24h, but Nov 1 has 25h.
    // At 12:10 AM Nov 2 (EST), "23:30" means Nov 1 23:30 EST = Nov 2 04:30 UTC.
    const now = Date.UTC(2026, 10, 2, 5, 10); // 12:10 AM EST
    expect(applyCustom({ hours: 23, minutes: 30 }, now, 'America/New_York')).toBe(
      Date.UTC(2026, 10, 2, 4, 30),
    );
    // and at 12:10 AM Nov 1 (still EDT), "23:30" means Oct 31 23:30 EDT = Nov 1 03:30 UTC
    const now2 = Date.UTC(2026, 10, 1, 4, 10);
    expect(applyCustom({ hours: 23, minutes: 30 }, now2, 'America/New_York')).toBe(
      Date.UTC(2026, 10, 1, 3, 30),
    );
  });
  it('clamps an out-of-range wall clock instead of overflowing into another day', () => {
    const now = Date.UTC(2026, 8, 14, 20, 4);
    expect(applyCustom({ hours: 25, minutes: 70 }, now, 'UTC')).toBe(Date.UTC(2026, 8, 13, 23, 59));
  });
  it('wallClockOf gives a picker its opening position', () => {
    expect(wallClockOf(Date.UTC(2026, 8, 14, 7, 5), 'UTC')).toEqual({ hours: 7, minutes: 5 });
    expect(wallClockOf(Date.UTC(2026, 8, 14, 0, 0), 'UTC')).toEqual({ hours: 0, minutes: 0 });
  });
});

describe('applyCustom (device zone — properties that hold in any zone)', () => {
  it('never lands in the future and keeps the wall clock asked for', () => {
    const now = Date.now();
    const wanted = { hours: 11, minutes: 40 };
    const got = applyCustom(wanted, now);
    expect(got).toBeLessThanOrEqual(now);
    expect(now - got).toBeLessThan(DAY + HOUR);
    const d = new Date(got);
    expect(d.getHours()).toBe(11);
    expect(d.getMinutes()).toBe(40);
    expect(d.getSeconds()).toBe(0);
  });
});
