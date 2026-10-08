/**
 * A growth measurement's instant: midday on the chosen day in the HOUSEHOLD's zone (PRODUCT_SPEC
 * §6.9; the audit of 2026-09-24 — "today" was saved at the moment the sheet opened, and a picked
 * day became midday in the phone's zone).
 */
import { localDayKey, wallClock } from '@nibblecue/core';
import { describe, expect, it } from 'vitest';
import { measuredDayKey, middayOfDay, middayOn } from './measuredOn';

const NY = 'America/New_York';
const TOKYO = 'Asia/Tokyo';

describe('the day a measurement was taken', () => {
  it('writes "today" as midday on the household’s day, not the moment the sheet opened', () => {
    const opened = Date.parse('2026-09-14T23:10:00.000Z'); // 7:10 PM in New York
    const at = middayOfDay(opened, NY);
    expect(localDayKey(NY, at)).toBe('2026-09-14');
    expect(wallClock(NY, at)).toMatchObject({ hour: 12, minute: 0 });
    // a record made at 7:10 AM the same day lands on the same instant
    expect(middayOfDay(Date.parse('2026-09-14T11:10:00.000Z'), NY)).toBe(at);
  });

  it('turns a picked day into midday in the household’s zone, whatever zone the phone is in', () => {
    const at = middayOn('2026-03-08', NY); // the spring-forward day in New York
    if (at === null) throw new Error('fixture');
    expect(wallClock(NY, at)).toMatchObject({ year: 2026, month: 3, day: 8, hour: 12 });
    // the same key in Tokyo is a different instant, on Tokyo's own day
    const tokyo = middayOn('2026-03-08', TOKYO);
    if (tokyo === null) throw new Error('fixture');
    expect(wallClock(TOKYO, tokyo)).toMatchObject({ day: 8, hour: 12 });
    expect(tokyo).not.toBe(at);
  });

  it('opens the picker on the household’s day, so the key goes in and comes back unshifted', () => {
    // 1:00 AM in Tokyo on the 15th is still the 14th in New York
    const ms = Date.parse('2026-09-14T16:00:00.000Z');
    expect(measuredDayKey(ms, TOKYO)).toBe('2026-09-15');
    expect(measuredDayKey(ms, NY)).toBe('2026-09-14');
    const back = middayOn(measuredDayKey(ms, NY), NY);
    expect(back === null ? null : localDayKey(NY, back)).toBe('2026-09-14');
  });

  it('refuses a key that is not a day rather than inventing one', () => {
    expect(middayOn('2026-13-01', NY)).toBeNull();
    expect(middayOn('yesterday', NY)).toBeNull();
    expect(middayOn('', NY)).toBeNull();
  });
});
