import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  announceBucket,
  announceElapsed,
  announceTimer,
  breastfeedTotals,
  formatClock,
  formatElapsed,
  keepClockWhole,
  relativeShort,
  TIMER_STOP_CAPTION,
  timerElapsed,
  timerStartedLine,
  timerSwitchLine,
  timerTitle,
  timerTotalsLine,
  weekdayName,
} from './timeFormat';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe('formatElapsed', () => {
  it('short: hours and minutes, dropping a zero minute, days past 48h', () => {
    expect(formatElapsed(HOUR + 26 * MIN)).toBe('1h 26m');
    expect(formatElapsed(26 * MIN)).toBe('26m');
    expect(formatElapsed(0)).toBe('0m');
    expect(formatElapsed(2 * HOUR)).toBe('2h');
    expect(formatElapsed(59 * MIN + 59_000)).toBe('59m');
    expect(formatElapsed(47 * HOUR + 5 * MIN)).toBe('47h 5m');
    expect(formatElapsed(2 * DAY + 12 * HOUR)).toBe('2d 12h');
    expect(formatElapsed(3 * DAY)).toBe('3d');
  });
  it('clock: the stopwatch form', () => {
    expect(formatElapsed(HOUR + 26 * MIN + 5_000, 'clock')).toBe('1:26:05');
    expect(formatElapsed(26 * MIN + 5_000, 'clock')).toBe('26:05');
    expect(formatElapsed(5_000, 'clock')).toBe('0:05');
  });
  it('live: seconds while they mean something', () => {
    expect(formatElapsed(HOUR + 5 * MIN + 9_000, 'live')).toBe('1h 05m');
    expect(formatElapsed(26 * MIN + 5_000, 'live')).toBe('26m 05s');
    expect(formatElapsed(5_000, 'live')).toBe('5s');
  });
  it('never goes negative, never throws on junk', () => {
    expect(formatElapsed(-5 * MIN)).toBe('0m');
    expect(formatElapsed(Number.NaN)).toBe('0m');
    expect(formatElapsed(-1, 'clock')).toBe('0:00');
  });
});

describe('relativeShort', () => {
  it('reads "in" for the future, "ago" for the past, "now" inside a minute', () => {
    expect(relativeShort(2 * HOUR + 10 * MIN)).toBe('in 2h 10m');
    expect(relativeShort(-2 * HOUR)).toBe('2h ago');
    expect(relativeShort(-(2 * HOUR + 10 * MIN))).toBe('2h 10m ago');
    expect(relativeShort(-18 * MIN)).toBe('18m ago');
    expect(relativeShort(30_000)).toBe('now');
    expect(relativeShort(-30_000)).toBe('now');
    expect(relativeShort(-3 * DAY)).toBe('3d ago');
  });
});

describe('announceElapsed', () => {
  it('says units in words with plurals', () => {
    expect(announceElapsed(HOUR + 26 * MIN)).toBe('1 hour 26 minutes');
    expect(announceElapsed(2 * HOUR + MIN)).toBe('2 hours 1 minute');
    expect(announceElapsed(26 * MIN)).toBe('26 minutes');
    expect(announceElapsed(HOUR)).toBe('1 hour');
    expect(announceElapsed(2 * DAY + 3 * HOUR)).toBe('2 days 3 hours');
    expect(announceElapsed(20_000)).toBe('less than a minute');
  });
  it('composes the timer sentence from MOBILE.md §9', () => {
    expect(
      announceTimer({
        typeLabel: 'Sleep',
        elapsedMs: HOUR + 12 * MIN,
        startedClock: '1:40 PM',
        byName: 'Dana',
      }),
    ).toBe('Sleep timer, 1 hour 12 minutes, started 1:40 PM by Dana');
    expect(announceTimer({ typeLabel: 'Pump', elapsedMs: 5 * MIN, startedClock: '13:40' })).toBe(
      'Pump timer, 5 minutes, started 13:40',
    );
  });
  it('buckets announcements to 30 seconds', () => {
    expect(announceBucket(900_029_999)).toBe(900_000_000);
    expect(announceBucket(900_030_000)).toBe(900_030_000);
  });
});

describe('formatClock', () => {
  // 2026-09-14 17:40 UTC
  const at = Date.UTC(2026, 8, 14, 17, 40);
  it('formats 12h and 24h in a named zone', () => {
    expect(formatClock(at, false, 'America/New_York')).toBe('1:40 PM');
    expect(formatClock(at, true, 'America/New_York')).toBe('13:40');
    expect(formatClock(at, false, 'UTC')).toBe('5:40 PM');
    expect(formatClock(at, true, 'UTC')).toBe('17:40');
  });
  it('midnight is 12:05 AM or 00:05, never 24:05', () => {
    const midnight = Date.UTC(2026, 8, 14, 0, 5);
    expect(formatClock(midnight, false, 'UTC')).toBe('12:05 AM');
    expect(formatClock(midnight, true, 'UTC')).toBe('00:05');
  });
  it('survives an unknown zone id instead of taking the clock down', () => {
    expect(() => formatClock(at, false, 'Not/AZone')).not.toThrow();
    expect(formatClock(at, true, 'Not/AZone')).toMatch(/^\d\d:\d\d$/);
  });
});

