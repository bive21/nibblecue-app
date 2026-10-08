import { afterEach, describe, expect, it, vi } from 'vitest';
import { keptDateFormat } from './formatters';

describe('keptDateFormat', () => {
  afterEach(() => vi.restoreAllMocks());

  it('formats exactly as a fresh formatter with the same arguments would', () => {
    const at = Date.UTC(2026, 9, 3, 23, 30);
    for (const timeZone of ['UTC', 'Pacific/Auckland', 'America/Los_Angeles']) {
      for (const options of [
        { month: 'short', day: 'numeric', timeZone },
        { weekday: 'short', timeZone },
        { hour: 'numeric', minute: '2-digit', hourCycle: 'h23', timeZone },
      ] as const) {
        expect(keptDateFormat('en-US', options).format(at)).toBe(
          new Intl.DateTimeFormat('en-US', options).format(at),
        );
      }
    }
  });

  it('builds one formatter for a locale and options however often it is asked', () => {
    const Real = Intl.DateTimeFormat;
    let built = 0;
    vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(function (
      locales?: string | string[],
      options?: Intl.DateTimeFormatOptions,
    ) {
      built += 1;
      return new Real(locales, options);
    } as never);
    // a zone no other test in this file asks for, so nothing is already kept
    for (let i = 0; i < 50; i++)
      keptDateFormat('en-US', { month: 'short', timeZone: 'Asia/Kathmandu' }).format(i);
    expect(built).toBe(1);
    // a different zone, or the phone's own locale, is a different formatter
    keptDateFormat('en-US', { month: 'short', timeZone: 'Asia/Tokyo' });
    keptDateFormat(undefined, { month: 'short', timeZone: 'Asia/Kathmandu' });
    expect(built).toBe(3);
  });

  it('throws for a zone the platform does not know, as the constructor does', () => {
    expect(() => keptDateFormat('en-US', { timeZone: 'Not/A_Zone' })).toThrow(RangeError);
  });
});
