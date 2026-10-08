/**
 * THE 11:39 PM PROBLEM, which is the whole reason this file exists.
 *
 * The owner opened the app at 23:39 and Up next showed three rows from that morning, every one
 * of them already missed, because the engine's window is one local day and the day had nothing
 * left in it (2026-09-17: "the next activity falls of another day and isn't even shown in
 * today's list on schedule page"). Every case below is set at that hour.
 */
import { describe, expect, it, vi } from 'vitest';
import { dayAheadLabel, dayBehindLabel, scheduleAhead } from './ahead';
import { at, ctx, rule } from './fixtures';
import { dayPlus } from './time';
import * as today from './today';

const fixed = (id: string, activity: 'bottle' | 'diaper' | 'bath', atLocalTime: string) =>
  rule({ id, activity, ruleType: 'FIXED', atLocalTime });

const LATE = ctx('23:39');

describe('the day after, when this one has nothing left', () => {
  it('today genuinely has nothing to come — which is what makes the rest of this necessary', () => {
    const day = today.scheduleDay([fixed('a', 'bottle', '09:00')], [], LATE);
    expect(day.occurrences.filter(o => o.status === 'UPCOMING')).toEqual([]);
    expect(day.occurrences.map(o => o.status)).toEqual(['MISSED']);
  });

  it('finds tomorrow morning’s slots, soonest first', () => {
    const rows = scheduleAhead(
      [fixed('a', 'bottle', '09:00'), fixed('b', 'diaper', '07:30')],
      [],
      LATE,
    );
    expect(rows.map(o => o.ruleId)).toEqual(['b', 'a']);
    expect(rows[0]?.atMs).toBe(at('07:30', 1));
    expect(rows[1]?.atMs).toBe(at('09:00', 1));
    // and every one of them is genuinely ahead of the parent holding the phone
    for (const o of rows) expect(o.atMs).toBeGreaterThan(LATE.nowMs);
  });

  it('gives one row per rule, not eight copies of a three-hourly bottle', () => {
    const every3h = rule({
      id: 'r',
      activity: 'bottle',
      ruleType: 'INTERVAL',
      everyMinutes: 180,
    });
    const rows = scheduleAhead([every3h], [], LATE, { want: 3 });
    expect(rows.map(o => o.ruleId)).toEqual(['r']);
  });

  it('honours repeat days, so a Thursday-only rule is not promised on Friday', () => {
    // the fixture day is a Wednesday; 0 = Sunday, so 4 = Thursday and 5 = Friday. `repeatDays`
    // is read ONLY when `repeat` is CUSTOM — without it both of these repeat daily and this
    // test passes while proving nothing, which is how it was first written
    const thursdays = rule({
      id: 'thu',
      activity: 'bath',
      ruleType: 'FIXED',
      atLocalTime: '18:30',
      repeat: 'CUSTOM',
      repeatDays: [4],
    });
    const fridays = rule({
      id: 'fri',
      activity: 'bath',
      ruleType: 'FIXED',
      atLocalTime: '18:30',
      repeat: 'CUSTOM',
      repeatDays: [5],
    });
    expect(scheduleAhead([thursdays], [], LATE).map(o => o.atMs)).toEqual([at('18:30', 1)]);
    // Friday is two days out, and two days is how far this looks by default
    expect(scheduleAhead([fridays], [], LATE).map(o => o.atMs)).toEqual([at('18:30', 2)]);
    // one day of look-ahead finds neither Friday nor anything else
    expect(scheduleAhead([fridays], [], LATE, { days: 1 })).toEqual([]);
  });

  it('stops at `want`, so a busy household does not compute a week it will not draw', () => {
    const rules = ['07:00', '08:00', '09:00', '10:00', '11:00'].map((t, i) =>
      fixed(`r${i}`, 'bottle', t),
    );
    expect(scheduleAhead(rules, [], LATE, { want: 2 })).toHaveLength(2);
  });

  it('never returns a time on a day it was not asked about', () => {
    // a RELATIVE rule anchored on the last feed resolves against TODAY's session, so its
    // "tomorrow" copy computes a time on today — the day guard is what drops it rather than
    // showing a parent a slot that is already behind them
    const afterFeed = rule({
      id: 'rel',
      activity: 'diaper',
      ruleType: 'RELATIVE',
      relativeTo: 'LAST_FEED',
      offsetMinutes: 20,
    });
    for (const o of scheduleAhead([afterFeed, fixed('a', 'bottle', '09:00')], [], LATE)) {
      expect(o.atMs).toBeGreaterThan(LATE.nowMs);
    }
  });

  it('is empty for a household with no rules at all', () => {
    expect(scheduleAhead([], [], LATE)).toEqual([]);
  });

  it('reuses a day the caller already built, and the rows stay the same', () => {
    const rules = [fixed('a', 'bottle', '09:00'), fixed('b', 'diaper', '07:30')];
    const plain = scheduleAhead(rules, [], LATE);
    const tomorrow = today.scheduleDay(rules, [], {
      ...LATE,
      dayStartMs: dayPlus(LATE.timeZone, LATE.dayStartMs, 1),
    });
    const spy = vi.spyOn(today, 'scheduleDay');
    const reused = scheduleAhead(rules, [], LATE, { knownDays: new Map([[1, tomorrow]]) });
    // day 1 is the day that was passed in; day 2 is the only one still built here
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
    expect(reused).toEqual(plain);
  });
});

describe('a time on another day never reads as this morning', () => {
  const weekdayOf = (ms: number): string =>
    new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: 'America/New_York' }).format(ms);

  it('says which day, or nothing at all for today', () => {
    const label = (ms: number) => dayAheadLabel({ ...LATE, atMs: ms }, weekdayOf);
    expect(label(at('23:50'))).toBeNull();
    expect(label(at('07:30'))).toBeNull();
    expect(label(at('07:30', 1))).toBe('Tomorrow');
    // the fixture day is a Wednesday, so two days out is Friday
    expect(label(at('07:30', 2))).toBe('Friday');
  });
});

/**
 * THE DAY BEHIND, for a card with room for two lines. `agoLabel`'s "5d ago" is arithmetic a
 * parent has to turn back into a day; the weekday is the thing they actually remember.
 */
describe('dayBehindLabel', () => {
  const TZ = 'America/New_York';
  const weekday = (atMs: number) =>
    new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: TZ }).format(atMs);
  // a Tuesday, mid-morning
  const NOW = Date.parse('2026-09-15T14:00:00Z');
  const daysBack = (n: number) => NOW - n * 24 * 60 * 60 * 1000;
  const label = (atMs: number) => dayBehindLabel({ timeZone: TZ, nowMs: NOW, atMs }, weekday);

  it('names today and yesterday by their own words', () => {
    expect(label(NOW - 60 * 60 * 1000)).toBe('Today');
    expect(label(daysBack(1))).toBe('Yesterday');
  });

  it('names the weekday for the rest of the week behind', () => {
    expect(label(daysBack(2))).toBe('Last Sunday');
    expect(label(daysBack(5))).toBe('Last Thursday');
    expect(label(daysBack(6))).toBe('Last Wednesday');
  });

  /**
   * AND STOPS AT A WEEK, because past it the weekday names the wrong day: "last Thursday" said
   * nine days later is a Thursday nobody meant. Null, and the caller says something else.
   */
  it('gives up rather than naming an ambiguous weekday', () => {
    expect(label(daysBack(7))).toBeNull();
    expect(label(daysBack(30))).toBeNull();
  });

  it('says nothing about the future — that is `dayAheadLabel`', () => {
    expect(label(NOW + 24 * 60 * 60 * 1000)).toBeNull();
  });
});