/*
  2026-09-28, speed: the same instants are drawn at every render, and on a phone each ICU `format`
  crosses JNI, so a time in a NAMED zone is read once and kept (`clockTexts`). What is held: the
  words never change, the key carries all three of its parts, the device's zone is never kept.
*/
describe('formatClock reads each time once', () => {
  const at = Date.UTC(2026, 8, 14, 17, 40);
  // `format` is an accessor on the prototype (ECMA-402), typed as a method: each read of it is one
  // `format` asked of ICU, which is what is counted
  const formats = () =>
    vi.spyOn(Intl.DateTimeFormat.prototype as { format: unknown }, 'format', 'get');
  afterEach(() => vi.restoreAllMocks());

  it('hands back the same words every time, and a clock or a zone never takes another’s', () => {
    const asked = [
      [false, 'America/New_York', '1:40 PM'],
      [true, 'America/New_York', '13:40'],
      [false, 'UTC', '5:40 PM'],
      [true, 'UTC', '17:40'],
    ] as const;
    for (let round = 0; round < 3; round++) {
      for (const [clock24, zone, words] of asked)
        expect(formatClock(at, clock24, zone)).toBe(words);
    }
    expect(formatClock(at + MIN, false, 'UTC')).toBe('5:41 PM');
  });

  it('asks ICU once for an instant, a clock and a named zone', () => {
    const seen = formats();
    const once = Date.UTC(2026, 8, 15, 9, 7);
    expect(formatClock(once, false, 'Europe/Paris')).toBe('11:07 AM');
    const first = seen.mock.calls.length;
    expect(first).toBe(1);
    for (let i = 0; i < 5; i++) expect(formatClock(once, false, 'Europe/Paris')).toBe('11:07 AM');
    expect(seen.mock.calls.length).toBe(first);
    formatClock(once, true, 'Europe/Paris');
    expect(seen.mock.calls.length).toBe(first + 1);
  });

  it('never keeps a time in the device’s zone, named or fallen back to — the device can move', () => {
    const seen = formats();
    const once = Date.UTC(2026, 8, 16, 4, 30);
    formatClock(once, false);
    formatClock(once, false);
    formatClock(once, false, '');
    formatClock(once, false, '');
    formatClock(once, false, 'Not/AZone');
    formatClock(once, false, 'Not/AZone');
    expect(seen.mock.calls.length).toBe(6);
  });

  it('stays right past its bound, which it forgets whole', () => {
    const start = Date.UTC(2026, 8, 17, 0, 0);
    for (let i = 0; i < 2100; i++) formatClock(start + i * MIN, true, 'UTC');
    expect(formatClock(start, true, 'UTC')).toBe('00:00');
    expect(formatClock(start + 2099 * MIN, true, 'UTC')).toBe('10:59');
  });
});

describe('weekdayName', () => {
  const fresh = (ms: number, timeZone: string): string =>
    new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone }).format(ms);

  it('is the word a fresh formatter gives, in the zone asked', () => {
    // 02:00 UTC on Monday is Sunday evening on the west coast
    const at = Date.UTC(2026, 8, 14, 2, 0);
    expect(weekdayName(at, 'UTC')).toBe('Monday');
    expect(weekdayName(at, 'America/Los_Angeles')).toBe('Sunday');
    for (let d = 0; d < 7; d++) {
      for (const zone of ['UTC', 'Asia/Tokyo', 'America/New_York']) {
        expect(weekdayName(at + d * DAY, zone)).toBe(fresh(at + d * DAY, zone));
      }
    }
  });

  it('refuses a zone ICU does not know, exactly as the formatter it replaced did', () => {
    expect(() => fresh(0, 'Not/AZone')).toThrow(RangeError);
    expect(() => weekdayName(0, 'Not/AZone')).toThrow(RangeError);
  });
});

// the owner, 2026-09-24: "10:56 PM" drawn on two rows — "you need to show it on one row"
describe('keepClockWhole — a time never breaks before its AM/PM', () => {
  const NBSP = '\u00A0';
  it('glues the day period to the digit before it, wherever the time sits in a line', () => {
    expect(keepClockWhole('10:56 PM')).toBe(`10:56${NBSP}PM`);
    expect(keepClockWhole('Wed, Sep 23 · 8:00 AM – 8:30 PM')).toBe(
      `Wed, Sep 23 · 8:00${NBSP}AM – 8:30${NBSP}PM`,
    );
    expect(keepClockWhole('Due 2:12 PM · 69 min late')).toBe(`Due 2:12${NBSP}PM · 69 min late`);
    expect(keepClockWhole('Bedtime 7 PM')).toBe(`Bedtime 7${NBSP}PM`);
  });
  it('glues what formatClock hands out, in every zone', () => {
    const at = Date.UTC(2026, 8, 14, 22, 56);
    expect(keepClockWhole(formatClock(at, false, 'UTC'))).toBe(`10:56${NBSP}PM`);
    expect(keepClockWhole(formatClock(at, true, 'UTC'))).toBe('22:56');
  });
  it('leaves words that only look like a day period alone', () => {
    for (const s of ['3 AMs', '2 PMs today', 'Plan AM', '5 amps', 'Log 10 ml · 2 AMP']) {
      expect(keepClockWhole(s)).toBe(s);
    }
  });
  it('draws the same width it replaced, and a second pass changes nothing', () => {
    const once = keepClockWhole('9:00 AM');
    expect(once.length).toBe('9:00 AM'.length);
    expect(keepClockWhole(once)).toBe(once);
  });
});

describe('timer arithmetic', () => {
  it('elapsed is now − started − paused, clamped at zero', () => {
    expect(timerElapsed(1000, 0, 61_000)).toBe(60_000);
    expect(timerElapsed(1000, 20_000, 61_000)).toBe(40_000);
    expect(timerElapsed(100_000, 0, 61_000)).toBe(0);
  });
  it('breastfeed totals add the open side from its own start', () => {
    const t = breastfeedTotals(
      { leftMs: 5 * MIN, rightMs: 3 * MIN, active: 'right', sideStartedAt: 100_000 },
      100_000 + 2 * MIN,
    );
    expect(t).toEqual({ leftMs: 5 * MIN, rightMs: 5 * MIN, totalMs: 10 * MIN });
    expect(breastfeedTotals({ leftMs: MIN, rightMs: MIN, active: null }, 0).totalMs).toBe(2 * MIN);
    // without a side start, the stored values already include the open run
    expect(breastfeedTotals({ leftMs: MIN, rightMs: 0, active: 'left' }, 999_999).leftMs).toBe(MIN);
  });
});

/**
 * The owner, 2026-09-16: "if there is only one baby 'Chiara F is sleeping' can be changed to
 * 'Sleeping'". The name was three of the five words on a card about the only person it could
 * be about.
 */
describe('timerTitle', () => {
  it('names nobody in a one-baby household', () => {
    expect(timerTitle('sleep')).toBe('Sleeping');
    expect(timerTitle('breastfeed')).toBe('Breastfeeding');
    expect(timerTitle('tummy')).toBe('Tummy time');
  });

  it('names the child when the caller passes one, because then there is another', () => {
    expect(timerTitle('sleep', 'Chiara')).toBe('Chiara is sleeping');
    expect(timerTitle('breastfeed', 'Emma')).toBe('Breastfeeding Emma');
    expect(timerTitle('tummy', 'Liam')).toBe('Tummy time · Liam');
  });

  it('calls tummy time by the household’s word once it is playtime; the verbs ignore it', () => {
    expect(timerTitle('tummy', undefined, 'Playtime')).toBe('Playtime');
    expect(timerTitle('tummy', 'Liam', 'Playtime')).toBe('Playtime · Liam');
    expect(timerTitle('tummy', undefined, '  ')).toBe('Tummy time');
    expect(timerTitle('sleep', undefined, 'Playtime')).toBe('Sleeping');
  });

  it('never names a child on a pump: it belongs to the person holding the phone', () => {
    expect(timerTitle('pump')).toBe('Pumping');
    expect(timerTitle('pump', 'Emma')).toBe('Pumping');
  });

  it('treats an empty or blank name as no name, never as a card titled " is sleeping"', () => {
    expect(timerTitle('sleep', '')).toBe('Sleeping');
    expect(timerTitle('sleep', '   ')).toBe('Sleeping');
    expect(timerTitle('sleep', '  Emma ')).toBe('Emma is sleeping');
  });
});

/**
 * The lines the card composes, here so the renderer measures the card's own words over the owner's
 * pictures (`theme/artWords.ts`) — every string the card drew inline before, unchanged.
 */
describe('the running card’s composed lines', () => {
  it('writes a feed’s totals side by side, then the open side or "paused"', () => {
    const totals = { leftMs: 12 * MIN + 4_000, rightMs: 8 * MIN + 30_000 };
    expect(timerTotalsLine(totals, 'left')).toBe('L 12m · R 8m · on left');
    expect(timerTotalsLine(totals, 'right')).toBe('L 12m · R 8m · on right');
    expect(timerTotalsLine(totals, null)).toBe('L 12m · R 8m · paused');
    expect(timerTotalsLine(totals, undefined)).toBe('L 12m · R 8m · paused');
  });

  it('writes the start, and who started it only when the card is told', () => {
    expect(timerStartedLine('1:48 PM')).toBe('Started 1:48 PM');
    expect(timerStartedLine('1:48 PM', 'Dana')).toBe('Started 1:48 PM · Dana');
    expect(timerStartedLine('1:48 PM', '')).toBe('Started 1:48 PM');
  });

  it('names the side a switch opens, which is never the open one', () => {
    expect(timerSwitchLine('left')).toBe('Switch to right');
    expect(timerSwitchLine('right')).toBe('Switch to left');
    expect(timerSwitchLine(null)).toBe('Switch to left');
  });

  it('says what the stop does, one word where one will do', () => {
    expect(TIMER_STOP_CAPTION).toEqual({
      sleep: 'Woke up',
      pump: 'Stop',
      breastfeed: 'Finish',
      tummy: 'Stop',
    });
  });
});
